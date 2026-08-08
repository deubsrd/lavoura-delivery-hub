import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { useAtendenteAdmin } from "@/hooks/use-atendente-admin";
import { AcessoRestrito } from "@/components/acesso-restrito";
import { PaginaHeader } from "@/components/pagina-header";
import { exportarClientes, listarClientes, type ClienteListado } from "@/lib/clientes.functions";
import { maskCpf } from "@/lib/cpf";
import { maskTelefone } from "@/lib/lavoura";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/clientes")({
  head: () => ({
    meta: [{ title: "Clientes — Lavoura" }, { name: "robots", content: "noindex" }],
  }),
  component: ClientesPage,
});

function ClientesPage() {
  const atendente = useAtendenteAdmin();

  if (atendente.isLoading) {
    return <main className="p-8 text-center text-sm text-muted-foreground">Carregando…</main>;
  }
  if (!atendente.souAdmin) return <AcessoRestrito />;

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-5 py-8">
      <PaginaHeader titulo="Clientes" />
      <SecaoClientes />
    </main>
  );
}

/** "2026-08-11T13:00:00.000Z" -> "11/08/2026" */
function formatarData(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Boa_Vista" });
}

function paraCsv(linhas: ClienteListado[]): string {
  const cabecalho = ["Nome", "Telefone", "CPF", "Total de compras", "Cadastro", "Última compra"];
  const escapar = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const corpo = linhas.map((c) =>
    [
      c.nome_completo,
      maskTelefone(c.telefone),
      maskCpf(c.cpf),
      String(c.total_compras),
      formatarData(c.created_at),
      c.ultima_compra ? formatarData(c.ultima_compra) : "",
    ]
      .map(escapar)
      .join(","),
  );
  return [cabecalho.map(escapar).join(","), ...corpo].join("\n");
}

// BOM na frente do CSV: sem ele, o Excel abre acentos/ç quebrados ao dar
// duplo-clique no arquivo baixado (não detecta UTF-8 sem BOM). Via
// fromCharCode em vez do caractere literal, que o lint marca como
// "irregular whitespace".
const BOM_UTF8 = String.fromCharCode(0xfeff);

function baixarCsv(conteudo: string, nomeArquivo: string) {
  const blob = new Blob([BOM_UTF8 + conteudo], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  link.click();
  URL.revokeObjectURL(url);
}

function SecaoClientes() {
  const listarClientesFn = useServerFn(listarClientes);
  const exportarClientesFn = useServerFn(exportarClientes);

  const [buscaInput, setBuscaInput] = useState("");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(0);
  const [exportando, setExportando] = useState(false);

  const clientesQuery = useQuery({
    queryKey: ["clientes", busca, pagina],
    queryFn: () => listarClientesFn({ data: { busca: busca || undefined, pagina } }),
  });

  function buscar() {
    setBusca(buscaInput.trim());
    setPagina(0);
  }

  async function exportar() {
    setExportando(true);
    try {
      const linhas = await exportarClientesFn({ data: { busca: busca || undefined } });
      if (linhas.length === 0) {
        toast.info("Nenhum cliente para exportar com esse filtro.");
        return;
      }
      baixarCsv(paraCsv(linhas), `clientes-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível exportar.");
    } finally {
      setExportando(false);
    }
  }

  const total = clientesQuery.data?.total ?? 0;
  const paginaTamanho = clientesQuery.data?.paginaTamanho ?? 50;
  const totalPaginas = Math.max(1, Math.ceil(total / paginaTamanho));

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:max-w-xs">
        <div className="rounded-xl border bg-card p-4 shadow-card">
          <p className="text-xs text-muted-foreground">Total de clientes</p>
          <p className="mt-1 text-2xl font-medium">{total}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={buscaInput}
          onChange={(e) => setBuscaInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && buscar()}
          placeholder="Nome, CPF ou telefone"
          className="max-w-xs"
        />
        <Button variant="outline" onClick={buscar}>
          <Search className="size-4" /> Buscar
        </Button>
        <Button variant="outline" onClick={exportar} disabled={exportando} className="ml-auto">
          {exportando ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          Exportar
        </Button>
      </div>

      {clientesQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : clientesQuery.data && clientesQuery.data.clientes.length > 0 ? (
        <>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Nome</th>
                  <th className="px-3 py-2 font-medium">Telefone</th>
                  <th className="px-3 py-2 font-medium">CPF</th>
                  <th className="px-3 py-2 font-medium">Compras</th>
                  <th className="px-3 py-2 font-medium">Cadastro</th>
                  <th className="px-3 py-2 font-medium">Última compra</th>
                </tr>
              </thead>
              <tbody>
                {clientesQuery.data.clientes.map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="px-3 py-2 font-medium">{c.nome_completo}</td>
                    <td className="px-3 py-2 text-muted-foreground">{maskTelefone(c.telefone)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{maskCpf(c.cpf)}</td>
                    <td className="px-3 py-2">{c.total_compras}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {formatarData(c.created_at)}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {c.ultima_compra ? formatarData(c.ultima_compra) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Página {pagina + 1} de {totalPaginas}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagina((p) => Math.max(0, p - 1))}
                disabled={pagina === 0}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
                disabled={pagina + 1 >= totalPaginas}
              >
                Próxima
              </Button>
            </div>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhum cliente encontrado.</p>
      )}
    </section>
  );
}
