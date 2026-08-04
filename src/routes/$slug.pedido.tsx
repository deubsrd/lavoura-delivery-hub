import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Clock, Loader2, Minus, Plus } from "lucide-react";
import { toast } from "sonner";

import { criarPedido, getUnidadeBySlug } from "@/lib/pedidos.functions";
import {
  HORARIO_LABEL,
  TIPO_SERVICO_LABEL,
  formatarDataHora,
  maskTelefone,
  type HorarioPreferido,
  type TipoServico,
} from "@/lib/lavoura";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/$slug/pedido")({
  loader: async ({ params }) => {
    const unidade = await getUnidadeBySlug({ data: { slug: params.slug } });
    if (!unidade) throw notFound();
    return { unidade };
  },
  head: ({ loaderData }) => {
    const nome = loaderData?.unidade.nome ?? "Lavoura";
    const title = `Pedido de busca e entrega — ${nome}`;
    const description =
      "Preencha seus dados e solicite a busca e entrega das suas roupas na Lavoura.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        ...(loaderData ? [] : [{ name: "robots", content: "noindex" }]),
      ],
    };
  },
  component: PedidoPage,
  errorComponent: () => (
    <Aviso titulo="Não conseguimos carregar esta unidade" texto="Tente novamente em instantes." />
  ),
  notFoundComponent: () => (
    <Aviso
      titulo="Unidade não encontrada"
      texto="Confira o link recebido da sua lavanderia Lavoura."
    />
  ),
});

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-5 text-center">
      <div>
        <h1 className="text-3xl">{titulo}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{texto}</p>
        <Link to="/" className="mt-6 inline-block text-sm font-medium underline">
          Voltar ao início
        </Link>
      </div>
    </main>
  );
}

type Endereco = {
  rua: string;
  numero: string;
  bairro: string;
  complemento: string;
  referencia: string;
};

const enderecoVazio: Endereco = {
  rua: "",
  numero: "",
  bairro: "",
  complemento: "",
  referencia: "",
};

function PedidoPage() {
  const { unidade } = Route.useLoaderData();
  const enviar = useServerFn(criarPedido);

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [coleta, setColeta] = useState<Endereco>(enderecoVazio);
  const [entrega, setEntrega] = useState<Endereco>(enderecoVazio);
  const [cestos, setCestos] = useState(1);
  const [tipo, setTipo] = useState<TipoServico | "">("");
  const [mesmoEndereco, setMesmoEndereco] = useState<boolean | null>(null);
  const [horario, setHorario] = useState<HorarioPreferido>("sem_preferencia");
  const [observacoes, setObservacoes] = useState("");
  const [armadilha, setArmadilha] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [confirmado, setConfirmado] = useState<{
    data_prevista_retorno: string | null;
  } | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: Parameters<typeof criarPedido>[0]) => enviar(payload),
    onSuccess: (res) => {
      setConfirmado({ data_prevista_retorno: res.data_prevista_retorno });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Não foi possível enviar o pedido.");
    },
  });

  function validar() {
    const e: Record<string, string> = {};
    if (nome.trim().length < 3) e["nome"] = "Informe o nome completo";
    if (telefone.replace(/\D/g, "").length < 10) e["telefone"] = "Telefone inválido";
    if (!coleta.rua.trim()) e["rua"] = "Obrigatório";
    if (!coleta.numero.trim()) e["numero"] = "Obrigatório";
    if (!coleta.bairro.trim()) e["bairro"] = "Obrigatório";
    if (!tipo) e["tipo"] = "Escolha o tipo de serviço";
    if (tipo === "busca_e_entrega") {
      if (mesmoEndereco === null) e["mesmoEndereco"] = "Responda esta pergunta";
      if (mesmoEndereco === false) {
        if (!entrega.rua.trim()) e["rua_entrega"] = "Obrigatório";
        if (!entrega.numero.trim()) e["numero_entrega"] = "Obrigatório";
        if (!entrega.bairro.trim()) e["bairro_entrega"] = "Obrigatório";
      }
    }
    setErros(e);
    return Object.keys(e).length === 0;
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validar()) {
      toast.error("Revise os campos destacados.");
      return;
    }
    mutation.mutate({
      data: {
        slug: unidade.slug,
        nome_completo: nome,
        telefone,
        rua: coleta.rua,
        numero: coleta.numero,
        bairro: coleta.bairro,
        complemento: coleta.complemento || null,
        referencia: coleta.referencia || null,
        quantidade_cestos: cestos,
        tipo_servico: tipo as TipoServico,
        horario_preferido: horario,
        observacoes: observacoes || null,
        mesmo_endereco_entrega: tipo === "busca_e_entrega" ? mesmoEndereco : null,
        rua_entrega: entrega.rua || null,
        numero_entrega: entrega.numero || null,
        bairro_entrega: entrega.bairro || null,
        complemento_entrega: entrega.complemento || null,
        referencia_entrega: entrega.referencia || null,
        armadilha,
      },
    });
  }

  if (confirmado) {
    return (
      <main className="min-h-screen bg-background px-5 py-12">
        <div className="mx-auto max-w-lg text-center">
          <CheckCircle2 className="mx-auto size-14 text-accent" />
          <h1 className="mt-4 text-4xl">Pedido recebido!</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            A unidade {unidade.nome} já está com o seu pedido na fila.
          </p>

          <div className="mt-8 space-y-3 rounded-xl border bg-card p-5 text-left text-sm shadow-card">
            <Resumo rotulo="Nome" valor={nome} />
            <Resumo rotulo="Telefone" valor={telefone} />
            <Resumo rotulo="Serviço" valor={TIPO_SERVICO_LABEL[tipo as TipoServico]} />
            <Resumo rotulo="Cestos" valor={String(cestos)} />
            <Resumo rotulo="Horário preferido" valor={HORARIO_LABEL[horario]} />
            <Resumo
              rotulo={tipo === "entrega" ? "Endereço de entrega" : "Endereço de coleta"}
              valor={`${coleta.rua}, ${coleta.numero} — ${coleta.bairro}`}
            />
            {tipo === "busca_e_entrega" && mesmoEndereco === false ? (
              <Resumo
                rotulo="Endereço de entrega"
                valor={`${entrega.rua}, ${entrega.numero} — ${entrega.bairro}`}
              />
            ) : null}
            {observacoes ? <Resumo rotulo="Observações" valor={observacoes} /> : null}
            {confirmado.data_prevista_retorno ? (
              <Resumo
                rotulo="Previsão de retorno"
                valor={formatarDataHora(confirmado.data_prevista_retorno)}
              />
            ) : null}
          </div>

          <Link to="/" className="mt-8 inline-block text-sm font-medium underline">
            Voltar ao início
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background pb-16">
      <header className="bg-primary px-5 py-7 text-primary-foreground">
        <div className="mx-auto max-w-lg">
          <img
            src="/lavoura-logo-branco.svg"
            alt="Lavoura Lavanderia Self Service"
            className="h-9 w-auto sm:h-11"
          />
          <h1 className="mt-4 text-3xl leading-tight sm:text-4xl">Pedido de busca e entrega</h1>
          <p className="mt-1 text-sm opacity-90">
            {unidade.nome} · {unidade.cidade}
          </p>
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-accent/15 p-3 text-sm">
            <Clock className="mt-0.5 size-4 shrink-0 text-accent" />
            Suas roupas ficam prontas em até {unidade.prazo_padrao_horas}h após a busca.
          </p>
        </div>
      </header>

      <form onSubmit={onSubmit} className="mx-auto mt-8 max-w-lg space-y-8 px-5">
        <Bloco titulo="Seus dados">
          <Campo rotulo="Nome completo" erro={erros["nome"]}>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Maria Silva" />
          </Campo>
          <Campo rotulo="Telefone / WhatsApp" erro={erros["telefone"]}>
            <Input
              value={telefone}
              onChange={(e) => setTelefone(maskTelefone(e.target.value))}
              inputMode="tel"
              placeholder="(95) 99999-9999"
            />
          </Campo>
        </Bloco>

        <Bloco
          titulo={tipo === "entrega" ? "Endereço de entrega" : "Endereço de coleta"}
          descricao="Onde o motoboy deve ir."
        >
          <BlocoEndereco
            valor={coleta}
            onChange={setColeta}
            erros={{
              rua: erros["rua"],
              numero: erros["numero"],
              bairro: erros["bairro"],
            }}
          />
        </Bloco>

        <Bloco titulo="Sobre o pedido">
          <Campo rotulo="Quantidade aproximada de cestos">
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setCestos((c) => Math.max(1, c - 1))}
                aria-label="Diminuir cestos"
              >
                <Minus className="size-4" />
              </Button>
              <span className="w-10 text-center font-display text-2xl">{cestos}</span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setCestos((c) => Math.min(50, c + 1))}
                aria-label="Aumentar cestos"
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </Campo>

          <Campo rotulo="Tipo de serviço" erro={erros["tipo"]}>
            <div className="grid gap-2">
              {(["busca", "entrega", "busca_e_entrega"] as TipoServico[]).map((opcao) => (
                <button
                  key={opcao}
                  type="button"
                  onClick={() => {
                    setTipo(opcao);
                    if (opcao !== "busca_e_entrega") setMesmoEndereco(null);
                  }}
                  className={`rounded-lg border p-3 text-left text-sm transition ${
                    tipo === opcao
                      ? "border-accent bg-accent/10 font-medium"
                      : "bg-card hover:bg-secondary"
                  }`}
                >
                  <span className="block">{TIPO_SERVICO_LABEL[opcao]}</span>
                  <span className="text-xs text-muted-foreground">
                    {opcao === "busca"
                      ? "O motoboy busca as roupas na sua casa."
                      : opcao === "entrega"
                        ? "O motoboy leva as roupas prontas até você."
                        : "Buscamos as roupas e devolvemos prontas."}
                  </span>
                </button>
              ))}
            </div>
          </Campo>

          {tipo === "busca_e_entrega" ? (
            <Campo
              rotulo="O endereço de entrega é o mesmo da coleta?"
              erro={erros["mesmoEndereco"]}
            >
              <div className="flex gap-2">
                {[
                  { label: "Sim", valor: true },
                  { label: "Não", valor: false },
                ].map((op) => (
                  <button
                    key={op.label}
                    type="button"
                    onClick={() => setMesmoEndereco(op.valor)}
                    className={`flex-1 rounded-lg border p-3 text-sm transition ${
                      mesmoEndereco === op.valor
                        ? "border-accent bg-accent/10 font-medium"
                        : "bg-card hover:bg-secondary"
                    }`}
                  >
                    {op.label}
                  </button>
                ))}
              </div>
            </Campo>
          ) : null}

          {tipo === "busca_e_entrega" && mesmoEndereco === false ? (
            <div className="rounded-lg border border-dashed p-4">
              <p className="mb-3 font-display text-xl">Endereço de entrega</p>
              <BlocoEndereco
                valor={entrega}
                onChange={setEntrega}
                erros={{
                  rua: erros["rua_entrega"],
                  numero: erros["numero_entrega"],
                  bairro: erros["bairro_entrega"],
                }}
              />
            </div>
          ) : null}

          <Campo rotulo="Horário preferido (opcional)">
            <div className="flex gap-2">
              {(["manha", "tarde", "sem_preferencia"] as HorarioPreferido[]).map((op) => (
                <button
                  key={op}
                  type="button"
                  onClick={() => setHorario(op)}
                  className={`flex-1 rounded-lg border p-2.5 text-xs transition ${
                    horario === op
                      ? "border-accent bg-accent/10 font-medium"
                      : "bg-card hover:bg-secondary"
                  }`}
                >
                  {HORARIO_LABEL[op]}
                </button>
              ))}
            </div>
          </Campo>

          <Campo rotulo="Observações (opcional)">
            <Textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Ex.: tem peça delicada, portão azul, ligar antes de subir…"
              rows={3}
            />
          </Campo>
        </Bloco>

        {/* Campo honeypot: invisível para pessoas, preenchido por robôs. */}
        <div className="hidden" aria-hidden="true">
          <label>
            Não preencha
            <input
              tabIndex={-1}
              autoComplete="off"
              value={armadilha}
              onChange={(e) => setArmadilha(e.target.value)}
            />
          </label>
        </div>

        <Button
          type="submit"
          disabled={mutation.isPending}
          className="h-12 w-full bg-accent text-accent-foreground hover:bg-accent/90"
        >
          {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Enviar pedido
        </Button>
      </form>
    </main>
  );
}

function Resumo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-4 border-b pb-2 last:border-0 last:pb-0">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="text-right font-medium">{valor}</span>
    </div>
  );
}

function Bloco({
  titulo,
  descricao,
  children,
}: {
  titulo: string;
  descricao?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl">{titulo}</h2>
        {descricao ? <p className="text-sm text-muted-foreground">{descricao}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Campo({
  rotulo,
  erro,
  children,
}: {
  rotulo: string;
  erro?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{rotulo}</Label>
      {children}
      {erro ? <p className="text-xs text-destructive">{erro}</p> : null}
    </div>
  );
}

function BlocoEndereco({
  valor,
  onChange,
  erros,
}: {
  valor: Endereco;
  onChange: (v: Endereco) => void;
  erros: { rua?: string | undefined; numero?: string | undefined; bairro?: string | undefined };
}) {
  const set = (campo: keyof Endereco) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...valor, [campo]: e.target.value });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2 space-y-1.5">
          <Label>Rua</Label>
          <Input value={valor.rua} onChange={set("rua")} />
          {erros.rua ? <p className="text-xs text-destructive">{erros.rua}</p> : null}
        </div>
        <div className="space-y-1.5">
          <Label>Número</Label>
          <Input value={valor.numero} onChange={set("numero")} />
          {erros.numero ? <p className="text-xs text-destructive">{erros.numero}</p> : null}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Bairro</Label>
        <Input value={valor.bairro} onChange={set("bairro")} />
        {erros.bairro ? <p className="text-xs text-destructive">{erros.bairro}</p> : null}
      </div>
      <div className="space-y-1.5">
        <Label>Complemento (opcional)</Label>
        <Input value={valor.complemento} onChange={set("complemento")} />
      </div>
      <div className="space-y-1.5">
        <Label>Ponto de referência (opcional)</Label>
        <Input value={valor.referencia} onChange={set("referencia")} />
      </div>
    </div>
  );
}
