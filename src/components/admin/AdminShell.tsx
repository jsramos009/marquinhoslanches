import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard,
  ClipboardList,
  Users,
  LogOut,
  Package,
  BookOpen,
  Truck,
  Settings,
  BarChart3,
  Bike,
  UserRound,
  Printer,
} from "lucide-react";

type Item = { to: string; label: string; icon: ReactNode; adminOnly?: boolean };

const ITEMS: Item[] = [
  { to: "/admin/dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} /> },
  { to: "/admin/pedidos", label: "Pedidos", icon: <ClipboardList size={18} /> },
  { to: "/admin/impressao", label: "Impressão", icon: <Printer size={18} /> },
  { to: "/admin/arquivados", label: "Relatórios", icon: <BarChart3 size={18} /> },
  { to: "/admin/clientes", label: "Clientes", icon: <UserRound size={18} /> },
  { to: "/admin/entregadores", label: "Entregadores", icon: <Bike size={18} /> },
  { to: "/admin/estoque", label: "Estoque", icon: <Package size={18} /> },
  { to: "/admin/catalogo", label: "Catálogo", icon: <BookOpen size={18} />, adminOnly: true },
  { to: "/admin/frete", label: "Frete", icon: <Truck size={18} />, adminOnly: true },
  { to: "/admin/configuracoes", label: "Configurações", icon: <Settings size={18} />, adminOnly: true },
  { to: "/admin/usuarios", label: "Acessos", icon: <Users size={18} />, adminOnly: true },
];

export function AdminShell({
  user,
  roles,
  title,
  actions,
  children,
}: {
  user: { email?: string };
  roles: string[];
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [signingOut, setSigningOut] = useState(false);
  const isAdmin = roles.includes("admin");

  async function signOut() {
    setSigningOut(true);
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="h-screen w-screen bg-background text-foreground overflow-hidden">
      <div className="flex h-full w-full">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-card/40 p-4 md:flex">
          <div className="mb-6 px-2">
            <p className="font-display text-lg text-primary">Marquinhos</p>
            <p className="text-xs text-muted-foreground">Painel</p>
          </div>
          <nav className="flex flex-1 flex-col gap-1">
            {ITEMS.filter((i) => !i.adminOnly || isAdmin).map((i) => {
              const active = pathname.startsWith(i.to);
              return (
                <Link
                  key={i.to}
                  to={i.to}
                  preload="intent"
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                    active
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  }`}
                >
                  {i.icon}
                  <span>{i.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="mt-4 border-t border-border pt-4">
            <p className="px-2 text-xs text-muted-foreground truncate" title={user.email}>
              {user.email}
            </p>
            <button
              onClick={signOut}
              disabled={signingOut}
              className="mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-secondary/60 hover:text-foreground disabled:opacity-60"
            >
              <LogOut size={16} /> {signingOut ? "Saindo…" : "Sair"}
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile top bar */}
          <div className="flex items-center gap-2 overflow-x-auto border-b border-border bg-card/40 px-4 py-2 md:hidden">
            {ITEMS.filter((i) => !i.adminOnly || isAdmin).map((i) => {
              const active = pathname.startsWith(i.to);
              return (
                <Link
                  key={i.to}
                  to={i.to}
                  preload="intent"
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs ${
                    active ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"
                  }`}
                >
                  {i.icon}
                  {i.label}
                </Link>
              );
            })}
            <button
              onClick={signOut}
              className="ml-auto shrink-0 rounded-full bg-secondary px-3 py-1.5 text-xs"
            >
              Sair
            </button>
          </div>

          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-5">
            <h1 className="font-display text-2xl text-primary">{title}</h1>
            <div className="flex items-center gap-2">{actions}</div>
          </header>

          <main className="flex-1 overflow-y-auto px-5 py-6">{children}</main>
        </div>
      </div>
    </div>
  );
}

export const formatBRL = (v: number) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
