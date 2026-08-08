import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { supabase } from "@/integrations/supabase/client";
import { useAtendenteAdmin } from "@/hooks/use-atendente-admin";
import { AcessoRestrito } from "@/components/acesso-restrito";
import { PaginaHeader } from "@/components/pagina-header";
import { TIPO_SERVICO_LABEL, formatarMoeda, type TipoServico } from "@/lib/lavoura";
import { Input } from "@/components/ui/input";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [{ title: "Dashboard — Lavoura" }, { name: "robots", content: "noindex" }],
  }),
  component: DashboardPage,
});

type PedidoDashboard = {
  data_pedido: string;
  status: string;
  tipo_servico: TipoServico;
  valor_total: number | null;
  distancia_km: number | null;
};

function DashboardPage() {
  const atendente = useAtendenteAdmin();

  if (atendente.isLoading) {
    return <main className="p-8 text-center text-sm text-muted-foreground">Carregando…</main>;
  }
  if (!atendente.souAdmin) return <AcessoRestrito />;

  return <SecaoDashboard />;
}

const CHART_CONFIG: ChartConfig = {
  vendas: { label: "Vendas", color: "var(--accent)" },
};

type Periodo = "hoje" | "ontem" | "este_mes" | "mes_passado" | "personalizado";

const PERIODO_LABEL: Record<Periodo, string> = {
  hoje: "Hoje",
  ontem: "Ontem",
  este_mes: "Este mês",
  mes_passado: "Mês passado",
  personalizado: "Personalizado",
};

function paraDataLocal(data: string): Date {
  const partes = data.split("-").map(Number);
  const [ano, mes, dia] = [partes[0] ?? 1970, partes[1] ?? 1, partes[2] ?? 1];
  return new Date(ano, mes - 1, dia);
}

/** Início/fim (inclusive, hora local) do intervalo correspondente ao período escolhido. */
function calcularIntervalo(
  periodo: Periodo,
  personalizado: { inicio: string; fim: string },
): { inicio: Date; fim: Date } | null {
  const hoje = new Date();
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const fimHoje = new Date(inicioHoje.getTime() + 24 * 60 * 60 * 1000 - 1);

  switch (periodo) {
    case "hoje":
      return { inicio: inicioHoje, fim: fimHoje };
    case "ontem": {
      const inicioOntem = new Date(inicioHoje.getTime() - 24 * 60 * 60 * 1000);
      const fimOntem = new Date(inicioHoje.getTime() - 1);
      return { inicio: inicioOntem, fim: fimOntem };
    }
    case "este_mes": {
      const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      return { inicio, fim: fimHoje };
    }
    case "mes_passado": {
      const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
      const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 1).getTime() - 1;
      return { inicio, fim: new Date(fim) };
    }
    case "personalizado": {
      if (!personalizado.inicio || !personalizado.fim) return null;
      const inicio = paraDataLocal(personalizado.inicio);
      const fim = new Date(paraDataLocal(personalizado.fim).getTime() + 24 * 60 * 60 * 1000 - 1);
      return { inicio, fim };
    }
  }
}

function SecaoDashboard() {
  const [periodo, setPeriodo] = useState<Periodo>("hoje");
  const [personalizado, setPersonalizado] = useState({ inicio: "", fim: "" });

  const intervalo = useMemo(
    () => calcularIntervalo(periodo, personalizado),
    [periodo, personalizado],
  );

  const pedidos = useQuery({
    queryKey: ["pedidos-dashboard", periodo, personalizado.inicio, personalizado.fim],
    queryFn: async () => {
      if (!intervalo) return [] as PedidoDashboard[];
      const { data, error } = await supabase
        .from("pedidos_delivery")
        .select("data_pedido, status, tipo_servico, valor_total, distancia_km")
        .gte("data_pedido", intervalo.inicio.toISOString())
        .lte("data_pedido", intervalo.fim.toISOString())
        .order("data_pedido", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PedidoDashboard[];
    },
    enabled: intervalo !== null,
  });

  const metricas = useMemo(() => {
    const todos = pedidos.data ?? [];
    const naoCancelados = todos.filter((p) => p.status !== "cancelado");

    const vendasTotais = naoCancelados.reduce((soma, p) => soma + (p.valor_total ?? 0), 0);
    const kmTotais = naoCancelados.reduce((soma, p) => soma + (p.distancia_km ?? 0), 0);
    const ticketMedio = naoCancelados.length > 0 ? vendasTotais / naoCancelados.length : 0;
    const taxaCancelamento =
      todos.length > 0 ? ((todos.length - naoCancelados.length) / todos.length) * 100 : 0;

    const porTipo: Record<TipoServico, number> = { busca: 0, entrega: 0, busca_e_entrega: 0 };
    for (const p of naoCancelados) porTipo[p.tipo_servico] = (porTipo[p.tipo_servico] ?? 0) + 1;

    const vendasPorDiaMapa = new Map<string, number>();
    for (const p of naoCancelados) {
      const dia = p.data_pedido.slice(0, 10);
      vendasPorDiaMapa.set(dia, (vendasPorDiaMapa.get(dia) ?? 0) + (p.valor_total ?? 0));
    }
    const vendasPorDia = [...vendasPorDiaMapa.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dia, vendas]) => ({
        dia: new Date(dia + "T00:00:00").toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
        }),
        vendas,
      }));

    return {
      vendasTotais,
      kmTotais,
      ticketMedio,
      taxaCancelamento,
      porTipo,
      vendasPorDia,
      totalPedidos: naoCancelados.length,
    };
  }, [pedidos.data]);

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-5 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PaginaHeader titulo="Dashboard" />
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value as Periodo)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            {(Object.keys(PERIODO_LABEL) as Periodo[]).map((p) => (
              <option key={p} value={p}>
                {PERIODO_LABEL[p]}
              </option>
            ))}
          </select>
          {periodo === "personalizado" ? (
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={personalizado.inicio}
                onChange={(e) => setPersonalizado((p) => ({ ...p, inicio: e.target.value }))}
                className="h-9 w-[9.5rem] text-sm"
              />
              <span className="text-sm text-muted-foreground">até</span>
              <Input
                type="date"
                value={personalizado.fim}
                onChange={(e) => setPersonalizado((p) => ({ ...p, fim: e.target.value }))}
                className="h-9 w-[9.5rem] text-sm"
              />
            </div>
          ) : null}
        </div>
      </div>

      {periodo === "personalizado" && !intervalo ? (
        <p className="text-sm text-muted-foreground">Escolha as duas datas para ver os dados.</p>
      ) : pedidos.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile rotulo="Vendas" valor={formatarMoeda(metricas.vendasTotais)} />
            <StatTile rotulo="Pedidos" valor={String(metricas.totalPedidos)} />
            <StatTile rotulo="Ticket médio" valor={formatarMoeda(metricas.ticketMedio)} />
            <StatTile rotulo="Km percorridos" valor={`${metricas.kmTotais.toFixed(1)} km`} />
            <StatTile
              rotulo="Taxa de cancelamento"
              valor={`${metricas.taxaCancelamento.toFixed(1)}%`}
            />
          </div>

          <section className="space-y-3">
            <h2 className="text-xl">Serviços</h2>
            <div className="grid grid-cols-3 gap-3">
              {(["busca", "entrega", "busca_e_entrega"] as TipoServico[]).map((tipo) => (
                <StatTile
                  key={tipo}
                  rotulo={TIPO_SERVICO_LABEL[tipo]}
                  valor={String(metricas.porTipo[tipo])}
                />
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl">Vendas por dia</h2>
            {metricas.vendasPorDia.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum pedido no período.</p>
            ) : (
              <ChartContainer config={CHART_CONFIG} className="aspect-auto h-64 w-full">
                <BarChart data={metricas.vendasPorDia}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="dia" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} width={40} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="vendas" fill="var(--color-vendas)" radius={4} />
                </BarChart>
              </ChartContainer>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function StatTile({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-card">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="mt-1 text-2xl font-medium">{valor}</p>
    </div>
  );
}
