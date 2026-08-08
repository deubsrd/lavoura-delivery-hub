import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { exigirAdmin } from "./unidade.functions";

export type ConexaoWhatsapp = {
  status: "desconectado" | "conectando" | "conectado";
  comando: "nenhum" | "conectar" | "desconectar";
  qr_atual: string | null;
  telefone_conectado: string | null;
  conectado_em: string | null;
  erro: string | null;
};

const CONEXAO_PADRAO: ConexaoWhatsapp = {
  status: "desconectado",
  comando: "nenhum",
  qr_atual: null,
  telefone_conectado: null,
  conectado_em: null,
  erro: null,
};

/** Estado atual da conexão WhatsApp da própria unidade (só admin). Sem linha ainda = nunca conectou. */
export const obterConexaoWhatsapp = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ConexaoWhatsapp> => {
    const { unidadeId } = await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("whatsapp_conexoes")
      .select("status, comando, qr_atual, telefone_conectado, conectado_em, erro")
      .eq("unidade_id", unidadeId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? CONEXAO_PADRAO;
  });

/**
 * Pede pro script Baileys (rodando na VM) iniciar o pareamento da própria
 * unidade — cria a linha se ainda não existir. O comando é consumido pelo
 * script, que assina esta tabela via Supabase Realtime; esta função só
 * grava a intenção, não sabe nada sobre WhatsApp de verdade.
 */
export const solicitarConexaoWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const { unidadeId } = await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("whatsapp_conexoes")
      .upsert(
        { unidade_id: unidadeId, comando: "conectar", erro: null },
        { onConflict: "unidade_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const desconectarWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const { unidadeId } = await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("whatsapp_conexoes")
      .update({ comando: "desconectar" })
      .eq("unidade_id", unidadeId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type ConversaResumo = {
  telefone: string;
  cliente_id: string | null;
  nome: string | null;
  ultima_mensagem: string;
  ultima_mensagem_em: string;
  ultima_direcao: "enviada" | "recebida";
};

/**
 * Uma linha por telefone com mensagem na unidade, mais recente primeiro —
 * a "lista de conversas" do chat. Sem view/RPC agregada no banco: busca as
 * últimas N mensagens e agrupa em memória (volume esperado é baixo, é chat
 * de uma lavanderia, não um call center).
 */
export const listarConversas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ConversaResumo[]> => {
    const { unidadeId } = await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data, error } = await supabaseAdmin
      .from("whatsapp_mensagens")
      .select("telefone, cliente_id, texto, direcao, created_at, clientes(nome_completo)")
      .eq("unidade_id", unidadeId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const porTelefone = new Map<string, ConversaResumo>();
    for (const linha of data ?? []) {
      if (porTelefone.has(linha.telefone)) continue;
      porTelefone.set(linha.telefone, {
        telefone: linha.telefone,
        cliente_id: linha.cliente_id,
        nome: (linha.clientes as { nome_completo: string } | null)?.nome_completo ?? null,
        ultima_mensagem: linha.texto,
        ultima_mensagem_em: linha.created_at,
        ultima_direcao: linha.direcao,
      });
    }
    return [...porTelefone.values()];
  });

export type MensagemChat = {
  id: string;
  direcao: "enviada" | "recebida";
  origem: "automatica" | "manual";
  status: "pendente" | "enviada" | "entregue" | "lida" | "falhou";
  texto: string;
  created_at: string;
};

/** Thread completa de mensagens com um telefone específico, mais antiga primeiro. */
export const obterConversa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ telefone: z.string().min(8).max(20) }).parse(data))
  .handler(async ({ data, context }): Promise<MensagemChat[]> => {
    const { unidadeId } = await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: mensagens, error } = await supabaseAdmin
      .from("whatsapp_mensagens")
      .select("id, direcao, origem, status, texto, created_at")
      .eq("unidade_id", unidadeId)
      .eq("telefone", data.telefone)
      .order("created_at", { ascending: true })
      .limit(300);
    if (error) throw new Error(error.message);
    return mensagens ?? [];
  });

/**
 * Envia uma mensagem manual (atendente digitando no chat) — só enfileira
 * (status "pendente"); o script Baileys entrega de fato e atualiza o
 * status depois. Mesma tabela/fila das notificações automáticas de
 * status de pedido, ver notificacoes.server.ts.
 */
export const enviarMensagemManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        telefone: z.string().min(8).max(20),
        clienteId: z.string().uuid().optional().nullable(),
        texto: z.string().trim().min(1).max(4000),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { unidadeId } = await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("whatsapp_mensagens").insert({
      unidade_id: unidadeId,
      cliente_id: data.clienteId ?? null,
      telefone: data.telefone,
      direcao: "enviada",
      origem: "manual",
      status: "pendente",
      texto: data.texto,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
