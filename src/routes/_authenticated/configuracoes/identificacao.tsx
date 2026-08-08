import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAtendenteAdmin } from "@/hooks/use-atendente-admin";
import { AcessoRestrito } from "@/components/acesso-restrito";
import { PaginaHeader } from "@/components/pagina-header";
import {
  obterHorariosUnidade,
  salvarHorariosUnidade,
  salvarIdentificacaoUnidade,
  type HorarioDiaUnidade,
} from "@/lib/unidade.functions";
import { DIA_SEMANA_LABEL } from "@/lib/lavoura";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/configuracoes/identificacao")({
  head: () => ({
    meta: [{ title: "Identificação da unidade — Lavoura" }, { name: "robots", content: "noindex" }],
  }),
  component: IdentificacaoPage,
});

type Identificacao = { nome: string; cidade: string; slug: string };

function IdentificacaoPage() {
  const atendente = useAtendenteAdmin();

  if (atendente.isLoading) {
    return <main className="p-8 text-center text-sm text-muted-foreground">Carregando…</main>;
  }
  if (!atendente.souAdmin) return <AcessoRestrito />;

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-5 py-8">
      <PaginaHeader titulo="Identificação da unidade" />
      <SecaoIdentificacao unidadeId={atendente.unidadeId!} />
      <SecaoHorarios />
    </main>
  );
}

function SecaoIdentificacao({ unidadeId }: { unidadeId: string }) {
  const queryClient = useQueryClient();
  const salvarIdentificacao = useServerFn(salvarIdentificacaoUnidade);

  const [nome, setNome] = useState("");
  const [cidade, setCidade] = useState("");

  const identificacao = useQuery({
    queryKey: ["identificacao-unidade", unidadeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("unidades")
        .select("nome, cidade, slug")
        .eq("id", unidadeId)
        .maybeSingle();
      if (error) throw error;
      return data as Identificacao | null;
    },
  });

  useEffect(() => {
    if (identificacao.data) {
      setNome(identificacao.data.nome);
      setCidade(identificacao.data.cidade);
    }
  }, [identificacao.data]);

  const salvar = useMutation({
    mutationFn: () => salvarIdentificacao({ data: { nome, cidade } }),
    onSuccess: () => {
      toast.success("Identificação da unidade atualizada.");
      queryClient.invalidateQueries({ queryKey: ["identificacao-unidade", unidadeId] });
      queryClient.invalidateQueries({ queryKey: ["atendente"] });
    },
    onError: (error: Error) => toast.error(error.message || "Não foi possível salvar."),
  });

  if (identificacao.isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  }

  return (
    <section className="space-y-4">
      <div className="space-y-1.5">
        <Label>Nome da unidade</Label>
        <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Lavoura Boa Vista" />
      </div>
      <div className="space-y-1.5">
        <Label>Cidade</Label>
        <Input value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Boa Vista" />
      </div>
      <div className="space-y-1.5">
        <Label>Slug (usado na URL pública do pedido)</Label>
        <Input value={identificacao.data?.slug ?? ""} disabled readOnly />
        <p className="text-xs text-muted-foreground">
          /{identificacao.data?.slug}/pedido — não é editável aqui: mudar quebraria links já
          compartilhados com clientes.
        </p>
      </div>
      <Button
        onClick={() => salvar.mutate()}
        disabled={salvar.isPending || nome.trim().length < 2 || cidade.trim().length < 2}
      >
        {salvar.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
        Salvar
      </Button>
    </section>
  );
}

function horariosPadrao(): HorarioDiaUnidade[] {
  return Array.from({ length: 7 }, (_, dia_semana) => ({
    dia_semana,
    ativo: dia_semana !== 0,
    hora_abertura: "13:00",
    hora_fechamento: "19:00",
  }));
}

function SecaoHorarios() {
  const queryClient = useQueryClient();
  const buscarHorarios = useServerFn(obterHorariosUnidade);
  const salvarHorarios = useServerFn(salvarHorariosUnidade);

  const [horarios, setHorarios] = useState<HorarioDiaUnidade[]>(horariosPadrao());

  const horariosQuery = useQuery({
    queryKey: ["horarios-unidade"],
    queryFn: () => buscarHorarios(),
  });

  useEffect(() => {
    if (!horariosQuery.data) return;
    // O Postgres devolve colunas `time` como "HH:MM:SS"; normaliza para
    // "HH:MM" — formato que o <input type="time"> usa e que o schema de
    // validação do servidor espera de volta ao salvar.
    const porDia = new Map(
      horariosQuery.data.map((h) => [
        h.dia_semana,
        { ...h, hora_abertura: h.hora_abertura.slice(0, 5), hora_fechamento: h.hora_fechamento.slice(0, 5) },
      ]),
    );
    setHorarios(horariosPadrao().map((padrao) => porDia.get(padrao.dia_semana) ?? padrao));
  }, [horariosQuery.data]);

  const salvar = useMutation({
    mutationFn: () => salvarHorarios({ data: { horarios } }),
    onSuccess: () => {
      toast.success("Horário de funcionamento atualizado.");
      queryClient.invalidateQueries({ queryKey: ["horarios-unidade"] });
    },
    onError: (error: Error) => toast.error(error.message || "Não foi possível salvar os horários."),
  });

  function atualizarDia(dia: number, patch: Partial<HorarioDiaUnidade>) {
    setHorarios((atual) => atual.map((h) => (h.dia_semana === dia ? { ...h, ...patch } : h)));
  }

  const algumInvalido = horarios.some((h) => h.ativo && h.hora_abertura >= h.hora_fechamento);

  return (
    <section className="space-y-4 rounded-xl border bg-card p-4 shadow-card">
      <div>
        <h2 className="text-lg font-medium">Horário de funcionamento</h2>
        <p className="text-sm text-muted-foreground">
          Defina o horário de atendimento de cada dia da semana. Fora desses horários, o cliente
          é convidado a agendar o pedido para o próximo horário disponível.
        </p>
      </div>
      {horariosQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <div className="space-y-3">
          {horarios.map((h) => (
            <div key={h.dia_semana} className="flex flex-wrap items-center gap-3">
              <div className="flex w-40 items-center gap-2">
                <Switch
                  checked={h.ativo}
                  onCheckedChange={(v) => atualizarDia(h.dia_semana, { ativo: v })}
                />
                <span className="text-sm">{DIA_SEMANA_LABEL[h.dia_semana]}</span>
              </div>
              {h.ativo ? (
                <div className="flex items-center gap-1.5">
                  <Input
                    type="time"
                    value={h.hora_abertura}
                    onChange={(e) => atualizarDia(h.dia_semana, { hora_abertura: e.target.value })}
                    className="h-9 w-28"
                  />
                  <span className="text-sm text-muted-foreground">até</span>
                  <Input
                    type="time"
                    value={h.hora_fechamento}
                    onChange={(e) => atualizarDia(h.dia_semana, { hora_fechamento: e.target.value })}
                    className="h-9 w-28"
                  />
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Fechado</span>
              )}
            </div>
          ))}
        </div>
      )}
      {algumInvalido ? (
        <p className="text-xs text-destructive">
          Em algum dia ativo o horário de abertura não é antes do de fechamento.
        </p>
      ) : null}
      <Button onClick={() => salvar.mutate()} disabled={salvar.isPending || algumInvalido}>
        {salvar.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
        Salvar horários
      </Button>
    </section>
  );
}
