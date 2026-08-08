/**
 * Notificação automática de mudança de status via webhook do WhatsApp.
 * Chamada nos três pontos combinados: pedido recebido, pronto para
 * entrega e entregue. Se WHATSAPP_WEBHOOK_URL não estiver configurada, a
 * chamada é simplesmente pulada (não é um erro, e nada é registrado).
 */

type StatusNotificavel = "recebido" | "pronto" | "entregue";

export async function notificarStatusPedido(params: {
  pedidoId: string;
  telefone: string;
  nome: string;
  status: StatusNotificavel;
}): Promise<void> {
  const url = process.env["WHATSAPP_WEBHOOK_URL"];
  if (!url) return;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let sucesso = false;
  let resposta: string | null = null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        telefone: params.telefone,
        nome: params.nome,
        status: params.status,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    sucesso = res.ok;
    resposta = (await res.text().catch(() => "")).slice(0, 2000) || null;
  } catch (err) {
    sucesso = false;
    resposta = err instanceof Error ? err.message : "Erro desconhecido ao chamar o webhook.";
  }

  const { error } = await supabaseAdmin.from("notificacoes_pedido").insert({
    pedido_id: params.pedidoId,
    status_notificado: params.status,
    sucesso,
    resposta,
  });
  if (error) console.error("[notificacoes] falha ao registrar notificação", error.message);
}
