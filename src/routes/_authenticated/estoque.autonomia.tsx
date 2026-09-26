import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { garantirVinculoAtendente } from "@/lib/atendentes.functions";
import { notificarEstoqueBaixo } from "@/lib/estoque.functions";
import { PaginaHeader } from "@/components/pagina-header";
import { chaveDiaBoaVista } from "@/lib/lavoura";
import {
  CATEGORIA_LABEL,
  UNIDADE_MEDIDA_LABEL,
  type Categoria,
  type UnidadeMedida,
} from "./estoque";

export const Route = createFileRoute("/_authenticated/estoque/autonomia")({
  head: () => ({
    meta: [{ title: "Autonomia de estoque — Lavoura" }, { name: "robots", content: "noindex" }],
  }),
  component: AutonomiaPage,
});

type ItemComLimites = {
  id: string;
  nome: string;
  categoria: Categoria;
  unidade_medida: UnidadeMedida;
  limite_alerta_amarelo_dias: number;
  limite_alerta_vermelho_dias: number;
};

type Lancamento = { item_id: string; data: string; quantidade: number };

type Status = "verde" | "amarelo" | "vermelho" | "sem_dados";

const STATUS_COR: Record<Status, string> = {
  verde: "bg-green-500/15 text-green-700 border-green-500/40",
  amarelo: "bg-amber-500/15 text-amber-700 border-amber-500/40",
  vermelho: "bg-destructive/15 text-destructive border-destructive/40",
  sem_dados: "bg-secondary text-muted-foreground border-transparent",
};
const STATUS_LABEL: Record<Status, string> = {
  verde: "Confortável",
  amarelo: "Atenção",
  vermelho: "Crítico",
  sem_dados: "Sem dados",
};

function AutonomiaPage() {
  const atendente = useQuery({
    queryKey: ["atendente-estoque"],
    queryFn: async () => {
      await garantirVinculoAtendente();
      const { data, error } = await supabase
        .from("atendentes")
        .select("id, unidade_id, role")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [janelaDias, setJanelaDias] = useState<7 | 14>(7);

  if (atendente.isLoading) {
    return <main className="p-8 text-center text-sm text-muted-foreground">Carregando…</main>;
  }
  if (!atendente.data) {
    return (
      <main className="mx-auto mt-16 max-w-md px-5 text-center">
        <h1 className="text-2xl">Sem vínculo</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Seu usuário ainda não está vinculado a nenhuma unidade.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl space-y-5 px-5 py-8">
      <div className="flex items-center justify-between">
        <PaginaHeader titulo="Autonomia e alertas" />
        <Link to="/estoque" className="text-sm font-medium underline">
          Contagem diária
        </Link>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Consumo médio dos últimos</span>
        {([7, 14] as const).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setJanelaDias(n)}
            className={`rounded-full border px-3 py-1 font-medium transition ${
              janelaDias === n
                ? "border-accent bg-accent/10 text-accent-foreground"
                : "bg-card hover:bg-secondary"
            }`}
          >
            {n} dias
          </button>
        ))}
      </div>

      <TabelaAutonomia unidadeId={atendente.data.unidade_id} janelaDias={janelaDias} />
    </main>
  );
}

function TabelaAutonomia({ unidadeId, janelaDias }: { unidadeId: string; janelaDias: number }) {
  const notificar = useServerFn(notificarEstoqueBaixo);
  const jaNotificados = useRef(new Set<string>());

  const itens = useQuery({
    queryKey: ["itens-autonomia", unidadeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("itens")
        .select(
          "id, nome, categoria, unidade_medida, limite_alerta_amarelo_dias, limite_alerta_vermelho_dias",
        )
        .eq("unidade_id", unidadeId)
        .eq("ativo", true)
        .order("categoria")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as ItemComLimites[];
    },
  });

  const dataLimite = chaveDiaBoaVista(
    new Date(Date.now() - janelaDias * 24 * 60 * 60 * 1000).toISOString(),
  );

  const lancamentos = useQuery({
    queryKey: ["lancamentos-autonomia", unidadeId, janelaDias],
    enabled: (itens.data?.length ?? 0) > 0,
    queryFn: async () => {
      const itemIds = (itens.data ?? []).map((i) => i.id);
      const { data, error } = await supabase
        .from("lancamentos_diarios")
        .select("item_id, data, quantidade")
        .in("item_id", itemIds)
        .gte("data", dataLimite)
        .order("data", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Lancamento[];
    },
  });

  type Linha = ItemComLimites & {
    estoqueAtual: number | null;
    consumoMedio: number;
    diasAutonomia: number | null;
    status: Status;
  };

  const linhas: Linha[] = (itens.data ?? []).map((item) => {
    const doItem = (lancamentos.data ?? []).filter((l) => l.item_id === item.id);
    if (doItem.length === 0) {
      return {
        ...item,
        estoqueAtual: null,
        consumoMedio: 0,
        diasAutonomia: null,
        status: "sem_dados",
      };
    }
    let totalConsumido = 0;
    let intervalos = 0;
    for (let i = 1; i < doItem.length; i++) {
      const delta = doItem[i - 1]!.quantidade - doItem[i]!.quantidade;
      if (delta > 0) totalConsumido += delta;
      intervalos += 1;
    }
    const consumoMedio = intervalos > 0 ? totalConsumido / intervalos : 0;
    const estoqueAtual = doItem[doItem.length - 1]!.quantidade;
    const diasAutonomia = consumoMedio > 0 ? estoqueAtual / consumoMedio : null;

    let status: Status = "verde";
    if (diasAutonomia !== null) {
      if (diasAutonomia <= item.limite_alerta_vermelho_dias) status = "vermelho";
      else if (diasAutonomia <= item.limite_alerta_amarelo_dias) status = "amarelo";
    }

    return { ...item, estoqueAtual, consumoMedio, diasAutonomia, status };
  });

  // Dispara alerta (deduplicado no servidor) pra cada item que calculou
  // como crítico — uma vez por item por carregamento da tela, pra não
  // reenviar em loop se o componente re-renderizar.
  useEffect(() => {
    for (const linha of linhas) {
      if (linha.status !== "vermelho" || linha.diasAutonomia === null) continue;
      if (jaNotificados.current.has(linha.id)) continue;
      jaNotificados.current.add(linha.id);
      notificar({
        data: { itemId: linha.id, nomeItem: linha.nome, diasAutonomia: linha.diasAutonomia },
      }).catch(() => {
        // Falha no alerta não deve travar a tela — fica registrado (ou não)
        // em notificacoes_estoque pra auditoria depois.
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas.map((l) => `${l.id}:${l.status}`).join(",")]);

  if (itens.isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (linhas.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Nenhum item cadastrado ainda.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {linhas.map((linha) => (
        <div key={linha.id} className="rounded-lg border bg-card p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-medium">{linha.nome}</p>
              <p className="text-xs text-muted-foreground">{CATEGORIA_LABEL[linha.categoria]}</p>
            </div>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_COR[linha.status]}`}
            >
              {linha.status === "vermelho" ? <AlertTriangle className="size-3" /> : null}
              {STATUS_LABEL[linha.status]}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Estoque atual</p>
              <p>
                {linha.estoqueAtual ?? "—"} {UNIDADE_MEDIDA_LABEL[linha.unidade_medida]}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Consumo médio/dia</p>
              <p>
                {linha.consumoMedio > 0 ? linha.consumoMedio.toFixed(1) : "—"}{" "}
                {linha.consumoMedio > 0 ? UNIDADE_MEDIDA_LABEL[linha.unidade_medida] : ""}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Autonomia</p>
              <p>{linha.diasAutonomia !== null ? `${linha.diasAutonomia.toFixed(1)} dias` : "—"}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
