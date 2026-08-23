import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getCurrentCashSession,
  openCashSession,
  closeCashSession,
} from "@/lib/cash-sessions.functions";
import { cn } from "@/lib/utils";

export function CashSessionControl({ className }: { className?: string } = {}) {
  const qc = useQueryClient();
  const current = useServerFn(getCurrentCashSession);
  const open = useServerFn(openCashSession);
  const close = useServerFn(closeCashSession);
  const [showClose, setShowClose] = useState(false);
  const [note, setNote] = useState("");

  const q = useQuery({
    queryKey: ["cash-session-current"],
    queryFn: () => current(),
    refetchInterval: 60_000,
  });

  const openMut = useMutation({
    mutationFn: () => open({ data: {} }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cash-session-current"] });
      qc.invalidateQueries({ queryKey: ["orders-recent"] });
      qc.invalidateQueries({ queryKey: ["cash-sessions"] });
      qc.invalidateQueries({ queryKey: ["dashboard-metrics"] });
    },
  });

  const closeMut = useMutation({
    mutationFn: () => {
      if (!q.data?.id) throw new Error("Não há caixa aberto.");
      return close({ data: { id: q.data.id, note } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cash-session-current"] });
      qc.invalidateQueries({ queryKey: ["cash-sessions"] });
      qc.invalidateQueries({ queryKey: ["orders-recent"] });
      qc.invalidateQueries({ queryKey: ["orders-archived"] });
      qc.invalidateQueries({ queryKey: ["dashboard-metrics"] });
      setShowClose(false);
      setNote("");
    },
  });

  const session = q.data;
  const openedAt = session?.opened_at
    ? new Date(session.opened_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : null;

  if (!session) {
    return (
      <button
        onClick={() => openMut.mutate()}
        disabled={openMut.isPending}
        className={cn(
          "rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60",
          className,
        )}
        title="Abrir caixa"
      >
        {openMut.isPending ? "Abrindo…" : "🟢 Abrir caixa"}
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowClose(true)}
        className={cn(
          "rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-black hover:bg-amber-600",
          className,
        )}
        title={`Aberto em ${openedAt}`}
      >
        🔒 Fechar caixa
      </button>
      {showClose && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-card p-5 shadow-lg">
            <h3 className="mb-2 text-lg font-semibold">Fechar caixa</h3>
            <p className="mb-3 text-sm text-muted-foreground">
              Aberto em <b>{openedAt}</b>. Novos pedidos entrarão na próxima sessão.
            </p>
            <label className="block text-sm">
              Observação (opcional)
              <textarea
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowClose(false)}
                className="rounded-md bg-secondary px-3 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={() => closeMut.mutate()}
                disabled={closeMut.isPending}
                className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-60"
              >
                {closeMut.isPending ? "Fechando…" : "Confirmar fechamento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
