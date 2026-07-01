import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getMyPanelAccess, type PanelAccess } from "@/lib/access.functions";

function panelAccessFromRows(rows: { role: string; status: string }[]): PanelAccess {
  const approved = rows.filter((r) => r.status === "approved");
  const roles = approved.map((r) => r.role);
  let accessStatus: PanelAccess["accessStatus"] = "none";
  if (approved.length > 0) accessStatus = "approved";
  else if (rows.some((r) => r.status === "pending")) accessStatus = "pending";
  else if (rows.some((r) => r.status === "rejected")) accessStatus = "rejected";
  return { roles, accessStatus };
}

const ACCESS_CACHE_TTL_MS = 60_000;
let accessCache:
  | { userId: string; access: PanelAccess; expiresAt: number }
  | undefined;

async function loadPanelAccess(userId: string): Promise<PanelAccess> {
  if (accessCache?.userId === userId && accessCache.expiresAt > Date.now()) {
    return accessCache.access;
  }

  try {
    const { data: rows, error } = await supabase
      .from("user_roles")
      .select("role, status")
      .eq("user_id", userId);
    if (error) throw error;
    const access = panelAccessFromRows(rows ?? []);
    accessCache = { userId, access, expiresAt: Date.now() + ACCESS_CACHE_TTL_MS };
    return access;
  } catch (err) {
    console.warn("[auth] direct user_roles query failed, falling back to server check", err);
    try {
      const access = await getMyPanelAccess();
      accessCache = { userId, access, expiresAt: Date.now() + ACCESS_CACHE_TTL_MS };
      return access;
    } catch (fallbackErr) {
      console.error("[auth] server access check failed", fallbackErr);
      return { roles: [], accessStatus: "none" };
    }
  }
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data: sessionData } = await supabase.auth.getSession();
    let user = sessionData.session?.user ?? null;

    if (!user) {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        throw redirect({
          to: "/auth",
          search: { redirect: location.href },
        });
      }
      user = data.user;
    }

    if (!user) {
      throw redirect({
        to: "/auth",
        search: { redirect: location.href },
      });
    }

    const access = await loadPanelAccess(user.id);
    return {
      user,
      roles: access.roles,
      accessStatus: access.accessStatus,
    };
  },
  pendingComponent: AdminRouteLoading,
  component: AuthenticatedLayout,
});

function AdminRouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10">
      <div className="text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
        <p className="mt-3 text-sm text-muted-foreground">Abrindo painel…</p>
      </div>
    </div>
  );
}

function AuthenticatedLayout() {
  const { user, accessStatus } = Route.useRouteContext() as {
    user: { email?: string };
    accessStatus: "approved" | "pending" | "rejected" | "none";
  };
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);

  if (accessStatus === "approved") return <Outlet />;

  async function signOut() {
    setSigningOut(true);
    accessCache = undefined;
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const title =
    accessStatus === "pending"
      ? "Cadastro enviado"
      : accessStatus === "rejected"
        ? "Acesso não autorizado"
        : "Sem acesso liberado";
  const message =
    accessStatus === "pending"
      ? "Seu cadastro foi recebido e está aguardando aprovação do administrador. Assim que liberado, basta entrar de novo."
      : accessStatus === "rejected"
        ? "Seu acesso ao painel foi negado pelo administrador. Se acha que é um engano, fale com o responsável da loja."
        : "Sua conta ainda não tem permissão para acessar o painel. Peça ao administrador para liberar.";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-lg">
        <h1 className="font-display text-2xl text-primary">{title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Logado como <strong className="text-foreground">{user?.email}</strong>
        </p>
        <p className="mt-4 text-base text-foreground">{message}</p>
        <button
          onClick={signOut}
          disabled={signingOut}
          className="mt-6 w-full rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm font-medium text-foreground hover:opacity-90 disabled:opacity-60"
        >
          {signingOut ? "Saindo…" : "Sair"}
        </button>
      </div>
    </div>
  );
}