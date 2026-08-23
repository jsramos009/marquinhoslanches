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
  Menu,
  Plus,
} from "lucide-react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { CashSessionControl } from "@/components/admin/CashSessionControl";

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
  {
    to: "/admin/configuracoes",
    label: "Configurações",
    icon: <Settings size={18} />,
    adminOnly: true,
  },
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
          <MobileTopBar
            isAdmin={isAdmin}
            pathname={pathname}
            signingOut={signingOut}
            onSignOut={signOut}
          />

          <header className="flex min-w-0 flex-col gap-3 border-b border-border px-3 py-4 sm:px-5 md:flex-row md:items-center md:justify-between md:py-5">
            <h1 className="font-display text-xl text-primary sm:text-2xl">{title}</h1>
            {actions && (
              <div className="flex w-full min-w-0 items-center gap-2 overflow-x-auto pb-1 md:w-auto md:overflow-visible md:pb-0">
                {actions}
              </div>
            )}
          </header>

          <main className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-28 pt-4 sm:px-5 md:py-6">
            {children}
          </main>

          <MobileActionDock isAdmin={isAdmin} pathname={pathname} />
        </div>
      </div>
    </div>
  );
}

function MobileTopBar({
  isAdmin,
  pathname,
  signingOut,
  onSignOut,
}: {
  isAdmin: boolean;
  pathname: string;
  signingOut: boolean;
  onSignOut: () => void;
}) {
  return (
    <div className="flex h-14 items-center justify-between border-b border-border bg-card/60 px-3 md:hidden">
      <div className="min-w-0">
        <p className="truncate font-display text-base text-primary">Marquinhos</p>
        <p className="text-[11px] text-muted-foreground">Painel administrativo</p>
      </div>

      <Sheet>
        <SheetTrigger asChild>
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-semibold"
            aria-label="Abrir menu do painel"
          >
            <Menu size={18} /> Menu
          </button>
        </SheetTrigger>
        <SheetContent side="right" className="w-[88vw] max-w-sm overflow-y-auto p-4">
          <SheetHeader className="pr-8 text-left">
            <SheetTitle className="font-display text-primary">Navegação</SheetTitle>
            <SheetDescription>Acesse todas as áreas do sistema.</SheetDescription>
          </SheetHeader>
          <nav className="mt-5 grid gap-1.5">
            {ITEMS.filter((i) => !i.adminOnly || isAdmin).map((item) => {
              const active = pathname.startsWith(item.to);
              return (
                <SheetClose asChild key={item.to}>
                  <Link
                    to={item.to}
                    preload="intent"
                    className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </Link>
                </SheetClose>
              );
            })}
          </nav>
          <div className="mt-5 border-t border-border pt-4">
            <button
              type="button"
              onClick={onSignOut}
              disabled={signingOut}
              className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-60"
            >
              <LogOut size={18} /> {signingOut ? "Saindo…" : "Sair do painel"}
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function MobileActionDock({ isAdmin, pathname }: { isAdmin: boolean; pathname: string }) {
  const quickItems = [ITEMS[0], ITEMS[1], ITEMS[2], isAdmin ? ITEMS[7] : ITEMS[4]];

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 px-1 pb-2 pt-1 shadow-[0_-12px_30px_rgba(0,0,0,0.18)] backdrop-blur md:hidden">
      <div className="mx-auto grid max-w-md grid-cols-5 items-end">
        {quickItems.slice(0, 2).map((item) => (
          <QuickLink key={item.to} item={item} active={pathname.startsWith(item.to)} />
        ))}

        <Sheet>
          <SheetTrigger asChild>
            <button
              type="button"
              className="group mx-auto -mt-7 flex w-16 flex-col items-center gap-1 text-[10px] font-semibold text-primary"
              aria-label="Abrir ações rápidas"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-background bg-primary text-primary-foreground shadow-lg transition group-active:scale-95">
                <Plus size={28} strokeWidth={2.5} />
              </span>
              Ações
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-7 pt-5">
            <SheetHeader className="text-left">
              <SheetTitle className="font-display text-primary">Ações rápidas</SheetTitle>
              <SheetDescription>Registre um pedido ou controle o caixa.</SheetDescription>
            </SheetHeader>
            <div className="mt-5 grid gap-3">
              <SheetClose asChild>
                <Link
                  to="/admin/novo-pedido"
                  search={{ editId: undefined }}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
                >
                  <ClipboardList size={19} /> Lançar pedido
                </Link>
              </SheetClose>
              <CashSessionControl className="min-h-12 w-full rounded-xl" />
            </div>
          </SheetContent>
        </Sheet>

        {quickItems.slice(2).map((item) => (
          <QuickLink key={item.to} item={item} active={pathname.startsWith(item.to)} />
        ))}
      </div>
    </div>
  );
}

function QuickLink({ item, active }: { item: Item; active: boolean }) {
  return (
    <Link
      to={item.to}
      preload="intent"
      className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[10px] font-medium transition ${
        active ? "text-primary" : "text-muted-foreground"
      }`}
    >
      {item.icon}
      <span className="max-w-full truncate">{item.label}</span>
    </Link>
  );
}

export const formatBRL = (v: number) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
