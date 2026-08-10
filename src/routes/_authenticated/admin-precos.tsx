import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { garantirVinculoAtendente } from "@/lib/atendentes.functions";
import { PaginaHeader } from "@/components/pagina-header";
import { formatarMoeda, horaCurta } from "@/lib/lavoura";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin-precos")({
  head: () => ({
    meta: [{ title: "Preços — Lavoura" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminPrecosPage,
});

const DIAS_SEMANA = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

type ConfiguracaoPrecos = {
  id: string;
  unidade_id: string;
  valor_lavagem_por_cesto: number;
  valor_secagem_por_cesto: number;
  valor_atendente_por_pedido: number;
};
type FaixaDelivery = { id: string; distancia_ate_km: number; valor: number };
type PrecoHorario = {
  id: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fim: string;
  valor_cesto: number;
};

function AdminPrecosPage() {
  const queryClient = useQueryClient();

  const atendente = useQuery({
    queryKey: ["atendente-admin"],
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

  const unidadeId = atendente.data?.unidade_id;
  const souAdmin = atendente.data?.role === "admin";

  const precos = useQuery({
    queryKey: ["config-precos", unidadeId],
    enabled: !!unidadeId && souAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("configuracao_precos")
        .select("*")
        .eq("unidade_id", unidadeId!)
        .maybeSingle();
      if (error) throw error;
      return data as ConfiguracaoPrecos | null;
    },
  });

  const faixas = useQuery({
    queryKey: ["faixas-delivery", unidadeId],
    enabled: !!unidadeId && souAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("faixas_delivery")
        .select("*")
        .eq("unidade_id", unidadeId!)
        .order("distancia_ate_km");
      if (error) throw error;
      return (data ?? []) as FaixaDelivery[];
    },
  });

  const precosHorario = useQuery({
    queryKey: ["precos-horario", unidadeId],
    enabled: !!unidadeId && souAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("precos_por_horario")
        .select("*")
        .eq("unidade_id", unidadeId!)
        .order("dia_semana");
      if (error) throw error;
      return (data ?? []) as PrecoHorario[];
    },
  });

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

  if (!souAdmin) {
    return (
      <main className="mx-auto mt-16 max-w-md px-5 text-center">
        <h1 className="text-2xl">Acesso restrito</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Só administradores da unidade podem configurar preços e faixas de delivery.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl space-y-10 px-5 py-8">
      <PaginaHeader titulo="Preços" />

      <SecaoPrecosBase
        unidadeId={unidadeId!}
        precos={precos.data ?? null}
        onSalvo={() => queryClient.invalidateQueries({ queryKey: ["config-precos", unidadeId] })}
      />
      <SecaoPrecosPorHorario
        unidadeId={unidadeId!}
        precosHorario={precosHorario.data ?? []}
        onMudou={() => queryClient.invalidateQueries({ queryKey: ["precos-horario", unidadeId] })}
      />
      <SecaoFaixas
        unidadeId={unidadeId!}
        faixas={faixas.data ?? []}
        onMudou={() => queryClient.invalidateQueries({ queryKey: ["faixas-delivery", unidadeId] })}
      />
    </main>
  );
}

function SecaoPrecosBase({
  unidadeId,
  precos,
  onSalvo,
}: {
  unidadeId: string;
  precos: ConfiguracaoPrecos | null;
  onSalvo: () => void;
}) {
  const [atendenteValor, setAtendenteValor] = useState(String(precos?.valor_atendente_por_pedido ?? ""));

  const salvar = useMutation({
    mutationFn: async () => {
      const payload = {
        unidade_id: unidadeId,
        // Lavagem/secagem não são mais editadas aqui — a unidade define o
        // preço do cesto inteiramente pela grade "Preços por dia e
        // horário" abaixo. Esses dois campos continuam existindo na
        // tabela (servem de "preço de reserva" pra um dia/horário sem
        // regra cadastrada), então preserva o que já estava salvo em vez
        // de zerar.
        valor_lavagem_por_cesto: precos?.valor_lavagem_por_cesto ?? 0,
        valor_secagem_por_cesto: precos?.valor_secagem_por_cesto ?? 0,
        valor_atendente_por_pedido: Number(atendenteValor),
      };
      const { error } = precos
        ? await supabase.from("configuracao_precos").update(payload).eq("id", precos.id)
        : await supabase.from("configuracao_precos").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Preços atualizados.");
      onSalvo();
    },
    onError: () => toast.error("Não foi possível salvar os preços."),
  });

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-2xl">Preços base</h2>
        <p className="text-sm text-muted-foreground">
          O preço do cesto (lavagem + secagem) é definido pela grade "Preços por dia e horário"
          abaixo, cobrindo todos os dias. Aqui fica só a taxa fixa da atendente.
        </p>
      </div>
      <div className="max-w-[200px] space-y-1.5">
        <Label>Atendente / pedido</Label>
        <Input
          type="number"
          step="0.01"
          min="0"
          value={atendenteValor}
          onChange={(e) => setAtendenteValor(e.target.value)}
        />
      </div>
      <Button onClick={() => salvar.mutate()} disabled={salvar.isPending || !atendenteValor}>
        {salvar.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
        Salvar preços
      </Button>
    </section>
  );
}

const DIA_ABREV = ["D", "S", "T", "Q", "Q", "S", "S"];

function SecaoPrecosPorHorario({
  unidadeId,
  precosHorario,
  onMudou,
}: {
  unidadeId: string;
  precosHorario: PrecoHorario[];
  onMudou: () => void;
}) {
  const [diasSelecionados, setDiasSelecionados] = useState<Set<number>>(new Set());
  const [horaInicio, setHoraInicio] = useState("00:00");
  const [horaFim, setHoraFim] = useState("23:59");
  const [valorCesto, setValorCesto] = useState("");

  function alternarDia(dia: number) {
    setDiasSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(dia)) novo.delete(dia);
      else novo.add(dia);
      return novo;
    });
  }

  const adicionar = useMutation({
    mutationFn: async () => {
      const linhas = [...diasSelecionados].map((dia) => ({
        unidade_id: unidadeId,
        dia_semana: dia,
        hora_inicio: horaInicio,
        hora_fim: horaFim,
        valor_cesto: Number(valorCesto),
      }));
      const { error } = await supabase.from("precos_por_horario").insert(linhas);
      if (error) throw error;
    },
    onSuccess: () => {
      setDiasSelecionados(new Set());
      setValorCesto("");
      onMudou();
      toast.success("Preço por horário adicionado.");
    },
    onError: (error: Error) =>
      toast.error(error.message || "Não foi possível adicionar o preço por horário."),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("precos_por_horario").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: onMudou,
    onError: () => toast.error("Não foi possível remover."),
  });

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-2xl">Preços por dia e horário</h2>
        <p className="text-sm text-muted-foreground">
          Defina uma taxa diferente para lavagem e para secagem (o mesmo valor vale para as duas)
          numa janela de dias e horários — por exemplo, terça-feira das 07h às 12h por R$ 13,90
          (cesto completo sai por R$ 27,80: R$ 13,90 de lavagem + R$ 13,90 de secagem). Fora dessas
          janelas valem os preços base acima.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
        <div className="space-y-1.5">
          <Label>Dias</Label>
          <div className="flex gap-1">
            {DIA_ABREV.map((letra, i) => (
              <button
                key={i}
                type="button"
                onClick={() => alternarDia(i)}
                title={DIAS_SEMANA[i]}
                className={`flex size-8 items-center justify-center rounded-full border text-xs font-medium transition ${
                  diasSelecionados.has(i)
                    ? "border-accent bg-accent/10 text-accent-foreground"
                    : "bg-background hover:bg-secondary"
                }`}
              >
                {letra}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Válido das</Label>
          <Input
            type="time"
            className="w-28"
            value={horaInicio}
            onChange={(e) => setHoraInicio(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>até as</Label>
          <Input
            type="time"
            className="w-28"
            value={horaFim}
            onChange={(e) => setHoraFim(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Preço por serviço (R$)</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            className="w-28"
            value={valorCesto}
            onChange={(e) => setValorCesto(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Cesto completo (lavagem + secagem):{" "}
            {valorCesto ? formatarMoeda(Number(valorCesto) * 2) : "—"}
          </p>
        </div>
        <Button
          onClick={() => adicionar.mutate()}
          disabled={adicionar.isPending || diasSelecionados.size === 0 || !valorCesto}
        >
          {adicionar.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Adicionar
        </Button>
      </div>

      <div>
        <h3 className="text-sm font-medium text-muted-foreground">Visão geral</h3>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {DIAS_SEMANA.map((nome, dia) => {
            const regras = precosHorario.filter((r) => r.dia_semana === dia);
            return (
              <div key={nome} className="rounded-lg border bg-card p-3">
                <p className="text-xs font-medium">{nome}</p>
                {regras.length === 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">—</p>
                ) : (
                  <div className="mt-1 space-y-1">
                    {regras.map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-1 text-xs">
                        <span>
                          {horaCurta(r.hora_inicio)}–{horaCurta(r.hora_fim)} · cesto{" "}
                          {formatarMoeda(r.valor_cesto * 2)} ({formatarMoeda(r.valor_cesto)}
                          /serviço)
                        </span>
                        <button
                          onClick={() => remover.mutate(r.id)}
                          disabled={remover.isPending}
                          aria-label="Remover"
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function SecaoFaixas({
  unidadeId,
  faixas,
  onMudou,
}: {
  unidadeId: string;
  faixas: FaixaDelivery[];
  onMudou: () => void;
}) {
  const [distancia, setDistancia] = useState("");
  const [valor, setValor] = useState("");

  const adicionar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("faixas_delivery").insert({
        unidade_id: unidadeId,
        distancia_ate_km: Number(distancia),
        valor: Number(valor),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setDistancia("");
      setValor("");
      onMudou();
    },
    onError: () => toast.error("Não foi possível adicionar a faixa."),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("faixas_delivery").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: onMudou,
    onError: () => toast.error("Não foi possível remover a faixa."),
  });

  return (
    <section className="space-y-3">
      <h2 className="text-2xl">Faixas de delivery</h2>
      <div className="space-y-2">
        {faixas.map((f) => (
          <div key={f.id} className="flex items-center justify-between rounded-lg border bg-card p-3 text-sm">
            <span>
              Até {f.distancia_ate_km} km — R$ {f.valor.toFixed(2)}
            </span>
            <button
              onClick={() => remover.mutate(f.id)}
              disabled={remover.isPending}
              aria-label="Remover faixa"
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
        {faixas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma faixa cadastrada.</p>
        ) : null}
      </div>
      <div className="flex items-end gap-2">
        <div className="space-y-1.5">
          <Label>Até (km)</Label>
          <Input type="number" step="0.1" min="0" className="w-28" value={distancia} onChange={(e) => setDistancia(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Valor (R$)</Label>
          <Input type="number" step="0.01" min="0" className="w-28" value={valor} onChange={(e) => setValor(e.target.value)} />
        </div>
        <Button onClick={() => adicionar.mutate()} disabled={adicionar.isPending || !distancia || !valor}>
          {adicionar.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Adicionar
        </Button>
      </div>
    </section>
  );
}

// Seção de promoções por dia da semana removida — a função de
// desconto/promoção não afeta mais o preço do pedido (decisão de negócio).
// A tabela `promocoes_dia_semana` continua existindo no banco (não foi
// removida por segurança), só não tem mais UI de cadastro nem efeito no
// cálculo. Ver pedido-calculo.server.ts.
