export function AcessoRestrito() {
  return (
    <main className="mx-auto mt-16 max-w-md px-5 text-center">
      <h1 className="text-2xl">Acesso restrito</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Só administradores da unidade podem acessar esta página.
      </p>
    </main>
  );
}
