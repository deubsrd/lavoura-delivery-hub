import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Garante que o usuário logado tenha um cadastro de atendente vinculado à
 * unidade correspondente ao código de convite informado no cadastro
 * (guardado nos metadados do usuário). A primeira atendente vinculada a
 * uma unidade vira admin automaticamente — ver migração atendente_role.
 */
export const garantirVinculoAtendente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ vinculado: boolean; erro?: string }> => {
    const { data: existente } = await context.supabase
      .from("atendentes")
      .select("id")
      .eq("id", context.userId)
      .maybeSingle();
    if (existente) return { vinculado: true };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: userData, error: userErr } = await supabaseAdmin.auth.admin.getUserById(
      context.userId,
    );
    if (userErr || !userData.user) {
      return { vinculado: false, erro: "Não foi possível ler seu usuário." };
    }

    const meta = z
      .object({ codigo_convite: z.string().min(1), nome: z.string().optional() })
      .safeParse(userData.user.user_metadata ?? {});
    if (!meta.success) {
      return { vinculado: false, erro: "Cadastro incompleto: nenhum código de convite foi informado." };
    }

    const { data: unidadeId, error: rpcErr } = await context.supabase.rpc(
      "unidade_por_codigo_convite",
      { codigo: meta.data.codigo_convite.trim() },
    );
    if (rpcErr) return { vinculado: false, erro: "Não foi possível validar o código de convite." };
    if (!unidadeId) {
      return {
        vinculado: false,
        erro: "Código de convite inválido. Confira o código com o responsável da sua unidade.",
      };
    }

    const { count: jaExisteAtendente } = await supabaseAdmin
      .from("atendentes")
      .select("id", { count: "exact", head: true })
      .eq("unidade_id", unidadeId);

    const { error } = await supabaseAdmin.from("atendentes").insert({
      id: context.userId,
      nome: meta.data.nome ?? userData.user.email ?? "",
      unidade_id: unidadeId,
      role: (jaExisteAtendente ?? 0) === 0 ? "admin" : "atendente",
    });
    if (error) return { vinculado: false, erro: "Não foi possível concluir o vínculo com a unidade." };
    return { vinculado: true };
  });
