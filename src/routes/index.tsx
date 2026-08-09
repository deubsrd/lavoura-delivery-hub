import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Truck, Sparkles, ShieldCheck } from "lucide-react";

const PALAVRAS_ROTATIVAS = ["lavada", "seca", "dobrada", "cheirosa", "em casa"];

/**
 * "Sua roupa [palavra]" com a palavra trocando sozinha a cada ~2,2s (fade +
 * slide, via as classes do tw-animate-css já usadas no resto do projeto —
 * sem depender de framer-motion) e bolinhas indicando a posição atual.
 * Mesma dinâmica do hero do suportelavoura ("Aqui tem [palavra]"), adaptada
 * pro vocabulário/paleta daqui.
 */
function PalavraRotativa() {
  const [indice, setIndice] = useState(0);

  useEffect(() => {
    const id = setTimeout(() => setIndice((i) => (i + 1) % PALAVRAS_ROTATIVAS.length), 2200);
    return () => clearTimeout(id);
  }, [indice]);

  return (
    <span className="flex flex-col items-center">
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
  return (
    <main className="min-h-screen bg-background">
      <section className="bg-primary px-5 pt-12 pb-16 text-primary-foreground sm:pt-16 sm:pb-20">
        <div className="mx-auto max-w-2xl text-center">
          <img
            src="/lavoura-logo-branco.svg"
            alt="Lavoura Lavanderia Self Service"
            className="mx-auto h-12 w-auto sm:h-14"
          />
          <div className="mt-8">
            <p className="text-lg text-primary-foreground/70 sm:text-xl">Sua roupa</p>
            <PalavraRotativa />
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
