import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function senhaConfere(a: string, b: string): Promise<boolean> {
  const { timingSafeEqual } = await import("node:crypto");
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export type ConviteUnidade = { nome: string; cidade: string; codigo_convite: string };

/**
 * Lista o código de convite de cada unidade para o responsável da rede
 * repassar manualmente às atendentes. Protegida por ADMIN_SECRET — nunca
 * hardcoded, sempre lida de variável de ambiente no servidor.
 */
export const listarConvites = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ senha: z.string().min(1) }).parse(data))
  .handler(async ({ data }): Promise<ConviteUnidade[]> => {
    const segredo = process.env["ADMIN_SECRET"];
    if (!segredo || !(await senhaConfere(data.senha, segredo))) {
      throw new Error("Senha incorreta.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: unidades, error } = await supabaseAdmin
      .from("unidades")
      .select("nome, cidade, codigo_convite")
      .order("nome");
    if (error) throw new Error(error.message);
    return unidades ?? [];
  });
