import { createFileRoute, Link } from "@tanstack/react-router";
import { Truck, Sparkles, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lavoura — Lavanderia self-service com busca e entrega" },
      {
        name: "description",
        content:
          "Peça a busca e entrega das suas roupas na Lavoura. Formulário rápido, prazo transparente e acompanhamento do pedido pela unidade.",
      },
      { property: "og:title", content: "Lavoura — Lavanderia self-service com busca e entrega" },
      {
        property: "og:description",
        content: "Peça a busca e entrega das suas roupas na Lavoura, em poucos toques pelo celular.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="min-h-screen bg-background">
      <section className="bg-primary px-5 pt-16 pb-20 text-primary-foreground">
        <div className="mx-auto max-w-2xl">
          <p className="font-display text-xl tracking-[0.3em] text-accent">LAVOURA</p>
          <h1 className="mt-4 text-5xl leading-[0.95] sm:text-6xl">
            Sua roupa lavada, dobrada e de volta em casa
          </h1>
          <p className="mt-5 text-base/relaxed opacity-90">
            Rede de lavanderias self-service com serviço de busca e entrega por motoboy. Faça seu
            pedido em menos de um minuto pelo celular.
          </p>
          <Link
            to="/$slug/pedido"
            params={{ slug: "boa-vista" }}
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 font-medium text-accent-foreground transition hover:opacity-90"
          >
            <Truck className="size-5" /> Pedir busca e entrega
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
              texto: "Você recebe a data prevista de retorno na confirmação do pedido.",
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
