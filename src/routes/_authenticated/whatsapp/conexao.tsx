import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Smartphone } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAtendenteAdmin } from "@/hooks/use-atendente-admin";
import { AcessoRestrito } from "@/components/acesso-restrito";
import { PaginaHeader } from "@/components/pagina-header";
import {
  desconectarWhatsapp,
  obterConexaoWhatsapp,
  solicitarConexaoWhatsapp,
} from "@/lib/whatsapp.functions";
import { formatarDataHora } from "@/lib/lavoura";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/whatsapp/conexao")({
  head: () => ({
    meta: [{ title: "Conexão WhatsApp — Lavoura" }, { name: "robots", content: "noindex" }],
  }),
  component: ConexaoWhatsappPage,
});

function ConexaoWhatsappPage() {
  const atendente = useAtendenteAdmin();

  if (atendente.isLoading) {
    return <main className="p-8 text-center text-sm text-muted-foreground">Carregando…</main>;
  }
  if (!atendente.souAdmin) return <AcessoRestrito />;

  return (
    <main className="mx-auto max-w-xl space-y-4 px-5 py-8">
      <PaginaHeader titulo="Conexão WhatsApp" />
      <SecaoConexao />
    </main>
  );
}

const STATUS_BADGE: Record<string, { texto: string; variant: "default" | "secondary" | "destructive" }> = {
  conectado: { texto: "Conectado", variant: "default" },
  conectando: { texto: "Conectando…", variant: "secondary" },
  desconectado: { texto: "Desconectado", variant: "destructive" },
};

function SecaoConexao() {
  const queryClient = useQueryClient();
  const obterConexaoFn = useServerFn(obterConexaoWhatsapp);
  const solicitarConexaoFn = useServerFn(solicitarConexaoWhatsapp);
  const desconectarFn = useServerFn(desconectarWhatsapp);

  const conexao = useQuery({
    queryKey: ["whatsapp-conexao"],
    queryFn: () => obterConexaoFn(),
    // O QR expira e é trocado periodicamente pelo script enquanto ninguém
    // escaneia — sem isso a tela ficaria com um QR morto na tela.
    refetchInterval: 15_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("whatsapp-conexao-admin")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_conexoes" },
        () => queryClient.invalidateQueries({ queryKey: ["whatsapp-conexao"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const conectar = useMutation({
    mutationFn: () => solicitarConexaoFn(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["whatsapp-conexao"] }),
    onError: (error: Error) => toast.error(error.message || "Não foi possível iniciar a conexão."),
  });

  const desconectar = useMutation({
    mutationFn: () => desconectarFn(),
    onSuccess: () => {
      toast.success("Solicitação de desconexão enviada.");
      queryClient.invalidateQueries({ queryKey: ["whatsapp-conexao"] });
    },
    onError: (error: Error) => toast.error(error.message || "Não foi possível desconectar."),
  });

  if (conexao.isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  }

  const dados = conexao.data!;
  const badge = STATUS_BADGE[dados.status];

  return (
    <section className="space-y-4 rounded-xl border bg-card p-4 shadow-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Smartphone className="size-5 text-muted-foreground" />
          <span className="font-medium">Status</span>
        </div>
        {badge ? <Badge variant={badge.variant}>{badge.texto}</Badge> : null}
      </div>

      {dados.erro ? (
        <p className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive">{dados.erro}</p>
      ) : null}

      {dados.status === "conectando" && dados.qr_atual ? (
        <div className="space-y-2 text-center">
          <img
            src={dados.qr_atual}
            alt="QR code do WhatsApp"
            className="mx-auto size-64 rounded-lg border"
          />
          <p className="text-sm text-muted-foreground">
            No celular: WhatsApp → Configurações → Aparelhos conectados → Conectar um aparelho, e
            aponte a câmera pra esse QR code. Ele é trocado automaticamente a cada instantes até
            ser escaneado.
          </p>
        </div>
      ) : null}

      {dados.status === "conectando" && !dados.qr_atual ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Aguardando o QR code ser gerado…
        </p>
      ) : null}

      {dados.status === "conectado" ? (
        <div className="space-y-1 text-sm">
          {dados.telefone_conectado ? (
            <p>
              Número conectado: <span className="font-medium">{dados.telefone_conectado}</span>
            </p>
          ) : null}
          {dados.conectado_em ? (
            <p className="text-muted-foreground">
              Desde {formatarDataHora(dados.conectado_em)}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex gap-2">
        {dados.status === "desconectado" ? (
          <Button onClick={() => conectar.mutate()} disabled={conectar.isPending}>
            {conectar.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Conectar WhatsApp
          </Button>
        ) : null}
        {dados.status !== "desconectado" ? (
          <Button variant="outline" onClick={() => desconectar.mutate()} disabled={desconectar.isPending}>
            {desconectar.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Desconectar
          </Button>
        ) : null}
      </div>
    </section>
  );
}
