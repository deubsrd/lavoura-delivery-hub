import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { isValidCpf, soDigitosCpf } from "./cpf";
import { exigirAtendente } from "./unidade.functions";
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
  hora_limite_pedido: string;
  // Diferente dos campos acima, esses dois são de fato opcionais na tabela
  // (a unidade pode nunca ter configurado uma mídia) — só ficam null.
  midia_propaganda_url: string | null;
  midia_propaganda_tipo: "imagem" | "video" | null;
};

export const getUnidadeBySlug = createServerFn({ method: "GET" })
  .inputValidator((data: { slug: string }) =>
    z.object({ slug: z.string().min(1).max(80) }).parse(data),
  )
  .handler(async ({ data }): Promise<UnidadePublica | null> => {
    const { getPublicClient } = await import("./supabase-public.server");
    const supabase = getPublicClient();
    const { data: unidade, error } = await supabase
      .from("unidades_publico")
      .select(
        "id, nome, slug, cidade, prazo_padrao_horas, hora_limite_pedido, midia_propaganda_url, midia_propaganda_tipo",
      )
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    // As colunas da view unidades_publico são espelhos diretos de colunas
    // NOT NULL em unidades; o gerador de tipos do Supabase marca colunas de
    // view como nullable de forma genérica, mas na prática nunca são —
    // exceto midia_propaganda_*, que são de fato opcionais.
    return unidade as UnidadePublica | null;
  });

/** Unidade completa (inclui colunas privadas), só para uso interno no servidor. */
async function buscarUnidadeCompletaPorSlug(slug: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: unidade, error } = await supabaseAdmin
    .from("unidades")
    .select(
      "id, nome, slug, cidade, prazo_padrao_horas, hora_limite_pedido, quantidade_maquinas, latitude, longitude, endereco_completo",
    )
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!unidade) throw new Error("Unidade não encontrada.");
  return unidade;
}

export type HorarioDiaPublico = {
  dia_semana: number;
  ativo: boolean;
  hora_abertura: string;
  hora_fechamento: string;
};

export type HorariosPublico = {
  horarios: HorarioDiaPublico[];
  hora_limite_pedido: string;
  textoHoje: string;
  // A unidade está aceitando pedidos normalmente agora (dentro do
  // expediente e antes do horário-limite de pedido)? Usado pelo formulário
  // pra decidir entre mostrar a grade de horários de coleta (regra: cliente
  // escolhe o horário) ou pular direto pro aviso de "fora do horário,
  // deseja agendar pro próximo horário livre?" — ver $slug.pedido.tsx.
  atendendoAgora: boolean;
};

/**
 * Horário de funcionamento por dia da semana + texto pronto do horário de
 * hoje, para o cabeçalho do formulário público. O "hoje" é calculado no
 * servidor (fuso da unidade), não no browser do cliente.
 */
export const obterHorariosPublico = createServerFn({ method: "GET" })
  .inputValidator((data: { slug: string }) =>
    z.object({ slug: z.string().min(1).max(80) }).parse(data),
  )
  .handler(async ({ data }): Promise<HorariosPublico> => {
    const unidade = await buscarUnidadeCompletaPorSlug(data.slug);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: horarios, error } = await supabaseAdmin
      .from("horarios_unidade")
      .select("dia_semana, ativo, hora_abertura, hora_fechamento")
      .eq("unidade_id", unidade.id)
      .order("dia_semana");
    if (error) throw new Error(error.message);

    const { diaSemanaLocal, pedidoForaDoHorarioAgora } = await import("./pedido-calculo.server");
    const { textoHorarioHoje } = await import("./lavoura");
    const agora = new Date();
    const hoje = (horarios ?? []).find((h) => h.dia_semana === diaSemanaLocal(agora)) ?? null;

    return {
      horarios: horarios ?? [],
      hora_limite_pedido: unidade.hora_limite_pedido,
      textoHoje: textoHorarioHoje(hoje),
      atendendoAgora: !pedidoForaDoHorarioAgora(unidade, horarios ?? [], agora),
    };
  });

/**
 * Horários de coleta já reservados por outros pedidos da unidade (a partir
 * de agora — coletas passadas não interessam pra grade de disponibilidade).
 * Pedidos cancelados liberam o horário de volta, por isso ficam de fora.
 * Devolve um Set de epoch ms pra comparação O(1) contra os slots da grade.
 */
async function buscarHorariosOcupados(
  supabaseAdmin: import("@supabase/supabase-js").SupabaseClient,
  unidadeId: string,
  agora: Date,
): Promise<Set<number>> {
  const { data, error } = await supabaseAdmin
    .from("pedidos_delivery")
    .select("horario_coleta")
    .eq("unidade_id", unidadeId)
    .neq("status", "cancelado")
    .not("horario_coleta", "is", null)
    .gte("horario_coleta", agora.toISOString());
  if (error) throw new Error(error.message);
  return new Set(
    (data ?? [])
      .map((linha) => (linha.horario_coleta ? new Date(linha.horario_coleta).getTime() : null))
      .filter((v): v is number => v !== null),
  );
}

/**
 * Soma de cestos já reservados por dia (chave "YYYY-MM-DD" no fuso da
 * unidade — ver chaveDiaLocal), pra aplicar o teto de capacidade diária
 * (CAPACIDADE_MAXIMA_CESTOS_POR_DIA em pedido-calculo.server.ts). Mesmo
 * filtro de buscarHorariosOcupados: só pedidos não cancelados com coleta a
 * partir de agora.
 */
async function buscarCestosOcupadosPorDia(
  supabaseAdmin: import("@supabase/supabase-js").SupabaseClient,
  unidadeId: string,
  agora: Date,
): Promise<Map<string, number>> {
  const { data, error } = await supabaseAdmin
    .from("pedidos_delivery")
    .select("horario_coleta, quantidade_cestos")
    .eq("unidade_id", unidadeId)
    .neq("status", "cancelado")
    .not("horario_coleta", "is", null)
    .gte("horario_coleta", agora.toISOString());
  if (error) throw new Error(error.message);

  const { chaveDiaLocal } = await import("./pedido-calculo.server");
  const mapa = new Map<string, number>();
  for (const linha of data ?? []) {
    if (!linha.horario_coleta) continue;
    const chave = chaveDiaLocal(new Date(linha.horario_coleta));
    mapa.set(chave, (mapa.get(chave) ?? 0) + linha.quantidade_cestos);
  }
  return mapa;
}

export type DiaColetaPublico = import("./pedido-calculo.server").DiaColetaPublico;
export type SlotColetaPublico = import("./pedido-calculo.server").SlotColetaPublico;

/**
 * Grade pública de horários de coleta disponíveis (regra: intervalo mínimo
 * de 30 min entre coletas da unidade — ver DURACAO_SLOT_COLETA_MINUTOS em
 * pedido-calculo.server.ts). `quantidade_cestos` entra no cálculo porque um
 * pedido maior pode não caber num slot perto do fechamento (ver
 * slotCabeNoMesmoDia). Só é chamada quando a unidade está atendendo agora —
 * quando está fora do horário, o formulário pula direto pro fluxo de
 * agendamento automático (ver criarPedido/montarResumo).
 */
export const obterSlotsColeta = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        slug: z.string().min(1).max(80),
        quantidade_cestos: z.number().int().min(1).max(50),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<DiaColetaPublico[]> => {
    const unidade = await buscarUnidadeCompletaPorSlug(data.slug);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: horarios, error } = await supabaseAdmin
      .from("horarios_unidade")
      .select("dia_semana, ativo, hora_abertura, hora_fechamento")
      .eq("unidade_id", unidade.id);
    if (error) throw new Error(error.message);

    const { gerarSlotsColetaDisponiveis, formatarSlotsColetaPublico } =
      await import("./pedido-calculo.server");
    const agora = new Date();
    const [ocupados, cestosPorDia] = await Promise.all([
      buscarHorariosOcupados(supabaseAdmin, unidade.id, agora),
      buscarCestosOcupadosPorDia(supabaseAdmin, unidade.id, agora),
    ]);
    const DIAS_JANELA_PUBLICA = 6;
    const dias = gerarSlotsColetaDisponiveis(
      unidade,
      horarios ?? [],
      data.quantidade_cestos,
      agora,
      ocupados,
      cestosPorDia,
      DIAS_JANELA_PUBLICA,
    );
    return formatarSlotsColetaPublico(dias);
  });

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
 * público, antes de saber endereço/distância/preço de horário especial. Só
 * esses 3 números — nada sensível, já é exatamente o que aparece no
 * detalhamento da Etapa 5 pra todo mundo.
 */
export const obterPrecosBase = createServerFn({ method: "GET" })
  .inputValidator((data: { slug: string }) =>
    z.object({ slug: z.string().min(1).max(80) }).parse(data),
  )
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
  // Horário de coleta escolhido pelo cliente na grade de disponibilidade
  // (obterSlotsColeta). Só é obrigatório quando a unidade está atendendo
  // normalmente agora — quando está fora do horário, ninguém escolhe nada,
  // o próximo horário livre é atribuído automaticamente (ver montarResumo).
  horario_coleta: z.string().datetime().optional(),
  usar_proximo_dia_util: z.boolean().optional(),
});

export type ResumoPedido = {
  distanciaKm: number | null;
  deliveryMensagemErro: string | null;
  foraDoHorario: boolean;
  // Pedido feito com a unidade fechada (fora do horário de funcionamento no
  // momento do envio) — regra de negócio: não exige aceite manual da
  // atendente nem dispara o alerta sonoro (ver pedido_fora_do_horario e
  // painel.tsx). Distinto de `foraDoHorario`: esse também fica true quando
  // a unidade está aberta mas o horário de coleta escolhido não dá tempo de
  // terminar o ciclo antes do fechamento — nesse caso o pedido some da fila
  // normalmente, só precisa reagendar o horário.
  pedidoForaDoHorario: boolean;
  horarioColetaIso: string;
  baseUsadaIso: string;
  previstoIso: string;
  proximoHorarioUtilIso: string;
  detalhamento: { rotulo: string; valor: number }[];
  valorTotal: number;
};

export async function montarResumo(input: z.infer<typeof resumoInputSchema>): Promise<{
  unidade: Awaited<ReturnType<typeof buscarUnidadeCompletaPorSlug>>;
  horarios: import("./pedido-calculo.server").HorarioDia[];
  ocupados: Set<number>;
  cestosPorDia: Map<string, number>;
  resumo: ResumoPedido;
  precoDetalhado: import("./pedido-calculo.server").ResumoPreco;
}> {
  const unidade = await buscarUnidadeCompletaPorSlug(input.slug);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const {
    calcularPrazo,
    calcularProximoHorarioUtil,
    calcularPreco,
    pedidoForaDoHorarioAgora,
    primeiroSlotColetaLivre,
  } = await import("./pedido-calculo.server");
  const { calcularDistanciaKm } = await import("./geolocalizacao.server");

  const { data: horariosData } = await supabaseAdmin
    .from("horarios_unidade")
    .select("dia_semana, ativo, hora_abertura, hora_fechamento")
    .eq("unidade_id", unidade.id);
  const horarios = horariosData ?? [];

  const agora = new Date();
  const [ocupados, cestosPorDia] = await Promise.all([
    buscarHorariosOcupados(supabaseAdmin, unidade.id, agora),
    buscarCestosOcupadosPorDia(supabaseAdmin, unidade.id, agora),
  ]);
  const proximoSlotLivre =
    primeiroSlotColetaLivre(
      unidade,
      horarios,
      input.quantidade_cestos,
      agora,
      ocupados,
      cestosPorDia,
      21,
    ) ?? calcularProximoHorarioUtil(horarios, agora);

  // "Fora do horário" pra fins da regra de negócio é sobre o instante em
  // que o PEDIDO é feito, não sobre o horário de coleta escolhido (que
  // pode ser um dia futuro mesmo com a unidade aberta agora). Um
  // horario_coleta explícito do cliente sempre vence — mesmo fora do
  // horário de atendimento a grade de horários fica disponível pro cliente
  // escolher (ver SeletorHorarioColeta no form público). Só cai no
  // próximo horário livre automático quando o cliente não escolheu nada
  // (fallback de segurança contra um client que pule a grade).
  const pedidoForaDoHorario = pedidoForaDoHorarioAgora(unidade, horarios, agora);

  let baseDateTime: Date;
  if (input.horario_coleta) {
    baseDateTime = new Date(input.horario_coleta);
    if (Number.isNaN(baseDateTime.getTime())) throw new Error("Horário de coleta inválido.");
  } else if (input.usar_proximo_dia_util === true || pedidoForaDoHorario) {
    baseDateTime = proximoSlotLivre;
  } else {
    throw new Error("Escolha o horário da coleta.");
  }

  const prazo = calcularPrazo(unidade, horarios, input.quantidade_cestos, baseDateTime);

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

  const tipoPernaUnica: "coleta" | "entrega" =
    input.tipo_servico === "entrega" ? "entrega" : "coleta";
  let pernas: { tipo: "coleta" | "entrega"; distanciaKm: number | null }[];
  let deliveryMensagemErro: string | null = distanciaColeta.ok ? null : distanciaColeta.mensagem;

  if (input.tipo_servico !== "busca_e_entrega") {
    pernas = [
      {
        tipo: tipoPernaUnica,
        distanciaKm: distanciaColeta.ok ? distanciaColeta.distanciaKm : null,
      },
    ];
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

  // Promoção/desconto por dia da semana foi removida do cálculo (decisão de
  // negócio — ver PR de remoção de promoções), então não busca mais
  // promocoes_dia_semana aqui.
  const [{ data: precos }, { data: faixas }, { data: precosPorHorario }] = await Promise.all([
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
      .from("precos_por_horario")
      .select("dia_semana, hora_inicio, hora_fim, valor_cesto")
      .eq("unidade_id", unidade.id),
  ]);
  if (!precos) throw new Error("Preços não configurados para esta unidade. Contate o suporte.");

  const preco = calcularPreco(
    precos,
    faixas ?? [],
    precosPorHorario ?? [],
    input.quantidade_cestos,
    pernas,
    prazo.baseUsada,
  );

  return {
    unidade,
    horarios,
    ocupados,
    cestosPorDia,
    precoDetalhado: preco,
    resumo: {
      distanciaKm: pernas[0]?.distanciaKm ?? null,
      deliveryMensagemErro: preco.deliveryIndisponivel ? deliveryMensagemErro : null,
      // Além da unidade fechada agora, um horário de coleta escolhido perto
      // do fechamento que estoure o prazo do ciclo também força reagendar
      // (ver slotCabeNoMesmoDia — na prática a grade de obterSlotsColeta já
      // não oferece esses horários, isso é só defesa contra um client que
      // pule a grade e mande um horario_coleta arbitrário).
      foraDoHorario: pedidoForaDoHorario || prazo.foraDoHorario,
      pedidoForaDoHorario,
      horarioColetaIso: baseDateTime.toISOString(),
      baseUsadaIso: prazo.baseUsada.toISOString(),
      previstoIso: prazo.previsto.toISOString(),
      proximoHorarioUtilIso: proximoSlotLivre.toISOString(),
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
    horario_coleta: z.string().datetime().optional(),
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

    const { unidade, horarios, ocupados, cestosPorDia, resumo, precoDetalhado } = await montarResumo({
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
      horario_coleta: data.horario_coleta,
      usar_proximo_dia_util: data.usar_proximo_dia_util,
    });

    // Defesa contra client malicioso pulando a etapa de escolha de
    // horário: fora do horário de atendimento, o pedido só é aceito se o
    // cliente escolheu um horario_coleta explícito na grade (fluxo atual)
    // ou confirmou o agendamento automático via usar_proximo_dia_util
    // (fallback legado).
    if (!data.usar_proximo_dia_util && !data.horario_coleta && resumo.foraDoHorario) {
      throw new Error(
        "Fora do horário de atendimento para hoje. Volte e escolha um horário de coleta.",
      );
    }

    // Defesa extra pro caminho manual: o horário devolvido por montarResumo
    // precisa realmente estar disponível — alinhado à grade, dia ainda com
    // capacidade (CAPACIDADE_MAXIMA_CESTOS_POR_DIA) e horário não ocupado —
    // protege contra um client que pule obterSlotsColeta ou mande um
    // horario_coleta desatualizado/arbitrário. Usa ocupados/cestosPorDia já
    // buscados em montarResumo (mesmo instante, sem round-trip extra);
    // concorrência real entre dois clientes fechando o mesmo slot ao mesmo
    // tempo é resolvida pelo índice único no banco
    // (idx_pedidos_unidade_horario_coleta), tratado no catch do insert logo
    // abaixo — o teto de capacidade diária, por não ter um índice
    // equivalente, tem uma janela de corrida bem menor (não eliminada) sob
    // concorrência pesada no mesmo dia.
    if (!data.usar_proximo_dia_util) {
      const { slotDisponivel } = await import("./pedido-calculo.server");
      const disponivel = slotDisponivel(
        unidade,
        horarios,
        data.quantidade_cestos,
        new Date(),
        ocupados,
        cestosPorDia,
        new Date(resumo.horarioColetaIso),
      );
      if (!disponivel) {
        throw new Error(
          "Esse horário de coleta não está mais disponível (dia lotado ou horário ocupado). Volte e escolha outro.",
        );
      }
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

    // Proteção básica anti-spam: só por IP — um cliente legítimo pode fazer
    // vários pedidos seguidos (endereços diferentes, tipos de serviço
    // diferentes, etc.), então não há limite por telefone.
    const quinzeMin = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count: porIp } = await supabaseAdmin
      .from("pedidos_delivery")
      .select("id", { count: "exact", head: true })
      .eq("ip_origem", ip)
      .gte("created_at", quinzeMin);
    if ((porIp ?? 0) >= 5) {
      throw new Error(
        "Muitos pedidos enviados deste dispositivo. Tente novamente em alguns minutos.",
      );
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
        horario_coleta: resumo.horarioColetaIso,
        pedido_fora_do_horario: resumo.pedidoForaDoHorario,
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
      .select("id, data_prevista_retorno, data_pedido, horario_coleta")
      .single();

    if (error) {
      // Índice único idx_pedidos_unidade_horario_coleta: outro pedido
      // fechou esse exato horário entre o cliente escolher o slot e
      // confirmar o pedido. Mensagem amigável em vez do erro cru do
      // Postgres — o client deve voltar pra escolha de horário.
      if (error.code === "23505") {
        throw new Error(
          "Esse horário de coleta acabou de ser reservado por outro cliente. Volte e escolha outro horário.",
        );
      }
      throw new Error(error.message);
    }

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
      horario_coleta: pedido.horario_coleta,
      pedido_fora_do_horario: resumo.pedidoForaDoHorario,
      unidade_nome: unidade.nome,
      detalhamento: resumo.detalhamento,
      valor_total: resumo.valorTotal,
    };
  });

/**
 * Cria de fato um pedido de balcão (cliente traz a roupa pessoalmente e
 * busca depois) — usado tanto pelo fluxo dedicado (criarPedidoBalcao, aberto
 * a qualquer atendente) quanto pela opção "Balcão" dentro do Pedido Manual
 * (admin). Sem endereço, sem motoboy, sem horário de coleta agendado (a
 * coleta é "agora"). Preço: SÓ o serviço da atendente — lavagem, secagem e
 * a quantidade de cestos não entram no valor do pedido porque são pagos no
 * totem de pagamento da loja, fora deste sistema.
 */
async function criarPedidoBalcaoInterno(params: {
  unidadeId: string;
  cpf: string;
  nomeCompleto?: string | undefined;
  telefone?: string | undefined;
  quantidadeCestos: number;
  observacoes?: string | null | undefined;
}): Promise<{ id: string; data_prevista_retorno: string | null; valor_total: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: unidade, error: unidadeErr } = await supabaseAdmin
    .from("unidades")
    .select("id, hora_limite_pedido, quantidade_maquinas")
    .eq("id", params.unidadeId)
    .single();
  if (unidadeErr || !unidade) throw new Error("Unidade não encontrada.");

  const [{ data: horarios }, { data: precos }] = await Promise.all([
    supabaseAdmin
      .from("horarios_unidade")
      .select("dia_semana, ativo, hora_abertura, hora_fechamento")
      .eq("unidade_id", unidade.id),
    supabaseAdmin
      .from("configuracao_precos")
      .select("valor_atendente_por_pedido")
      .eq("unidade_id", unidade.id)
      .maybeSingle(),
  ]);
  if (!precos) throw new Error("Preços não configurados para esta unidade. Contate o suporte.");

  const { calcularPrazo } = await import("./pedido-calculo.server");
  const agora = new Date();
  const prazo = calcularPrazo(unidade, horarios ?? [], params.quantidadeCestos, agora);

  const cpf = soDigitosCpf(params.cpf);
  let { data: cliente } = await supabaseAdmin
    .from("clientes")
    .select("id, nome_completo, telefone")
    .eq("unidade_id", unidade.id)
    .eq("cpf", cpf)
    .maybeSingle();

  if (!cliente) {
    if (!params.nomeCompleto || !params.telefone) {
      throw new Error("Cliente novo: informe nome completo e telefone.");
    }
    const { data: novoCliente, error: clienteErr } = await supabaseAdmin
      .from("clientes")
      .insert({
        unidade_id: unidade.id,
        cpf,
        nome_completo: params.nomeCompleto,
        telefone: params.telefone.replace(/\D/g, ""),
      })
      .select("id, nome_completo, telefone")
      .single();
    if (clienteErr) throw new Error(clienteErr.message);
    cliente = novoCliente;
  }

  const valorAtendente = precos.valor_atendente_por_pedido;

  const { data: pedido, error } = await supabaseAdmin
    .from("pedidos_delivery")
    .insert({
      unidade_id: unidade.id,
      cliente_id: cliente.id,
      nome_completo: cliente.nome_completo,
      telefone: cliente.telefone,
      rua: null,
      numero: null,
      bairro: null,
      quantidade_cestos: params.quantidadeCestos,
      tipo_servico: "balcao",
      observacoes: params.observacoes || null,
      status: "recebido" as const,
      data_pedido: agora.toISOString(),
      data_prevista_retorno: prazo.previsto.toISOString(),
      horario_coleta: null,
      pedido_fora_do_horario: false,
      visualizado_em: agora.toISOString(),
      origem: "manual",
      valor_lavagem: 0,
      valor_secagem: 0,
      valor_atendente: valorAtendente,
      valor_delivery: null,
      valor_desconto: 0,
      desconto_descricao: null,
      distancia_km: null,
      valor_total: valorAtendente,
    })
    .select("id, data_prevista_retorno, data_pedido")
    .single();
  if (error) throw new Error(error.message);

  return {
    id: pedido.id,
    data_prevista_retorno: pedido.data_prevista_retorno,
    valor_total: valorAtendente,
  };
}

export const pedidoManualSchema = z
  .object({
    cpf: cpfSchema,
    nome_completo: z.string().trim().min(3, "Informe o nome completo").max(160).optional(),
    telefone: z
      .string()
      .trim()
      .refine((v) => v.replace(/\D/g, "").length >= 10, "Telefone inválido")
      .optional(),
    // Diferente do fluxo público (enderecoBase), aqui rua/numero/bairro só
    // são obrigatórios quando o tipo NÃO é "balcao" — validado abaixo no
    // superRefine, já que dependem do tipo_servico escolhido.
    rua: z.string().trim().max(160).optional(),
    numero: z.string().trim().max(20).optional(),
    bairro: z.string().trim().max(120).optional(),
    complemento: z.string().trim().max(160).optional().nullable(),
    referencia: z.string().trim().max(200).optional().nullable(),
    quantidade_cestos: z.number().int().min(1).max(50),
    tipo_servico: z.enum(["busca", "entrega", "busca_e_entrega", "balcao"]),
    observacoes: z.string().trim().max(800).optional().nullable(),
    mesmo_endereco_entrega: z.boolean().optional().nullable(),
    rua_entrega: z.string().trim().max(160).optional().nullable(),
    numero_entrega: z.string().trim().max(20).optional().nullable(),
    bairro_entrega: z.string().trim().max(120).optional().nullable(),
    complemento_entrega: z.string().trim().max(160).optional().nullable(),
    referencia_entrega: z.string().trim().max(200).optional().nullable(),
    // Diferente do fluxo público, aqui o horário é sempre escolhido
    // explicitamente pela atendente — não existe agendamento automático.
    // Balcão não tem horário de coleta: a coleta é "agora" (cliente já
    // está na loja).
    horario_coleta: z.string().datetime().optional(),
  })
  .superRefine((data, ctx) => {
    // Balcão: sem endereço, sem horário de coleta — nada mais a validar.
    if (data.tipo_servico === "balcao") return;

    if (!data.rua || data.rua.trim().length < 2) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["rua"], message: "Informe a rua" });
    }
    if (!data.numero || data.numero.trim().length < 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["numero"], message: "Informe o número" });
    }
    if (!data.bairro || data.bairro.trim().length < 2) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["bairro"], message: "Informe o bairro" });
    }
    if (!data.horario_coleta) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["horario_coleta"],
        message: "Escolha o horário da coleta",
      });
    }

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

/**
 * Registra, pelo painel, um pedido feito por fora do link público (ex.:
 * telefone, balcão) — pra dar controle sobre esses pedidos em vez de
 * deixá-los sem nenhum registro. Aberto a qualquer atendente da unidade
 * (não só admin) — é uma tarefa operacional do dia a dia, não uma ação
 * administrativa. Reaproveita o mesmo motor de prazo/preço do fluxo
 * público (montarResumo/calcularPreco), mas sem agendamento automático nem
 * limite de IP: a atendente sempre escolhe o horário e não há "fora do
 * horário" a resolver — quem está lançando já está atendendo. Marca
 * visualizado_em na hora (a atendente que criou já sabe do pedido, não
 * precisa do alarme sonoro de "pedido novo") e origem: "manual" pra
 * distinguir dos pedidos feitos pelo cliente no site.
 */
export const criarPedidoManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => pedidoManualSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { unidadeId } = await exigirAtendente(context);

    // Balcão é um pedido de outra natureza (sem endereço, sem motoboy, sem
    // horário de coleta agendado) — não passa pelo motor de prazo/preço de
    // delivery abaixo, cai direto no mesmo caminho do fluxo dedicado
    // (criarPedidoBalcao).
    if (data.tipo_servico === "balcao") {
      return criarPedidoBalcaoInterno({
        unidadeId,
        cpf: data.cpf,
        nomeCompleto: data.nome_completo,
        telefone: data.telefone,
        quantidadeCestos: data.quantidade_cestos,
        observacoes: data.observacoes,
      });
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: unidadeRow, error: unidadeErr } = await supabaseAdmin
      .from("unidades")
      .select("slug")
      .eq("id", unidadeId)
      .single();
    if (unidadeErr || !unidadeRow) throw new Error("Unidade não encontrada.");

    // A validação de rua/numero/bairro/horario_coleta obrigatórios pra
    // qualquer tipo_servico != "balcao" já rodou no superRefine do schema
    // (pedidoManualSchema) — essas checagens aqui só existem pra estreitar
    // o tipo de `string | undefined` pra `string` sem usar "as".
    if (!data.rua || !data.numero || !data.bairro || !data.horario_coleta) {
      throw new Error("Endereço e horário de coleta são obrigatórios para esse tipo de serviço.");
    }

    const { unidade, horarios, ocupados, cestosPorDia, resumo, precoDetalhado } = await montarResumo({
      slug: unidadeRow.slug,
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
      horario_coleta: data.horario_coleta,
    });

    const { slotDisponivel } = await import("./pedido-calculo.server");
    const disponivel = slotDisponivel(
      unidade,
      horarios,
      data.quantidade_cestos,
      new Date(),
      ocupados,
      cestosPorDia,
      new Date(resumo.horarioColetaIso),
    );
    if (!disponivel) {
      throw new Error(
        "Esse horário de coleta não está disponível (dia lotado ou horário ocupado). Escolha outro.",
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

    const enderecoDiferente =
      data.tipo_servico === "busca_e_entrega" && data.mesmo_endereco_entrega === false;
    const agora = new Date();

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
        horario_coleta: resumo.horarioColetaIso,
        pedido_fora_do_horario: resumo.pedidoForaDoHorario,
        visualizado_em: agora.toISOString(),
        origem: "manual",
        valor_lavagem: precoDetalhado.valorLavagem,
        valor_secagem: precoDetalhado.valorSecagem,
        valor_atendente: precoDetalhado.valorAtendente,
        valor_delivery: precoDetalhado.valorDelivery,
        valor_desconto: precoDetalhado.valorDesconto,
        desconto_descricao: precoDetalhado.descontoDescricao,
        distancia_km: resumo.distanciaKm,
        valor_total: resumo.valorTotal,
      })
      .select("id, data_prevista_retorno, data_pedido, horario_coleta")
      .single();

    if (error) {
      if (error.code === "23505") {
        throw new Error("Esse horário acabou de ser reservado por outro pedido. Escolha outro.");
      }
      throw new Error(error.message);
    }

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
      horario_coleta: pedido.horario_coleta,
      valor_total: resumo.valorTotal,
    };
  });

export const pedidoBalcaoSchema = z.object({
  cpf: cpfSchema,
  nome_completo: z.string().trim().min(3, "Informe o nome completo").max(160).optional(),
  telefone: z
    .string()
    .trim()
    .refine((v) => v.replace(/\D/g, "").length >= 10, "Telefone inválido")
    .optional(),
  quantidade_cestos: z.number().int().min(1).max(50),
  observacoes: z.string().trim().max(800).optional().nullable(),
});

/**
 * Registra, pelo painel, um pedido de balcão. Aberto a qualquer atendente
 * (não só admin) — diferente do pedido manual (telefone/delivery), que
 * continua admin-only, embora "Balcão" também esteja disponível como opção
 * de tipo_servico ali (ver criarPedidoManual). Toda a lógica de fato mora
 * em criarPedidoBalcaoInterno, compartilhada pelos dois pontos de entrada.
 */
export const criarPedidoBalcao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => pedidoBalcaoSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { unidadeId } = await exigirAtendente(context);
    return criarPedidoBalcaoInterno({
      unidadeId,
      cpf: data.cpf,
      nomeCompleto: data.nome_completo,
      telefone: data.telefone,
      quantidadeCestos: data.quantidade_cestos,
      observacoes: data.observacoes,
    });
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
