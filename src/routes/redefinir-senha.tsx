import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/redefinir-senha")({
  head: () => ({
    meta: [{ title: "Redefinir senha — Lavoura" }, { name: "robots", content: "noindex" }],
  }),
  component: RedefinirSenhaPage,
});

function RedefinirSenhaPage() {
  const navigate = useNavigate();
  const [verificando, setVerificando] = useState(true);
  const [linkValido, setLinkValido] = useState(false);
  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    // O link do e-mail de recuperação carrega um token na própria URL; o
    // client do Supabase detecta isso sozinho ao inicializar e dispara o
    // evento PASSWORD_RECOVERY com uma sessão temporária válida só para
    // trocar a senha.
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setLinkValido(true);
        setVerificando(false);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setLinkValido(true);
      setVerificando(false);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (senha.length < 6) {
      toast.error("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (senha !== confirmarSenha) {
      toast.error("As senhas não coincidem.");
      return;
    }
    setCarregando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setCarregando(false);
    if (error) {
      toast.error("Não foi possível redefinir a senha. Solicite um novo link.");
      return;
    }
    toast.success("Senha redefinida com sucesso.");
    navigate({ to: "/painel", replace: true });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-primary px-5 py-10">
      <div className="w-full max-w-sm rounded-2xl bg-card p-7 shadow-card">
        <img
          src="/lavoura-logo-verde.svg"
          alt="Lavoura Lavanderia Self Service"
          className="h-9 w-auto"
        />

        {verificando ? (
          <div className="mt-8 flex justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : !linkValido ? (
          <>
            <h1 className="mt-2 text-3xl">Link inválido ou expirado</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Solicite um novo link de recuperação de senha.
            </p>
            <Link to="/auth" className="mt-6 block text-center text-sm font-medium underline">
              Voltar para o acesso
            </Link>
          </>
        ) : (
          <>
            <h1 className="mt-2 text-3xl">Nova senha</h1>
            <p className="mt-1 text-sm text-muted-foreground">Escolha uma nova senha de acesso.</p>
            <form onSubmit={onSubmit} className="mt-5 space-y-4">
              <div className="space-y-1.5">
                <Label>Nova senha</Label>
                <Input
                  type="password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Confirmar nova senha</Label>
                <Input
                  type="password"
                  value={confirmarSenha}
                  onChange={(e) => setConfirmarSenha(e.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </div>
              <Button
                type="submit"
                disabled={carregando}
                className="h-11 w-full bg-accent text-accent-foreground hover:bg-accent/90"
              >
                {carregando ? <Loader2 className="size-4 animate-spin" /> : null}
                Salvar nova senha
              </Button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
