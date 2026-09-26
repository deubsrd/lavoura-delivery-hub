import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { exigirAtendente } from "./unidade.functions";
import { chaveDiaBoaVista } from "./lavoura";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Desconta `quantidade` da contagem de HOJE de um item, chamado quando um
 * pedido de delivery/balcão/manual vende um item também controlado no
 * estoque (ver item_id/item_quantidade em pedidos_delivery). Evita que a
 * atendente precise contar esse produto duas vezes — uma no estoque, outra
 * no pedido. Se ainda não existe lançamento de hoje pra esse item, parte
 * do último lançamento anterior como base (nunca deixa a quantidade ficar
 * negativa: se o desconto for maior que o estoque conhecido, zera).
 * Erro aqui não deve derrubar a criação do pedido — quem chama decide se
 * ignora a falha (ver criarPedidoBalcaoInterno/criarPedidoManual).
 */
export async function descontarItemDoEstoque(params: {
  supabaseAdmin: SupabaseClient<Database>;
  itemId: string;
  unidadeId: string;
  quantidade: number;
}): Promise<void> {
  const { supabaseAdmin, itemId, unidadeId, quantidade } = params;
  const hoje = chaveDiaBoaVista(new Date().toISOString());

  const { data: registroHoje } = await supabaseAdmin
    .from("lancamentos_diarios")
    .select("id, quantidade")
    .eq("item_id", itemId)
    .eq("data", hoje)
    .maybeSingle();

  if (registroHoje) {
    const nova = Math.max(0, registroHoje.quantidade - quantidade);
    await supabaseAdmin
      .from("lancamentos_diarios")
      .update({ quantidade: nova })
      .eq("id", registroHoje.id);
    return;
  }

  const { data: ultimoAnterior } = await supabaseAdmin
    .from("lancamentos_diarios")
    .select("quantidade")
    .eq("item_id", itemId)
    .lt("data", hoje)
    .order("data", { ascending: false })
    .limit(1)
    .maybeSingle();

  const base = ultimoAnterior?.quantidade ?? 0;
  await supabaseAdmin.from("lancamentos_diarios").insert({
    item_id: itemId,
    unidade_id: unidadeId,
    data: hoje,
    quantidade: Math.max(0, base - quantidade),
    origem: "delivery",
  });
}

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
