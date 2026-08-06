import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Clock, Loader2, Minus, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  buscarClientePorCpf,
  calcularResumoPedido,
  criarClienteBasico,
  criarPedido,
  getUnidadeBySlug,
  type ClienteEncontrado,
  type ResumoPedido,
} from "@/lib/pedidos.functions";
import { isValidCpf, maskCpf, soDigitosCpf } from "@/lib/cpf";
import {
  TIPO_SERVICO_LABEL,
  formatarDataHora,
  formatarMoeda,
  maskTelefone,
  textoHorarioFuncionamento,
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

type Etapa = 1 | 2 | 3 | 4 | 5;
const TOTAL_ETAPAS = 5;
const TITULO_ETAPA: Record<Etapa, string> = {
  1: "Seu CPF",
  2: "Seus dados",
  3: "Endereço",
  4: "Sobre o pedido",
  5: "Resumo",
};

function enderecoPorExtenso(e: {
  rua: string | null;
  numero: string | null;
  bairro: string | null;
}): string {
  return `${e.rua ?? ""}, ${e.numero ?? ""} — ${e.bairro ?? ""}`;
}

function PedidoPage() {
  const { unidade } = Route.useLoaderData();

  const buscarCliente = useServerFn(buscarClientePorCpf);
  const criarClienteFn = useServerFn(criarClienteBasico);
  const calcularResumoFn = useServerFn(calcularResumoPedido);
  const enviarPedidoFn = useServerFn(criarPedido);

  const [etapa, setEtapa] = useState<Etapa>(1);
  const [pilha, setPilha] = useState<Etapa[]>([]);
  const [fase1, setFase1] = useState<"cpf" | "confirmar-endereco">("cpf");

  const [cpf, setCpf] = useState("");
  const [clienteEncontrado, setClienteEncontrado] = useState<ClienteEncontrado | null>(null);

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");

  const [coleta, setColeta] = useState<Endereco>(enderecoVazio);
  const [entrega, setEntrega] = useState<Endereco>(enderecoVazio);
  const [cestos, setCestos] = useState(1);
  const [tipo, setTipo] = useState<TipoServico | "">("");
  const [mesmoEnderecoEntrega, setMesmoEnderecoEntrega] = useState<boolean | null>(null);
  const [observacoes, setObservacoes] = useState("");
  const [armadilha, setArmadilha] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});

  const [resumo, setResumo] = useState<ResumoPedido | null>(null);
  const [usarProximoDiaUtil, setUsarProximoDiaUtil] = useState(false);

  const [confirmado, setConfirmado] = useState<{
    data_prevista_retorno: string | null;
    detalhamento: { rotulo: string; valor: number }[];
    valor_total: number;
  } | null>(null);

  function ir(novaEtapa: Etapa) {
    setPilha((p) => [...p, etapa]);
    setEtapa(novaEtapa);
  }

  function voltar() {
    if (etapa === 1 && fase1 === "confirmar-endereco") {
      setFase1("cpf");
      return;
    }
    setPilha((p) => {
      const copia = [...p];
      const anterior = copia.pop();
      if (anterior) setEtapa(anterior);
      return copia;
    });
  }

  const buscaCpfMutation = useMutation({
    mutationFn: (cpfLimpo: string) => buscarCliente({ data: { slug: unidade.slug, cpf: cpfLimpo } }),
    onSuccess: (cliente) => {
      if (cliente) {
        setClienteEncontrado(cliente);
        setFase1("confirmar-endereco");
      } else {
        setClienteEncontrado(null);
        ir(2);
      }
    },
    onError: () => toast.error("Não foi possível verificar o CPF. Tente novamente."),
  });

  function confirmarCpf() {
    if (!isValidCpf(cpf)) {
      setErros({ cpf: "CPF inválido" });
      return;
    }
    setErros({});
    buscaCpfMutation.mutate(soDigitosCpf(cpf));
  }

  function usarEnderecoAnterior(usar: boolean) {
    if (!clienteEncontrado) return;
    if (usar) {
      setColeta({
        rua: clienteEncontrado.ultima_rua ?? "",
        numero: clienteEncontrado.ultimo_numero ?? "",
        bairro: clienteEncontrado.ultimo_bairro ?? "",
        complemento: clienteEncontrado.ultimo_complemento ?? "",
        referencia: clienteEncontrado.ultima_referencia ?? "",
      });
      setEntrega({
        rua: clienteEncontrado.ultima_rua_entrega ?? "",
        numero: clienteEncontrado.ultimo_numero_entrega ?? "",
        bairro: clienteEncontrado.ultimo_bairro_entrega ?? "",
        complemento: clienteEncontrado.ultimo_complemento_entrega ?? "",
        referencia: clienteEncontrado.ultima_referencia_entrega ?? "",
      });
      setMesmoEnderecoEntrega(clienteEncontrado.ultimo_mesmo_endereco_entrega);
      setNome(clienteEncontrado.nome_completo);
      setTelefone(maskTelefone(clienteEncontrado.telefone));
      ir(4);
    } else {
      setColeta(enderecoVazio);
      setEntrega(enderecoVazio);
      setMesmoEnderecoEntrega(null);
      setNome(clienteEncontrado.nome_completo);
      setTelefone(maskTelefone(clienteEncontrado.telefone));
      ir(3);
    }
  }

  const criarClienteMutation = useMutation({
    mutationFn: () =>
      criarClienteFn({
        data: { slug: unidade.slug, cpf: soDigitosCpf(cpf), nome_completo: nome, telefone },
      }),
    onSuccess: () => ir(3),
    onError: (error: Error) => toast.error(error.message || "Não foi possível salvar seus dados."),
  });

  function confirmarDadosNovos() {
    const e: Record<string, string> = {};
    if (nome.trim().length < 3) e["nome"] = "Informe o nome completo";
    if (telefone.replace(/\D/g, "").length < 10) e["telefone"] = "Telefone inválido";
    setErros(e);
    if (Object.keys(e).length > 0) return;
    criarClienteMutation.mutate();
  }

  function confirmarEndereco() {
    const e: Record<string, string> = {};
    if (!coleta.rua.trim()) e["rua"] = "Obrigatório";
    if (!coleta.numero.trim()) e["numero"] = "Obrigatório";
    if (!coleta.bairro.trim()) e["bairro"] = "Obrigatório";
    setErros(e);
    if (Object.keys(e).length > 0) return;
    ir(4);
  }

  const resumoMutation = useMutation({
    mutationFn: (usarProximoDia: boolean) =>
      calcularResumoFn({
        data: {
          slug: unidade.slug,
          quantidade_cestos: cestos,
          tipo_servico: tipo as TipoServico,
          rua: coleta.rua,
          numero: coleta.numero,
          bairro: coleta.bairro,
          complemento: coleta.complemento || null,
          referencia: coleta.referencia || null,
          usar_proximo_dia_util: usarProximoDia,
        },
      }),
    onSuccess: (novoResumo, usarProximoDia) => {
      setResumo(novoResumo);
      setUsarProximoDiaUtil(usarProximoDia);
      if (etapa !== 5) ir(5);
    },
    onError: () => toast.error("Não foi possível calcular o resumo do pedido."),
  });

  function confirmarDadosPedido() {
    const e: Record<string, string> = {};
    if (!tipo) e["tipo"] = "Escolha o tipo de serviço";
    if (tipo === "busca_e_entrega") {
      if (mesmoEnderecoEntrega === null) e["mesmoEndereco"] = "Responda esta pergunta";
      if (mesmoEnderecoEntrega === false) {
        if (!entrega.rua.trim()) e["rua_entrega"] = "Obrigatório";
        if (!entrega.numero.trim()) e["numero_entrega"] = "Obrigatório";
        if (!entrega.bairro.trim()) e["bairro_entrega"] = "Obrigatório";
      }
    }
    setErros(e);
    if (Object.keys(e).length > 0) return;
    resumoMutation.mutate(false);
  }

  const enviarMutation = useMutation({
    mutationFn: () =>
      enviarPedidoFn({
        data: {
          slug: unidade.slug,
          cpf: soDigitosCpf(cpf),
          nome_completo: clienteEncontrado ? undefined : nome,
          telefone: clienteEncontrado ? undefined : telefone,
          rua: coleta.rua,
          numero: coleta.numero,
          bairro: coleta.bairro,
          complemento: coleta.complemento || null,
          referencia: coleta.referencia || null,
          quantidade_cestos: cestos,
          tipo_servico: tipo as TipoServico,
          observacoes: observacoes || null,
          mesmo_endereco_entrega: tipo === "busca_e_entrega" ? mesmoEnderecoEntrega : null,
          rua_entrega: entrega.rua || null,
          numero_entrega: entrega.numero || null,
          bairro_entrega: entrega.bairro || null,
          complemento_entrega: entrega.complemento || null,
          referencia_entrega: entrega.referencia || null,
          usar_proximo_dia_util: usarProximoDiaUtil,
          armadilha,
        },
      }),
    onSuccess: (res) => {
      setConfirmado({
        data_prevista_retorno: res.data_prevista_retorno,
        detalhamento: res.detalhamento,
        valor_total: res.valor_total,
      });
    },
    onError: (error: Error) => toast.error(error.message || "Não foi possível enviar o pedido."),
  });

  if (confirmado) {
    const tituloEndereco = tipo === "entrega" ? "Endereço de entrega" : "Endereço de coleta";
    return (
      <main className="min-h-screen bg-background px-5 py-12">
        <div className="mx-auto max-w-lg text-center">
          <CheckCircle2 className="mx-auto size-14 text-accent" />
          <h1 className="mt-4 text-4xl">Pedido recebido!</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            A unidade {unidade.nome} já está com o seu pedido na fila.
          </p>

          <div className="mt-8 space-y-3 rounded-xl border bg-card p-5 text-left text-sm shadow-card">
            <Resumo rotulo="Nome" valor={nome || clienteEncontrado?.nome_completo || ""} />
            <Resumo rotulo="Serviço" valor={TIPO_SERVICO_LABEL[tipo as TipoServico]} />
            <Resumo rotulo="Cestos" valor={String(cestos)} />
            <Resumo rotulo={tituloEndereco} valor={`${coleta.rua}, ${coleta.numero} — ${coleta.bairro}`} />
            {observacoes ? <Resumo rotulo="Observações" valor={observacoes} /> : null}
            {confirmado.data_prevista_retorno ? (
              <Resumo
                rotulo="Previsão de retorno"
                valor={formatarDataHora(confirmado.data_prevista_retorno)}
              />
            ) : null}
          </div>

          <div className="mt-4 space-y-1.5 rounded-xl border bg-card p-5 text-left text-sm shadow-card">
            {confirmado.detalhamento.map((item) => (
              <div key={item.rotulo} className="flex justify-between gap-4">
                <span className="text-muted-foreground">{item.rotulo}</span>
                <span className={item.valor < 0 ? "text-accent" : ""}>{formatarMoeda(item.valor)}</span>
              </div>
            ))}
            <div className="mt-2 flex justify-between border-t pt-2 font-medium">
              <span>Total estimado</span>
              <span>{formatarMoeda(confirmado.valor_total)}</span>
            </div>
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
            {textoHorarioFuncionamento(unidade)}
          </p>
        </div>
      </header>

      <div className="mx-auto mt-6 max-w-lg px-5">
        <ProgressoEtapas atual={etapa} />
      </div>

      <div className="mx-auto mt-6 max-w-lg space-y-8 px-5">
        {etapa === 1 && fase1 === "cpf" ? (
          <Bloco titulo="Informe seu CPF" descricao="Usamos para agilizar pedidos futuros.">
            <Campo rotulo="CPF" erro={erros["cpf"]}>
              <Input
                value={cpf}
                onChange={(e) => setCpf(maskCpf(e.target.value))}
                inputMode="numeric"
                placeholder="000.000.000-00"
              />
            </Campo>
            <Button
              onClick={confirmarCpf}
              disabled={buscaCpfMutation.isPending}
              className="h-12 w-full bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {buscaCpfMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Continuar
            </Button>
          </Bloco>
        ) : null}

        {etapa === 1 && fase1 === "confirmar-endereco" && clienteEncontrado ? (
          <Bloco titulo={`Bem-vindo(a) de volta, ${clienteEncontrado.nome_completo.split(" ")[0]}!`}>
            <p className="text-sm text-muted-foreground">Usar o mesmo endereço de coleta e entrega da última vez?</p>
            <div className="rounded-lg border bg-card p-3 text-sm">
              <p className="font-medium">Coleta</p>
              <p className="text-muted-foreground">{enderecoPorExtenso({
                rua: clienteEncontrado.ultima_rua,
                numero: clienteEncontrado.ultimo_numero,
                bairro: clienteEncontrado.ultimo_bairro,
              })}</p>
              {clienteEncontrado.ultimo_mesmo_endereco_entrega === false ? (
                <>
                  <p className="mt-2 font-medium">Entrega</p>
                  <p className="text-muted-foreground">{enderecoPorExtenso({
                    rua: clienteEncontrado.ultima_rua_entrega,
                    numero: clienteEncontrado.ultimo_numero_entrega,
                    bairro: clienteEncontrado.ultimo_bairro_entrega,
                  })}</p>
                </>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => usarEnderecoAnterior(false)}>
                Não, usar outro
              </Button>
              <Button className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => usarEnderecoAnterior(true)}>
                Sim, usar o mesmo
              </Button>
            </div>
          </Bloco>
        ) : null}

        {etapa === 2 ? (
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
            <div className="flex gap-2">
              <Button variant="outline" onClick={voltar}>Voltar</Button>
              <Button
                onClick={confirmarDadosNovos}
                disabled={criarClienteMutation.isPending}
                className="flex-1 h-12 bg-accent text-accent-foreground hover:bg-accent/90"
              >
                {criarClienteMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Continuar
              </Button>
            </div>
          </Bloco>
        ) : null}

        {etapa === 3 ? (
          <Bloco titulo="Endereço" descricao="Onde o motoboy deve ir.">
            <BlocoEndereco
              valor={coleta}
              onChange={setColeta}
              erros={{ rua: erros["rua"], numero: erros["numero"], bairro: erros["bairro"] }}
            />
            <div className="flex gap-2">
              <Button variant="outline" onClick={voltar}>Voltar</Button>
              <Button onClick={confirmarEndereco} className="flex-1 h-12 bg-accent text-accent-foreground hover:bg-accent/90">
                Continuar
              </Button>
            </div>
          </Bloco>
        ) : null}

        {etapa === 4 ? (
          <Bloco titulo="Sobre o pedido">
            <Campo rotulo="Quantidade aproximada de cestos">
              <div className="flex items-center gap-3">
                <Button type="button" variant="outline" size="icon" onClick={() => setCestos((c) => Math.max(1, c - 1))} aria-label="Diminuir cestos">
                  <Minus className="size-4" />
                </Button>
                <span className="w-10 text-center font-display text-2xl">{cestos}</span>
                <Button type="button" variant="outline" size="icon" onClick={() => setCestos((c) => Math.min(50, c + 1))} aria-label="Aumentar cestos">
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
                      if (opcao !== "busca_e_entrega") setMesmoEnderecoEntrega(null);
                    }}
                    className={`rounded-lg border p-3 text-left text-sm transition ${
                      tipo === opcao ? "border-accent bg-accent/10 font-medium" : "bg-card hover:bg-secondary"
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
              <Campo rotulo="O endereço de entrega é o mesmo da coleta?" erro={erros["mesmoEndereco"]}>
                <div className="flex gap-2">
                  {[{ label: "Sim", valor: true }, { label: "Não", valor: false }].map((op) => (
                    <button
                      key={op.label}
                      type="button"
                      onClick={() => setMesmoEnderecoEntrega(op.valor)}
                      className={`flex-1 rounded-lg border p-3 text-sm transition ${
                        mesmoEnderecoEntrega === op.valor ? "border-accent bg-accent/10 font-medium" : "bg-card hover:bg-secondary"
                      }`}
                    >
                      {op.label}
                    </button>
                  ))}
                </div>
              </Campo>
            ) : null}

            {tipo === "busca_e_entrega" && mesmoEnderecoEntrega === false ? (
              <div className="rounded-lg border border-dashed p-4">
                <p className="mb-3 font-display text-xl">Endereço de entrega</p>
                <BlocoEndereco
                  valor={entrega}
                  onChange={setEntrega}
                  erros={{ rua: erros["rua_entrega"], numero: erros["numero_entrega"], bairro: erros["bairro_entrega"] }}
                />
              </div>
            ) : null}

            <Campo rotulo="Observações (opcional)">
              <Textarea
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Ex.: tem peça delicada, portão azul, ligar antes de subir…"
                rows={3}
              />
            </Campo>

            <div className="flex gap-2">
              <Button variant="outline" onClick={voltar}>Voltar</Button>
              <Button
                onClick={confirmarDadosPedido}
                disabled={resumoMutation.isPending}
                className="flex-1 h-12 bg-accent text-accent-foreground hover:bg-accent/90"
              >
                {resumoMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Ver resumo
              </Button>
            </div>
          </Bloco>
        ) : null}

        {etapa === 5 && resumo ? (
          <EtapaResumo
            resumo={resumo}
            usarProximoDiaUtil={usarProximoDiaUtil}
            recalculando={resumoMutation.isPending}
            enviando={enviarMutation.isPending}
            onVoltar={voltar}
            onAgendarProximoDia={() => resumoMutation.mutate(true)}
            onConfirmar={() => enviarMutation.mutate()}
          />
        ) : null}

        {/* Campo honeypot: invisível para pessoas, preenchido por robôs. */}
        <div className="hidden" aria-hidden="true">
          <label>
            Não preencha
            <input tabIndex={-1} autoComplete="off" value={armadilha} onChange={(e) => setArmadilha(e.target.value)} />
          </label>
        </div>
      </div>
    </main>
  );
}

function ProgressoEtapas({ atual }: { atual: Etapa }) {
  return (
    <div>
      <div className="flex gap-1.5">
        {Array.from({ length: TOTAL_ETAPAS }, (_, i) => (i + 1) as Etapa).map((n) => (
          <div
            key={n}
            className={`h-1.5 flex-1 rounded-full ${n <= atual ? "bg-accent" : "bg-secondary"}`}
          />
        ))}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Etapa {atual} de {TOTAL_ETAPAS} · {TITULO_ETAPA[atual]}
      </p>
    </div>
  );
}

function EtapaResumo({
  resumo,
  usarProximoDiaUtil,
  recalculando,
  enviando,
  onVoltar,
  onAgendarProximoDia,
  onConfirmar,
}: {
  resumo: ResumoPedido;
  usarProximoDiaUtil: boolean;
  recalculando: boolean;
  enviando: boolean;
  onVoltar: () => void;
  onAgendarProximoDia: () => void;
  onConfirmar: () => void;
}) {
  if (resumo.foraDoHorario && !usarProximoDiaUtil) {
    return (
      <Bloco titulo="Sem tempo hábil hoje">
        <p className="text-sm text-muted-foreground">
          Não conseguimos concluir esse pedido ainda hoje dentro do nosso horário de atendimento.
          Deseja agendar para o próximo horário útil, a partir de{" "}
          {formatarDataHora(resumo.proximoHorarioUtilIso)}?
        </p>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onVoltar}>
            Não, voltar
          </Button>
          <Button
            className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={onAgendarProximoDia}
            disabled={recalculando}
          >
            {recalculando ? <Loader2 className="size-4 animate-spin" /> : null}
            Sim, agendar
          </Button>
        </div>
      </Bloco>
    );
  }

  return (
    <Bloco titulo="Resumo do pedido">
      {resumo.deliveryMensagemErro ? (
        <p className="rounded-lg bg-secondary p-3 text-xs text-muted-foreground">
          {resumo.deliveryMensagemErro}
        </p>
      ) : null}
      <div className="space-y-1.5 rounded-xl border bg-card p-4 text-sm">
        {resumo.detalhamento.map((item) => (
          <div key={item.rotulo} className="flex justify-between gap-4">
            <span className="text-muted-foreground">{item.rotulo}</span>
            <span className={item.valor < 0 ? "text-accent" : ""}>{formatarMoeda(item.valor)}</span>
          </div>
        ))}
        <div className="mt-2 flex justify-between border-t pt-2 font-medium">
          <span>Total estimado</span>
          <span>{formatarMoeda(resumo.valorTotal)}</span>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Previsão de retorno: {formatarDataHora(resumo.previstoIso)}
        {usarProximoDiaUtil ? " (agendado)" : ""}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onVoltar}>Voltar</Button>
        <Button
          onClick={onConfirmar}
          disabled={enviando}
          className="flex-1 h-12 bg-accent text-accent-foreground hover:bg-accent/90"
        >
          {enviando ? <Loader2 className="size-4 animate-spin" /> : null}
          Confirmar pedido
        </Button>
      </div>
    </Bloco>
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
