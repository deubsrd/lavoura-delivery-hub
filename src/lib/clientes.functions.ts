import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { exigirAdmin } from "./unidade.functions";

const PAGE_SIZE = 50;

export type ClienteListado = {
  id: string;
  nome_completo: string;
  telefone: string;
  cpf: string;
  created_at: string;
  total_compras: number;
  ultima_compra: string | null;
};

/**
 * Total de compras (pedidos não cancelados) e data da última, por cliente
 * — não existe hoje uma coluna/view agregada pra isso, então é calculado
 * aqui a partir de pedidos_delivery pros ids da página atual.
 */
async function buscarEstatisticasClientes(
  supabaseAdmin: import("@supabase/supabase-js").SupabaseClient,
  clienteIds: string[],
): Promise<Map<string, { total: number; ultima: string | null }>> {
  const mapa = new Map<string, { total: number; ultima: string | null }>();
  if (clienteIds.length === 0) return mapa;

  const { data, error } = await supabaseAdmin
    .from("pedidos_delivery")
    .select("cliente_id, data_pedido")
    .in("cliente_id", clienteIds)
    .neq("status", "cancelado");
  if (error) throw new Error(error.message);

  for (const linha of data ?? []) {
    if (!linha.cliente_id) continue;
    const atual = mapa.get(linha.cliente_id) ?? { total: 0, ultima: null };
    atual.total += 1;
    if (!atual.ultima || linha.data_pedido > atual.ultima) atual.ultima = linha.data_pedido;
    mapa.set(linha.cliente_id, atual);
  }
  return mapa;
}

/**
 * Filtro OR pra busca por nome (parcial) ou, se o termo tiver 3+ dígitos,
 * também por CPF/telefone (parcial, ignorando pontuação) — cobre tanto
 * "digitei o nome" quanto "colei o número de telefone com máscara". `null`
 * quando não há termo (nenhum filtro a aplicar).
 */
function filtroBuscaOr(busca: string | undefined): string | null {
  const termo = busca?.trim();
  if (!termo) return null;
  const digitos = termo.replace(/\D/g, "");
  if (digitos.length >= 3) {
    return `nome_completo.ilike.%${termo}%,cpf.ilike.%${digitos}%,telefone.ilike.%${digitos}%`;
  }
  return `nome_completo.ilike.%${termo}%`;
}

const filtroSchema = z.object({
  busca: z.string().trim().max(160).optional(),
  pagina: z.number().int().min(0).default(0),
});

export type ClientesPagina = {
  clientes: ClienteListado[];
  total: number;
  paginaTamanho: number;
};

/** Lista paginada de clientes da própria unidade, com busca por nome/CPF/telefone (só admin). */
export const listarClientes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => filtroSchema.parse(data))
  .handler(async ({ data, context }): Promise<ClientesPagina> => {
    const { unidadeId } = await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("clientes")
      .select("id, nome_completo, telefone, cpf, created_at", { count: "exact" })
      .eq("unidade_id", unidadeId)
      .order("nome_completo");
    const filtro = filtroBuscaOr(data.busca);
    if (filtro) query = query.or(filtro);

    const inicio = data.pagina * PAGE_SIZE;
    const { data: linhas, count, error } = await query.range(inicio, inicio + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);

    const ids = (linhas ?? []).map((c) => c.id);
    const estatisticas = await buscarEstatisticasClientes(supabaseAdmin, ids);

    const clientes: ClienteListado[] = (linhas ?? []).map((c) => ({
      ...c,
      total_compras: estatisticas.get(c.id)?.total ?? 0,
      ultima_compra: estatisticas.get(c.id)?.ultima ?? null,
    }));

    return { clientes, total: count ?? 0, paginaTamanho: PAGE_SIZE };
  });

// Teto de segurança pra exportação: evita uma unidade com uma base gigante
// travar a função exportando dezenas de milhares de linhas de uma vez.
const LIMITE_EXPORTACAO = 5000;

/** Todos os clientes que batem com a busca (sem paginação, até o teto acima), pra exportar em CSV. */
export const exportarClientes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ busca: z.string().trim().max(160).optional() }).parse(data))
  .handler(async ({ data, context }): Promise<ClienteListado[]> => {
    const { unidadeId } = await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("clientes")
      .select("id, nome_completo, telefone, cpf, created_at")
      .eq("unidade_id", unidadeId)
      .order("nome_completo")
      .limit(LIMITE_EXPORTACAO);
    const filtro = filtroBuscaOr(data.busca);
    if (filtro) query = query.or(filtro);

    const { data: linhas, error } = await query;
    if (error) throw new Error(error.message);

    const ids = (linhas ?? []).map((c) => c.id);
    const estatisticas = await buscarEstatisticasClientes(supabaseAdmin, ids);

    return (linhas ?? []).map((c) => ({
      ...c,
      total_compras: estatisticas.get(c.id)?.total ?? 0,
      ultima_compra: estatisticas.get(c.id)?.ultima ?? null,
    }));
  });
