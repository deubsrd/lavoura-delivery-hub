import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, SendHorizontal } from "lucide-react";
import { toast } from "sonner";

import {
  buscarClientePorCpf,
  calcularResumoPedido,
  criarClienteBasico,
  criarPedido,
  getUnidadeBySlug,
  obterHorariosPublico,
  obterPrecosBase,
  obterSlotsColeta,
  type ClienteEncontrado,
  type DiaColetaPublico,
  type ResumoPedido,
} from "@/lib/pedidos.functions";
import { isValidCpf, maskCpf, soDigitosCpf } from "@/lib/cpf";
import {
  DIA_SEMANA_LABEL,
  TIPO_SERVICO_LABEL,
  chaveDiaBoaVista,
  formatarDataHora,
  formatarMoeda,
  horaCurta,
  maskTelefone,
  type TipoServico,
} from "@/lib/lavoura";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * Formulário de pedido em formato de conversa — substitui a versão anterior
 * por etapas (formulário tradicional), mantida no histórico do git pra
 * reverter se precisar. Mesma lógica de negócio e mesmas server functions de
 * antes (busca de cliente por CPF, cálculo de prazo/preço, grade de
 * horários, criação do pedido); só a apresentação muda — uma pergunta de
 * cada vez, com respostas prontas quando dá pra prever a resposta (sim/não,
 * tipo de serviço) e texto livre quando não dá.
 */
export const Route = createFileRoute("/$slug/pedido")({
  loader: async ({ params }) => {
    const unidade = await getUnidadeBySlug({ data: { slug: params.slug } });
    if (!unidade) throw notFound();
    return { unidade };
  },
  head: ({ loaderData }) => {
    const nome = loaderData?.unidade.nome ?? "Lavoura";
    const title = `Pedido de busca e entrega — ${nome}`;
    return {
      meta: [
        { title },
        { name: "description", content: "Faça seu pedido conversando, como num chat." },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: PedidoChatPage,
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

// Cada valor é um "turno" da conversa — o passo em que o cliente está
// respondendo agora. Controla o que aparece na área de resposta (texto
// livre, botões de resposta rápida, ou um cartão mais rico como a grade de
// horários e o resumo).
type Passo =
  | "cpf"
  | "confirmar_endereco_anterior"
  | "nome"
  | "telefone"
  | "rua"
  | "numero"
  | "bairro"
  | "complemento"
  | "referencia"
  | "cestos"
  | "horario"
  | "tipo_servico"
  | "mesmo_endereco_entrega"
  | "rua_entrega"
  | "numero_entrega"
  | "bairro_entrega"
  | "observacoes"
  | "calculando"
  | "resumo"
  | "concluido";

type Mensagem = { id: string; autor: "bot" | "usuario"; conteudo: ReactNode };

let contadorMensagem = 0;
function proximoId(): string {
  contadorMensagem += 1;
  return `m${contadorMensagem}`;
}

function PedidoChatPage() {
  const { unidade } = Route.useLoaderData();

  const buscarCliente = useServerFn(buscarClientePorCpf);
  const criarClienteFn = useServerFn(criarClienteBasico);
  const calcularResumoFn = useServerFn(calcularResumoPedido);
  const enviarPedidoFn = useServerFn(criarPedido);
  const obterHorariosPublicoFn = useServerFn(obterHorariosPublico);
  const obterSlotsColetaFn = useServerFn(obterSlotsColeta);

  const horariosPublico = useQuery({
    queryKey: ["horarios-publico", unidade.slug],
    queryFn: () => obterHorariosPublicoFn({ data: { slug: unidade.slug } }),
  });
  const precisaEscolherHorario = horariosPublico.data?.atendendoAgora === true;

  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [passo, setPasso] = useState<Passo>("cpf");
  const iniciado = useRef(false);

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
  const [resumo, setResumo] = useState<ResumoPedido | null>(null);
  const [horarioColeta, setHorarioColeta] = useState<string | null>(null);
  const [diaColetaSelecionado, setDiaColetaSelecionado] = useState<string | null>(null);
  const [confirmado, setConfirmado] = useState<{
    data_prevista_retorno: string | null;
    horario_coleta: string | null;
    detalhamento: { rotulo: string; valor: number }[];
    valor_total: number;
  } | null>(null);

  const precisaGradeDeHorarios = precisaEscolherHorario || resumo?.foraDoHorario === true;
  const slotsColeta = useQuery({
    queryKey: ["slots-coleta", unidade.slug, cestos],
    queryFn: () => obterSlotsColetaFn({ data: { slug: unidade.slug, quantidade_cestos: cestos } }),
    enabled: precisaGradeDeHorarios,
    refetchInterval: precisaGradeDeHorarios ? 20_000 : false,
  });

  useEffect(() => {
    if (!horarioColeta || !slotsColeta.data) return;
    const aindaDisponivel = slotsColeta.data.some((dia) =>
      dia.slots.some((slot) => slot.inicioIso === horarioColeta),
    );
    if (!aindaDisponivel) setHorarioColeta(null);
  }, [slotsColeta.data, horarioColeta]);

  useEffect(() => {
    if (!resumo?.foraDoHorario || horarioColeta) return;
    setHorarioColeta(resumo.horarioColetaIso);
    setDiaColetaSelecionado(chaveDiaBoaVista(resumo.horarioColetaIso));
  }, [resumo, horarioColeta]);

  function push(autor: "bot" | "usuario", conteudo: ReactNode) {
    setMensagens((m) => [...m, { id: proximoId(), autor, conteudo }]);
  }

  function avancar(proximo: Passo, perguntaBot: ReactNode) {
    if (perguntaBot) push("bot", perguntaBot);
    setPasso(proximo);
  }

  // Primeira pergunta, assim que a tela monta.
  useEffect(() => {
    if (iniciado.current) return;
    iniciado.current = true;
    push(
      "bot",
      <>
        Oi! Eu sou o assistente de pedidos da <strong>{unidade.nome}</strong>. Pra começar, qual o
        seu CPF?
      </>,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buscaCpfMutation = useMutation({
    mutationFn: (cpfLimpo: string) =>
      buscarCliente({ data: { slug: unidade.slug, cpf: cpfLimpo } }),
    onSuccess: (cliente) => {
      if (cliente && cliente.ultima_rua) {
        setClienteEncontrado(cliente);
        avancar(
          "confirmar_endereco_anterior",
          <>
            Encontrei seu cadastro, {cliente.nome_completo.split(" ")[0]}! Quer usar o mesmo
            endereço de sempre — {cliente.ultima_rua}, {cliente.ultimo_numero} (
            {cliente.ultimo_bairro})?
          </>,
        );
      } else if (cliente) {
        setClienteEncontrado(cliente);
        setNome(cliente.nome_completo);
        setTelefone(cliente.telefone);
        avancar("rua", "Achei seu cadastro, mas ainda não tenho um endereço salvo. Qual a rua?");
      } else {
        setClienteEncontrado(null);
        avancar("nome", "Ainda não te conheço por aqui! Qual seu nome completo?");
      }
    },
    onError: () => push("bot", "Não consegui verificar esse CPF agora. Pode tentar de novo?"),
  });

  const criarClienteMutation = useMutation({
    mutationFn: (dados: { nome: string; telefone: string }) =>
      criarClienteFn({
        data: {
          slug: unidade.slug,
          cpf: soDigitosCpf(cpf),
          nome_completo: dados.nome,
          telefone: dados.telefone,
        },
      }),
    onSuccess: () => avancar("rua", "Show! Agora me diga o endereço de coleta. Qual a rua?"),
    onError: (error: Error) =>
      push("bot", error.message || "Não consegui salvar seus dados. Pode tentar de novo?"),
  });

  const resumoMutation = useMutation({
    mutationFn: () =>
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
          mesmo_endereco_entrega: tipo === "busca_e_entrega" ? mesmoEnderecoEntrega : null,
          rua_entrega: entrega.rua || null,
          numero_entrega: entrega.numero || null,
          bairro_entrega: entrega.bairro || null,
          horario_coleta: horarioColeta ?? undefined,
        },
      }),
    onSuccess: (novoResumo) => {
      setResumo(novoResumo);
      setPasso("resumo");
    },
    onError: () => {
      push("bot", "Não consegui calcular o valor agora. Pode tentar de novo?");
      setPasso("observacoes");
    },
  });

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
          horario_coleta: horarioColeta ?? undefined,
          armadilha: "",
        },
      }),
    onSuccess: (res) => {
      setConfirmado({
        data_prevista_retorno: res.data_prevista_retorno,
        horario_coleta: res.horario_coleta,
        detalhamento: res.detalhamento,
        valor_total: res.valor_total,
      });
      setPasso("concluido");
    },
    onError: (error: Error) =>
      toast.error(error.message || "Não foi possível enviar o pedido. Tente de novo."),
  });

  // ---- Respostas de texto livre --------------------------------------

  const [entradaTexto, setEntradaTexto] = useState("");

  function responderTexto(valorBruto?: string) {
    const valor = (valorBruto ?? entradaTexto).trim();

    switch (passo) {
      case "cpf": {
        if (!isValidCpf(valor)) {
          push("bot", "Esse CPF não parece válido — pode conferir e digitar de novo?");
          return;
        }
        push("usuario", maskCpf(valor));
        setCpf(valor);
        buscaCpfMutation.mutate(soDigitosCpf(valor));
        break;
      }
      case "nome": {
        if (valor.length < 3) {
          push("bot", "Preciso do nome completo, pode escrever de novo?");
          return;
        }
        push("usuario", valor);
        setNome(valor);
        avancar("telefone", "E o telefone, com DDD?");
        break;
      }
      case "telefone": {
        if (valor.replace(/\D/g, "").length < 10) {
          push("bot", "Esse telefone não parece completo — confere o DDD e os números?");
          return;
        }
        push("usuario", maskTelefone(valor));
        setTelefone(valor);
        criarClienteMutation.mutate({ nome, telefone: valor });
        break;
      }
      case "rua": {
        if (!valor) {
          push("bot", "Preciso da rua pra continuar 🙂");
          return;
        }
        push("usuario", valor);
        setColeta((c) => ({ ...c, rua: valor }));
        avancar("numero", "Número?");
        break;
      }
      case "numero": {
        if (!valor) {
          push("bot", "Só o número da casa/apto mesmo, pode mandar?");
          return;
        }
        push("usuario", valor);
        setColeta((c) => ({ ...c, numero: valor }));
        avancar("bairro", "Bairro?");
        break;
      }
      case "bairro": {
        if (!valor) {
          push("bot", "Qual o bairro?");
          return;
        }
        push("usuario", valor);
        setColeta((c) => ({ ...c, bairro: valor }));
        avancar(
          "complemento",
          "Tem complemento — apto, bloco, ponto comercial? Se não tiver, pode pular.",
        );
        break;
      }
      case "complemento": {
        push("usuario", valor || "Pular");
        setColeta((c) => ({ ...c, complemento: valor }));
        avancar("referencia", "Algum ponto de referência? Também pode pular.");
        break;
      }
      case "referencia": {
        push("usuario", valor || "Pular");
        setColeta((c) => ({ ...c, referencia: valor }));
        entrarEmCestos();
        break;
      }
      case "cestos": {
        const n = Number(valor.replace(/\D/g, ""));
        if (!n || n < 1 || n > 50) {
          push("bot", "Me manda só a quantidade de cestos (um número de 1 a 50).");
          return;
        }
        confirmarCestos(n);
        break;
      }
      case "rua_entrega": {
        if (!valor) {
          push("bot", "Qual a rua de entrega?");
          return;
        }
        push("usuario", valor);
        setEntrega((c) => ({ ...c, rua: valor }));
        avancar("numero_entrega", "Número?");
        break;
      }
      case "numero_entrega": {
        if (!valor) {
          push("bot", "Número do endereço de entrega?");
          return;
        }
        push("usuario", valor);
        setEntrega((c) => ({ ...c, numero: valor }));
        avancar("bairro_entrega", "Bairro?");
        break;
      }
      case "bairro_entrega": {
        if (!valor) {
          push("bot", "Bairro da entrega?");
          return;
        }
        push("usuario", valor);
        setEntrega((c) => ({ ...c, bairro: valor }));
        avancar("observacoes", "Quer deixar alguma observação sobre o pedido? Pode pular.");
        break;
      }
      case "observacoes": {
        push("usuario", valor || "Pular");
        setObservacoes(valor);
        push("bot", "Perfeito, só um instante enquanto calculo o valor…");
        setPasso("calculando");
        resumoMutation.mutate();
        break;
      }
      default:
        return;
    }
    setEntradaTexto("");
  }

  function entrarEmCestos() {
    avancar("cestos", "Quantos cestos de roupa? (1 cesto ≈ 25 peças)");
  }

  function confirmarCestos(n: number) {
    push("usuario", `${n} ${n === 1 ? "cesto" : "cestos"}`);
    setCestos(n);
    if (precisaEscolherHorario) {
      avancar("horario", "Qual horário prefere pra coleta?");
    } else {
      avancar("tipo_servico", "E qual tipo de serviço você quer?");
    }
  }

  function confirmarEnderecoAnterior(usar: boolean) {
    if (!clienteEncontrado) return;
    if (usar) {
      push("usuario", "Sim, usar esse endereço");
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
      setTelefone(clienteEncontrado.telefone);
      entrarEmCestos();
    } else {
      push("usuario", "Não, é outro endereço");
      setColeta(enderecoVazio);
      setEntrega(enderecoVazio);
      setMesmoEnderecoEntrega(null);
      setNome(clienteEncontrado.nome_completo);
      setTelefone(clienteEncontrado.telefone);
      avancar("rua", "Sem problemas! Qual a rua?");
    }
  }

  function confirmarHorario() {
    if (!horarioColeta) {
      push("bot", "Escolhe um horário na grade acima pra continuar 🙂");
      return;
    }
    push("usuario", formatarDataHora(horarioColeta));
    avancar("tipo_servico", "E qual tipo de serviço você quer?");
  }

  function confirmarTipoServico(t: TipoServico) {
    push("usuario", TIPO_SERVICO_LABEL[t]);
    setTipo(t);
    if (t === "busca_e_entrega") {
      avancar("mesmo_endereco_entrega", "O endereço de entrega é o mesmo da coleta?");
    } else {
      avancar("observacoes", "Quer deixar alguma observação sobre o pedido? Pode pular.");
    }
  }

  function confirmarMesmoEndereco(mesmo: boolean) {
    push("usuario", mesmo ? "Sim, o mesmo" : "Não, é outro");
    setMesmoEnderecoEntrega(mesmo);
    if (mesmo) {
      avancar("observacoes", "Quer deixar alguma observação sobre o pedido? Pode pular.");
    } else {
      avancar("rua_entrega", "Qual a rua de entrega?");
    }
  }

  function confirmarPedidoFinal() {
    push("usuario", "Confirmar pedido");
    enviarMutation.mutate();
  }

  // ---- Rolagem automática ----------------------------------------------

  const fimRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mensagens, passo]);

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
            <LinhaResumo rotulo="Nome" valor={nome || clienteEncontrado?.nome_completo || ""} />
            <LinhaResumo rotulo="Serviço" valor={TIPO_SERVICO_LABEL[tipo as TipoServico]} />
            <LinhaResumo rotulo="Cestos" valor={String(cestos)} />
            <LinhaResumo
              rotulo={tituloEndereco}
              valor={`${coleta.rua}, ${coleta.numero} — ${coleta.bairro}`}
            />
            {observacoes ? <LinhaResumo rotulo="Observações" valor={observacoes} /> : null}
            {confirmado.horario_coleta ? (
              <LinhaResumo
                rotulo="Horário de coleta"
                valor={formatarDataHora(confirmado.horario_coleta)}
              />
            ) : null}
            {confirmado.data_prevista_retorno ? (
              <LinhaResumo
                rotulo="Previsão de retorno"
                valor={formatarDataHora(confirmado.data_prevista_retorno)}
              />
            ) : null}
          </div>

          <div className="mt-4 space-y-1.5 rounded-xl border bg-card p-5 text-left text-sm shadow-card">
            {confirmado.detalhamento.map((item) => (
              <div key={item.rotulo} className="flex justify-between gap-4">
                <span className="text-muted-foreground">{item.rotulo}</span>
                <span className={item.valor < 0 ? "text-accent" : ""}>
                  {formatarMoeda(item.valor)}
                </span>
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
    <main className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-10 bg-primary px-5 py-4 text-primary-foreground">
        <div className="mx-auto max-w-lg">
          <img
            src="/lavoura-logo-branco.svg"
            alt="Lavoura Lavanderia Self Service"
            className="h-8 w-auto"
          />
          <p className="mt-1 text-sm opacity-90">Pedido de busca e entrega — {unidade.nome}</p>
        </div>
      </header>

      <div className="mx-auto w-full max-w-lg flex-1 space-y-3 px-4 py-5">
        {mensagens.map((m) => (
          <Bolha key={m.id} autor={m.autor}>
            {m.conteudo}
          </Bolha>
        ))}

        {passo === "confirmar_endereco_anterior" ? (
          <RespostasRapidas>
            <BotaoResposta onClick={() => confirmarEnderecoAnterior(true)}>
              Sim, usar esse
            </BotaoResposta>
            <BotaoResposta onClick={() => confirmarEnderecoAnterior(false)}>
              Não, outro endereço
            </BotaoResposta>
          </RespostasRapidas>
        ) : null}

        {passo === "cestos" ? (
          <RespostasRapidas>
            {[1, 2, 3, 4, 5].map((n) => (
              <BotaoResposta key={n} onClick={() => confirmarCestos(n)}>
                {n}
              </BotaoResposta>
            ))}
          </RespostasRapidas>
        ) : null}

        {passo === "horario" ? (
          <Bolha autor="bot">
            <div className="w-full space-y-3">
              <SeletorHorarioColeta
                dias={slotsColeta.data ?? []}
                carregando={slotsColeta.isPending}
                diaSelecionado={diaColetaSelecionado}
                onSelecionarDia={setDiaColetaSelecionado}
                horarioSelecionado={horarioColeta}
                onSelecionarHorario={setHorarioColeta}
              />
              <Button
                size="sm"
                onClick={confirmarHorario}
                className="bg-accent text-accent-foreground hover:bg-accent/90"
              >
                Confirmar horário
              </Button>
            </div>
          </Bolha>
        ) : null}

        {passo === "tipo_servico" ? (
          <RespostasRapidas>
            {(["busca", "entrega", "busca_e_entrega"] as TipoServico[]).map((t) => (
              <BotaoResposta key={t} onClick={() => confirmarTipoServico(t)}>
                {TIPO_SERVICO_LABEL[t]}
              </BotaoResposta>
            ))}
          </RespostasRapidas>
        ) : null}

        {passo === "mesmo_endereco_entrega" ? (
          <RespostasRapidas>
            <BotaoResposta onClick={() => confirmarMesmoEndereco(true)}>Sim, o mesmo</BotaoResposta>
            <BotaoResposta onClick={() => confirmarMesmoEndereco(false)}>
              Não, é outro
            </BotaoResposta>
          </RespostasRapidas>
        ) : null}

        {passo === "calculando" ? (
          <Bolha autor="bot">
            <span className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" /> Calculando…
            </span>
          </Bolha>
        ) : null}

        {passo === "resumo" && resumo ? (
          <Bolha autor="bot">
            <div className="w-full space-y-3">
              {resumo.deliveryMensagemErro ? (
                <p className="rounded-lg bg-secondary p-2 text-xs text-muted-foreground">
                  {resumo.deliveryMensagemErro}
                </p>
              ) : null}
              <div className="space-y-1.5 rounded-xl border bg-card p-3 text-sm">
                {resumo.detalhamento.map((item) => (
                  <div key={item.rotulo} className="flex justify-between gap-4">
                    <span className="text-muted-foreground">{item.rotulo}</span>
                    <span className={item.valor < 0 ? "text-accent" : ""}>
                      {formatarMoeda(item.valor)}
                    </span>
                  </div>
                ))}
                <div className="mt-2 flex justify-between border-t pt-2 font-medium">
                  <span>Total estimado</span>
                  <span>{formatarMoeda(resumo.valorTotal)}</span>
                </div>
              </div>

              {resumo.foraDoHorario ? (
                <div className="space-y-2 rounded-xl border-2 border-accent bg-accent/10 p-3">
                  <p className="text-sm font-medium text-accent">
                    Estamos fora do horário de atendimento agora — escolha o horário de coleta:
                  </p>
                  <SeletorHorarioColeta
                    dias={slotsColeta.data ?? []}
                    carregando={slotsColeta.isPending}
                    diaSelecionado={diaColetaSelecionado}
                    onSelecionarDia={setDiaColetaSelecionado}
                    horarioSelecionado={horarioColeta}
                    onSelecionarHorario={setHorarioColeta}
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Horário de coleta: {formatarDataHora(resumo.horarioColetaIso)}
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                Previsão de retorno: {formatarDataHora(resumo.previstoIso)}
              </p>

              <Button
                onClick={confirmarPedidoFinal}
                disabled={enviarMutation.isPending || (resumo.foraDoHorario && !horarioColeta)}
                className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
              >
                {enviarMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Confirmar pedido
              </Button>
            </div>
          </Bolha>
        ) : null}

        <div ref={fimRef} />
      </div>

      {ehPassoDeTexto(passo) ? (
        <div className="sticky bottom-0 border-t bg-card px-4 py-3">
          <div className="mx-auto flex max-w-lg items-center gap-2">
            <Input
              autoFocus
              value={entradaTexto}
              onChange={(e) =>
                setEntradaTexto(
                  passo === "cpf"
                    ? maskCpf(e.target.value)
                    : passo === "telefone"
                      ? maskTelefone(e.target.value)
                      : e.target.value,
                )
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") responderTexto();
              }}
              placeholder={placeholderDoPasso(passo)}
              disabled={buscaCpfMutation.isPending || criarClienteMutation.isPending}
            />
            {ehOpcional(passo) ? (
              <Button variant="outline" onClick={() => responderTexto("")}>
                Pular
              </Button>
            ) : null}
            <Button
              size="icon"
              onClick={() => responderTexto()}
              disabled={buscaCpfMutation.isPending || criarClienteMutation.isPending}
              className="shrink-0 bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {buscaCpfMutation.isPending || criarClienteMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <SendHorizontal className="size-4" />
              )}
            </Button>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function ehPassoDeTexto(passo: Passo): boolean {
  return [
    "cpf",
    "nome",
    "telefone",
    "rua",
    "numero",
    "bairro",
    "complemento",
    "referencia",
    "cestos",
    "rua_entrega",
    "numero_entrega",
    "bairro_entrega",
    "observacoes",
  ].includes(passo);
}

function ehOpcional(passo: Passo): boolean {
  return passo === "complemento" || passo === "referencia" || passo === "observacoes";
}

function placeholderDoPasso(passo: Passo): string {
  switch (passo) {
    case "cpf":
      return "000.000.000-00";
    case "nome":
      return "Nome completo";
    case "telefone":
      return "(00) 00000-0000";
    case "cestos":
      return "Quantidade de cestos";
    case "complemento":
      return "Complemento (opcional)";
    case "referencia":
      return "Ponto de referência (opcional)";
    case "observacoes":
      return "Observações (opcional)";
    default:
      return "Digite aqui…";
  }
}

function Bolha({ autor, children }: { autor: "bot" | "usuario"; children: ReactNode }) {
  const doUsuario = autor === "usuario";
  return (
    <div className={`flex ${doUsuario ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
          doUsuario
            ? "rounded-br-sm bg-accent text-accent-foreground"
            : "rounded-bl-sm bg-secondary text-secondary-foreground"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function RespostasRapidas({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap justify-end gap-2">{children}</div>;
}

function BotaoResposta({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-accent bg-accent/10 px-4 py-2 text-sm font-medium text-accent-foreground transition hover:bg-accent/20"
    >
      {children}
    </button>
  );
}

function LinhaResumo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-4 border-b pb-2 last:border-0 last:pb-0">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="text-right font-medium">{valor}</span>
    </div>
  );
}

/** "2026-08-10" -> "seg. 10/08" (dia da semana abreviado + dia/mês). */
function rotuloDiaColeta(dia: DiaColetaPublico): string {
  const [, mes, diaDoMes] = dia.data.split("-");
  const nomeDia = DIA_SEMANA_LABEL[dia.diaSemana]?.slice(0, 3).toLowerCase() ?? "";
  return `${nomeDia}. ${diaDoMes}/${mes}`;
}

function SeletorHorarioColeta({
  dias,
  carregando,
  diaSelecionado,
  onSelecionarDia,
  horarioSelecionado,
  onSelecionarHorario,
}: {
  dias: DiaColetaPublico[];
  carregando: boolean;
  diaSelecionado: string | null;
  onSelecionarDia: (data: string) => void;
  horarioSelecionado: string | null;
  onSelecionarHorario: (horarioIso: string) => void;
}) {
  if (carregando) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Carregando horários disponíveis…
      </p>
    );
  }

  if (dias.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Não há horários de coleta disponíveis no momento. Volte em instantes ou fale com a unidade.
      </p>
    );
  }

  const diaAtual = dias.find((d) => d.data === diaSelecionado) ?? dias[0]!;

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {dias.map((dia) => (
          <button
            key={dia.data}
            type="button"
            onClick={() => onSelecionarDia(dia.data)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              dia.data === diaAtual.data
                ? "border-accent bg-accent/10 text-accent-foreground"
                : "bg-card hover:bg-secondary"
            }`}
          >
            {rotuloDiaColeta(dia)}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {diaAtual.slots.map((slot) => (
          <button
            key={slot.inicioIso}
            type="button"
            onClick={() => onSelecionarHorario(slot.inicioIso)}
            className={`rounded-lg border py-2 text-sm transition ${
              slot.inicioIso === horarioSelecionado
                ? "border-accent bg-accent/10 font-medium"
                : "bg-card hover:bg-secondary"
            }`}
          >
            {horaCurta(slot.horaLocal)}
          </button>
        ))}
      </div>
    </div>
  );
}
