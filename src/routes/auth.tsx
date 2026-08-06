import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";

import { supabase } from "@/integrations/supabase/client";
import { validarCodigoConvite } from "@/lib/atendentes.functions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Acesso da equipe — Lavoura" },
      {
        name: "description",
        content:
          "Entre com seu e-mail e senha para gerenciar a fila de pedidos da sua unidade Lavoura.",
      },
      { property: "og:title", content: "Acesso da equipe — Lavoura" },
      { property: "og:description", content: "Área interna das atendentes da rede Lavoura." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
  errorComponent: () => (
    <main className="flex min-h-screen items-center justify-center px-5 text-center">
      <p className="text-sm text-muted-foreground">
        Não conseguimos carregar a tela de acesso. Tente novamente.
      </p>
    </main>
  ),
});

function AuthPage() {
  const navigate = useNavigate();
  const validarConvite = useServerFn(validarCodigoConvite);
  const [modo, setModo] = useState<"entrar" | "cadastrar">("entrar");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [codigoConvite, setCodigoConvite] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [avisoEmail, setAvisoEmail] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/painel", replace: true });
    });
  }, [navigate]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setCarregando(true);

    if (modo === "entrar") {
      const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
      setCarregando(false);
      if (error) {
        toast.error("E-mail ou senha incorretos.");
        return;
      }
      navigate({ to: "/painel", replace: true });
      return;
    }

    const codigo = codigoConvite.trim();
    if (!codigo) {
      setCarregando(false);
      toast.error("Informe o código de convite da sua unidade.");
      return;
    }

    try {
      const valido = await validarConvite({ data: { codigo } });
      if (!valido) {
        setCarregando(false);
        toast.error("Código de convite inválido. Confira o código com o responsável da sua unidade.");
        return;
      }
    } catch {
      setCarregando(false);
      toast.error("Não foi possível validar o código de convite agora.");
      return;
    }
    const { data: unidadeId, error: codigoErr } = await supabase.rpc(
      "unidade_por_codigo_convite",
      { codigo },
    );
    if (codigoErr || !unidadeId) {
      setCarregando(false);
      toast.error("Código de convite inválido. Confira com o responsável da sua unidade.");
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: {
        emailRedirectTo: window.location.origin + "/painel",
        data: { nome, codigo_convite: codigo },
      },
    });
    setCarregando(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data.session) {
      setAvisoEmail(true);
      return;
    }
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
        <h1 className="mt-2 text-3xl">Painel da unidade</h1>
        <p className="mt-1 text-sm text-muted-foreground">Acesso restrito à equipe.</p>

        {avisoEmail ? (
          <p className="mt-6 rounded-lg bg-secondary p-3 text-sm">
            Enviamos um e-mail de confirmação. Confirme o endereço para acessar o painel.
          </p>
        ) : (
          <>
            <div className="mt-6 flex gap-2 rounded-lg bg-secondary p-1">
              {(["entrar", "cadastrar"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setModo(m)}
                  className={`flex-1 rounded-md py-1.5 text-sm transition ${
                    modo === m ? "bg-card font-medium shadow-card" : "text-muted-foreground"
                  }`}
                >
                  {m === "entrar" ? "Entrar" : "Criar acesso"}
                </button>
              ))}
            </div>

            <form onSubmit={onSubmit} className="mt-5 space-y-4">
              {modo === "cadastrar" ? (
                <>
                  <div className="space-y-1.5">
                    <Label>Seu nome</Label>
                    <Input value={nome} onChange={(e) => setNome(e.target.value)} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Código de convite</Label>
                    <Input
                      value={codigoConvite}
                      onChange={(e) => setCodigoConvite(e.target.value.toUpperCase())}
                      placeholder="Recebido da sua unidade"
                      autoCapitalize="characters"
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Peça o código à responsável da sua unidade Lavoura.
                    </p>
                  </div>
                </>
              ) : null}

              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Senha</Label>
                <Input
                  type="password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  autoComplete={modo === "entrar" ? "current-password" : "new-password"}
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
                {modo === "entrar" ? "Entrar" : "Criar acesso"}
              </Button>
            </form>
          </>
        )}

        <Link to="/" className="mt-6 block text-center text-xs text-muted-foreground underline">
          Voltar ao site
        </Link>
      </div>
    </main>
  );
}
