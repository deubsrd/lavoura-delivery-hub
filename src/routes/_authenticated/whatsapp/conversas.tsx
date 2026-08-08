import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAtendenteAdmin } from "@/hooks/use-atendente-admin";
import { AcessoRestrito } from "@/components/acesso-restrito";
import { PaginaHeader } from "@/components/pagina-header";
import {
  enviarMensagemManual,
  listarConversas,
  obterConversa,
  type ConversaResumo,
} from "@/lib/whatsapp.functions";
import { maskTelefone } from "@/lib/lavoura";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/whatsapp/conversas")({
  head: () => ({
    meta: [{ title: "Conversas — Lavoura" }, { name: "robots", content: "noindex" }],
  }),
  component: ConversasPage,
});

function ConversasPage() {
  const atendente = useAtendenteAdmin();

  if (atendente.isLoading) {
    return <main className="p-8 text-center text-sm text-muted-foreground">Carregando…</main>;
  }
  if (!atendente.souAdmin) return <AcessoRestrito />;

  return (
    <main className="mx-auto max-w-5xl px-5 py-8">
      <div className="mb-4">
        <PaginaHeader titulo="Conversas" />
      </div>
      <SecaoConversas />
    </main>
  );
}

function nomeOuTelefone(c: ConversaResumo): string {
  return c.nome ?? maskTelefone(c.telefone);
}

function SecaoConversas() {
  const queryClient = useQueryClient();
  const listarConversasFn = useServerFn(listarConversas);

  const [telefoneSelecionado, setTelefoneSelecionado] = useState<string | null>(null);

  const conversas = useQuery({
    queryKey: ["whatsapp-conversas"],
    queryFn: () => listarConversasFn(),
  });

  useEffect(() => {
    const channel = supabase
      .channel("whatsapp-mensagens-admin")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_mensagens" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["whatsapp-conversas"] });
          queryClient.invalidateQueries({ queryKey: ["whatsapp-thread"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const conversaSelecionada = conversas.data?.find((c) => c.telefone === telefoneSelecionado) ?? null;

  return (
    <div className="grid gap-4 sm:grid-cols-[280px_1fr]">
      <div className="rounded-xl border bg-card">
        {conversas.isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Carregando…</p>
        ) : conversas.data && conversas.data.length > 0 ? (
          <ScrollArea className="h-[70vh]">
            <div className="divide-y">
              {conversas.data.map((c) => (
                <button
                  key={c.telefone}
                  onClick={() => setTelefoneSelecionado(c.telefone)}
                  className={`block w-full p-3 text-left text-sm transition ${
                    telefoneSelecionado === c.telefone ? "bg-secondary" : "hover:bg-secondary/50"
                  }`}
                >
                  <p className="font-medium">{nomeOuTelefone(c)}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {c.ultima_direcao === "enviada" ? "Você: " : ""}
                    {c.ultima_mensagem}
                  </p>
                </button>
              ))}
            </div>
          </ScrollArea>
        ) : (
          <p className="p-4 text-sm text-muted-foreground">Nenhuma conversa ainda.</p>
        )}
      </div>

      {conversaSelecionada ? (
        <ThreadConversa conversa={conversaSelecionada} />
      ) : (
        <div className="flex h-[70vh] items-center justify-center rounded-xl border bg-card text-sm text-muted-foreground">
          Selecione uma conversa
        </div>
      )}
    </div>
  );
}

function ThreadConversa({ conversa }: { conversa: ConversaResumo }) {
  const obterConversaFn = useServerFn(obterConversa);
  const enviarMensagemFn = useServerFn(enviarMensagemManual);
  const queryClient = useQueryClient();

  const [texto, setTexto] = useState("");

  const mensagens = useQuery({
    queryKey: ["whatsapp-thread", conversa.telefone],
    queryFn: () => obterConversaFn({ data: { telefone: conversa.telefone } }),
  });

  const enviar = useMutation({
    mutationFn: () =>
      enviarMensagemFn({
        data: { telefone: conversa.telefone, clienteId: conversa.cliente_id, texto: texto.trim() },
      }),
    onSuccess: () => {
      setTexto("");
      queryClient.invalidateQueries({ queryKey: ["whatsapp-thread", conversa.telefone] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-conversas"] });
    },
    onError: (error: Error) => toast.error(error.message || "Não foi possível enviar."),
  });

  function enviarSeValido() {
    if (!texto.trim() || enviar.isPending) return;
    enviar.mutate();
  }

  return (
    <div className="flex h-[70vh] flex-col rounded-xl border bg-card">
      <div className="border-b p-3">
        <p className="font-medium">{nomeOuTelefone(conversa)}</p>
        <p className="text-xs text-muted-foreground">{maskTelefone(conversa.telefone)}</p>
      </div>

      <ScrollArea className="flex-1 p-3">
        {mensagens.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <div className="space-y-2">
            {(mensagens.data ?? []).map((m) => (
              <div
                key={m.id}
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                  m.direcao === "enviada"
                    ? "ml-auto bg-accent/15 text-right"
                    : "mr-auto bg-secondary"
                }`}
              >
                <p className="whitespace-pre-wrap text-left">{m.texto}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {m.origem === "automatica" ? "Automática · " : ""}
                  {new Date(m.created_at).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "America/Boa_Vista",
                  })}
                  {m.direcao === "enviada" && m.status === "falhou" ? " · falhou" : ""}
                  {m.direcao === "enviada" && m.status === "pendente" ? " · enviando…" : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      <div className="flex gap-2 border-t p-3">
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              enviarSeValido();
            }
          }}
          placeholder="Digite uma mensagem…"
          className="min-h-10 resize-none"
          rows={1}
        />
        <Button onClick={enviarSeValido} disabled={enviar.isPending || !texto.trim()}>
          {enviar.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </div>
    </div>
  );
}
