import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { garantirVinculoAtendente } from "@/lib/atendentes.functions";

/**
 * Dados da atendente logada (nome, unidade, papel) — mesma queryKey usada em
 * painel.tsx, para que o React Query reaproveite o cache entre o shell
 * admin e a página atual em vez de buscar duas vezes.
 */
export function useAtendenteAdmin() {
  const query = useQuery({
    queryKey: ["atendente"],
    queryFn: async () => {
      await garantirVinculoAtendente();
      const { data: at, error } = await supabase
        .from("atendentes")
        .select("id, nome, unidade_id, role")
        .maybeSingle();
      if (error) throw error;
      if (!at) return null;

      const { data: unidade } = await supabase
        .from("unidades_publico")
        .select("nome, cidade, prazo_padrao_horas")
        .eq("id", at.unidade_id)
        .maybeSingle();

      return { ...at, unidades: unidade ?? null };
    },
  });

  return {
    ...query,
    souAdmin: query.data?.role === "admin",
    unidadeId: query.data?.unidade_id,
  };
}
