import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  listAccessUsers,
  approveUser,
  rejectUser,
  revokeUser,
} from "@/lib/access.functions";

export const Route = createFileRoute("/_authenticated/admin/usuarios")({
  component: UsuariosPage,
  head: () => ({
    meta: [
      { title: "Acessos do painel — Marquinhos" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function UsuariosPage() {
  const { roles, user } = Route.useRouteContext() as {
    user: { id: string; email?: string };
    roles: string[];
  };
  const navigate = useNavigate();
  const isAdmin = roles.includes("admin");

  useEffect(() => {
    if (!isAdmin) navigate({ to: "/admin/pedidos", replace: true });
  }, [isAdmin, navigate]);

  const list = useServerFn(listAccessUsers);
  const approve = useServerFn(approveUser);
  const reject = useServerFn(rejectUser);
  const revoke = useServerFn(revokeUser);

  const queryClient = useQueryClient();
  const usersQuery = useQuery({
    queryKey: ["access-users"],
    queryFn: () => list(),
    enabled: isAdmin,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["access-users"] });

  const approveMut = useMutation({
    mutationFn: (userId: string) => approve({ data: { userId } }),
    onSuccess: invalidate,
  });
  const rejectMut = useMutation({
    mutationFn: (userId: string) => reject({ data: { userId } }),
    onSuccess: invalidate,
  });
  const revokeMut = useMutation({
    mutationFn: (userId: string) => revoke({ data: { userId } }),
    onSuccess: invalidate,
  });

  if (!isAdmin) return null;

  const users = usersQuery.data ?? [];
  const pending = users.filter((u) => u.status === "pending");
  const approved = users.filter((u) => u.status === "approved");
  const rejected = users.filter((u) => u.status === "rejected");

  return (
    <div className="min-h-screen bg-background px-5 py-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl text-primary">Acessos do painel</h1>
            <p className="text-sm text-muted-foreground">
              Aprovar novos funcionários e gerenciar quem pode operar pedidos.
            </p>
          </div>
          <Link
            to="/admin/pedidos"
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-secondary"
          >
            ← Pedidos
          </Link>
        </header>

        {usersQuery.isLoading && (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        )}
        {usersQuery.error && (
          <p className="text-sm text-destructive">
            {(usersQuery.error as Error).message}
          </p>
        )}

        <Section title={`Pendentes (${pending.length})`}>
          {pending.length === 0 && (
            <Empty>Nenhum cadastro aguardando aprovação.</Empty>
          )}
          {pending.map((u) => (
            <Row
              key={u.user_id + u.role}
              email={u.email}
              role={u.role}
              createdAt={u.created_at}
              actions={
                <>
                  <button
                    onClick={() => approveMut.mutate(u.user_id)}
                    disabled={approveMut.isPending}
                    className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
                  >
                    Aprovar
                  </button>
                  <button
                    onClick={() => rejectMut.mutate(u.user_id)}
                    disabled={rejectMut.isPending}
                    className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-secondary disabled:opacity-60"
                  >
                    Rejeitar
                  </button>
                </>
              }
            />
          ))}
        </Section>

        <Section title={`Com acesso (${approved.length})`}>
          {approved.length === 0 && <Empty>Nenhum usuário aprovado ainda.</Empty>}
          {approved.map((u) => {
            const isSelf = u.user_id === user.id;
            const canRevoke = u.role === "staff" && !isSelf;
            return (
              <Row
                key={u.user_id + u.role}
                email={u.email}
                role={u.role}
                createdAt={u.created_at}
                actions={
                  canRevoke ? (
                    <button
                      onClick={() => {
                        if (confirm(`Revogar acesso de ${u.email}?`)) {
                          revokeMut.mutate(u.user_id);
                        }
                      }}
                      disabled={revokeMut.isPending}
                      className="rounded-lg border border-destructive/40 bg-card px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-60"
                    >
                      Revogar
                    </button>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {isSelf ? "você" : "—"}
                    </span>
                  )
                }
              />
            );
          })}
        </Section>

        {rejected.length > 0 && (
          <Section title={`Rejeitados (${rejected.length})`}>
            {rejected.map((u) => (
              <Row
                key={u.user_id + u.role}
                email={u.email}
                role={u.role}
                createdAt={u.created_at}
                actions={
                  <button
                    onClick={() => approveMut.mutate(u.user_id)}
                    disabled={approveMut.isPending}
                    className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-secondary disabled:opacity-60"
                  >
                    Reativar
                  </button>
                }
              />
            ))}
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-4 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function Row({
  email,
  role,
  createdAt,
  actions,
}: {
  email: string | null;
  role: "admin" | "staff";
  createdAt: string;
  actions: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{email ?? "(sem e-mail)"}</p>
        <p className="text-xs text-muted-foreground">
          <span className="rounded-full bg-secondary px-2 py-0.5 uppercase tracking-wide">
            {role}
          </span>
          <span className="ml-2">
            cadastrado em {new Date(createdAt).toLocaleString("pt-BR")}
          </span>
        </p>
      </div>
      <div className="flex items-center gap-2">{actions}</div>
    </div>
  );
}