import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Truck, Sparkles, ShieldCheck } from "lucide-react";

import { getUnidadeBySlug } from "@/lib/pedidos.functions";

// A home pública ainda não é multi-unidade de verdade (link fixo abaixo já
// aponta pra essa mesma unidade) — a mídia de propaganda exibida aqui é a
// configurada pra ela em Configurações > Identificação.
const SLUG_UNIDADE_HOME = "boa-vista";

const PALAVRAS_ROTATIVAS = ["lavada", "seca", "dobrada", "cheirosa", "em casa"];

/**
 * "Sua roupa [palavra]" com a palavra trocando sozinha a cada ~2,2s (fade +
 * slide, via as classes do tw-animate-css já usadas no resto do projeto —
 * sem depender de framer-motion) e bolinhas indicando a posição atual.
 * Mesma dinâmica do hero do suportelavoura ("Aqui tem [palavra]"), adaptada
 * pro vocabulário/paleta daqui.
 */
function PalavraRotativa({ alinhamento = "" }: { alinhamento?: string }) {
  const [indice, setIndice] = useState(0);

  useEffect(() => {
    const id = setTimeout(() => setIndice((i) => (i + 1) % PALAVRAS_ROTATIVAS.length), 2200);
    return () => clearTimeout(id);
  }, [indice]);

  return (
    <span className={`flex flex-col items-center ${alinhamento}`}>
      {/* Altura fixa (não em `em`) — como o tamanho da fonte muda por
          breakpoint mas está no elemento FILHO, um `h-[Xem]` aqui em cima
          resolveria contra o font-size herdado (bem menor), cortando a
          palavra pela metade. */}
      <span className="relative block h-20 overflow-hidden sm:h-28">
        <span
          key={PALAVRAS_ROTATIVAS[indice]}
          className="block animate-in fade-in slide-in-from-bottom-3 font-serif-display text-5xl leading-tight text-accent italic duration-500 sm:text-7xl"
        >
          {PALAVRAS_ROTATIVAS[indice]}
        </span>
      </span>
      <span className="mt-2 flex gap-1.5">
        {PALAVRAS_ROTATIVAS.map((palavra, i) => (
          <span
            key={palavra}
            className={`h-1 rounded-full transition-all ${
              i === indice ? "w-4 bg-accent" : "w-1 bg-primary-foreground/25"
            }`}
          />
        ))}
      </span>
    </span>
  );
}

export const Route = createFileRoute("/")({
  loader: async () => {
    // A home é a porta de entrada pública do site inteiro — nunca pode
    // quebrar por causa de um dado opcional (a mídia de propaganda). Se a
    // busca falhar por qualquer motivo (rede, coluna nova ainda não
    // migrada no banco, etc.), cai pro layout sem mídia em vez de derrubar
    // a página inteira.
    try {
      const unidade = await getUnidadeBySlug({ data: { slug: SLUG_UNIDADE_HOME } });
      return { unidade };
    } catch (err) {
      console.error("[home] falha ao buscar dados da unidade", err);
      return { unidade: null };
    }
  },
  head: () => ({
    meta: [
      { title: "Lavoura — Lavanderia autosserviço com busca e entrega" },
      {
        name: "description",
        content:
          "Peça a busca e entrega das suas roupas na Lavoura. Formulário rápido, prazo transparente e acompanhamento do pedido pela unidade.",
      },
      {
        property: "og:title",
        content: "Lavoura — Lavanderia autosserviço com busca e entrega",
      },
      {
        property: "og:description",
        content:
          "Peça a busca e entrega das suas roupas na Lavoura. Formulário rápido, prazo transparente e acompanhamento do pedido pela unidade.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const { unidade } = Route.useLoaderData();
  const midiaUrl = unidade?.midia_propaganda_url ?? null;
  const midiaTipo = unidade?.midia_propaganda_tipo ?? null;
  const temMidia = midiaUrl !== null && midiaTipo !== null;

  return (
    <main className="min-h-screen bg-background">
      <section className="bg-primary text-primary-foreground">
        <div
          className={
            temMidia
              ? "mx-auto grid max-w-6xl items-center md:grid-cols-2 md:gap-10"
              : "mx-auto max-w-2xl px-5 pt-12 pb-16 sm:pt-16 sm:pb-20"
          }
        >
          <div
            className={
              temMidia
                ? "px-5 py-12 text-center sm:py-16 md:py-24 md:text-left"
                : "text-center"
            }
          >
            <img
              src="/lavoura-logo-branco.svg"
              alt="Lavoura Lavanderia Self Service"
              className={`h-12 w-auto sm:h-14 ${temMidia ? "mx-auto md:mx-0" : "mx-auto"}`}
            />
            <div className="mt-8">
              <p
                className={`text-lg text-primary-foreground/70 sm:text-xl ${temMidia ? "md:text-left" : ""}`}
              >
                Sua roupa
              </p>
              <PalavraRotativa alinhamento={temMidia ? "md:items-start" : ""} />
            </div>
            <p className="mt-5 text-base/relaxed opacity-90">
              Faça seu pedido em menos de um minuto pelo celular.
            </p>
            <Link
              to="/$slug/pedido"
              params={{ slug: "boa-vista" }}
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 font-medium text-accent-foreground transition hover:opacity-90"
            >
              <Truck className="size-5" /> Pedir Delivery
            </Link>
          </div>

          {temMidia ? (
            <div className="relative h-64 md:h-full md:min-h-[28rem]">
              {midiaTipo === "video" ? (
                <video
                  src={midiaUrl}
                  controls
                  playsInline
                  className="h-full w-full object-cover"
                />
              ) : (
                <img
                  src={midiaUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              )}
              {/* Degradê pra não cortar bruscamente entre o fundo verde e a
                  mídia — em pé (empilhado) a costura é em cima, lado a lado
                  (md+) a costura é à esquerda. */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,var(--primary)_0%,transparent_18%)] md:bg-[linear-gradient(to_right,var(--primary)_0%,transparent_18%)]"
              />
            </div>
          ) : null}
        </div>
      </section>

      <section className="mx-auto max-w-2xl px-5 py-14">
        <h2 className="text-3xl">Como funciona</h2>
        <ul className="mt-6 space-y-4">
          {[
            {
              icon: Truck,
              titulo: "A gente busca",
              texto: "O motoboy retira as cestos no endereço que você informar.",
            },
            {
              icon: Sparkles,
              titulo: "Lavamos e dobramos",
              texto: "Suas roupas passam pela unidade e voltam prontas para usar.",
            },
            {
              icon: ShieldCheck,
              titulo: "Prazo combinado",
              texto: "Você recebe o horário previsto de retorno na confirmação do pedido.",
            },
          ].map((item) => (
            <li
              key={item.titulo}
              className="flex gap-4 rounded-xl border bg-card p-4 shadow-card"
            >
              <item.icon className="mt-0.5 size-5 shrink-0 text-accent" />
              <div>
                <p className="font-medium">{item.titulo}</p>
                <p className="text-sm text-muted-foreground">{item.texto}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-10 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          É da equipe Lavoura?{" "}
          <Link to="/painel" className="font-medium text-foreground underline">
            Acessar o painel da unidade
          </Link>
        </div>
      </section>
    </main>
  );
}
