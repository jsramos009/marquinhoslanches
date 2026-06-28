import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/pedidos")({
  component: PedidosPlaceholder,
  head: () => ({
    meta: [
      { title: "Pedidos do dia — Marquinhos" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function PedidosPlaceholder() {
  const { user, roles } = Route.useRouteContext() as {
    user: { email?: string };
    roles: string[];
  };
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    // smoke test: confirm we can hit user_roles under RLS
    supabase.from("user_roles").select("role").then(({ data, error }) => {
      if (error) console.warn("user_roles read", error);
      else console.info("user_roles OK", data);
    });
  }, []);

  async function signOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background px-5 py-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl text-primary">Pedidos do dia</h1>
            <p className="text-sm text-muted-foreground">
              Logado como <strong className="text-foreground">{user?.email}</strong>{" "}
              {roles.length > 0 && (
                <span className="ml-1 rounded-full bg-secondary px-2 py-0.5 text-xs uppercase tracking-wide">
                  {roles.join(", ")}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {roles.includes("admin") && (
              <Link
                to="/admin/usuarios"
                className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-secondary"
              >
                Acessos
              </Link>
            )}
            <button
              onClick={signOut}
              disabled={signingOut}
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-secondary"
            >
              Sair
            </button>
          </div>
        </header>

        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-base text-foreground">Fase 1 concluída ✅</p>
          <p className="mt-2 text-sm text-muted-foreground">
            A tela de pedidos do dia (com cards, status e tempo real) será montada na Fase 2.
          </p>
        </div>
      </div>
    </div>
  );
}