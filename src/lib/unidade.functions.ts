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
 * Salva o endereço da unidade e geocodifica automaticamente (OpenStreetMap
 * Nominatim) para preencher latitude/longitude — usadas como origem no
 * cálculo de distância de delivery. A atendente nunca precisa lidar com
 * coordenadas diretamente.
 */
export const salvarEnderecoUnidade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ endereco: z.string().trim().min(10, "Informe o endereço completo").max(300) }).parse(data),
  )
  .handler(async ({ data, context }): Promise<EnderecoUnidade> => {
    const { unidadeId } = await exigirAdmin(context);

    const { geocodarEndereco } = await import("./geolocalizacao.server");
    const geocodificado = await geocodarEndereco(data.endereco);
    if (!geocodificado.ok) throw new Error(geocodificado.mensagem);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("unidades")
      .update({
        endereco_completo: geocodificado.enderecoFormatado,
        latitude: geocodificado.latitude,
        longitude: geocodificado.longitude,
      })
      .eq("id", unidadeId);
    if (error) throw new Error(error.message);

    return {
      endereco_completo: geocodificado.enderecoFormatado,
      latitude: geocodificado.latitude,
      longitude: geocodificado.longitude,
    };
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
