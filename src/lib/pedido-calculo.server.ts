/**
 * Cálculo de prazo e preço do pedido. Roda tanto na prévia (Etapa 5 do
 * formulário) quanto na criação de fato do pedido — a criação sempre
 * recalcula do zero a partir dos dados brutos (endereço, cestos, tipo,
 * data-base) e ignora qualquer valor de preço vindo do client, para que
 * um cliente malicioso não consiga forjar um total mais barato.
 *
 * Premissa assumida (ver PR): toda a rede opera no fuso America/Boa_Vista
 * (UTC-4, sem horário de verão). Não existe hoje coluna de fuso por
 * unidade; se a rede expandir para outro fuso isso precisa virar
 * configurável.
 */

const OFFSET_MINUTOS_UNIDADE = -4 * 60;

const NOMES_DIA_SEMANA = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

import { formatarMoeda } from "./lavoura";

const MINUTOS_LAVAR = 30;
const MINUTOS_SECAR = 45;
const MINUTOS_FIXOS_COLETA_DOBRA_ENTREGA = 90;

function paraLocal(data: Date): Date {
  return new Date(data.getTime() + OFFSET_MINUTOS_UNIDADE * 60000);
}

function minutosDoDiaLocal(data: Date): number {
  const local = paraLocal(data);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
}

export function chaveDiaLocal(data: Date): string {
  return paraLocal(data).toISOString().slice(0, 10);
}

export function diaSemanaLocal(data: Date): number {
  return paraLocal(data).getUTCDay();
}

function parseHora(hora: string): { h: number; m: number } {
  const [h, m] = hora.split(":").map(Number);
  return { h: h ?? 0, m: m ?? 0 };
}

/** Data/hora local (America/Boa_Vista) de abertura N dias à frente da informada, na hora dada. */
function aberturaEmDias(data: Date, diasAFrente: number, horaAbertura: string): Date {
  const local = paraLocal(data);
  const { h, m } = parseHora(horaAbertura);
  const anoMesDia = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate() + diasAFrente,
    h,
    m,
  );
  return new Date(anoMesDia - OFFSET_MINUTOS_UNIDADE * 60000);
}

export type HorarioDia = {
  dia_semana: number;
  ativo: boolean;
  hora_abertura: string;
  hora_fechamento: string;
};

export type UnidadeOperacao = {
  hora_limite_pedido: string;
  quantidade_maquinas: number;
};

function buscarHorarioDoDia(horarios: HorarioDia[], diaSemana: number): HorarioDia | undefined {
  return horarios.find((h) => h.dia_semana === diaSemana);
}

/** Precisa de um `quantidade_maquinas` — não usa o resto de UnidadeOperacao, mas reaproveita o tipo pra não ter mais um parâmetro solto. */
function tempoTotalProcessamentoMin(
  unidade: Pick<UnidadeOperacao, "quantidade_maquinas">,
  quantidadeCestos: number,
): number {
  const ciclos = Math.ceil(quantidadeCestos / Math.max(1, unidade.quantidade_maquinas));
  return ciclos * (MINUTOS_LAVAR + MINUTOS_SECAR) + MINUTOS_FIXOS_COLETA_DOBRA_ENTREGA;
}

export type PrazoResultado = {
  baseUsada: Date;
  previsto: Date;
  foraDoHorario: boolean;
  cicloMinutos: number;
};

export function calcularPrazo(
  unidade: UnidadeOperacao,
  horarios: HorarioDia[],
  quantidadeCestos: number,
  baseDateTime: Date,
): PrazoResultado {
  const tempoTotalMin = tempoTotalProcessamentoMin(unidade, quantidadeCestos);

  const previsto = new Date(baseDateTime.getTime() + tempoTotalMin * 60000);

  const horarioHoje = buscarHorarioDoDia(horarios, diaSemanaLocal(baseDateTime));
  const diaFechado = !horarioHoje || !horarioHoje.ativo;

  const limitePedidoMin =
    parseHora(unidade.hora_limite_pedido).h * 60 + parseHora(unidade.hora_limite_pedido).m;
  const aberturaMin = horarioHoje
    ? parseHora(horarioHoje.hora_abertura).h * 60 + parseHora(horarioHoje.hora_abertura).m
    : 0;
  const fechamentoMin = horarioHoje
    ? parseHora(horarioHoje.hora_fechamento).h * 60 + parseHora(horarioHoje.hora_fechamento).m
    : 0;

  const minutoAgora = minutosDoDiaLocal(baseDateTime);
  const pedidoAntesDaAbertura = !diaFechado && minutoAgora < aberturaMin;
  const pedidoDepoisDoLimite = !diaFechado && minutoAgora > limitePedidoMin;
  const retornoEmOutroDia = chaveDiaLocal(previsto) !== chaveDiaLocal(baseDateTime);
  const retornoDepoisDoFechamento =
    !diaFechado && !retornoEmOutroDia && minutosDoDiaLocal(previsto) > fechamentoMin;

  return {
    baseUsada: baseDateTime,
    previsto,
    foraDoHorario:
      diaFechado ||
      pedidoAntesDaAbertura ||
      pedidoDepoisDoLimite ||
      retornoEmOutroDia ||
      retornoDepoisDoFechamento,
    cicloMinutos: tempoTotalMin,
  };
}

/**
 * Próximo horário de abertura a partir de `apartirDe`: hoje mesmo, se ainda
 * não tiver passado da abertura de hoje e hoje for um dia ativo; senão o
 * primeiro dia ativo seguinte (pulando dias marcados como fechados),
 * olhando até uma semana à frente.
 */
export function calcularProximoHorarioUtil(horarios: HorarioDia[], apartirDe: Date): Date {
  const diaSemanaBase = diaSemanaLocal(apartirDe);
  for (let offset = 0; offset <= 8; offset++) {
    const horario = buscarHorarioDoDia(horarios, (diaSemanaBase + offset) % 7);
    if (!horario || !horario.ativo) continue;
    const abertura = aberturaEmDias(apartirDe, offset, horario.hora_abertura);
    if (offset === 0 && abertura.getTime() <= apartirDe.getTime()) continue;
    return abertura;
  }
  // Nenhum dia ativo configurado — não deveria acontecer em uso normal
  // (toda unidade deveria ter ao menos um dia aberto), mas devolve a
  // própria referência em vez de travar o cálculo.
  return apartirDe;
}

/**
 * A unidade está aceitando pedidos normalmente agora ("agora" = o instante
 * em que o cliente está enviando o pedido, não o horário de coleta que ele
 * vai escolher)? Usa exatamente as mesmas três condições que `calcularPrazo`
 * já usava para decidir "fora do horário" quando todo pedido tinha
 * baseDateTime = agora: dia fechado, ainda não abriu, ou já passou do
 * horário-limite de pedido. Extraído como função própria porque agora
 * baseDateTime pode ser um horário de coleta escolhido pelo cliente (futuro,
 * dentro do expediente) — o que NÃO significa que a unidade esteja aberta
 * neste exato instante. Essa distinção é a base da regra "pedido fora do
 * horário não exige aceite manual": ver `pedido_fora_do_horario` em
 * pedidos.functions.ts.
 */
export function pedidoForaDoHorarioAgora(
  unidade: Pick<UnidadeOperacao, "hora_limite_pedido">,
  horarios: HorarioDia[],
  agora: Date,
): boolean {
  const horarioHoje = buscarHorarioDoDia(horarios, diaSemanaLocal(agora));
  if (!horarioHoje || !horarioHoje.ativo) return true;

  const aberturaMin =
    parseHora(horarioHoje.hora_abertura).h * 60 + parseHora(horarioHoje.hora_abertura).m;
  const limiteMin =
    parseHora(unidade.hora_limite_pedido).h * 60 + parseHora(unidade.hora_limite_pedido).m;
  const minutoAgora = minutosDoDiaLocal(agora);

  return minutoAgora < aberturaMin || minutoAgora > limiteMin;
}

/** Intervalo mínimo entre coletas de uma mesma unidade (regra de negócio). */
export const DURACAO_SLOT_COLETA_MINUTOS = 30;

/**
 * Capacidade máxima de cestos que a unidade processa por dia (soma de
 * todos os pedidos com coleta nesse dia, não cancelados). Ao atingir esse
 * total, o dia inteiro sai da grade oferecida — mesmo que ainda haja
 * horários "vazios" (o gargalo é capacidade de processamento, não só
 * intervalo entre coletas). Mesmo valor pra todo dia ativo; não há hoje
 * configuração por unidade/dia para isso.
 */
export const CAPACIDADE_MAXIMA_CESTOS_POR_DIA = 10;

/** O dia (identificado pela chave "YYYY-MM-DD" local) ainda comporta mais `quantidadeCestos`? */
function diaTemCapacidade(
  cestosPorDia: ReadonlyMap<string, number>,
  diaChave: string,
  quantidadeCestos: number,
): boolean {
  const jaOcupado = cestosPorDia.get(diaChave) ?? 0;
  return jaOcupado + quantidadeCestos <= CAPACIDADE_MAXIMA_CESTOS_POR_DIA;
}

/** "13:30:00" -> "13:30" (formato usado nos slots devolvidos ao client). */
function horaLocalDeData(data: Date): string {
  const local = paraLocal(data);
  return `${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}`;
}

/**
 * Um slot cabe no mesmo dia se, iniciando a coleta nele, o ciclo completo
 * (lavagem + secagem + coleta/dobra/entrega) termina antes do fechamento do
 * dia em que a coleta acontece — sem estourar pra outro dia. Não usa
 * `hora_limite_pedido` (esse é o corte pra pedidos "pra agora", não pra um
 * horário de coleta específico já escolhido) nem reabre a checagem de
 * abertura/dia ativo (o slot já nasce dentro da grade de um dia ativo, ver
 * `gerarGradeColeta`).
 */
function slotCabeNoMesmoDia(
  unidade: UnidadeOperacao,
  horarios: HorarioDia[],
  quantidadeCestos: number,
  slot: Date,
): boolean {
  const horarioDoSlot = buscarHorarioDoDia(horarios, diaSemanaLocal(slot));
  if (!horarioDoSlot || !horarioDoSlot.ativo) return false;
  const fechamentoMin =
    parseHora(horarioDoSlot.hora_fechamento).h * 60 + parseHora(horarioDoSlot.hora_fechamento).m;
  const tempoTotalMin = tempoTotalProcessamentoMin(unidade, quantidadeCestos);
  const previsto = new Date(slot.getTime() + tempoTotalMin * 60000);
  return (
    chaveDiaLocal(previsto) === chaveDiaLocal(slot) && minutosDoDiaLocal(previsto) <= fechamentoMin
  );
}

export type DiaComSlotsColeta = { data: string; diaSemana: number; slots: Date[] };

/**
 * Grade "crua" de horários de coleta possíveis (sem descontar ocupação nem
 * viabilidade de prazo): todo múltiplo de 30 min entre a abertura e o
 * fechamento de cada dia ativo, a partir de `agora`, olhando até
 * `diasAFrente` dias à frente. No dia de hoje (offset 0), a grade nunca
 * volta pro passado nem pra antes da abertura — o primeiro slot é sempre
 * `max(hora_abertura, próximo múltiplo de 30 min a partir de agora)`. Isso
 * cobre de graça tanto o primeiro pedido do dia (agora < abertura → grade
 * começa na abertura) quanto pedidos fora do horário comercial tentando
 * ocupar horários que ainda nem abriram (mesma razão: nunca gera slot antes
 * da abertura, então nunca há o que "ocupar" ali).
 */
export function gerarGradeColeta(
  horarios: HorarioDia[],
  agora: Date,
  diasAFrente: number,
): DiaComSlotsColeta[] {
  const dias: DiaComSlotsColeta[] = [];
  const diaSemanaBase = diaSemanaLocal(agora);
  const passoMs = DURACAO_SLOT_COLETA_MINUTOS * 60000;

  for (let offset = 0; offset <= diasAFrente; offset++) {
    const horario = buscarHorarioDoDia(horarios, (diaSemanaBase + offset) % 7);
    if (!horario || !horario.ativo) continue;

    const abertura = aberturaEmDias(agora, offset, horario.hora_abertura);
    const fechamento = aberturaEmDias(agora, offset, horario.hora_fechamento);
    if (fechamento.getTime() <= abertura.getTime()) continue;

    let cursor = abertura;
    if (offset === 0 && agora.getTime() > abertura.getTime()) {
      const passosDecorridos = Math.ceil((agora.getTime() - abertura.getTime()) / passoMs);
      cursor = new Date(abertura.getTime() + passosDecorridos * passoMs);
    }

    const slots: Date[] = [];
    while (cursor.getTime() < fechamento.getTime()) {
      slots.push(cursor);
      cursor = new Date(cursor.getTime() + passoMs);
    }
    if (slots.length > 0) {
      dias.push({ data: chaveDiaLocal(abertura), diaSemana: (diaSemanaBase + offset) % 7, slots });
    }
  }
  return dias;
}

/**
 * Grade de coleta realmente oferecível ao cliente: a grade crua acima,
 * descontando (a) dias que já bateram a capacidade máxima de cestos
 * (`cestosPorDia`, ver CAPACIDADE_MAXIMA_CESTOS_POR_DIA — o dia inteiro sai
 * da grade, não só alguns horários), (b) horários já ocupados por outro
 * pedido da mesma unidade (`ocupados`, em epoch ms — pedidos cancelados não
 * contam, ver `buscarHorariosOcupados` em pedidos.functions.ts) e (c)
 * horários que não dariam tempo de terminar o ciclo antes do fechamento do
 * dia.
 */
export function gerarSlotsColetaDisponiveis(
  unidade: UnidadeOperacao,
  horarios: HorarioDia[],
  quantidadeCestos: number,
  agora: Date,
  ocupados: ReadonlySet<number>,
  cestosPorDia: ReadonlyMap<string, number>,
  diasAFrente: number,
): DiaComSlotsColeta[] {
  const grade = gerarGradeColeta(horarios, agora, diasAFrente);
  const dias: DiaComSlotsColeta[] = [];
  for (const dia of grade) {
    if (!diaTemCapacidade(cestosPorDia, dia.data, quantidadeCestos)) continue;
    const slots = dia.slots.filter(
      (slot) =>
        !ocupados.has(slot.getTime()) &&
        slotCabeNoMesmoDia(unidade, horarios, quantidadeCestos, slot),
    );
    if (slots.length > 0) dias.push({ data: dia.data, diaSemana: dia.diaSemana, slots });
  }
  return dias;
}

/**
 * Primeiro horário de coleta livre (usado tanto para o agendamento
 * automático de pedidos fora do horário quanto como fallback de exibição).
 * Pula dias lotados (ver gerarSlotsColetaDisponiveis) — é assim que um
 * pedido fora do horário feito num dia cheio acaba agendado pro próximo dia
 * com vaga, não só pro próximo horário livre daquele mesmo dia.
 * `diasAFrente` grande o bastante pra praticamente nunca devolver null; se
 * mesmo assim devolver (unidade lotada por semanas seguidas — não deveria
 * acontecer em uso normal), quem chama decide o fallback.
 */
export function primeiroSlotColetaLivre(
  unidade: UnidadeOperacao,
  horarios: HorarioDia[],
  quantidadeCestos: number,
  agora: Date,
  ocupados: ReadonlySet<number>,
  cestosPorDia: ReadonlyMap<string, number>,
  diasAFrente = 21,
): Date | null {
  const dias = gerarSlotsColetaDisponiveis(
    unidade,
    horarios,
    quantidadeCestos,
    agora,
    ocupados,
    cestosPorDia,
    diasAFrente,
  );
  return dias[0]?.slots[0] ?? null;
}

/**
 * O `slot` está realmente disponível agora (alinhado à grade, dentro da
 * capacidade diária, não ocupado por outro pedido e cabendo antes do
 * fechamento)? É a mesma função que decide o que oferecer em
 * obterSlotsColeta — usada aqui como defesa em criarPedido contra um client
 * que pule obterSlotsColeta e mande um horario_coleta arbitrário ou
 * desatualizado.
 */
export function slotDisponivel(
  unidade: UnidadeOperacao,
  horarios: HorarioDia[],
  quantidadeCestos: number,
  agora: Date,
  ocupados: ReadonlySet<number>,
  cestosPorDia: ReadonlyMap<string, number>,
  slot: Date,
  diasAFrente = 21,
): boolean {
  const dias = gerarSlotsColetaDisponiveis(
    unidade,
    horarios,
    quantidadeCestos,
    agora,
    ocupados,
    cestosPorDia,
    diasAFrente,
  );
  const alvo = slot.getTime();
  return dias.some((dia) => dia.slots.some((s) => s.getTime() === alvo));
}

export type SlotColetaPublico = { inicioIso: string; horaLocal: string };
export type DiaColetaPublico = { data: string; diaSemana: number; slots: SlotColetaPublico[] };

/** Formata a grade de slots disponíveis pro formato que trafega pro client. */
export function formatarSlotsColetaPublico(dias: DiaComSlotsColeta[]): DiaColetaPublico[] {
  return dias.map((dia) => ({
    data: dia.data,
    diaSemana: dia.diaSemana,
    slots: dia.slots.map((slot) => ({
      inicioIso: slot.toISOString(),
      horaLocal: horaLocalDeData(slot),
    })),
  }));
}

export type ConfiguracaoPrecos = {
  valor_lavagem_por_cesto: number;
  valor_secagem_por_cesto: number;
  valor_atendente_por_pedido: number;
};

export type FaixaDelivery = { distancia_ate_km: number; valor: number };

export type PromocaoDiaSemana = {
  dia_semana: number;
  tipo_desconto: "percentual" | "valor_fixo";
  valor: number;
  aplica_em: "tudo" | "lavagem" | "secagem" | "atendente" | "delivery";
  ativo: boolean;
};

/**
 * Preço customizado do cesto (lavagem + secagem combinadas) pra uma janela
 * de dia da semana + horário — substitui a soma de valor_lavagem_por_cesto
 * + valor_secagem_por_cesto quando o horário de coleta do pedido cai
 * dentro dela. `hora_fim <= hora_inicio` é uma janela que atravessa a
 * meia-noite (ex.: 23:00–00:59).
 */
export type PrecoPorHorario = {
  dia_semana: number;
  hora_inicio: string;
  hora_fim: string;
  valor_cesto: number;
};

function buscarPrecoPorHorario(
  regras: PrecoPorHorario[],
  data: Date,
): PrecoPorHorario | undefined {
  const dia = diaSemanaLocal(data);
  const minuto = minutosDoDiaLocal(data);
  return regras.find((r) => {
    if (r.dia_semana !== dia) return false;
    const inicioMin = parseHora(r.hora_inicio).h * 60 + parseHora(r.hora_inicio).m;
    const fimMin = parseHora(r.hora_fim).h * 60 + parseHora(r.hora_fim).m;
    if (fimMin <= inicioMin) return minuto >= inicioMin || minuto <= fimMin;
    return minuto >= inicioMin && minuto <= fimMin;
  });
}

/**
 * Uma "perna" do trajeto do motoboy (coleta e/ou entrega). O valor do
 * delivery é cobrado uma vez por perna — busca ou entrega isoladas têm
 * uma perna, busca_e_entrega tem duas (mesma distância se o endereço de
 * entrega for igual ao de coleta, ou distâncias diferentes senão).
 */
export type PernaDelivery = { tipo: "coleta" | "entrega"; distanciaKm: number | null };

export type ItemDetalhamento = { rotulo: string; valor: number };

export type ResumoPreco = {
  valorLavagem: number;
  valorSecagem: number;
  valorAtendente: number;
  valorDelivery: number | null;
  deliveryIndisponivel: boolean;
  valorDesconto: number;
  descontoDescricao: string | null;
  valorTotal: number;
  detalhamento: ItemDetalhamento[];
};

function buscarValorFaixa(faixas: FaixaDelivery[], distanciaKm: number): number | null {
  const faixa = faixas
    .filter((f) => f.distancia_ate_km >= distanciaKm)
    .sort((a, b) => a.distancia_ate_km - b.distancia_ate_km)[0];
  return faixa ? faixa.valor : null;
}

const ROTULO_PERNA: Record<PernaDelivery["tipo"], string> = {
  coleta: "coleta",
  entrega: "entrega",
};

export function calcularPreco(
  precos: ConfiguracaoPrecos,
  faixas: FaixaDelivery[],
  promocoes: PromocaoDiaSemana[],
  precosPorHorario: PrecoPorHorario[],
  quantidadeCestos: number,
  pernas: PernaDelivery[],
  dataBuscaParaPromocao: Date,
): ResumoPreco {
  const regraHorario = buscarPrecoPorHorario(precosPorHorario, dataBuscaParaPromocao);

  let valorLavagem: number;
  let valorSecagem: number;
  const detalhamento: ItemDetalhamento[] = [];

  if (regraHorario) {
    // Preço especial: um único valor pro cesto (lavagem + secagem juntas)
    // nessa janela — dividido proporcionalmente entre lavagem/secagem só
    // pra manter as colunas valor_lavagem/valor_secagem preenchidas de
    // forma coerente; a mensagem pro cliente mostra o valor combinado.
    const valorCestoEspecial = quantidadeCestos * regraHorario.valor_cesto;
    const totalBase = precos.valor_lavagem_por_cesto + precos.valor_secagem_por_cesto;
    const proporcaoLavagem = totalBase > 0 ? precos.valor_lavagem_por_cesto / totalBase : 0.5;
    valorLavagem = valorCestoEspecial * proporcaoLavagem;
    valorSecagem = valorCestoEspecial - valorLavagem;
    detalhamento.push({
      rotulo: `Lavagem + secagem — preço de horário especial (${quantidadeCestos} ${quantidadeCestos === 1 ? "cesto" : "cestos"} × ${formatarMoeda(regraHorario.valor_cesto)})`,
      valor: valorCestoEspecial,
    });
  } else {
    valorLavagem = quantidadeCestos * precos.valor_lavagem_por_cesto;
    valorSecagem = quantidadeCestos * precos.valor_secagem_por_cesto;
    detalhamento.push(
      {
        rotulo: `Lavagem (${quantidadeCestos} ${quantidadeCestos === 1 ? "cesto" : "cestos"} × ${formatarMoeda(precos.valor_lavagem_por_cesto)})`,
        valor: valorLavagem,
      },
      {
        rotulo: `Secagem (${quantidadeCestos} ${quantidadeCestos === 1 ? "cesto" : "cestos"} × ${formatarMoeda(precos.valor_secagem_por_cesto)})`,
        valor: valorSecagem,
      },
    );
  }

  const valorAtendente = precos.valor_atendente_por_pedido;
  detalhamento.push({ rotulo: "Serviço da atendente", valor: valorAtendente });

  // Cada perna do trajeto (coleta e/ou entrega) é cobrada separadamente,
  // pela faixa de distância correspondente. Se qualquer perna não puder
  // ser precificada (endereço não localizado), o delivery inteiro fica
  // "a confirmar" em vez de mostrar um total parcial enganoso.
  let valorDelivery: number | null = null;
  let deliveryIndisponivel = false;
  const valoresPernas: { tipo: PernaDelivery["tipo"]; distanciaKm: number; valor: number }[] = [];
  for (const perna of pernas) {
    if (perna.distanciaKm === null) {
      deliveryIndisponivel = true;
      continue;
    }
    const valor = buscarValorFaixa(faixas, perna.distanciaKm);
    if (valor === null) {
      deliveryIndisponivel = true;
      continue;
    }
    valoresPernas.push({ tipo: perna.tipo, distanciaKm: perna.distanciaKm, valor });
  }
  if (!deliveryIndisponivel && valoresPernas.length === pernas.length && pernas.length > 0) {
    valorDelivery = valoresPernas.reduce((soma, p) => soma + p.valor, 0);
    for (const p of valoresPernas) {
      detalhamento.push({
        rotulo: `Delivery (${ROTULO_PERNA[p.tipo]}, ${p.distanciaKm.toFixed(1)} km)`,
        valor: p.valor,
      });
    }
  } else if (deliveryIndisponivel) {
    detalhamento.push({ rotulo: "Delivery (fora da área de cobertura, a confirmar)", valor: 0 });
  }

  const diaSemana = diaSemanaLocal(dataBuscaParaPromocao);
  const promo = promocoes.find((p) => p.ativo && p.dia_semana === diaSemana);

  let valorDesconto = 0;
  let descontoDescricao: string | null = null;
  if (promo) {
    const base = valorBaseParaDesconto(
      promo.aplica_em,
      valorLavagem,
      valorSecagem,
      valorAtendente,
      valorDelivery ?? 0,
    );
    valorDesconto =
      promo.tipo_desconto === "percentual"
        ? base * (promo.valor / 100)
        : Math.min(promo.valor, base);
    if (valorDesconto > 0) {
      const nomeDia = NOMES_DIA_SEMANA[diaSemana];
      const rotuloValor =
        promo.tipo_desconto === "percentual"
          ? `-${promo.valor}%`
          : `-${formatarMoeda(promo.valor)}`;
      descontoDescricao = `Desconto de ${nomeDia} (${rotuloValor})`;
      detalhamento.push({ rotulo: descontoDescricao, valor: -valorDesconto });
    }
  }

  const valorTotal = Math.max(
    0,
    valorLavagem + valorSecagem + valorAtendente + (valorDelivery ?? 0) - valorDesconto,
  );

  return {
    valorLavagem,
    valorSecagem,
    valorAtendente,
    valorDelivery,
    deliveryIndisponivel,
    valorDesconto,
    descontoDescricao,
    valorTotal,
    detalhamento,
  };
}

function valorBaseParaDesconto(
  aplicaEm: PromocaoDiaSemana["aplica_em"],
  lavagem: number,
  secagem: number,
  atendente: number,
  delivery: number,
): number {
  switch (aplicaEm) {
    case "lavagem":
      return lavagem;
    case "secagem":
      return secagem;
    case "atendente":
      return atendente;
    case "delivery":
      return delivery;
    case "tudo":
    default:
      return lavagem + secagem + atendente + delivery;
  }
}
