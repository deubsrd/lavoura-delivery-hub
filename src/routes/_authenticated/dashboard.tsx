import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, TrendingDown, TrendingUp } from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { supabase } from "@/integrations/supabase/client";
import { useAtendenteAdmin } from "@/hooks/use-atendente-admin";
import { AcessoRestrito } from "@/components/acesso-restrito";
import { PaginaHeader } from "@/components/pagina-header";
import { TIPO_SERVICO_LABEL, formatarMoeda, type TipoServico } from "@/lib/lavoura";
import { Button } from "@/components/ui/button";
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

function DashboardPage() {
  const atendente = useAtendenteAdmin();

  if (atendente.isLoading) {
    return <main className="p-8 text-center text-sm text-muted-foreground">Carregando…</main>;
  }
  if (!atendente.souAdmin) return <AcessoRestrito />;

  return <SecaoDashboard />;
}

// ---------- Datas locais (fuso do navegador — mesma convenção já usada
// pelos filtros de data existentes no painel, não o fuso fixo da unidade
// usado no motor de cálculo de pedido). ----------

function inicioDoDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Segunda-feira (00:00) da semana de `d`. */
function inicioDaSemana(d: Date): Date {
  const diaSemana = (d.getDay() + 6) % 7; // 0 = segunda
  return new Date(inicioDoDia(d).getTime() - diaSemana * 86400000);
}

/** Mesmo dia-do-mês de `d`, um mês antes — grudado no último dia se o mês anterior for mais curto. */
function mesmoDiaMesAnterior(d: Date): Date {
  const diasMesAnterior = new Date(d.getFullYear(), d.getMonth(), 0).getDate();
  return new Date(d.getFullYear(), d.getMonth() - 1, Math.min(d.getDate(), diasMesAnterior));
}

function fimDoDiaAntes(d: Date): Date {
  return new Date(d.getTime() - 1);
}

/** Variação percentual atual vs anterior; `null` = sem base de comparação ("novo"). */
function variacaoPercentual(atual: number, anterior: number): number | null {
  if (anterior === 0) return atual === 0 ? 0 : null;
  return ((atual - anterior) / anterior) * 100;
}

type PedidoDashboard = {
  data_pedido: string;
  status: string;
  tipo_servico: TipoServico;
  valor_total: number | null;
  distancia_km: number | null;
  cliente_id: string | null;
  cancelamento_teste: boolean;
};

type ClienteDashboard = { id: string; created_at: string };

const MESES_ABREV = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

const CHART_CONFIG: ChartConfig = {
  vendas: { label: "Vendas", color: "var(--accent)" },
};

function SecaoDashboard() {
  // Fixado por montagem do componente (não precisa re-renderizar sozinho
  // se o admin deixar a aba aberta atravessando a meia-noite) — estável
  // entre renders, pra não invalidar os useMemo abaixo à toa.
  const hoje = useMemo(() => new Date(), []);

  // Os 6 cards do topo são sempre "hoje/esta semana/este mês" de verdade —
  // não seguem a navegação do gráfico abaixo. Busca desde o início do mês
  // anterior, janela larga o bastante pra cobrir todas as comparações
  // "vs período anterior" (inclusive a de "este mês" contra o mês passado).
  const inicioJanelaStats = useMemo(
    () => new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1),
    [hoje],
  );

  const pedidosStats = useQuery({
    queryKey: ["dashboard-pedidos-stats", inicioJanelaStats.toISOString().slice(0, 10)],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos_delivery")
        .select(
          "data_pedido, status, tipo_servico, valor_total, distancia_km, cliente_id, cancelamento_teste",
        )
        .gte("data_pedido", inicioJanelaStats.toISOString())
        .order("data_pedido", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PedidoDashboard[];
    },
  });

  const clientesStats = useQuery({
    queryKey: ["dashboard-clientes-stats", inicioJanelaStats.toISOString().slice(0, 10)],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("id, created_at")
        .gte("created_at", inicioJanelaStats.toISOString());
      if (error) throw error;
      return (data ?? []) as ClienteDashboard[];
    },
  });

  const metricas = useMemo(() => {
    // Pedidos de teste (cancelamento_teste, ver painel.tsx) não representam
    // negócio real — ficam de fora de toda métrica, não só da taxa de
    // cancelamento, senão inflariam "pedidos este mês"/"todos este mês" à
    // toa.
    const pedidos = (pedidosStats.data ?? []).filter((p) => !p.cancelamento_teste);
    const clientes = clientesStats.data ?? [];
    const naoCancelados = pedidos.filter((p) => p.status !== "cancelado");

    function somaVendas(inicio: Date, fim: Date): number {
      return naoCancelados
        .filter((p) => p.data_pedido >= inicio.toISOString() && p.data_pedido <= fim.toISOString())
        .reduce((soma, p) => soma + (p.valor_total ?? 0), 0);
    }
    function contaPedidos(inicio: Date, fim: Date): number {
      return naoCancelados.filter(
        (p) => p.data_pedido >= inicio.toISOString() && p.data_pedido <= fim.toISOString(),
      ).length;
    }
    function clientesNovosNoPeriodo(inicio: Date, fim: Date): number {
      return clientes.filter(
        (c) => c.created_at >= inicio.toISOString() && c.created_at <= fim.toISOString(),
      ).length;
    }
    // "Recorrente" = cliente que já existia antes do início do período e
    // fez pelo menos 1 pedido dentro dele (voltou a comprar).
    function clientesRecorrentesNoPeriodo(inicio: Date, fim: Date): number {
      const idsAntigos = new Set(
        clientes.filter((c) => c.created_at < inicio.toISOString()).map((c) => c.id),
      );
      const idsCompraramNoPeriodo = new Set(
        naoCancelados
          .filter(
            (p) =>
              p.cliente_id &&
              p.data_pedido >= inicio.toISOString() &&
              p.data_pedido <= fim.toISOString() &&
              idsAntigos.has(p.cliente_id),
          )
          .map((p) => p.cliente_id as string),
      );
      return idsCompraramNoPeriodo.size;
    }

    const inicioHoje = inicioDoDia(hoje);
    const inicioOntem = new Date(inicioHoje.getTime() - 86400000);
    const fimOntem = fimDoDiaAntes(inicioHoje);
    const fimHoje = hoje;

    const inicioSemana = inicioDaSemana(hoje);
    const inicioSemanaAnterior = new Date(inicioSemana.getTime() - 7 * 86400000);
    // Compara o mesmo número de dias já decorridos na semana (justo: não
    // compara uma semana inteira passada com uma semana ainda pela metade).
    const fimSemanaAnteriorComparavel = new Date(
      inicioSemanaAnterior.getTime() + (hoje.getTime() - inicioSemana.getTime()),
    );

    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const inicioMesAnterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const fimMesAnteriorComparavel = mesmoDiaMesAnterior(hoje);

    const vendasHoje = somaVendas(inicioHoje, fimHoje);
    const vendasOntem = somaVendas(inicioOntem, fimOntem);

    const vendasSemana = somaVendas(inicioSemana, fimHoje);
    const vendasSemanaAnterior = somaVendas(inicioSemanaAnterior, fimSemanaAnteriorComparavel);

    const vendasMes = somaVendas(inicioMes, fimHoje);
    const vendasMesAnterior = somaVendas(inicioMesAnterior, fimMesAnteriorComparavel);

    const pedidosMes = contaPedidos(inicioMes, fimHoje);
    const pedidosMesAnterior = contaPedidos(inicioMesAnterior, fimMesAnteriorComparavel);
    const ticketMedioMes = pedidosMes > 0 ? vendasMes / pedidosMes : 0;
    const ticketMedioMesAnterior =
      pedidosMesAnterior > 0 ? vendasMesAnterior / pedidosMesAnterior : 0;

    const clientesNovosMes = clientesNovosNoPeriodo(inicioMes, fimHoje);
    const clientesNovosMesAnterior = clientesNovosNoPeriodo(
      inicioMesAnterior,
      fimMesAnteriorComparavel,
    );

    const clientesRecorrentesMes = clientesRecorrentesNoPeriodo(inicioMes, fimHoje);
    const clientesRecorrentesMesAnterior = clientesRecorrentesNoPeriodo(
      inicioMesAnterior,
      fimMesAnteriorComparavel,
    );

    // Métricas complementares (não fazem parte do print de referência, mas
    // já existiam no dashboard antes e continuam úteis) — sempre "este mês".
    const pedidosEsteMes = naoCancelados.filter(
      (p) => p.data_pedido >= inicioMes.toISOString() && p.data_pedido <= fimHoje.toISOString(),
    );
    const kmEsteMes = pedidosEsteMes.reduce((soma, p) => soma + (p.distancia_km ?? 0), 0);
    const todosEsteMes = pedidos.filter(
      (p) => p.data_pedido >= inicioMes.toISOString() && p.data_pedido <= fimHoje.toISOString(),
    );
    const taxaCancelamentoEsteMes =
      todosEsteMes.length > 0
        ? ((todosEsteMes.length - pedidosEsteMes.length) / todosEsteMes.length) * 100
        : 0;
    const porTipoEsteMes: Record<TipoServico, number> = {
      busca: 0,
      entrega: 0,
      busca_e_entrega: 0,
      balcao: 0,
    };
    for (const p of pedidosEsteMes) porTipoEsteMes[p.tipo_servico] += 1;

    return {
      hoje: { valor: vendasHoje, variacao: variacaoPercentual(vendasHoje, vendasOntem) },
      semana: {
        valor: vendasSemana,
        variacao: variacaoPercentual(vendasSemana, vendasSemanaAnterior),
      },
      mes: { valor: vendasMes, variacao: variacaoPercentual(vendasMes, vendasMesAnterior) },
      ticketMedio: {
        valor: ticketMedioMes,
        variacao: variacaoPercentual(ticketMedioMes, ticketMedioMesAnterior),
      },
      clientesNovos: {
        valor: clientesNovosMes,
        variacao: variacaoPercentual(clientesNovosMes, clientesNovosMesAnterior),
      },
      clientesRecorrentes: {
        valor: clientesRecorrentesMes,
        variacao: variacaoPercentual(clientesRecorrentesMes, clientesRecorrentesMesAnterior),
      },
      kmEsteMes,
      taxaCancelamentoEsteMes,
      porTipoEsteMes,
    };
  }, [pedidosStats.data, clientesStats.data, hoje]);

  const carregandoStats = pedidosStats.isLoading || clientesStats.isLoading;

  return (
    <main className="mx-auto w-full max-w-[1800px] space-y-6 px-5 py-8 xl:px-10">
      <PaginaHeader titulo="Dashboard" />

      {carregandoStats ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <StatTile
              rotulo="Hoje"
              valor={formatarMoeda(metricas.hoje.valor)}
              variacao={metricas.hoje.variacao}
            />
            <StatTile
              rotulo="Esta semana"
              valor={formatarMoeda(metricas.semana.valor)}
              variacao={metricas.semana.variacao}
            />
            <StatTile
              rotulo="Este mês"
              valor={formatarMoeda(metricas.mes.valor)}
              variacao={metricas.mes.variacao}
            />
            <StatTile
              rotulo="Ticket médio"
              valor={formatarMoeda(metricas.ticketMedio.valor)}
              variacao={metricas.ticketMedio.variacao}
            />
            <StatTile
              rotulo="Clientes novos"
              valor={String(metricas.clientesNovos.valor)}
              variacao={metricas.clientesNovos.variacao}
            />
            <StatTile
              rotulo="Clientes recorrentes"
              valor={String(metricas.clientesRecorrentes.valor)}
              variacao={metricas.clientesRecorrentes.variacao}
            />
          </div>

          <SecaoGrafico />

          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-5">
            <StatTileSimples
              rotulo="Km percorridos (mês)"
              valor={`${metricas.kmEsteMes.toFixed(1)} km`}
            />
            <StatTileSimples
              rotulo="Cancelamento (mês)"
              valor={`${metricas.taxaCancelamentoEsteMes.toFixed(1)}%`}
            />
            {(["busca", "entrega", "busca_e_entrega", "balcao"] as TipoServico[]).map((tipo) => (
              <StatTileSimples
                key={tipo}
                rotulo={TIPO_SERVICO_LABEL[tipo]}
                valor={String(metricas.porTipoEsteMes[tipo])}
              />
            ))}
          </section>
        </>
      )}
    </main>
  );
}

function Variacao({ percentual }: { percentual: number | null }) {
  if (percentual === null) {
    return (
      <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
        novo
      </span>
    );
  }
  const positivo = percentual >= 0;
  const Icone = positivo ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        positivo ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive"
      }`}
    >
      <Icone className="size-3" />
      {positivo ? "+" : ""}
      {percentual.toFixed(0)}%
    </span>
  );
}

function StatTile({
  rotulo,
  valor,
  variacao,
}: {
  rotulo: string;
  valor: string;
  variacao: number | null;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{rotulo}</p>
        <Variacao percentual={variacao} />
      </div>
      <p className="mt-2 text-2xl font-medium">{valor}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">vs período anterior</p>
    </div>
  );
}

function StatTileSimples({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-card">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="mt-1 text-2xl font-medium">{valor}</p>
    </div>
  );
}

type ModoGrafico = "diario" | "mensal";

function paraCsv(pontos: { rotulo: string; valor: number }[], tituloColuna: string): string {
  const escapar = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const linhas = [
    [tituloColuna, "Vendas"].map(escapar).join(","),
    ...pontos.map((p) => [p.rotulo, p.valor.toFixed(2)].map(escapar).join(",")),
  ];
  return linhas.join("\n");
}

function baixarCsv(conteudo: string, nomeArquivo: string) {
  const blob = new Blob([String.fromCharCode(0xfeff) + conteudo], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  link.click();
  URL.revokeObjectURL(url);
}

function SecaoGrafico() {
  const [modo, setModo] = useState<ModoGrafico>("diario");
  const [referencia, setReferencia] = useState(() => new Date());
  const [mostrarDetalhes, setMostrarDetalhes] = useState(false);

  const intervalo = useMemo(() => {
    if (modo === "diario") {
      const inicio = new Date(referencia.getFullYear(), referencia.getMonth(), 1);
      const fim = new Date(referencia.getFullYear(), referencia.getMonth() + 1, 0, 23, 59, 59, 999);
      return { inicio, fim };
    }
    const inicio = new Date(referencia.getFullYear(), 0, 1);
    const fim = new Date(referencia.getFullYear(), 11, 31, 23, 59, 59, 999);
    return { inicio, fim };
  }, [modo, referencia]);

  const pedidos = useQuery({
    queryKey: ["dashboard-pedidos-grafico", modo, intervalo.inicio.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos_delivery")
        .select("data_pedido, status, valor_total")
        .gte("data_pedido", intervalo.inicio.toISOString())
        .lte("data_pedido", intervalo.fim.toISOString());
      if (error) throw error;
      return (data ?? []) as { data_pedido: string; status: string; valor_total: number | null }[];
    },
  });

  const pontos = useMemo(() => {
    const naoCancelados = (pedidos.data ?? []).filter((p) => p.status !== "cancelado");
    if (modo === "diario") {
      const diasNoMes = new Date(referencia.getFullYear(), referencia.getMonth() + 1, 0).getDate();
      const porDia = new Map<number, number>();
      for (const p of naoCancelados) {
        const d = new Date(p.data_pedido);
        porDia.set(d.getDate(), (porDia.get(d.getDate()) ?? 0) + (p.valor_total ?? 0));
      }
      return Array.from({ length: diasNoMes }, (_, i) => ({
        rotulo: String(i + 1).padStart(2, "0"),
        valor: porDia.get(i + 1) ?? 0,
      }));
    }
    const porMes = new Map<number, number>();
    for (const p of naoCancelados) {
      const d = new Date(p.data_pedido);
      porMes.set(d.getMonth(), (porMes.get(d.getMonth()) ?? 0) + (p.valor_total ?? 0));
    }
    return MESES_ABREV.map((nome, i) => ({ rotulo: nome, valor: porMes.get(i) ?? 0 }));
  }, [pedidos.data, modo, referencia]);

  function navegar(delta: number) {
    setReferencia((atual) =>
      modo === "diario"
        ? new Date(atual.getFullYear(), atual.getMonth() + delta, 1)
        : new Date(atual.getFullYear() + delta, atual.getMonth(), 1),
    );
  }

  const tituloPeriodo =
    modo === "diario"
      ? `Mês de ${MESES_ABREV[referencia.getMonth()]}/${referencia.getFullYear()}`
      : `Ano de ${referencia.getFullYear()}`;

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex overflow-hidden rounded-md border text-sm">
          <button
            onClick={() => setModo("diario")}
            className={`px-3 py-1.5 font-medium transition ${
              modo === "diario" ? "bg-primary text-primary-foreground" : "hover:bg-secondary"
            }`}
          >
            Diário
          </button>
          <button
            onClick={() => setModo("mensal")}
            className={`px-3 py-1.5 font-medium transition ${
              modo === "mensal" ? "bg-primary text-primary-foreground" : "hover:bg-secondary"
            }`}
          >
            Mensal
          </button>
        </div>
        <div className="flex items-center gap-1 text-sm">
          <Button variant="ghost" size="icon" className="size-7" onClick={() => navegar(-1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-32 text-center font-medium">{tituloPeriodo}</span>
          <Button variant="ghost" size="icon" className="size-7" onClick={() => navegar(1)}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Vendas por período ({tituloPeriodo})</h2>
        <div className="flex items-center gap-3 text-sm">
          <button
            onClick={() =>
              baixarCsv(
                paraCsv(pontos, modo === "diario" ? "Dia" : "Mês"),
                `vendas-${tituloPeriodo}.csv`,
              )
            }
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <Download className="size-3.5" /> Exportar
          </button>
          <button
            onClick={() => setMostrarDetalhes((v) => !v)}
            className="text-muted-foreground hover:text-foreground"
          >
            Detalhes {mostrarDetalhes ? "▲" : "▶"}
          </button>
        </div>
      </div>

      {pedidos.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <ChartContainer config={CHART_CONFIG} className="aspect-auto h-72 w-full xl:h-96">
          <AreaChart data={pontos}>
            <defs>
              <linearGradient id="gradienteVendas" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-vendas)" stopOpacity={0.5} />
                <stop offset="95%" stopColor="var(--color-vendas)" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="rotulo" tickLine={false} axisLine={false} />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={56}
              tickFormatter={(v: number) => formatarMoeda(v)}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Area
              type="monotone"
              dataKey="valor"
              stroke="var(--color-vendas)"
              fill="url(#gradienteVendas)"
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      )}

      {mostrarDetalhes ? (
        <div className="max-h-56 overflow-y-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-3 py-1.5 font-medium">{modo === "diario" ? "Dia" : "Mês"}</th>
                <th className="px-3 py-1.5 font-medium">Vendas</th>
              </tr>
            </thead>
            <tbody>
              {pontos.map((p) => (
                <tr key={p.rotulo} className="border-b last:border-0">
                  <td className="px-3 py-1.5">{p.rotulo}</td>
                  <td className="px-3 py-1.5">{formatarMoeda(p.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
