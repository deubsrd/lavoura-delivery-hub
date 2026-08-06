import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound } from "lucide-react";

import { useAtendenteAdmin } from "@/hooks/use-atendente-admin";
import { AcessoRestrito } from "@/components/acesso-restrito";
import { PaginaHeader } from "@/components/pagina-header";
import { obterConviteUnidade } from "@/lib/unidade.functions";

export const Route = createFileRoute("/_authenticated/configuracoes/convites")({
  head: () => ({
    meta: [{ title: "Convite da unidade — Lavoura" }, { name: "robots", content: "noindex" }],
  }),
  component: ConvitesPage,
});

function ConvitesPage() {
  const atendente = useAtendenteAdmin();

  if (atendente.isLoading) {
    return <main className="p-8 text-center text-sm text-muted-foreground">Carregando…</main>;
  }
  if (!atendente.souAdmin) return <AcessoRestrito />;

  return (
    <main className="mx-auto max-w-2xl space-y-3 px-5 py-8">
      <PaginaHeader titulo="Convite da unidade" />
      <SecaoConvite />
    </main>
  );
}

function SecaoConvite() {
  const buscarConvite = useServerFn(obterConviteUnidade);

  const convite = useQuery({
    queryKey: ["convite-unidade"],
    queryFn: () => buscarConvite(),
  });

  return (
    <section className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Repasse este código para uma nova atendente criar acesso à sua unidade em{" "}
        <span className="font-medium text-foreground">/auth</span>. A primeira atendente vinculada a
        uma unidade vira administradora automaticamente.
      </p>
      {convite.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : convite.isError ? (
        <p className="text-sm text-destructive">Não foi possível carregar o código de convite.</p>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border bg-card p-4">
          <KeyRound className="size-5 text-accent" />
          <span className="font-mono text-2xl font-medium tracking-wide">
            {convite.data?.codigo_convite}
          </span>
        </div>
      )}
    </section>
  );
}
