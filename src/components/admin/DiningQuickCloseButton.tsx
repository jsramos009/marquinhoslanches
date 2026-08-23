import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { formatBRL } from "@/components/admin/AdminShell";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { closeDiningSession } from "@/lib/dining.functions";
import {
  calculateServiceCharge,
  type DiningPaymentMethod,
  type DiningTableView,
} from "@/lib/dining-domain";

const PAYMENT_LABELS: Record<DiningPaymentMethod, string> = {
  pix: "PIX",
  cartao_credito: "Crédito",
  cartao_debito: "Débito",
  dinheiro: "Dinheiro",
  misto: "Misto",
  nao_informado: "Não informado",
};

type SecondaryPayment = Exclude<DiningPaymentMethod, "misto" | "nao_informado" | "dinheiro">;

export function DiningQuickCloseButton({ table }: { table: DiningTableView }) {
  const session = table.session;
  const closeFn = useServerFn(closeDiningSession);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [serviceEnabled, setServiceEnabled] = useState(false);
  const [servicePercent, setServicePercent] = useState(10);
  const [paymentMethod, setPaymentMethod] = useState<DiningPaymentMethod>("nao_informado");
  const [cashAmount, setCashAmount] = useState("");
  const [secondaryPaymentMethod, setSecondaryPaymentMethod] = useState<SecondaryPayment>("pix");
  const totals = calculateServiceCharge(
    session?.subtotal ?? 0,
    serviceEnabled ? servicePercent : 0,
  );
  const mixedPaymentIsValid =
    paymentMethod !== "misto" || (Number(cashAmount) > 0 && Number(cashAmount) < totals.total);

  const closeMutation = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error("A comanda desta mesa não está mais aberta.");
      return closeFn({
        data: {
          sessionId: session.id,
          serviceChargePercent: serviceEnabled ? servicePercent : 0,
          paymentMethod,
          secondaryPaymentMethod: paymentMethod === "misto" ? secondaryPaymentMethod : null,
          cashAmount: paymentMethod === "misto" ? Number(cashAmount) : null,
          changeFor: null,
        },
      });
    },
    onSuccess: () => {
      setOpen(false);
      toast.success(`Mesa ${table.table_number} concluída.`);
      void queryClient.invalidateQueries({ queryKey: ["dining-tables"] });
      void queryClient.invalidateQueries({ queryKey: ["print-jobs"] });
    },
    onError: (error) => toast.error((error as Error).message),
  });

  function openQuickClose() {
    setServiceEnabled(false);
    setServicePercent(10);
    setPaymentMethod("nao_informado");
    setCashAmount("");
    setSecondaryPaymentMethod("pix");
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        disabled={!session || session.items.length === 0}
        onClick={openQuickClose}
        className="grid h-8 w-8 place-items-center rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 transition hover:bg-emerald-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-40"
        title="Concluir mesa"
        aria-label={`Concluir mesa ${table.table_number}`}
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">
              Concluir mesa {table.table_number}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <label className="block text-sm text-muted-foreground">
              Forma de pagamento
              <select
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value as DiningPaymentMethod)}
                className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-foreground"
              >
                {Object.entries(PAYMENT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            {paymentMethod === "misto" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm text-muted-foreground">
                  Valor em dinheiro
                  <input
                    type="number"
                    min={0.01}
                    max={totals.total}
                    step={0.01}
                    value={cashAmount}
                    onChange={(event) => setCashAmount(event.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-foreground"
                  />
                </label>
                <label className="block text-sm text-muted-foreground">
                  Restante em
                  <select
                    value={secondaryPaymentMethod}
                    onChange={(event) =>
                      setSecondaryPaymentMethod(event.target.value as SecondaryPayment)
                    }
                    className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-foreground"
                  >
                    <option value="pix">PIX</option>
                    <option value="cartao_credito">Crédito</option>
                    <option value="cartao_debito">Débito</option>
                  </select>
                </label>
              </div>
            )}

            <div className="rounded-xl border border-border bg-background/50 p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Taxa de serviço</p>
                  <p className="text-xs text-muted-foreground">Desligada por padrão</p>
                </div>
                <Switch checked={serviceEnabled} onCheckedChange={setServiceEnabled} />
              </div>
              {serviceEnabled && (
                <label className="mt-3 block text-sm text-muted-foreground">
                  Percentual (0–30%)
                  <input
                    type="number"
                    min={0}
                    max={30}
                    step={0.5}
                    value={servicePercent}
                    onChange={(event) =>
                      setServicePercent(Math.min(30, Math.max(0, Number(event.target.value))))
                    }
                    className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-foreground"
                  />
                </label>
              )}
            </div>

            <div className="space-y-1 border-t border-border pt-3 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>{formatBRL(session?.subtotal ?? 0)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Taxa</span>
                <span>{formatBRL(totals.service)}</span>
              </div>
              <div className="flex justify-between font-display text-xl text-primary">
                <span>Total</span>
                <span>{formatBRL(totals.total)}</span>
              </div>
            </div>

            <button
              type="button"
              disabled={closeMutation.isPending || !mixedPaymentIsValid}
              onClick={() => closeMutation.mutate()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {closeMutation.isPending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {closeMutation.isPending ? "Concluindo…" : "Confirmar fechamento"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
