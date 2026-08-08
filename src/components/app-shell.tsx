import { Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { KanbanSquare, LayoutDashboard, LogOut, Settings2, Users } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAtendenteAdmin } from "@/hooks/use-atendente-admin";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
} from "@/components/ui/sidebar";

const CAMINHOS_CONFIGURACOES = [
  "/configuracoes/identificacao",
  "/configuracoes/endereco",
  "/admin-precos",
  "/configuracoes/convites",
];

/**
 * Shell da área autenticada. Atendentes sem role admin veem exatamente o
 * comportamento de hoje (Outlet puro, sem menu). Admins ganham um menu
 * lateral com Pedidos / Dashboard / Configurações da unidade.
 */
export function AppShell() {
  const atendente = useAtendenteAdmin();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  if (atendente.isLoading || !atendente.souAdmin) {
    return <Outlet />;
  }

  async function sair() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <SidebarProvider>
      <Sidebar collapsible="offcanvas">
        <SidebarHeader>
          <img
            src="/lavoura-logo-branco.svg"
            alt="Lavoura Lavanderia Self Service"
            className="h-6 w-auto px-2 py-1"
          />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === "/painel"}>
                    <Link to="/painel">
                      <KanbanSquare /> Pedidos
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === "/dashboard"}>
                    <Link to="/dashboard">
                      <LayoutDashboard /> Dashboard
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === "/clientes"}>
                    <Link to="/clientes">
                      <Users /> Clientes
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive={CAMINHOS_CONFIGURACOES.includes(pathname)}>
                    <Settings2 /> Configurações da unidade
                  </SidebarMenuButton>
                  <SidebarMenuSub>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton
                        asChild
                        isActive={pathname === "/configuracoes/identificacao"}
                      >
                        <Link to="/configuracoes/identificacao">Identificação</Link>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton asChild isActive={pathname === "/configuracoes/endereco"}>
                        <Link to="/configuracoes/endereco">Endereço</Link>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton asChild isActive={pathname === "/admin-precos"}>
                        <Link to="/admin-precos">Preços</Link>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton asChild isActive={pathname === "/configuracoes/convites"}>
                        <Link to="/configuracoes/convites">Convites</Link>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  </SidebarMenuSub>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={sair}>
                <LogOut /> Sair
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}
