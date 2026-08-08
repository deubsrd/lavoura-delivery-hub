import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { isValidCpf, soDigitosCpf } from "./cpf";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const enderecoBase = {
  rua: z.string().trim().min(2).max(160),
  numero: z.string().trim().min(1).max(20),
  bairro: z.string().trim().min(2).max(120),
  complemento: z.string().trim().max(160).optional().nullable(),
  referencia: z.string().trim().max(200).optional().nullable(),
};

const cpfSchema = z
  .string()
  .trim()
  .refine((v) => isValidCpf(v), "CPF inválido");

export type UnidadePublica = {
  id: string;
  nome: string;
  slug: string;
  cidade: string;
  prazo_padrao_horas: number;
  hora_abertura: string;
  hora_fechamento: string;
  hora_limite_pedido: string;
};

export const getUnidadeBySlug = createServerFn({ method: "GET" })
  .inputValidator((data: { slug: string }) => z.object({ slug: z.string().min(1).max(80) }).parse(data))
  .handler(async ({ data }): Promise<UnidadePublica | null> => {
    const { getPublicClient } = await import("./supabase-public.server");
    const supabase = getPublicClient();
    const { data: unidade, error } = await supabase
      .from("unidades_publico")
      .select("id, nome, slug, cidade, prazo_padrao_horas, hora_abertura, hora_fechamento, hora_limite_pedido")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    // As colunas da view unidades_publico são espelhos diretos de colunas
    // NOT NULL em unidades; o gerador de tipos do Supabase marca colunas de
    // view como nullable de forma genérica, mas na prática nunca são.
    return unidade as UnidadePublica | null;
  });

/** Unidade completa (inclui colunas privadas), só para uso interno no servidor. */
async function buscarUnidadeCompletaPorSlug(slug: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: unidade, error } = await supabaseAdmin
    .from("unidades")
    .select(
      "id, nome, slug, cidade, prazo_padrao_horas, hora_abertura, hora_fechamento, hora_limite_pedido, quantidade_maquinas, latitude, longitude, endereco_completo",
    )
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!unidade) throw new Error("Unidade não encontrada.");
  return unidade;
}

export type ClienteEncontrado = {
  nome_completo: string;
  telefone: string;
  ultima_rua: string | null;
  ultimo_numero: string | null;
  ultimo_bairro: string | null;
  ultimo_complemento: string | null;
  ultima_referencia: string | null;
  ultima_rua_entrega: string | null;
  ultimo_numero_entrega: string | null;
  ultimo_bairro_entrega: string | null;
  ultimo_complemento_entrega: string | null;
  ultima_referencia_entrega: string | null;
  ultimo_mesmo_endereco_entrega: boolean | null;
};

export const buscarClientePorCpf = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ slug: z.string().min(1).max(80), cpf: cpfSchema }).parse(data),
  )
  .handler(async ({ data }): Promise<ClienteEncontrado | null> => {
    const unidade = await buscarUnidadeCompletaPorSlug(data.slug);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cliente, error } = await supabaseAdmin
      .from("clientes")
      .select(
        "nome_completo, telefone, ultima_rua, ultimo_numero, ultimo_bairro, ultimo_complemento, ultima_referencia, ultima_rua_entrega, ultimo_numero_entrega, ultimo_bairro_entrega, ultimo_complemento_entrega, ultima_referencia_entrega, ultimo_mesmo_endereco_entrega",
      )
      .eq("unidade_id", unidade.id)
      .eq("cpf", soDigitosCpf(data.cpf))
      .maybeSingle();
    if (error) throw new Error(error.message);
    return cliente ?? null;
  });

export const criarClienteBasico = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        slug: z.string().min(1).max(80),
        cpf: cpfSchema,
        nome_completo: z.string().trim().min(3, "Informe o nome completo").max(160),
        telefone: z
          .string()
          .trim()
          .refine((v) => v.replace(/\D/g, "").length >= 10, "Telefone inválido"),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const unidade = await buscarUnidadeCompletaPorSlug(data.slug);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cpf = soDigitosCpf(data.cpf);

    const { data: existente } = await supabaseAdmin
      .from("clientes")
      .select("id")
      .eq("unidade_id", unidade.id)
      .eq("cpf", cpf)
      .maybeSingle();
    if (existente) return { ok: true };

    const { error } = await supabaseAdmin.from("clientes").insert({
      unidade_id: unidade.id,
      cpf,
      nome_completo: data.nome_completo,
      telefone: data.telefone.replace(/\D/g, ""),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type PrecosBasePublico = {
  valor_lavagem_por_cesto: number;
  valor_secagem_por_cesto: number;
  valor_atendente_por_pedido: number;
};

/**
 * Preços base (lavagem/secagem por cesto + atendente fixo) de uma
 * unidade, para a prévia de valor "ao vivo" na Etapa 4 do formulário
 * público, antes de saber endereço/distância/promoção do dia. Só esses 3
 * números — nada sensível, já é exatamente o que aparece no
 * detalhamento da Etapa 5 pra todo mundo.
 */
export const obterPrecosBase = createServerFn({ method: "GET" })
  .inputValidator((data: { slug: string }) => z.object({ slug: z.string().min(1).max(80) }).parse(data))
  .handler(async ({ data }): Promise<PrecosBasePublico | null> => {
    const unidade = await buscarUnidadeCompletaPorSlug(data.slug);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: precos, error } = await supabaseAdmin
      .from("configuracao_precos")
      .select("valor_lavagem_por_cesto, valor_secagem_por_cesto, valor_atendente_por_pedido")
      .eq("unidade_id", unidade.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return precos;
  });

const resumoInputSchema = z.object({
  slug: z.string().min(1).max(80),
  quantidade_cestos: z.number().int().min(1).max(50),
  tipo_servico: z.enum(["busca", "entrega", "busca_e_entrega"]),
  ...enderecoBase,
  mesmo_endereco_entrega: z.boolean().optional().nullable(),
  rua_entrega: z.string().trim().max(160).optional().nullable(),
  numero_entrega: z.string().trim().max(20).optional().nullable(),
  bairro_entrega: z.string().trim().max(120).optional().nullable(),
  usar_proximo_dia_util: z.boolean().optional(),
});

export type ResumoPedido = {
  distanciaKm: number | null;
  deliveryMensagemErro: string | null;
  foraDoHorario: boolean;
  baseUsadaIso: string;
  previstoIso: string;
  proximoHorarioUtilIso: string;
  detalhamento: { rotulo: string; valor: number }[];
  valorTotal: number;
};

async function montarResumo(input: z.infer<typeof resumoInputSchema>): Promise<{
  unidade: Awaited<ReturnType<typeof buscarUnidadeCompletaPorSlug>>;
  resumo: ResumoPedido;
  precoDetalhado: import("./pedido-calculo.server").ResumoPreco;
}> {
  const unidade = await buscarUnidadeCompletaPorSlug(input.slug);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { calcularPrazo, calcularProximoHorarioUtil, calcularPreco } = await import(
    "./pedido-calculo.server"
  );
  const { calcularDistanciaKm } = await import("./geolocalizacao.server");

  const agora = new Date();
  const baseDateTime = input.usar_proximo_dia_util
    ? calcularProximoHorarioUtil(unidade, agora)
    : agora;

  const prazo = calcularPrazo(unidade, input.quantidade_cestos, baseDateTime);
  const proximoHorarioUtil = calcularProximoHorarioUtil(unidade, agora);

  // O valor do delivery é cobrado uma vez por "perna" do trajeto: só
  // busca ou só entrega tem uma perna; busca_e_entrega tem duas — a
  // mesma distância nas duas (mesmo endereço) ou distâncias diferentes
  // se o endereço de entrega for outro. Evita geocodificar duas vezes
  // quando o endereço é o mesmo (mais rápido e mais gentil com o limite
  // de requisições do Nominatim).
  const enderecoColeta = `${input.rua}, ${input.numero} - ${input.bairro}, ${unidade.cidade}`;
  const distanciaColeta = await calcularDistanciaKm({
    origemLatitude: unidade.latitude,
    origemLongitude: unidade.longitude,
    enderecoDestino: enderecoColeta,
  });

  const tipoPernaUnica: "coleta" | "entrega" = input.tipo_servico === "entrega" ? "entrega" : "coleta";
  let pernas: { tipo: "coleta" | "entrega"; distanciaKm: number | null }[];
  let deliveryMensagemErro: string | null = distanciaColeta.ok ? null : distanciaColeta.mensagem;

  if (input.tipo_servico !== "busca_e_entrega") {
    pernas = [{ tipo: tipoPernaUnica, distanciaKm: distanciaColeta.ok ? distanciaColeta.distanciaKm : null }];
  } else {
    const mesmoEndereco = input.mesmo_endereco_entrega ?? true;
    let distanciaEntrega = distanciaColeta;
    if (!mesmoEndereco && input.rua_entrega && input.numero_entrega && input.bairro_entrega) {
      const enderecoEntrega = `${input.rua_entrega}, ${input.numero_entrega} - ${input.bairro_entrega}, ${unidade.cidade}`;
      distanciaEntrega = await calcularDistanciaKm({
        origemLatitude: unidade.latitude,
        origemLongitude: unidade.longitude,
        enderecoDestino: enderecoEntrega,
      });
      if (!distanciaEntrega.ok) deliveryMensagemErro = distanciaEntrega.mensagem;
    }
    pernas = [
      { tipo: "coleta", distanciaKm: distanciaColeta.ok ? distanciaColeta.distanciaKm : null },
      { tipo: "entrega", distanciaKm: distanciaEntrega.ok ? distanciaEntrega.distanciaKm : null },
    ];
  }

  const [{ data: precos }, { data: faixas }, { data: promocoes }] = await Promise.all([
    supabaseAdmin
      .from("configuracao_precos")
      .select("valor_lavagem_por_cesto, valor_secagem_por_cesto, valor_atendente_por_pedido")
      .eq("unidade_id", unidade.id)
      .maybeSingle(),
    supabaseAdmin
      .from("faixas_delivery")
      .select("distancia_ate_km, valor")
      .eq("unidade_id", unidade.id),
    supabaseAdmin
      .from("promocoes_dia_semana")
      .select("dia_semana, tipo_desconto, valor, aplica_em, ativo")
      .eq("unidade_id", unidade.id),
  ]);
  if (!precos) throw new Error("Preços não configurados para esta unidade. Contate o suporte.");

  const preco = calcularPreco(
    precos,
    faixas ?? [],
    promocoes ?? [],
    input.quantidade_cestos,
    pernas,
    prazo.baseUsada,
  );

  return {
    unidade,
    precoDetalhado: preco,
    resumo: {
      distanciaKm: pernas[0]?.distanciaKm ?? null,
      deliveryMensagemErro: preco.deliveryIndisponivel ? deliveryMensagemErro : null,
      foraDoHorario: prazo.foraDoHorario,
      baseUsadaIso: prazo.baseUsada.toISOString(),
      previstoIso: prazo.previsto.toISOString(),
      proximoHorarioUtilIso: proximoHorarioUtil.toISOString(),
      detalhamento: preco.detalhamento,
      valorTotal: preco.valorTotal,
    },
  };
}

export const calcularResumoPedido = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => resumoInputSchema.parse(data))
  .handler(async ({ data }): Promise<ResumoPedido> => {
    const { resumo } = await montarResumo(data);
    return resumo;
  });

export const pedidoSchema = z
  .object({
    slug: z.string().trim().min(1).max(80),
    cpf: cpfSchema,
    nome_completo: z.string().trim().min(3, "Informe o nome completo").max(160).optional(),
    telefone: z
      .string()
      .trim()
      .refine((v) => v.replace(/\D/g, "").length >= 10, "Telefone inválido")
      .optional(),
    ...enderecoBase,
    quantidade_cestos: z.number().int().min(1).max(50),
    tipo_servico: z.enum(["busca", "entrega", "busca_e_entrega"]),
    observacoes: z.string().trim().max(800).optional().nullable(),
    mesmo_endereco_entrega: z.boolean().optional().nullable(),
    rua_entrega: z.string().trim().max(160).optional().nullable(),
    numero_entrega: z.string().trim().max(20).optional().nullable(),
    bairro_entrega: z.string().trim().max(120).optional().nullable(),
    complemento_entrega: z.string().trim().max(160).optional().nullable(),
    referencia_entrega: z.string().trim().max(200).optional().nullable(),
    usar_proximo_dia_util: z.boolean().optional(),
    // Honeypot anti-spam: precisa vir vazio.
    armadilha: z.string().max(0).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.tipo_servico === "busca_e_entrega") {
      if (typeof data.mesmo_endereco_entrega !== "boolean") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["mesmo_endereco_entrega"],
          message: "Responda se o endereço de entrega é o mesmo",
        });
        return;
      }
      if (data.mesmo_endereco_entrega === false) {
        for (const campo of ["rua_entrega", "numero_entrega", "bairro_entrega"] as const) {
          if (!data[campo] || String(data[campo]).trim().length < 1) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [campo],
              message: "Campo obrigatório para o endereço de entrega",
            });
          }
        }
      }
    }
  });

export type PedidoInput = z.infer<typeof pedidoSchema>;

export const criarPedido = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => pedidoSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const request = getRequest();
    const ip =
      request?.headers.get("cf-connecting-ip") ??
      request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "desconhecido";

    const { unidade, resumo, precoDetalhado } = await montarResumo({
      slug: data.slug,
      quantidade_cestos: data.quantidade_cestos,
      tipo_servico: data.tipo_servico,
      rua: data.rua,
      numero: data.numero,
      bairro: data.bairro,
      complemento: data.complemento,
      referencia: data.referencia,
      mesmo_endereco_entrega: data.mesmo_endereco_entrega,
      rua_entrega: data.rua_entrega,
      numero_entrega: data.numero_entrega,
      bairro_entrega: data.bairro_entrega,
      usar_proximo_dia_util: data.usar_proximo_dia_util,
    });

    // Defesa contra client malicioso pulando a etapa de confirmação de
    // reagendamento: sem usar_proximo_dia_util, um pedido fora do horário
    // nunca é aceito, mesmo que o client tenha calculado outra coisa.
    if (!data.usar_proximo_dia_util && resumo.foraDoHorario) {
      throw new Error(
        "Fora do horário de atendimento para hoje. Volte e escolha agendar para o próximo dia útil.",
      );
    }

    const cpf = soDigitosCpf(data.cpf);
    let { data: cliente } = await supabaseAdmin
      .from("clientes")
      .select("id, nome_completo, telefone")
      .eq("unidade_id", unidade.id)
      .eq("cpf", cpf)
      .maybeSingle();

    if (!cliente) {
      if (!data.nome_completo || !data.telefone) {
        throw new Error("Cliente novo: informe nome completo e telefone.");
      }
      const { data: novoCliente, error: clienteErr } = await supabaseAdmin
        .from("clientes")
        .insert({
          unidade_id: unidade.id,
          cpf,
          nome_completo: data.nome_completo,
          telefone: data.telefone.replace(/\D/g, ""),
        })
        .select("id, nome_completo, telefone")
        .single();
      if (clienteErr) throw new Error(clienteErr.message);
      cliente = novoCliente;
    }

    // Proteção básica anti-spam: limite por IP e por telefone.
    const quinzeMin = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count: porIp } = await supabaseAdmin
      .from("pedidos_delivery")
      .select("id", { count: "exact", head: true })
      .eq("ip_origem", ip)
      .gte("created_at", quinzeMin);
    if ((porIp ?? 0) >= 5) {
      throw new Error("Muitos pedidos enviados deste dispositivo. Tente novamente em alguns minutos.");
    }

    const { count: porTelefone } = await supabaseAdmin
      .from("pedidos_delivery")
      .select("id", { count: "exact", head: true })
      .eq("telefone", cliente.telefone)
      .gte("created_at", new Date(Date.now() - 3 * 60 * 1000).toISOString());
    if ((porTelefone ?? 0) >= 1) {
      throw new Error("Já recebemos um pedido com este telefone há poucos minutos.");
    }

    const agora = new Date();
    const enderecoDiferente =
      data.tipo_servico === "busca_e_entrega" && data.mesmo_endereco_entrega === false;

    const { data: pedido, error } = await supabaseAdmin
      .from("pedidos_delivery")
      .insert({
        unidade_id: unidade.id,
        cliente_id: cliente.id,
        nome_completo: cliente.nome_completo,
        telefone: cliente.telefone,
        rua: data.rua,
        numero: data.numero,
        bairro: data.bairro,
        complemento: data.complemento || null,
        referencia: data.referencia || null,
        mesmo_endereco_entrega:
          data.tipo_servico === "busca_e_entrega" ? (data.mesmo_endereco_entrega ?? null) : null,
        rua_entrega: enderecoDiferente ? (data.rua_entrega ?? null) : null,
        numero_entrega: enderecoDiferente ? (data.numero_entrega ?? null) : null,
        bairro_entrega: enderecoDiferente ? (data.bairro_entrega ?? null) : null,
        complemento_entrega: enderecoDiferente ? data.complemento_entrega || null : null,
        referencia_entrega: enderecoDiferente ? data.referencia_entrega || null : null,
        quantidade_cestos: data.quantidade_cestos,
        tipo_servico: data.tipo_servico,
        observacoes: data.observacoes || null,
        status: "recebido" as const,
        data_pedido: agora.toISOString(),
        data_prevista_retorno: resumo.previstoIso,
        ip_origem: ip,
        valor_lavagem: precoDetalhado.valorLavagem,
        valor_secagem: precoDetalhado.valorSecagem,
        valor_atendente: precoDetalhado.valorAtendente,
        valor_delivery: precoDetalhado.valorDelivery,
        valor_desconto: precoDetalhado.valorDesconto,
        desconto_descricao: precoDetalhado.descontoDescricao,
        distancia_km: resumo.distanciaKm,
        valor_total: resumo.valorTotal,
      })
      .select("id, data_prevista_retorno, data_pedido")
      .single();

    if (error) throw new Error(error.message);

    await supabaseAdmin
      .from("clientes")
      .update({
        ultima_rua: data.rua,
        ultimo_numero: data.numero,
        ultimo_bairro: data.bairro,
        ultimo_complemento: data.complemento || null,
        ultima_referencia: data.referencia || null,
        ultima_rua_entrega: enderecoDiferente ? (data.rua_entrega ?? null) : null,
        ultimo_numero_entrega: enderecoDiferente ? (data.numero_entrega ?? null) : null,
        ultimo_bairro_entrega: enderecoDiferente ? (data.bairro_entrega ?? null) : null,
        ultimo_complemento_entrega: enderecoDiferente ? data.complemento_entrega || null : null,
        ultima_referencia_entrega: enderecoDiferente ? data.referencia_entrega || null : null,
        ultimo_mesmo_endereco_entrega:
          data.tipo_servico === "busca_e_entrega" ? (data.mesmo_endereco_entrega ?? null) : null,
      })
      .eq("id", cliente.id);

    const { notificarStatusPedido } = await import("./notificacoes.server");
    await notificarStatusPedido({
      pedidoId: pedido.id,
      telefone: cliente.telefone,
      nome: cliente.nome_completo,
      status: "recebido",
    });

    return {
      id: pedido.id,
      data_prevista_retorno: pedido.data_prevista_retorno,
      unidade_nome: unidade.nome,
      detalhamento: resumo.detalhamento,
      valor_total: resumo.valorTotal,
    };
  });

/**
 * Dispara a notificação de mudança de status (pronto/entregue) a partir do
 * painel. Confere que o pedido pertence à unidade da atendente logada antes
 * de notificar — o client já faz a mudança de status via RLS, esta função
 * só cuida do efeito colateral do webhook.
 */
export const notificarMudancaStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ pedidoId: z.string().uuid(), status: z.enum(["pronto", "entregue"]) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: pedido, error } = await context.supabase
      .from("pedidos_delivery")
      .select("id, nome_completo, telefone")
      .eq("id", data.pedidoId)
      .maybeSingle();
    if (error || !pedido) return { ok: false };

    const { notificarStatusPedido } = await import("./notificacoes.server");
    await notificarStatusPedido({
      pedidoId: pedido.id,
      telefone: pedido.telefone,
      nome: pedido.nome_completo,
      status: data.status,
    });
    return { ok: true };
  });
