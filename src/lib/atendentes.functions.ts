import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Lista pública de unidades (usada na tela de acesso da equipe). */
export type UnidadeResumo = { id: string; nome: string; slug: string; cidade: string };

export const listarUnidades = createServerFn({ method: "GET" }).handler(
  async (): Promise<UnidadeResumo[]> => {
  const { getPublicClient } = await import("./supabase-public.server");
  const { data, error } = await getPublicClient()
    .from("unidades")
    .select("id, nome, slug, cidade")
    .order("nome");
  if (error) throw new Error(error.message);
    return data ?? [];
  },
);

/**
 * Garante que o usuário logado tenha um cadastro de atendente vinculado à
 * unidade escolhida no momento do cadastro (guardada nos metadados do usuário).
 */
export const garantirVinculoAtendente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
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
    if (userErr || !userData.user) return { vinculado: false };

    const meta = z
      .object({ unidade_slug: z.string().min(1), nome: z.string().optional() })
      .safeParse(userData.user.user_metadata ?? {});
    if (!meta.success) return { vinculado: false };

    const { data: unidade } = await supabaseAdmin
      .from("unidades")
      .select("id")
      .eq("slug", meta.data.unidade_slug)
      .maybeSingle();
    if (!unidade) return { vinculado: false };

    const { error } = await supabaseAdmin.from("atendentes").insert({
      id: context.userId,
      nome: meta.data.nome ?? userData.user.email ?? "",
      unidade_id: unidade.id,
    });
    if (error) return { vinculado: false };
    return { vinculado: true };
  });
