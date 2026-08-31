export type TipoServico = "busca" | "entrega" | "busca_e_entrega" | "balcao";
export type PedidoStatus =
  | "recebido"
  | "motoboy_busca"
  | "processando"
  | "pronto"
  | "motoboy_entrega"
  | "entregue"
  | "cancelado";

export const TIPO_SERVICO_LABEL: Record<TipoServico, string> = {
  busca: "Só busca",
  entrega: "Só entrega",
  busca_e_entrega: "Busca e entrega",
  balcao: "Balcão (sem delivery)",
};

export const STATUS_LABEL: Record<PedidoStatus, string> = {
  recebido: "Pedido recebido",
  motoboy_busca: "Motoboy a caminho (busca)",
  processando: "Na lavanderia / processando",
  pronto: "Prontas para entrega",
  motoboy_entrega: "Motoboy a caminho (entrega)",
  entregue: "Entregue / Concluído",
  cancelado: "Cancelado",
};

export const FLUXO_STATUS: PedidoStatus[] = [
  "recebido",
  "motoboy_busca",
  "processando",
  "pronto",
  "motoboy_entrega",
  "entregue",
];

/** Etapas que não fazem sentido para um determinado tipo de serviço. */
export function statusAplicavel(status: PedidoStatus, tipo: TipoServico): boolean {
  if (status === "motoboy_busca" && tipo === "entrega") return false;
  if (status === "motoboy_entrega" && tipo === "busca") return false;
  // Balcão nunca tem motoboy — cliente traz e busca pessoalmente.
  if ((status === "motoboy_busca" || status === "motoboy_entrega") && tipo === "balcao") {
    return false;
  }
  return true;
}

export function colunasParaTipo(tipo: TipoServico): PedidoStatus[] {
  return FLUXO_STATUS.filter((s) => statusAplicavel(s, tipo));
}

export function maskTelefone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : "";
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function soDigitos(value: string): string {
  return value.replace(/\D/g, "");
}

export function whatsappLink(telefone: string): string {
  const digits = soDigitos(telefone);
  const comPais = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${comPais}`;
}

export function enderecoResumido(p: {
  rua: string | null;
  numero: string | null;
  bairro: string | null;
}): string {
  if (!p.rua || !p.numero || !p.bairro) return "Atendimento no balcão";
  return `${p.rua}, ${p.numero} — ${p.bairro}`;
}

function enderecoCompleto(p: {
  rua: string | null;
  numero: string | null;
  bairro: string | null;
  complemento?: string | null;
  referencia?: string | null;
}): string {
  let texto = enderecoResumido(p);
  if (p.complemento) texto += ` (${p.complemento})`;
  if (p.referencia) texto += ` — ref: ${p.referencia}`;
  return texto;
}

/**
 * Mensagem pronta pra colar no WhatsApp do motoboy, com tudo que ele
 * precisa pra sair pra rua sem ter que abrir o painel: quem, onde, quando
 * e quantos cestos. O endereço principal (rua/numero/bairro) é o de
 * coleta para busca/busca_e_entrega, e o de entrega para o serviço "só
 * entrega" — mesma convenção já usada no detalhe do card no painel.
 */
export function montarMensagemDelivery(pedido: {
  nome_completo: string;
  telefone: string;
  tipo_servico: TipoServico;
  quantidade_cestos: number;
  horario_coleta: string | null;
  data_prevista_retorno: string | null;
  rua: string | null;
  numero: string | null;
  bairro: string | null;
  complemento: string | null;
  referencia: string | null;
  mesmo_endereco_entrega: boolean | null;
  rua_entrega: string | null;
  numero_entrega: string | null;
  bairro_entrega: string | null;
  complemento_entrega: string | null;
  referencia_entrega: string | null;
  observacoes: string | null;
}): string {
  // Pedidos feitos antes deste recurso não têm horario_coleta preenchido
  // (coluna nova) — nesses casos não dá pra afirmar "o quanto antes" (pode
  // ter sido agendado), então cai pra previsão de retorno como referência,
  // ou por último um aviso claro de que não há horário registrado.
  const horarioColetaTexto = pedido.horario_coleta
    ? formatarDataHora(pedido.horario_coleta)
    : pedido.data_prevista_retorno
      ? `não registrado — previsão de retorno em ${formatarDataHora(pedido.data_prevista_retorno)}`
      : "não registrado, confira no painel";

  const linhas: string[] = [
    "*Delivery Lavoura*",
    "",
    `Cliente: ${pedido.nome_completo}`,
    `Telefone: ${maskTelefone(pedido.telefone)}`,
    `Serviço: ${TIPO_SERVICO_LABEL[pedido.tipo_servico]}`,
    `Cestos: ${pedido.quantidade_cestos}`,
    "",
    `Horário de coleta: ${horarioColetaTexto}`,
    "",
    `${pedido.tipo_servico === "entrega" ? "Endereço de entrega" : "Endereço de coleta"}: ${enderecoCompleto(pedido)}`,
  ];

  if (pedido.tipo_servico === "busca_e_entrega") {
    if (pedido.mesmo_endereco_entrega === false && pedido.rua_entrega) {
      linhas.push(
        `Endereço de entrega: ${enderecoCompleto({
          rua: pedido.rua_entrega,
          numero: pedido.numero_entrega ?? "",
          bairro: pedido.bairro_entrega ?? "",
          complemento: pedido.complemento_entrega,
          referencia: pedido.referencia_entrega,
        })}`,
      );
    } else {
      linhas.push("Entrega no mesmo endereço da coleta.");
    }
  }

  if (pedido.observacoes) {
    linhas.push("", `Observações: ${pedido.observacoes}`);
  }

  return linhas.join("\n");
}

export function tempoRelativo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora mesmo";
  if (min < 60) return `há ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `há ${horas}h`;
  const dias = Math.floor(horas / 24);
  return `há ${dias} ${dias === 1 ? "dia" : "dias"}`;
}

/** "13:00:00" -> "13h" / "13:30:00" -> "13h30" */
export function horaCurta(hora: string): string {
  const [h, m] = hora.split(":");
  return m && m !== "00" ? `${h}h${m}` : `${h}h`;
}

export const DIA_SEMANA_LABEL: string[] = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

/** Texto do horário de hoje, a partir do horário configurado para o dia da semana atual (ou "fechado"). */
export function textoHorarioHoje(
  hoje: { ativo: boolean; hora_abertura: string; hora_fechamento: string } | null,
): string {
  // Em vez de só avisar "estamos fechados" (que afasta o cliente), convida
  // a agendar já — o pedido é aceito normalmente e entra pro próximo
  // horário disponível (ver EtapaResumo em $slug.pedido.tsx).
  if (!hoje || !hoje.ativo) return "Agende seu pedido agora para o próximo horário disponível.";
  return `Hoje atendemos das ${horaCurta(hoje.hora_abertura)} às ${horaCurta(hoje.hora_fechamento)}.`;
}

export function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Toda a rede opera no fuso America/Boa_Vista (UTC-4, sem horário de
// verão) — mesma premissa assumida em pedido-calculo.server.ts. Sem fixar
// o timeZone aqui, o horário exibido depende do fuso do dispositivo de
// quem está olhando (atendente, admin), que na prática costuma ser
// America/Sao_Paulo (UTC-3): um horário de coleta às 13h aparecia como
// 14h pra quem tivesse o computador nesse fuso.
const FUSO_UNIDADE = "America/Boa_Vista";

export function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: FUSO_UNIDADE,
  });
}

export function estaAtrasado(p: {
  data_prevista_retorno: string | null;
  status: PedidoStatus;
}): boolean {
  if (!p.data_prevista_retorno) return false;
  if (p.status === "entregue" || p.status === "cancelado") return false;
  return new Date(p.data_prevista_retorno).getTime() < Date.now();
}

/** "YYYY-MM-DD" do instante `iso`, no fuso da unidade (America/Boa_Vista) — pra comparar "é hoje?" sem depender do fuso de quem está olhando a tela. */
export function chaveDiaBoaVista(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: FUSO_UNIDADE });
}

// Conversão entre o valor de um <input type="datetime-local"> ("YYYY-MM-
// DDTHH:mm", sem fuso) e um ISO real — usadas nos formulários administrativos
// (edição de pedido, lançamento manual) onde a atendente digita um horário e
// ele precisa ser interpretado como hora de Boa Vista, não a do fuso do
// navegador (ver mesma justificativa em formatarDataHora acima).
export function horarioLocalParaIso(valorLocal: string): string {
  return new Date(`${valorLocal}:00-04:00`).toISOString();
}

export function isoParaHorarioLocal(iso: string): string {
  return new Date(new Date(iso).getTime() - 4 * 60 * 60 * 1000).toISOString().slice(0, 16);
}
