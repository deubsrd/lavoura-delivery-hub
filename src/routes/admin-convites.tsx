import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Loader2 } from "lucide-react";

import { listarConvites, type ConviteUnidade } from "@/lib/admin.functions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin-convites")({
  head: () => ({
    meta: [{ title: "Códigos de convite — Lavoura" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminConvitesPage,
});

function AdminConvitesPage() {
  const buscar = useServerFn(listarConvites);
  const [senha, setSenha] = useState("");

  const mutation = useMutation({
    mutationFn: (senha: string) => buscar({ data: { senha } }),
  });

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    mutation.mutate(senha);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-primary px-5 py-10">
      <div className="w-full max-w-lg rounded-2xl bg-card p-7 shadow-card">
        <div className="flex items-center gap-2">
          <KeyRound className="size-6 text-accent" />
          <h1 className="text-3xl">Códigos de convite</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Repasse manualmente o código de cada unidade à atendente correspondente.
        </p>

        <form onSubmit={onSubmit} className="mt-6 flex items-end gap-2">
          <div className="flex-1 space-y-1.5">
            <Label>Senha de administrador</Label>
            <Input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="off"
              required
            />
          </div>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Ver códigos
          </Button>
        </form>

        {mutation.isError ? (
          <p className="mt-4 text-sm text-destructive">
            {mutation.error instanceof Error ? mutation.error.message : "Não foi possível carregar."}
          </p>
        ) : null}

        {mutation.isSuccess ? <ListaConvites unidades={mutation.data} /> : null}
      </div>
    </main>
  );
}

function ListaConvites({ unidades }: { unidades: ConviteUnidade[] }) {
  if (unidades.length === 0) {
    return <p className="mt-6 text-sm text-muted-foreground">Nenhuma unidade cadastrada.</p>;
  }
  return (
    <table className="mt-6 w-full text-sm">
      <thead>
        <tr className="border-b text-left text-muted-foreground">
          <th className="pb-2 font-medium">Unidade</th>
          <th className="pb-2 font-medium">Código</th>
        </tr>
      </thead>
      <tbody>
        {unidades.map((u) => (
          <tr key={u.nome + u.codigo_convite} className="border-b last:border-0">
            <td className="py-2">
              {u.nome} <span className="text-muted-foreground">· {u.cidade}</span>
            </td>
            <td className="py-2 font-mono font-medium tracking-wide">{u.codigo_convite}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
