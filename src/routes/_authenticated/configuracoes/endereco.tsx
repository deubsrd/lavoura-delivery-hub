import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";

import { useAtendenteAdmin } from "@/hooks/use-atendente-admin";
import { AcessoRestrito } from "@/components/acesso-restrito";
import { PaginaHeader } from "@/components/pagina-header";
import { obterEnderecoUnidade, salvarEnderecoUnidade } from "@/lib/unidade.functions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/configuracoes/endereco")({
  head: () => ({
    meta: [{ title: "Endereço da unidade — Lavoura" }, { name: "robots", content: "noindex" }],
  }),
  component: EnderecoPage,
});

function EnderecoPage() {
  const atendente = useAtendenteAdmin();

  if (atendente.isLoading) {
    return <main className="p-8 text-center text-sm text-muted-foreground">Carregando…</main>;
  }
  if (!atendente.souAdmin) return <AcessoRestrito />;

  return (
    <main className="mx-auto max-w-2xl space-y-3 px-5 py-8">
      <PaginaHeader titulo="Endereço da unidade" />
      <SecaoEndereco />
    </main>
  );
}

function SecaoEndereco() {
  const buscarEndereco = useServerFn(obterEnderecoUnidade);
  const salvarEndereco = useServerFn(salvarEnderecoUnidade);

  const [endereco, setEndereco] = useState("");

  const enderecoAtual = useQuery({
    queryKey: ["endereco-unidade"],
    queryFn: () => buscarEndereco(),
  });

  useEffect(() => {
    if (enderecoAtual.data?.endereco_completo) setEndereco(enderecoAtual.data.endereco_completo);
  }, [enderecoAtual.data?.endereco_completo]);

  const salvar = useMutation({
    mutationFn: () => salvarEndereco({ data: { endereco } }),
    onSuccess: (res) => {
      if (res.localizacaoConfirmada) {
        toast.success("Endereço confirmado e localização atualizada.");
      } else {
        toast.warning(
          "Endereço salvo, mas não foi possível confirmar a localização agora. Tente salvar de novo em instantes.",
        );
      }
      setEndereco(res.endereco_completo ?? endereco);
      enderecoAtual.refetch();
    },
    onError: (error: Error) =>
      toast.error(error.message || "Não foi possível salvar o endereço."),
  });

  const localizacaoConfirmada =
    enderecoAtual.data?.latitude !== null && enderecoAtual.data?.latitude !== undefined;

  return (
    <section className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Usado como ponto de partida para calcular a distância de delivery até o cliente. Ao salvar,
        localizamos o endereço automaticamente — você não precisa saber latitude/longitude.
      </p>
      <div className="space-y-1.5">
        <Label>Endereço completo (rua, número, bairro, cidade)</Label>
        <Input
          value={endereco}
          onChange={(e) => setEndereco(e.target.value)}
          placeholder="Rua Exemplo, 123 — Centro, Boa Vista - RR"
        />
      </div>
      {!enderecoAtual.isLoading ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="size-3.5" />
          {localizacaoConfirmada
            ? `Localização confirmada (${enderecoAtual.data!.latitude!.toFixed(5)}, ${enderecoAtual.data!.longitude!.toFixed(5)})`
            : 'Localização ainda não confirmada — o delivery vai aparecer como "a confirmar" até isso ser salvo.'}
        </p>
      ) : null}
      <Button
        onClick={() => salvar.mutate()}
        disabled={salvar.isPending || endereco.trim().length < 10}
      >
        {salvar.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
        Salvar e confirmar localização
      </Button>
    </section>
  );
}
