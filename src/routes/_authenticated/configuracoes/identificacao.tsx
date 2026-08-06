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
import { salvarIdentificacaoUnidade } from "@/lib/unidade.functions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

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
    <main className="mx-auto max-w-2xl space-y-3 px-5 py-8">
      <PaginaHeader titulo="Identificação da unidade" />
      <SecaoIdentificacao unidadeId={atendente.unidadeId!} />
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
