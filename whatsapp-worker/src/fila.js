import { supabase } from "./supabaseClient.js";

/**
 * Fila de saída: mensagens que o app principal (Cloudflare) enfileirou em
 * whatsapp_mensagens (direcao='enviada', status='pendente') — tanto
 * notificação automática de status de pedido quanto mensagem manual do
 * chat, ver src/lib/notificacoes.server.ts e src/lib/whatsapp.functions.ts
 * no app principal. Este worker é quem efetivamente manda pro WhatsApp.
 *
 * `obterSessaoConectada(unidadeId)` é injetado pelo manager — devolve a
 * WhatsappSession da unidade se ela estiver com uma conexão ativa, ou
 * `null` se a unidade ainda não conectou (a mensagem fica pendente até
 * conectar; não é tratada como falha).
 */
export function iniciarFilaDeSaida(obterSessaoConectada) {
  async function processarPendentes() {
    const { data: pendentes, error } = await supabase
      .from("whatsapp_mensagens")
      .select("id, unidade_id, telefone, texto")
      .eq("direcao", "enviada")
      .eq("status", "pendente")
      .order("created_at", { ascending: true })
      .limit(50);

    if (error) {
      console.error("[fila] falha ao buscar mensagens pendentes", error.message);
      return;
    }
    if (!pendentes || pendentes.length === 0) return;

    for (const mensagem of pendentes) {
      const sessao = obterSessaoConectada(mensagem.unidade_id);
      if (!sessao) continue; // unidade sem WhatsApp conectado ainda — tenta de novo na próxima passada

      try {
        await sessao.enviarMensagem(mensagem.telefone, mensagem.texto);
        await supabase
          .from("whatsapp_mensagens")
          .update({ status: "enviada", enviado_em: new Date().toISOString() })
          .eq("id", mensagem.id);
      } catch (err) {
        console.error(`[fila] falha ao enviar mensagem ${mensagem.id}`, err);
        await supabase
          .from("whatsapp_mensagens")
          .update({ status: "falhou", erro: err instanceof Error ? err.message : String(err) })
          .eq("id", mensagem.id);
      }
    }
  }

  // Catch-up imediato (mensagens que se acumularam com o worker offline) +
  // reage a cada nova mensagem via Realtime + um intervalo de segurança
  // caso algum evento do Realtime se perca.
  processarPendentes();
  supabase
    .channel("whatsapp-fila-saida")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "whatsapp_mensagens" },
      (payload) => {
        if (payload.new?.direcao === "enviada" && payload.new?.status === "pendente") {
          processarPendentes();
        }
      },
    )
    .subscribe();
  setInterval(processarPendentes, 30_000);
}
