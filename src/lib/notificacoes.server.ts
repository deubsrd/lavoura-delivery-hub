/**
 * Notificação automática de mudança de status via WhatsApp. Chamada nos
 * três pontos combinados: pedido recebido, pronto para entrega e
 * entregue.
 *
 * Não fala com o WhatsApp diretamente — este app (Cloudflare Worker) não
 * consegue manter o socket persistente que o Baileys exige. Em vez disso,
 * só insere uma linha em `whatsapp_mensagens` (status "pendente"); um
 * script Node separado, rodando numa VM própria (ver whatsapp-worker/),
 * assina essa tabela via Supabase Realtime e faz o envio de fato,
 * atualizando o status pra "enviada"/"falhou" depois. Se a unidade nunca
 * conectou o WhatsApp, a mensagem fica pendente indefinidamente — sem
 * problema, é só não vai sair (o admin vê isso na tela de Conexão).
 */

type StatusNotificavel = "recebido" | "pronto" | "entregue";

const MENSAGEM_POR_STATUS: Record<StatusNotificavel, (nome: string) => string> = {
  recebido: (nome) =>
    `Olá, ${nome}! Recebemos seu pedido na Lavoura 🧺. Em breve o motoboy passa aí pra buscar suas roupas.`,
  pronto: (nome) =>
    `${nome}, suas roupas já estão prontas! 🎉 Em breve o motoboy sai pra entrega.`,
  entregue: (nome) => `Pedido entregue! Obrigado por usar a Lavoura, ${nome} 💚`,
};

export async function notificarStatusPedido(params: {
  pedidoId: string;
  unidadeId: string;
  clienteId: string | null;
  telefone: string;
  nome: string;
  status: StatusNotificavel;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const texto = MENSAGEM_POR_STATUS[params.status](params.nome.split(" ")[0] ?? params.nome);

  const { error: erroMensagem } = await supabaseAdmin.from("whatsapp_mensagens").insert({
    unidade_id: params.unidadeId,
    cliente_id: params.clienteId,
    pedido_id: params.pedidoId,
    telefone: params.telefone,
    direcao: "enviada",
    origem: "automatica",
    status: "pendente",
    texto,
  });

  // notificacoes_pedido é só o log de auditoria de "tentamos notificar
  // esse status" — sucesso aqui significa "a mensagem entrou na fila",
  // não "chegou no WhatsApp do cliente" (isso o script da VM controla via
  // whatsapp_mensagens.status).
  const { error: erroLog } = await supabaseAdmin.from("notificacoes_pedido").insert({
    pedido_id: params.pedidoId,
    status_notificado: params.status,
    sucesso: !erroMensagem,
    resposta: erroMensagem?.message ?? null,
  });
  if (erroLog) console.error("[notificacoes] falha ao registrar notificação", erroLog.message);
  if (erroMensagem) {
    console.error("[notificacoes] falha ao enfileirar mensagem de whatsapp", erroMensagem.message);
  }
}
