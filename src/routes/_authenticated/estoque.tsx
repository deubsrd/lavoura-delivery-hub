import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Minus, Plus, Settings2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { garantirVinculoAtendente } from "@/lib/atendentes.functions";
import { PaginaHeader } from "@/components/pagina-header";
import { chaveDiaBoaVista, formatarMoeda } from "@/lib/lavoura";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/estoque")({
  head: () => ({
    meta: [{ title: "Estoque — Lavoura" }, { name: "robots", content: "noindex" }],
  }),
  component: EstoquePage,
});

export type Categoria = "limpeza" | "geladeira";
export const CATEGORIA_LABEL: Record<Categoria, string> = {
  limpeza: "Limpeza",
  geladeira: "Geladeira (autosserviço)",
};
export type UnidadeMedida = "litro" | "unidade" | "pacote";
export const UNIDADE_MEDIDA_LABEL: Record<UnidadeMedida, string> = {
  litro: "L",
  unidade: "un",
  pacote: "pct",
};

export type Item = {
  id: string;
  unidade_id: string;
  nome: string;
  categoria: Categoria;
  unidade_medida: UnidadeMedida;
  estoque_minimo: number;
  custo_unitario: number | null;
  limite_alerta_amarelo_dias: number;
  limite_alerta_vermelho_dias: number;
  ativo: boolean;
};

type Lancamento = {
  id: string;
  item_id: string;
  data: string;
  quantidade: number;
  origem: string;
};

function EstoquePage() {
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

  const [categoria, setCategoria] = useState<Categoria>("limpeza");
  const [gerenciandoItens, setGerenciandoItens] = useState(false);

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

  const unidadeId = atendente.data.unidade_id;
  const souAdmin = atendente.data.role === "admin";

  return (
    <main className="mx-auto w-full max-w-7xl space-y-5 px-5 py-8 lg:px-8">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <PaginaHeader titulo="Estoque" />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link to="/estoque/autonomia" className="text-sm font-medium underline">
            Autonomia e alertas
          </Link>
          {souAdmin ? (
            <Button variant="outline" size="sm" onClick={() => setGerenciandoItens(true)}>
              <Settings2 className="size-4" /> Itens
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex gap-2 border-b">
        {(["limpeza", "geladeira"] as Categoria[]).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategoria(c)}
            className={`border-b-2 px-3 pb-2 text-sm font-medium transition ${
              categoria === c
                ? "border-accent text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {CATEGORIA_LABEL[c]}
          </button>
        ))}
      </div>

      <ContagemDiaria unidadeId={unidadeId} categoria={categoria} usuarioId={atendente.data.id} />

      {souAdmin ? (
        <Dialog open={gerenciandoItens} onOpenChange={setGerenciandoItens}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-2xl">Itens de estoque</DialogTitle>
              <DialogDescription>
                Cadastre e edite os itens contados no dia a dia.
              </DialogDescription>
            </DialogHeader>
            <GerenciarItens unidadeId={unidadeId} />
          </DialogContent>
        </Dialog>
      ) : null}
    </main>
  );
}

function ContagemDiaria({
  unidadeId,
  categoria,
  usuarioId,
}: {
  unidadeId: string;
  categoria: Categoria;
  usuarioId: string;
}) {
  const queryClient = useQueryClient();
  const hoje = chaveDiaBoaVista(new Date().toISOString());

  const itens = useQuery({
    queryKey: ["itens", unidadeId, categoria],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("itens")
        .select(
          "id, unidade_id, nome, categoria, unidade_medida, estoque_minimo, custo_unitario, limite_alerta_amarelo_dias, limite_alerta_vermelho_dias, ativo",
        )
        .eq("unidade_id", unidadeId)
        .eq("categoria", categoria)
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Item[];
    },
  });

  // Últimos lançamentos (janela de 4 dias é suficiente pra achar "hoje" e a
  // referência mais recente antes de hoje, mesmo pulando um dia).
  const lancamentos = useQuery({
    queryKey: ["lancamentos-recentes", unidadeId, categoria, hoje],
    enabled: (itens.data?.length ?? 0) > 0,
    queryFn: async () => {
      const itemIds = (itens.data ?? []).map((i) => i.id);
      const { data, error } = await supabase
        .from("lancamentos_diarios")
        .select("id, item_id, data, quantidade, origem")
        .in("item_id", itemIds)
        .order("data", { ascending: false })
        .limit(itemIds.length * 4);
      if (error) throw error;
      return (data ?? []) as Lancamento[];
    },
  });

  const [quantidades, setQuantidades] = useState<Record<string, number>>({});

  // Pré-preenche cada contador com a contagem de hoje (se já existir) ou a
  // referência mais recente anterior — só na primeira carga de cada item,
  // pra não sobrescrever o que a atendente já está digitando.
  useEffect(() => {
    if (!lancamentos.data) return;
    setQuantidades((atual) => {
      const proximo = { ...atual };
      for (const item of itens.data ?? []) {
        if (item.id in proximo) continue;
        const doItem = lancamentos.data!.filter((l) => l.item_id === item.id);
        const deHoje = doItem.find((l) => l.data === hoje);
        const referencia = doItem.find((l) => l.data !== hoje);
        proximo[item.id] = deHoje?.quantidade ?? referencia?.quantidade ?? 0;
      }
      return proximo;
    });
  }, [lancamentos.data, itens.data, hoje]);

  const confirmarMutation = useMutation({
    mutationFn: async () => {
      const linhas = (itens.data ?? []).map((item) => ({
        item_id: item.id,
        unidade_id: unidadeId,
        data: hoje,
        quantidade: quantidades[item.id] ?? 0,
        usuario_id: usuarioId,
        origem: "manual",
      }));
      const { error } = await supabase
        .from("lancamentos_diarios")
        .upsert(linhas as never, { onConflict: "item_id,data" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contagem do dia salva.");
      queryClient.invalidateQueries({ queryKey: ["lancamentos-recentes"] });
    },
    onError: () => toast.error("Não foi possível salvar a contagem. Tente de novo."),
  });

  if (itens.isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando itens…</p>;
  }
  if ((itens.data ?? []).length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Nenhum item cadastrado em {CATEGORIA_LABEL[categoria].toLowerCase()} ainda. Use o botão
        "Itens" acima pra cadastrar.
      </p>
    );
  }

  const lancamentosPorItem = new Map(
    (itens.data ?? []).map((item) => [
      item.id,
      (lancamentos.data ?? []).filter((l) => l.item_id === item.id),
    ]),
  );

  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-2">
        {(itens.data ?? []).map((item) => {
          const doItem = lancamentosPorItem.get(item.id) ?? [];
          const atualizadoHoje = doItem.some((l) => l.data === hoje);
          const referencia = doItem.find((l) => l.data !== hoje);
          const valor = quantidades[item.id] ?? 0;

          return (
            <div
              key={item.id}
              className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${
                atualizadoHoje ? "bg-card" : "border-accent/60 bg-accent/5"
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{item.nome}</p>
                  {!atualizadoHoje ? (
                    <Badge variant="outline" className="text-xs font-normal text-accent">
                      Não atualizado hoje
                    </Badge>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  {referencia
                    ? `Referência: ${referencia.quantidade} ${UNIDADE_MEDIDA_LABEL[item.unidade_medida]}`
                    : "Sem contagem anterior"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-8"
                  onClick={() =>
                    setQuantidades((q) => ({
                      ...q,
                      [item.id]: Math.max(0, (q[item.id] ?? 0) - 1),
                    }))
                  }
                >
                  <Minus className="size-3.5" />
                </Button>
                <Input
                  type="number"
                  min={0}
                  value={valor}
                  onChange={(e) =>
                    setQuantidades((q) => ({
                      ...q,
                      [item.id]: Math.max(0, Number(e.target.value) || 0),
                    }))
                  }
                  className="w-16 text-center"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-8"
                  onClick={() =>
                    setQuantidades((q) => ({ ...q, [item.id]: (q[item.id] ?? 0) + 1 }))
                  }
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <Button
        onClick={() => confirmarMutation.mutate()}
        disabled={confirmarMutation.isPending}
        className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
      >
        {confirmarMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
        Confirmar contagem do dia
      </Button>
    </div>
  );
}

function GerenciarItens({ unidadeId }: { unidadeId: string }) {
  const queryClient = useQueryClient();
  const [editando, setEditando] = useState<Item | "novo" | null>(null);

  const itens = useQuery({
    queryKey: ["itens-admin", unidadeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("itens")
        .select(
          "id, unidade_id, nome, categoria, unidade_medida, estoque_minimo, custo_unitario, limite_alerta_amarelo_dias, limite_alerta_vermelho_dias, ativo",
        )
        .eq("unidade_id", unidadeId)
        .order("categoria")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Item[];
    },
  });

  async function alternarAtivo(item: Item) {
    const { error } = await supabase
      .from("itens")
      .update({ ativo: !item.ativo } as never)
      .eq("id", item.id);
    if (error) {
      toast.error("Não foi possível atualizar o item.");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["itens-admin"] });
    queryClient.invalidateQueries({ queryKey: ["itens"] });
  }

  if (editando) {
    return (
      <FormularioItem
        unidadeId={unidadeId}
        item={editando === "novo" ? null : editando}
        onSalvo={() => {
          setEditando(null);
          queryClient.invalidateQueries({ queryKey: ["itens-admin"] });
          queryClient.invalidateQueries({ queryKey: ["itens"] });
        }}
        onCancelar={() => setEditando(null)}
      />
    );
  }

  return (
    <div className="space-y-3">
      <Button variant="outline" onClick={() => setEditando("novo")}>
        <Plus className="size-4" /> Novo item
      </Button>
      <div className="space-y-2">
        {(itens.data ?? []).map((item) => (
          <div
            key={item.id}
            className={`flex items-center justify-between gap-2 rounded-lg border p-3 text-sm ${
              item.ativo ? "" : "opacity-50"
            }`}
          >
            <button type="button" className="min-w-0 text-left" onClick={() => setEditando(item)}>
              <p className="font-medium">{item.nome}</p>
              <p className="text-xs text-muted-foreground">
                {CATEGORIA_LABEL[item.categoria]} · mín. {item.estoque_minimo}{" "}
                {UNIDADE_MEDIDA_LABEL[item.unidade_medida]}
                {item.custo_unitario ? ` · ${formatarMoeda(item.custo_unitario)}` : ""}
              </p>
            </button>
            <Button variant="ghost" size="sm" onClick={() => alternarAtivo(item)}>
              {item.ativo ? "Desativar" : "Ativar"}
            </Button>
          </div>
        ))}
        {(itens.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum item cadastrado ainda.</p>
        ) : null}
      </div>
    </div>
  );
}

function FormularioItem({
  unidadeId,
  item,
  onSalvo,
  onCancelar,
}: {
  unidadeId: string;
  item: Item | null;
  onSalvo: () => void;
  onCancelar: () => void;
}) {
  const [nome, setNome] = useState(item?.nome ?? "");
  const [categoria, setCategoria] = useState<Categoria>(item?.categoria ?? "limpeza");
  const [unidadeMedida, setUnidadeMedida] = useState<UnidadeMedida>(
    item?.unidade_medida ?? "unidade",
  );
  const [estoqueMinimo, setEstoqueMinimo] = useState(String(item?.estoque_minimo ?? 0));
  const [custoUnitario, setCustoUnitario] = useState(
    item?.custo_unitario != null ? String(item.custo_unitario) : "",
  );
  const [limiteAmarelo, setLimiteAmarelo] = useState(String(item?.limite_alerta_amarelo_dias ?? 7));
  const [limiteVermelho, setLimiteVermelho] = useState(
    String(item?.limite_alerta_vermelho_dias ?? 3),
  );
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!nome.trim()) {
      toast.error("Informe o nome do item.");
      return;
    }
    setSalvando(true);
    try {
      const payload = {
        unidade_id: unidadeId,
        nome: nome.trim(),
        categoria,
        unidade_medida: unidadeMedida,
        estoque_minimo: Number(estoqueMinimo) || 0,
        custo_unitario: custoUnitario ? Number(custoUnitario) : null,
        limite_alerta_amarelo_dias: Number(limiteAmarelo) || 7,
        limite_alerta_vermelho_dias: Number(limiteVermelho) || 3,
      };
      const { error } = item
        ? await supabase
            .from("itens")
            .update(payload as never)
            .eq("id", item.id)
        : await supabase.from("itens").insert(payload as never);
      if (error) throw error;
      toast.success(item ? "Item atualizado." : "Item cadastrado.");
      onSalvo();
    } catch {
      toast.error("Não foi possível salvar o item.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="space-y-1">
        <Label>Nome</Label>
        <Input value={nome} onChange={(e) => setNome(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label>Categoria</Label>
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value as Categoria)}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          >
            {(["limpeza", "geladeira"] as Categoria[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORIA_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label>Unidade de medida</Label>
          <select
            value={unidadeMedida}
            onChange={(e) => setUnidadeMedida(e.target.value as UnidadeMedida)}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          >
            {(["litro", "unidade", "pacote"] as UnidadeMedida[]).map((u) => (
              <option key={u} value={u}>
                {u === "litro" ? "Litro" : u === "unidade" ? "Unidade" : "Pacote"}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label>Estoque mínimo</Label>
          <Input
            type="number"
            min={0}
            value={estoqueMinimo}
            onChange={(e) => setEstoqueMinimo(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>Custo unitário (opcional)</Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={custoUnitario}
            onChange={(e) => setCustoUnitario(e.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label>Alerta amarelo (dias)</Label>
          <Input
            type="number"
            min={0}
            value={limiteAmarelo}
            onChange={(e) => setLimiteAmarelo(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>Alerta vermelho (dias)</Label>
          <Input
            type="number"
            min={0}
            value={limiteVermelho}
            onChange={(e) => setLimiteVermelho(e.target.value)}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onCancelar} className="flex-1">
          Cancelar
        </Button>
        <Button
          onClick={salvar}
          disabled={salvando}
          className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90"
        >
          {salvando ? <Loader2 className="size-4 animate-spin" /> : null}
          Salvar
        </Button>
      </div>
    </div>
  );
}
