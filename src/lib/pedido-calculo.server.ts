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

function chaveDiaLocal(data: Date): string {
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
  const ciclos = Math.ceil(quantidadeCestos / Math.max(1, unidade.quantidade_maquinas));
  const tempoMaquinasMin = ciclos * (MINUTOS_LAVAR + MINUTOS_SECAR);
  const tempoTotalMin = tempoMaquinasMin + MINUTOS_FIXOS_COLETA_DOBRA_ENTREGA;

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

const ROTULO_PERNA: Record<PernaDelivery["tipo"], string> = { coleta: "coleta", entrega: "entrega" };

export function calcularPreco(
  precos: ConfiguracaoPrecos,
  faixas: FaixaDelivery[],
  promocoes: PromocaoDiaSemana[],
  quantidadeCestos: number,
  pernas: PernaDelivery[],
  dataBuscaParaPromocao: Date,
): ResumoPreco {
  const valorLavagem = quantidadeCestos * precos.valor_lavagem_por_cesto;
  const valorSecagem = quantidadeCestos * precos.valor_secagem_por_cesto;
  const valorAtendente = precos.valor_atendente_por_pedido;

  const detalhamento: ItemDetalhamento[] = [
    {
      rotulo: `Lavagem (${quantidadeCestos} ${quantidadeCestos === 1 ? "cesto" : "cestos"} × ${formatarMoeda(precos.valor_lavagem_por_cesto)})`,
      valor: valorLavagem,
    },
    {
      rotulo: `Secagem (${quantidadeCestos} ${quantidadeCestos === 1 ? "cesto" : "cestos"} × ${formatarMoeda(precos.valor_secagem_por_cesto)})`,
      valor: valorSecagem,
    },
    { rotulo: "Serviço da atendente", valor: valorAtendente },
  ];

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
