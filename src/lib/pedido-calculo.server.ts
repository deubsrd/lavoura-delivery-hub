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

function diaSemanaLocal(data: Date): number {
  return paraLocal(data).getUTCDay();
}

function parseHora(hora: string): { h: number; m: number } {
  const [h, m] = hora.split(":").map(Number);
  return { h: h ?? 0, m: m ?? 0 };
}

/** Meia-noite local (America/Boa_Vista) do dia seguinte ao informado, na hora de abertura configurada. */
function proximaAberturaDiaSeguinte(data: Date, horaAbertura: string): Date {
  const local = paraLocal(data);
  const { h, m } = parseHora(horaAbertura);
  const anoMesDia = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate() + 1,
    h,
    m,
  );
  return new Date(anoMesDia - OFFSET_MINUTOS_UNIDADE * 60000);
}

export type UnidadeOperacao = {
  hora_abertura: string;
  hora_fechamento: string;
  hora_limite_pedido: string;
  quantidade_maquinas: number;
};

export type PrazoResultado = {
  baseUsada: Date;
  previsto: Date;
  foraDoHorario: boolean;
  cicloMinutos: number;
};

export function calcularPrazo(
  unidade: UnidadeOperacao,
  quantidadeCestos: number,
  baseDateTime: Date,
): PrazoResultado {
  const ciclos = Math.ceil(quantidadeCestos / Math.max(1, unidade.quantidade_maquinas));
  const tempoMaquinasMin = ciclos * (MINUTOS_LAVAR + MINUTOS_SECAR);
  const tempoTotalMin = tempoMaquinasMin + MINUTOS_FIXOS_COLETA_DOBRA_ENTREGA;

  const previsto = new Date(baseDateTime.getTime() + tempoTotalMin * 60000);

  const limitePedidoMin =
    parseHora(unidade.hora_limite_pedido).h * 60 + parseHora(unidade.hora_limite_pedido).m;
  const fechamentoMin =
    parseHora(unidade.hora_fechamento).h * 60 + parseHora(unidade.hora_fechamento).m;

  const pedidoDepoisDoLimite = minutosDoDiaLocal(baseDateTime) > limitePedidoMin;
  const retornoEmOutroDia = chaveDiaLocal(previsto) !== chaveDiaLocal(baseDateTime);
  const retornoDepoisDoFechamento =
    !retornoEmOutroDia && minutosDoDiaLocal(previsto) > fechamentoMin;

  return {
    baseUsada: baseDateTime,
    previsto,
    foraDoHorario: pedidoDepoisDoLimite || retornoEmOutroDia || retornoDepoisDoFechamento,
    cicloMinutos: tempoTotalMin,
  };
}

export function calcularProximoHorarioUtil(unidade: UnidadeOperacao, apartirDe: Date): Date {
  return proximaAberturaDiaSeguinte(apartirDe, unidade.hora_abertura);
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

export function calcularPreco(
  precos: ConfiguracaoPrecos,
  faixas: FaixaDelivery[],
  promocoes: PromocaoDiaSemana[],
  quantidadeCestos: number,
  distanciaKm: number | null,
  dataBuscaParaPromocao: Date,
): ResumoPreco {
  const valorLavagem = quantidadeCestos * precos.valor_lavagem_por_cesto;
  const valorSecagem = quantidadeCestos * precos.valor_secagem_por_cesto;
  const valorAtendente = precos.valor_atendente_por_pedido;

  let valorDelivery: number | null = null;
  let deliveryIndisponivel = false;
  if (distanciaKm !== null) {
    const faixa = faixas
      .filter((f) => f.distancia_ate_km >= distanciaKm)
      .sort((a, b) => a.distancia_ate_km - b.distancia_ate_km)[0];
    if (faixa) valorDelivery = faixa.valor;
    else deliveryIndisponivel = true;
  }

  const diaSemana = diaSemanaLocal(dataBuscaParaPromocao);
  const promo = promocoes.find((p) => p.ativo && p.dia_semana === diaSemana);

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
  if (valorDelivery !== null) {
    detalhamento.push({ rotulo: "Delivery", valor: valorDelivery });
  } else if (deliveryIndisponivel) {
    detalhamento.push({ rotulo: "Delivery (fora da área de cobertura, a confirmar)", valor: 0 });
  }

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
