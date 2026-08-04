export type TipoServico = "busca" | "entrega" | "busca_e_entrega";
export type HorarioPreferido = "manha" | "tarde" | "sem_preferencia";
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
};

export const HORARIO_LABEL: Record<HorarioPreferido, string> = {
  manha: "Manhã",
  tarde: "Tarde",
  sem_preferencia: "Sem preferência",
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
  return true;
}

export function colunasParaTipo(tipo: TipoServico): PedidoStatus[] {
  return FLUXO_STATUS.filter((s) => statusAplicavel(s, tipo));
}

export function maskTelefone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : "";
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
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
  rua: string;
  numero: string;
  bairro: string;
}): string {
  return `${p.rua}, ${p.numero} — ${p.bairro}`;
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

export function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
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
