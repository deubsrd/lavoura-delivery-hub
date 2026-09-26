import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { exigirAtendente } from "./unidade.functions";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Dispara (se ainda não tiver disparado nas últimas 20h) o alerta de
 * estoque baixo de um item, no mesmo canal de webhook já usado pro
 * delivery (ver notificacoes.server.ts). Chamado pela tela de autonomia e
 * alertas, e também depois de confirmar a contagem do dia, sempre que um
 * item calcula como "vermelho" — o cálculo de autonomia em si roda no
 * client (lê lancamentos_diarios direto, sob RLS), este server function só
 * cuida do "já notifiquei esse item recentemente?" e do envio.
 */
export const notificarEstoqueBaixo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        itemId: z.string().uuid(),
        nomeItem: z.string().min(1).max(160),
        diasAutonomia: z.number().nonnegative(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    // Confere que o item pertence à unidade da atendente logada — não dá
    // pra confiar só no itemId vindo do client.
    const { unidadeId } = await exigirAtendente(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: item, error: itemErr } = await supabaseAdmin
      .from("itens")
      .select("id")
      .eq("id", data.itemId)
      .eq("unidade_id", unidadeId)
      .maybeSingle();
    if (itemErr || !item) return { notificado: false };

    const vinteHorasAtras = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
    const { count } = await supabaseAdmin
      .from("notificacoes_estoque")
      .select("id", { count: "exact", head: true })
      .eq("item_id", data.itemId)
      .gte("created_at", vinteHorasAtras);
    if ((count ?? 0) > 0) return { notificado: false };

    const url = process.env["WHATSAPP_WEBHOOK_URL"];
    let sucesso = false;
    let resposta: string | null = null;

    if (url) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            tipo: "estoque_baixo",
            item: data.nomeItem,
            dias_autonomia: data.diasAutonomia,
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
    } else {
      resposta = "WHATSAPP_WEBHOOK_URL não configurada — alerta só registrado, não enviado.";
    }

    await supabaseAdmin.from("notificacoes_estoque").insert({
      item_id: data.itemId,
      dias_autonomia: data.diasAutonomia,
      sucesso,
      resposta,
    });

    return { notificado: true, sucesso };
  });
