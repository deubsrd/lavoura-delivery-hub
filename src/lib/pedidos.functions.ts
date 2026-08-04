import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

const enderecoBase = {
  rua: z.string().trim().min(2).max(160),
  numero: z.string().trim().min(1).max(20),
  bairro: z.string().trim().min(2).max(120),
  complemento: z.string().trim().max(160).optional().nullable(),
  referencia: z.string().trim().max(200).optional().nullable(),
};

export const pedidoSchema = z
  .object({
    slug: z.string().trim().min(1).max(80),
    nome_completo: z.string().trim().min(3, "Informe o nome completo").max(160),
    telefone: z
      .string()
      .trim()
      .refine((v) => v.replace(/\D/g, "").length >= 10, "Telefone inválido"),
    ...enderecoBase,
    quantidade_cestos: z.number().int().min(1).max(50),
    tipo_servico: z.enum(["busca", "entrega", "busca_e_entrega"]),
    horario_preferido: z.enum(["manha", "tarde", "sem_preferencia"]),
    observacoes: z.string().trim().max(800).optional().nullable(),
    mesmo_endereco_entrega: z.boolean().optional().nullable(),
    rua_entrega: z.string().trim().max(160).optional().nullable(),
    numero_entrega: z.string().trim().max(20).optional().nullable(),
    bairro_entrega: z.string().trim().max(120).optional().nullable(),
    complemento_entrega: z.string().trim().max(160).optional().nullable(),
    referencia_entrega: z.string().trim().max(200).optional().nullable(),
    // Honeypot anti-spam: precisa vir vazio.
    armadilha: z.string().max(0).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.tipo_servico === "busca_e_entrega") {
      if (typeof data.mesmo_endereco_entrega !== "boolean") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["mesmo_endereco_entrega"],
          message: "Responda se o endereço de entrega é o mesmo",
        });
        return;
      }
      if (data.mesmo_endereco_entrega === false) {
        for (const campo of ["rua_entrega", "numero_entrega", "bairro_entrega"] as const) {
          if (!data[campo] || String(data[campo]).trim().length < 1) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [campo],
              message: "Campo obrigatório para o endereço de entrega",
            });
          }
        }
      }
    }
  });

export type PedidoInput = z.infer<typeof pedidoSchema>;

export const getUnidadeBySlug = createServerFn({ method: "GET" })
  .inputValidator((data: { slug: string }) => z.object({ slug: z.string().min(1).max(80) }).parse(data))
  .handler(async ({ data }) => {
    const { getPublicClient } = await import("./supabase-public.server");
    const supabase = getPublicClient();
    const { data: unidade, error } = await supabase
      .from("unidades")
      .select("id, nome, slug, cidade, prazo_padrao_horas")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return unidade;
  });

export const criarPedido = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => pedidoSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const request = getRequest();
    const ip =
      request?.headers.get("cf-connecting-ip") ??
      request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "desconhecido";

    const { data: unidade, error: unidadeErr } = await supabaseAdmin
      .from("unidades")
      .select("id, nome, slug, prazo_padrao_horas")
      .eq("slug", data.slug)
      .maybeSingle();
    if (unidadeErr) throw new Error(unidadeErr.message);
    if (!unidade) throw new Error("Unidade não encontrada.");

    // Proteção básica anti-spam: limite por IP e por telefone.
    const quinzeMin = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count: porIp } = await supabaseAdmin
      .from("pedidos_delivery")
      .select("id", { count: "exact", head: true })
      .eq("ip_origem", ip)
      .gte("created_at", quinzeMin);
    if ((porIp ?? 0) >= 5) {
      throw new Error("Muitos pedidos enviados deste dispositivo. Tente novamente em alguns minutos.");
    }

    const telefone = data.telefone.replace(/\D/g, "");
    const { count: porTelefone } = await supabaseAdmin
      .from("pedidos_delivery")
      .select("id", { count: "exact", head: true })
      .eq("telefone", telefone)
      .gte("created_at", new Date(Date.now() - 3 * 60 * 1000).toISOString());
    if ((porTelefone ?? 0) >= 1) {
      throw new Error("Já recebemos um pedido com este telefone há poucos minutos.");
    }

    const agora = new Date();
    const previsto = new Date(agora.getTime() + unidade.prazo_padrao_horas * 60 * 60 * 1000);
    const enderecoDiferente =
      data.tipo_servico === "busca_e_entrega" && data.mesmo_endereco_entrega === false;

    const { data: pedido, error } = await supabaseAdmin
      .from("pedidos_delivery")
      .insert({
        unidade_id: unidade.id,
        nome_completo: data.nome_completo,
        telefone,
        rua: data.rua,
        numero: data.numero,
        bairro: data.bairro,
        complemento: data.complemento || null,
        referencia: data.referencia || null,
        mesmo_endereco_entrega:
          data.tipo_servico === "busca_e_entrega" ? (data.mesmo_endereco_entrega ?? null) : null,
        rua_entrega: enderecoDiferente ? (data.rua_entrega ?? null) : null,
        numero_entrega: enderecoDiferente ? (data.numero_entrega ?? null) : null,
        bairro_entrega: enderecoDiferente ? (data.bairro_entrega ?? null) : null,
        complemento_entrega: enderecoDiferente ? data.complemento_entrega || null : null,
        referencia_entrega: enderecoDiferente ? data.referencia_entrega || null : null,
        quantidade_cestos: data.quantidade_cestos,
        tipo_servico: data.tipo_servico,
        horario_preferido: data.horario_preferido,
        observacoes: data.observacoes || null,
        status: "recebido" as const,
        data_pedido: agora.toISOString(),
        data_prevista_retorno: previsto.toISOString(),
        ip_origem: ip,
      })
      .select("id, data_prevista_retorno, data_pedido")
      .single();

    if (error) throw new Error(error.message);

    return {
      id: pedido.id,
      data_prevista_retorno: pedido.data_prevista_retorno,
      unidade_nome: unidade.nome,
      prazo_padrao_horas: unidade.prazo_padrao_horas,
    };
  });
