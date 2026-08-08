import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type ContextoAuth = { supabase: import("@supabase/supabase-js").SupabaseClient; userId: string };

/** Confere que o usuário logado é admin da própria unidade; devolve o unidade_id. */
async function exigirAdmin(context: ContextoAuth): Promise<{ unidadeId: string }> {
  const { data, error } = await context.supabase
    .from("atendentes")
    .select("unidade_id, role")
    .eq("id", context.userId)
    .maybeSingle();
  if (error || !data || data.role !== "admin") {
    throw new Error("Acesso restrito a administradores da unidade.");
  }
  return { unidadeId: data.unidade_id };
}

export type EnderecoUnidade = {
  endereco_completo: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type SalvarEnderecoResultado = EnderecoUnidade & { localizacaoConfirmada: boolean };

/** Endereço/coordenadas configurados da própria unidade (só admin). */
export const obterEnderecoUnidade = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EnderecoUnidade> => {
    const { unidadeId } = await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("unidades")
      .select("endereco_completo, latitude, longitude")
      .eq("id", unidadeId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? { endereco_completo: null, latitude: null, longitude: null };
  });

/**
 * Salva o endereço da unidade e tenta geocodificar automaticamente
 * (OpenStreetMap Nominatim) para preencher latitude/longitude — usadas
 * como origem no cálculo de distância de delivery. A geocodificação é
 * "best effort": o Nominatim público é gratuito mas instável (limite de
 * 1 req/s, endereços não encontrados, indisponibilidade temporária), então
 * uma falha nele NÃO pode impedir o salvamento do endereço em si — antes
 * disso, qualquer erro de geocodificação bloqueava a confirmação inteira e
 * o admin não conseguia salvar o endereço de jeito nenhum. Agora o texto é
 * sempre salvo; se a geocodificação falhar, latitude/longitude ficam nulas
 * e a UI mostra "localização a confirmar" (o admin pode tentar salvar de
 * novo depois para completar a geocodificação).
 */
export const salvarEnderecoUnidade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ endereco: z.string().trim().min(10, "Informe o endereço completo").max(300) }).parse(data),
  )
  .handler(async ({ data, context }): Promise<SalvarEnderecoResultado> => {
    const { unidadeId } = await exigirAdmin(context);

    const { geocodarEndereco } = await import("./geolocalizacao.server");
    const geocodificado = await geocodarEndereco(data.endereco);

    const atualizacao = geocodificado.ok
      ? {
          endereco_completo: geocodificado.enderecoFormatado,
          latitude: geocodificado.latitude,
          longitude: geocodificado.longitude,
        }
      : { endereco_completo: data.endereco, latitude: null, longitude: null };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("unidades")
      .update(atualizacao)
      .eq("id", unidadeId);
    if (error) throw new Error(error.message);

    return { ...atualizacao, localizacaoConfirmada: geocodificado.ok };
  });

export type IdentificacaoUnidade = { nome: string; cidade: string };

/**
 * Atualiza nome/cidade da unidade. Não existe grant de UPDATE em
 * `unidades` para `authenticated`, por isso passa por supabaseAdmin —
 * mesmo padrão do endereço acima. O slug não é editável aqui: é usado na
 * URL pública do formulário de pedido, mudar quebraria links já
 * compartilhados com clientes.
 */
export const salvarIdentificacaoUnidade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        nome: z.string().trim().min(2, "Informe o nome da unidade").max(120),
        cidade: z.string().trim().min(2, "Informe a cidade").max(120),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<IdentificacaoUnidade> => {
    const { unidadeId } = await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("unidades")
      .update({ nome: data.nome, cidade: data.cidade })
      .eq("id", unidadeId);
    if (error) throw new Error(error.message);
    return { nome: data.nome, cidade: data.cidade };
  });

export type HorarioDiaUnidade = {
  dia_semana: number;
  ativo: boolean;
  hora_abertura: string;
  hora_fechamento: string;
};

/** Horário de funcionamento por dia da semana da própria unidade (só admin). */
export const obterHorariosUnidade = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HorarioDiaUnidade[]> => {
    const { unidadeId } = await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("horarios_unidade")
      .select("dia_semana, ativo, hora_abertura, hora_fechamento")
      .eq("unidade_id", unidadeId)
      .order("dia_semana");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const horaSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida");

const horarioDiaSchema = z.object({
  dia_semana: z.number().int().min(0).max(6),
  ativo: z.boolean(),
  hora_abertura: horaSchema,
  hora_fechamento: horaSchema,
});

/**
 * Salva os 7 dias de horário de funcionamento de uma vez (a tela sempre
 * edita a semana inteira junto, então um upsert em lote é mais simples
 * que um CRUD linha a linha).
 */
export const salvarHorariosUnidade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ horarios: z.array(horarioDiaSchema).length(7) })
      .refine(
        (d) => new Set(d.horarios.map((h) => h.dia_semana)).size === 7,
        "Informe os 7 dias da semana",
      )
      .refine(
        (d) => d.horarios.every((h) => !h.ativo || h.hora_abertura < h.hora_fechamento),
        "O horário de abertura precisa ser antes do de fechamento",
      )
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<HorarioDiaUnidade[]> => {
    const { unidadeId } = await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const linhas = data.horarios.map((h) => ({
      unidade_id: unidadeId,
      dia_semana: h.dia_semana,
      ativo: h.ativo,
      hora_abertura: h.hora_abertura,
      hora_fechamento: h.hora_fechamento,
    }));
    const { error } = await supabaseAdmin
      .from("horarios_unidade")
      .upsert(linhas, { onConflict: "unidade_id,dia_semana" });
    if (error) throw new Error(error.message);
    return data.horarios;
  });

export type CodigoConviteUnidade = { codigo_convite: string };

/** Código de convite da própria unidade (coluna não é selecionável direto pelo client, nem por admin). */
export const obterConviteUnidade = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CodigoConviteUnidade> => {
    const { unidadeId } = await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("unidades")
      .select("codigo_convite")
      .eq("id", unidadeId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Unidade não encontrada.");
    return data;
  });
