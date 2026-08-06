import { SidebarTrigger } from "@/components/ui/sidebar";

/** Cabeçalho padrão das páginas admin novas: botão de abrir o menu + título. */
export function PaginaHeader({ titulo }: { titulo: string }) {
  return (
    <div className="flex items-center gap-2">
      <SidebarTrigger className="-ml-1.5" />
      <h1 className="text-3xl">{titulo}</h1>
    </div>
  );
}
