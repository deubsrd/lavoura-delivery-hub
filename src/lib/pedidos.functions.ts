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
  hora_limite_pedido: string;
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
      .select("id, nome, slug, cidade, prazo_padrao_horas, hora_limite_pedido")
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
    const ocupados = await buscarHorariosOcupados(supabaseAdmin, unidade.id, agora);
    const DIAS_JANELA_PUBLICA = 6;
    const dias = gerarSlotsColetaDisponiveis(
      unidade,
      horarios ?? [],
      data.quantidade_cestos,
      agora,
      ocupados,
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
 * público, antes de saber endereço/distância/promoção do dia. Só esses 3
 * números — nada sensível, já é exatamente o que aparece no
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

async function montarResumo(input: z.infer<typeof resumoInputSchema>): Promise<{
  unidade: Awaited<ReturnType<typeof buscarUnidadeCompletaPorSlug>>;
  horarios: import("./pedido-calculo.server").HorarioDia[];
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
  const ocupados = await buscarHorariosOcupados(supabaseAdmin, unidade.id, agora);
  const proximoSlotLivre =
    primeiroSlotColetaLivre(unidade, horarios, input.quantidade_cestos, agora, ocupados, 21) ??
    calcularProximoHorarioUtil(horarios, agora);

  // "Fora do horário" pra fins da regra de negócio é sobre o instante em
  // que o PEDIDO é feito, não sobre o horário de coleta escolhido (que
  // pode ser um dia futuro mesmo com a unidade aberta agora). Só quando a
  // unidade está fechada agora — ou o cliente já concordou em agendar numa
  // rodada anterior — é que o horário de coleta é atribuído automaticamente
  // em vez de vir da escolha do cliente.
  const pedidoForaDoHorario = pedidoForaDoHorarioAgora(unidade, horarios, agora);
  const precisaAtribuirAutomaticamente =
    input.usar_proximo_dia_util === true || pedidoForaDoHorario;

  let baseDateTime: Date;
  if (precisaAtribuirAutomaticamente) {
    baseDateTime = proximoSlotLivre;
  } else {
    if (!input.horario_coleta) throw new Error("Escolha o horário da coleta.");
    baseDateTime = new Date(input.horario_coleta);
    if (Number.isNaN(baseDateTime.getTime())) throw new Error("Horário de coleta inválido.");
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
    horarios,
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

    const { unidade, horarios, resumo, precoDetalhado } = await montarResumo({
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

    // Defesa contra client malicioso pulando a etapa de confirmação de
    // reagendamento: sem usar_proximo_dia_util, um pedido fora do horário
    // nunca é aceito, mesmo que o client tenha calculado outra coisa.
    if (!data.usar_proximo_dia_util && resumo.foraDoHorario) {
      throw new Error(
        "Fora do horário de atendimento para hoje. Volte e escolha agendar para o próximo horário livre.",
      );
    }

    // Defesa extra pro caminho manual (regra do intervalo de 30 min entre
    // coletas): o horário devolvido por montarResumo precisa realmente
    // estar alinhado à grade de slots — protege contra um client que pule
    // obterSlotsColeta e mande um horario_coleta arbitrário. Concorrência
    // real (dois clientes fechando o mesmo slot ao mesmo tempo) é resolvida
    // pelo índice único no banco (idx_pedidos_unidade_horario_coleta),
    // tratado no catch do insert logo abaixo.
    if (!data.usar_proximo_dia_util) {
      const { slotAlinhadoAGrade } = await import("./pedido-calculo.server");
      if (!slotAlinhadoAGrade(horarios, new Date(), new Date(resumo.horarioColetaIso))) {
        throw new Error("Horário de coleta inválido. Volte e escolha novamente.");
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
