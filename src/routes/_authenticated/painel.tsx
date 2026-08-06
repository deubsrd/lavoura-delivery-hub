import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ArrowRight,
  LogOut,
  MessageCircle,
  PackageCheck,
  Search,
  Settings,
  Truck,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { garantirVinculoAtendente } from "@/lib/atendentes.functions";
import { notificarMudancaStatus } from "@/lib/pedidos.functions";
import {
  FLUXO_STATUS,
  STATUS_LABEL,
  TIPO_SERVICO_LABEL,
  colunasParaTipo,
  enderecoResumido,
  estaAtrasado,
  formatarDataHora,
  formatarMoeda,
  maskTelefone,
  statusAplicavel,
  tempoRelativo,
  whatsappLink,
  type PedidoStatus,
  type TipoServico,
} from "@/lib/lavoura";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({
    meta: [
      { title: "Painel de pedidos — Lavoura" },
      {
        name: "description",
        content: "Kanban de pedidos de busca e entrega da unidade, com filtros e atualização em tempo real.",
      },
      { property: "og:title", content: "Painel de pedidos — Lavoura" },
      { property: "og:description", content: "Gestão da fila de delivery da unidade Lavoura." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PainelPage,
});

type Pedido = {
  id: string;
  nome_completo: string;
  telefone: string;
  rua: string;
  numero: string;
  bairro: string;
  complemento: string | null;
  referencia: string | null;
  mesmo_endereco_entrega: boolean | null;
  rua_entrega: string | null;
  numero_entrega: string | null;
  bairro_entrega: string | null;
  complemento_entrega: string | null;
  referencia_entrega: string | null;
  quantidade_cestos: number;
  tipo_servico: TipoServico;
  observacoes: string | null;
  status: PedidoStatus;
  motivo_cancelamento: string | null;
  motoboy_nome: string | null;
  data_pedido: string;
  data_prevista_retorno: string | null;
  distancia_km: number | null;
  desconto_descricao: string | null;
  valor_total: number | null;
};

const COLUNAS: PedidoStatus[] = [...FLUXO_STATUS, "cancelado"];

function PainelPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const notificarStatus = useServerFn(notificarMudancaStatus);

  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<PedidoStatus | "">("");
  const [filtroTipo, setFiltroTipo] = useState<TipoServico | "">("");
  const [filtroData, setFiltroData] = useState("");
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState<Pedido | null>(null);
  const [motivo, setMotivo] = useState("");

  const [periodo, setPeriodo] = useState<"30" | "90" | "all">("30");

  const atendente = useQuery({
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

  const pedidos = useQuery({
    queryKey: ["pedidos", periodo],
    queryFn: async () => {
      let query = supabase
        .from("pedidos_delivery")
        .select("*")
        .order("data_pedido", { ascending: false });
      if (periodo !== "all") {
        const dias = periodo === "30" ? 30 : 90;
        const corte = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
        query = query.gte("data_pedido", corte);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as Pedido[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("painel-pedidos")
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos_delivery" }, () => {
        queryClient.invalidateQueries({ queryKey: ["pedidos"] });
        queryClient.invalidateQueries({ queryKey: ["historico"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const digitos = termo.replace(/\D/g, "");
    return (pedidos.data ?? []).filter((p) => {
      if (filtroStatus && p.status !== filtroStatus) return false;
      if (filtroTipo && p.tipo_servico !== filtroTipo) return false;
      if (filtroData && !p.data_pedido.startsWith(filtroData)) return false;
      if (termo) {
        const porNome = p.nome_completo.toLowerCase().includes(termo);
        const porTelefone = digitos.length >= 3 && p.telefone.includes(digitos);
        if (!porNome && !porTelefone) return false;
      }
      return true;
    });
  }, [pedidos.data, busca, filtroStatus, filtroTipo, filtroData]);

  const detalhe = (pedidos.data ?? []).find((p) => p.id === detalheId) ?? null;

  const historico = useQuery({
    queryKey: ["historico", detalheId],
    enabled: !!detalheId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedido_status_historico")
        .select("id, status, observacao, timestamp")
        .eq("pedido_id", detalheId!)
        .order("timestamp", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  async function mudarStatus(pedido: Pedido, novo: PedidoStatus, motivoCancelamento?: string) {
    const patch: Record<string, unknown> = { status: novo };
    if (novo === "cancelado") patch["motivo_cancelamento"] = motivoCancelamento ?? null;
    if (novo === "entregue") patch["data_entrega_efetiva"] = new Date().toISOString();
    const { error } = await supabase
      .from("pedidos_delivery")
      .update(patch as never)
      .eq("id", pedido.id);
    if (error) {
      toast.error("Não foi possível atualizar o pedido.");
      return;
    }
    toast.success(`Pedido movido para “${STATUS_LABEL[novo]}”.`);
    queryClient.invalidateQueries({ queryKey: ["pedidos"] });
    queryClient.invalidateQueries({ queryKey: ["historico", pedido.id] });

    if (novo === "pronto" || novo === "entregue") {
      notificarStatus({ data: { pedidoId: pedido.id, status: novo } }).catch(() => {
        // Falha na notificação não deve incomodar a atendente; o resultado
        // já fica registrado em notificacoes_pedido para auditoria depois.
      });
    }
  }

  async function salvarMotoboy(pedido: Pedido, nome: string) {
    const { error } = await supabase
      .from("pedidos_delivery")
      .update({ motoboy_nome: nome || null } as never)
      .eq("id", pedido.id);
    if (error) {
      toast.error("Não foi possível salvar o motoboy.");
      return;
    }
    toast.success("Motoboy atualizado.");
    queryClient.invalidateQueries({ queryKey: ["pedidos"] });
  }

  async function sair() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const unidade = atendente.data?.unidades as
    | { nome: string; cidade: string; prazo_padrao_horas: number }
    | null
    | undefined;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b bg-primary px-4 py-3 text-primary-foreground">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {atendente.data?.role === "admin" ? (
                <SidebarTrigger className="-ml-1.5 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground" />
              ) : null}
              <img
                src="/lavoura-logo-branco.svg"
                alt="Lavoura Lavanderia Self Service"
                className="h-6 w-auto"
              />
            </div>
            <h1 className="mt-1 truncate text-xl leading-tight sm:text-2xl">
              {unidade ? `${unidade.nome} · ${unidade.cidade}` : "Painel de pedidos"}
            </h1>
          </div>
          <div className="flex items-center gap-1">
            {atendente.data?.role === "admin" ? (
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="text-primary-foreground hover:bg-primary-foreground/10"
              >
                <Link to="/admin-precos">
                  <Settings className="size-4" /> Preços
                </Link>
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              onClick={sair}
              className="text-primary-foreground hover:bg-primary-foreground/10"
            >
              <LogOut className="size-4" /> Sair
            </Button>
          </div>
        </div>
      </header>

      {!atendente.isLoading && !atendente.data ? (
        <div className="mx-auto mt-8 max-w-lg rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
          Seu usuário ainda não está vinculado a nenhuma unidade. Peça ao responsável da rede para
          fazer o vínculo para você ver a fila de pedidos.
        </div>
      ) : null}

      <div className="space-y-3 border-b bg-card px-4 py-4">
        <div className="relative">
          <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou telefone"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value as "30" | "90" | "all")}
            className="h-9 rounded-md border bg-background px-2 text-sm"
            title="Período de pedidos carregados"
          >
            <option value="30">Últimos 30 dias</option>
            <option value="90">Últimos 90 dias</option>
            <option value="all">Todo o histórico</option>
          </select>
          <select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value as PedidoStatus | "")}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="">Todos os status</option>
            {COLUNAS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value as TipoServico | "")}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="">Todos os serviços</option>
            {(["busca", "entrega", "busca_e_entrega"] as TipoServico[]).map((t) => (
              <option key={t} value={t}>
                {TIPO_SERVICO_LABEL[t]}
              </option>
            ))}
          </select>
          <Input
            type="date"
            value={filtroData}
            onChange={(e) => setFiltroData(e.target.value)}
            className="h-9 w-40"
          />
          {busca || filtroStatus || filtroTipo || filtroData ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setBusca("");
                setFiltroStatus("");
                setFiltroTipo("");
                setFiltroData("");
              }}
            >
              <X className="size-4" /> Limpar
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto p-4">
        {COLUNAS.map((coluna) => {
          const cards = lista.filter((p) => p.status === coluna);
          return (
            <section key={coluna} className="w-[280px] shrink-0">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xl">{STATUS_LABEL[coluna]}</h2>
                <Badge variant="secondary">{cards.length}</Badge>
              </div>
              <div className="space-y-3">
                {cards.map((p) => (
                  <Card
                    key={p.id}
                    pedido={p}
                    onAbrir={() => setDetalheId(p.id)}
                    onAvancar={(novo) => mudarStatus(p, novo)}
                    onCancelar={() => {
                      setCancelando(p);
                      setMotivo("");
                    }}
                  />
                ))}
                {cards.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                    Nenhum pedido
                  </p>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>

      <Dialog open={!!detalhe} onOpenChange={(open) => !open && setDetalheId(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          {detalhe ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-3xl">{detalhe.nome_completo}</DialogTitle>
                <DialogDescription>
                  {TIPO_SERVICO_LABEL[detalhe.tipo_servico]} · {detalhe.quantidade_cestos}{" "}
                  {detalhe.quantidade_cestos === 1 ? "cesto" : "cestos"}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5 text-sm">
                <a
                  href={whatsappLink(detalhe.telefone)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 font-medium text-accent-foreground"
                >
                  <MessageCircle className="size-4" /> {maskTelefone(detalhe.telefone)}
                </a>

                <div className="grid gap-3">
                  <Endereco
                    titulo={
                      detalhe.tipo_servico === "entrega"
                        ? "Endereço de entrega"
                        : "Endereço de coleta"
                    }
                    rua={detalhe.rua}
                    numero={detalhe.numero}
                    bairro={detalhe.bairro}
                    complemento={detalhe.complemento}
                    referencia={detalhe.referencia}
                  />
                  {detalhe.tipo_servico === "busca_e_entrega" &&
                  detalhe.mesmo_endereco_entrega === false ? (
                    <Endereco
                      titulo="Endereço de entrega (diferente)"
                      destaque
                      rua={detalhe.rua_entrega ?? ""}
                      numero={detalhe.numero_entrega ?? ""}
                      bairro={detalhe.bairro_entrega ?? ""}
                      complemento={detalhe.complemento_entrega}
                      referencia={detalhe.referencia_entrega}
                    />
                  ) : detalhe.tipo_servico === "busca_e_entrega" ? (
                    <p className="text-xs text-muted-foreground">
                      Entrega no mesmo endereço da coleta.
                    </p>
                  ) : null}
                </div>

                {detalhe.observacoes ? (
                  <div>
                    <p className="font-medium">Observações</p>
                    <p className="text-muted-foreground">{detalhe.observacoes}</p>
                  </div>
                ) : null}

                {detalhe.valor_total !== null ? (
                  <div className="rounded-lg border p-3 text-xs">
                    <p className="mb-1 font-medium text-sm">
                      Total estimado: {formatarMoeda(detalhe.valor_total)}
                    </p>
                    {detalhe.distancia_km !== null ? (
                      <p className="text-muted-foreground">
                        Distância de delivery: {detalhe.distancia_km.toFixed(1)} km
                      </p>
                    ) : null}
                    {detalhe.desconto_descricao ? (
                      <p className="text-muted-foreground">{detalhe.desconto_descricao}</p>
                    ) : null}
                  </div>
                ) : null}

                <div className="grid gap-1 rounded-lg bg-secondary p-3 text-xs">
                  <span>Pedido feito em {formatarDataHora(detalhe.data_pedido)}</span>
                  {detalhe.data_prevista_retorno ? (
                    <span>
                      Previsão de retorno: {formatarDataHora(detalhe.data_prevista_retorno)}
                    </span>
                  ) : null}
                  {detalhe.motivo_cancelamento ? (
                    <span className="text-destructive">
                      Cancelado: {detalhe.motivo_cancelamento}
                    </span>
                  ) : null}
                </div>

                <MotoboyForm pedido={detalhe} onSalvar={salvarMotoboy} />

                <div>
                  <p className="mb-2 font-medium">Histórico de status</p>
                  <ol className="space-y-2 border-l pl-4">
                    {(historico.data ?? []).map((h) => (
                      <li key={h.id} className="relative">
                        <span className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-accent" />
                        <p className="font-medium">{STATUS_LABEL[h.status as PedidoStatus]}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatarDataHora(h.timestamp)}
                          {h.observacao ? ` · ${h.observacao}` : ""}
                        </p>
                      </li>
                    ))}
                    {(historico.data ?? []).length === 0 ? (
                      <li className="text-xs text-muted-foreground">Sem registros ainda.</li>
                    ) : null}
                  </ol>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={!!cancelando} onOpenChange={(open) => !open && setCancelando(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl">Cancelar pedido</DialogTitle>
            <DialogDescription>
              Informe o motivo do cancelamento. Ele fica registrado no histórico.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            placeholder="Ex.: cliente desistiu, endereço fora da área de atendimento…"
          />
          <Button
            disabled={motivo.trim().length < 3}
            onClick={async () => {
              if (!cancelando) return;
              await mudarStatus(cancelando, "cancelado", motivo.trim());
              setCancelando(null);
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Confirmar cancelamento
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Endereco({
  titulo,
  rua,
  numero,
  bairro,
  complemento,
  referencia,
  destaque,
}: {
  titulo: string;
  rua: string;
  numero: string;
  bairro: string;
  complemento: string | null;
  referencia: string | null;
  destaque?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${destaque ? "border-accent bg-accent/10" : "bg-card"}`}
    >
      <p className="font-medium">{titulo}</p>
      <p className="text-muted-foreground">
        {rua}, {numero} — {bairro}
      </p>
      {complemento ? <p className="text-xs text-muted-foreground">Compl.: {complemento}</p> : null}
      {referencia ? <p className="text-xs text-muted-foreground">Ref.: {referencia}</p> : null}
    </div>
  );
}

function MotoboyForm({
  pedido,
  onSalvar,
}: {
  pedido: Pedido;
  onSalvar: (p: Pedido, nome: string) => Promise<void>;
}) {
  const [nome, setNome] = useState(pedido.motoboy_nome ?? "");
  useEffect(() => {
    setNome(pedido.motoboy_nome ?? "");
  }, [pedido.id, pedido.motoboy_nome]);

  return (
    <div className="space-y-1.5">
      <Label>Motoboy responsável</Label>
      <div className="flex gap-2">
        <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do motoboy" />
        <Button variant="outline" onClick={() => onSalvar(pedido, nome.trim())}>
          Salvar
        </Button>
      </div>
    </div>
  );
}

function Card({
  pedido,
  onAbrir,
  onAvancar,
  onCancelar,
}: {
  pedido: Pedido;
  onAbrir: () => void;
  onAvancar: (novo: PedidoStatus) => void;
  onCancelar: () => void;
}) {
  const atrasado = estaAtrasado(pedido);
  const fluxo = colunasParaTipo(pedido.tipo_servico);
  const indice = fluxo.indexOf(pedido.status);
  const proximo = indice >= 0 ? fluxo[indice + 1] : undefined;

  return (
    <article
      className={`rounded-xl border bg-card p-3 shadow-card transition ${
        atrasado ? "border-2 border-destructive" : ""
      }`}
    >
      <button onClick={onAbrir} className="w-full text-left">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium">{pedido.nome_completo}</p>
          <Badge variant={pedido.tipo_servico === "busca_e_entrega" ? "default" : "secondary"}>
            {pedido.tipo_servico === "entrega" ? (
              <PackageCheck className="size-3" />
            ) : (
              <Truck className="size-3" />
            )}
            {TIPO_SERVICO_LABEL[pedido.tipo_servico]}
          </Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{enderecoResumido(pedido)}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {pedido.quantidade_cestos} {pedido.quantidade_cestos === 1 ? "cesto" : "cestos"} ·{" "}
          {tempoRelativo(pedido.data_pedido)}
        </p>
        {atrasado ? (
          <p className="mt-2 flex items-center gap-1 text-xs font-medium text-destructive">
            <AlertTriangle className="size-3" /> Atrasado
          </p>
        ) : null}
      </button>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a
          href={whatsappLink(pedido.telefone)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium"
        >
          <MessageCircle className="size-3" /> WhatsApp
        </a>
        {proximo && statusAplicavel(proximo, pedido.tipo_servico) ? (
          <Button size="sm" variant="outline" onClick={() => onAvancar(proximo)} className="h-7 text-xs">
            {STATUS_LABEL[proximo]} <ArrowRight className="size-3" />
          </Button>
        ) : null}
        {pedido.status !== "cancelado" && pedido.status !== "entregue" ? (
          <button onClick={onCancelar} className="text-xs text-muted-foreground underline">
            Cancelar
          </button>
        ) : null}
      </div>
    </article>
  );
}
