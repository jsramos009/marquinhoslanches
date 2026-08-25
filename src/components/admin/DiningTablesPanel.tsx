import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ImageOff, Minus, Plus, ReceiptText, Send, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  addDiningConsumption,
  cancelEmptyDiningSession,
  closeDiningSession,
  getDiningCatalog,
  listDiningTables,
  openDiningSession,
  setDiningTableCount,
} from "@/lib/dining.functions";
import { getCurrentCashSession } from "@/lib/cash-sessions.functions";
import {
  calculateServiceCharge,
  canReduceActiveTables,
  DINING_TABLE_OPEN_EVENT,
  getOpenDiningSessionId,
  type DiningCartItem,
  type DiningPaymentMethod,
  type DiningTableView,
} from "@/lib/dining-domain";
import { formatBRL } from "@/components/admin/AdminShell";
import type { QueryClient } from "@tanstack/react-query";

function freeTableInCache(queryClient: QueryClient, tableId: string) {
  const previous = queryClient.getQueryData<DiningTableView[]>(["dining-tables"]);
  if (!previous) return;
  queryClient.setQueryData<DiningTableView[]>(
    ["dining-tables"],
    previous.map((table) =>
      table.id === tableId ? { ...table, state: "free", session: null } : table,
    ),
  );
}

const PAYMENT_LABELS: Record<DiningPaymentMethod, string> = {
  pix: "PIX",
  cartao_credito: "Crédito",
  cartao_debito: "Débito",
  dinheiro: "Dinheiro",
  misto: "Misto",
  nao_informado: "Não informado",
};

export function DiningTablesPanel() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listDiningTables);
  const openFn = useServerFn(openDiningSession);
  const countFn = useServerFn(setDiningTableCount);
  const currentCashSessionFn = useServerFn(getCurrentCashSession);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);

  const tablesQuery = useQuery({
    queryKey: ["dining-tables"],
    queryFn: () => listFn(),
    refetchInterval: 5_000,
    staleTime: 2_000,
    placeholderData: (previous: DiningTableView[] | undefined) => previous,
  });
  const cashSessionQuery = useQuery({
    queryKey: ["cash-session-current"],
    queryFn: () => currentCashSessionFn(),
    refetchInterval: 60_000,
  });
  const tables = useMemo(() => tablesQuery.data ?? [], [tablesQuery.data]);
  const cashOpen = Boolean(cashSessionQuery.data?.id);
  const activeCount = tables.filter((table) => table.is_active).length;
  const selectedTable = tables.find((table) => table.id === selectedTableId) ?? null;

  useEffect(() => {
    function openTableFromKanban(event: Event) {
      const tableId = (event as CustomEvent<string>).detail;
      if (tables.some((table) => table.id === tableId && table.is_active && table.session)) {
        setSelectedTableId(tableId);
      }
    }

    window.addEventListener(DINING_TABLE_OPEN_EVENT, openTableFromKanban);
    return () => window.removeEventListener(DINING_TABLE_OPEN_EVENT, openTableFromKanban);
  }, [tables]);

  // Pré-carrega o catálogo para o diálogo abrir instantaneamente.
  const catalogPrefetchFn = useServerFn(getDiningCatalog);
  useQuery({
    queryKey: ["dining-catalog"],
    queryFn: () => catalogPrefetchFn(),
    staleTime: 5 * 60_000,
  });

  const countMutation = useMutation({
    mutationFn: (count: number) => countFn({ data: { count } }),
    onMutate: async (count: number) => {
      await queryClient.cancelQueries({ queryKey: ["dining-tables"] });
      const previous = queryClient.getQueryData<DiningTableView[]>(["dining-tables"]);
      if (previous) {
        queryClient.setQueryData<DiningTableView[]>(
          ["dining-tables"],
          previous.map((table, index) => ({ ...table, is_active: index < count })),
        );
      }
      return { previous };
    },
    onError: (error, _count, context) => {
      if (context?.previous) queryClient.setQueryData(["dining-tables"], context.previous);
      toast.error((error as Error).message);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["dining-tables"] });
    },
  });
  const openMutation = useMutation({
    mutationFn: (tableId: string) => openFn({ data: { tableId } }),
    onMutate: async (tableId: string) => {
      await queryClient.cancelQueries({ queryKey: ["dining-tables"] });
      const previous = queryClient.getQueryData<DiningTableView[]>(["dining-tables"]);
      if (previous) {
        queryClient.setQueryData<DiningTableView[]>(
          ["dining-tables"],
          previous.map((table) =>
            table.id === tableId && !table.session
              ? {
                  ...table,
                  state: "occupied",
                  session: {
                    id: `optimistic-${tableId}`,
                    customer_name: null,
                    notes: null,
                    opened_at: new Date().toISOString(),
                    subtotal: 0,
                    items: [],
                  },
                }
              : table,
          ),
        );
      }
      setSelectedTableId(tableId);
      return { previous };
    },
    onError: (error, _tableId, context) => {
      if (context?.previous) queryClient.setQueryData(["dining-tables"], context.previous);
      setSelectedTableId(null);
      toast.error((error as Error).message);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["dining-tables"] });
    },
  });

  function selectTable(table: DiningTableView) {
    if (!table.is_active) return;
    if (table.session) setSelectedTableId(table.id);
    else if (!cashOpen) toast.error("Abra o caixa antes de iniciar o consumo de uma mesa.");
    else openMutation.mutate(table.id);
  }

  const canReduce = activeCount > 1 && canReduceActiveTables(tables, activeCount - 1);

  return (
    <section
      id="dining-tables-panel"
      className="scroll-mt-4 rounded-2xl border border-border bg-card/70 p-4 shadow-sm md:p-5"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <UsersRound className="h-5 w-5 text-primary" />
            <h2 className="font-display text-xl text-foreground">Controle de mesas</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Consumo presencial isolado dos pedidos e métricas atuais.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-background/60 p-1.5">
          <button
            type="button"
            aria-label="Diminuir quantidade de mesas"
            title={canReduce ? "Desativar a última mesa livre" : "A última mesa está ocupada"}
            disabled={!canReduce || countMutation.isPending}
            onClick={() => countMutation.mutate(activeCount - 1)}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="min-w-20 text-center text-sm font-semibold tabular-nums">
            {activeCount}/30
          </span>
          <button
            type="button"
            aria-label="Aumentar quantidade de mesas"
            disabled={activeCount >= 30 || countMutation.isPending}
            onClick={() => countMutation.mutate(activeCount + 1)}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {!cashSessionQuery.isLoading && !cashOpen && (
        <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-300">
          Abra o caixa para ocupar mesas e adicionar produtos. Mesas já ocupadas continuam
          disponíveis para consulta e fechamento.
        </div>
      )}

      {tablesQuery.isLoading && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 xl:grid-cols-10">
          {Array.from({ length: 30 }, (_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-xl bg-secondary/60" />
          ))}
        </div>
      )}
      {tablesQuery.error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {(tablesQuery.error as Error).message}
        </p>
      )}
      {!tablesQuery.isLoading && !tablesQuery.error && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 xl:grid-cols-10">
          {tables
            .filter((table) => table.session)
            .map((table) => (
              <TableButton
                key={table.id}
                table={table}
                busy={openMutation.isPending && openMutation.variables === table.id}
                blocked={!cashOpen && !table.session}
                onClick={() => selectTable(table)}
              />
            ))}
        </div>
      )}
      {!tablesQuery.isLoading && !tablesQuery.error && !tables.some((table) => table.session) && (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
          Nenhuma mesa ocupada no momento.
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-4 text-[11px] text-muted-foreground">
        <Legend color="bg-amber-400" label="Ocupada" />
        <Legend color="bg-destructive" label="Falha de impressão" />
      </div>

      <DiningSessionDialog
        table={selectedTable}
        open={Boolean(selectedTable)}
        cashOpen={cashOpen}
        onOpenChange={(open) => !open && setSelectedTableId(null)}
      />
    </section>
  );
}

function TableButton({
  table,
  busy,
  blocked,
  onClick,
}: {
  table: DiningTableView;
  busy: boolean;
  blocked: boolean;
  onClick: () => void;
}) {
  const classes = !table.is_active
    ? "border-border/50 bg-muted/20 text-muted-foreground/40"
    : table.state === "print_failed"
      ? "border-destructive/60 bg-destructive/10 text-destructive"
      : table.state === "occupied"
        ? "border-amber-400/50 bg-amber-400/10 text-amber-300"
        : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20";
  return (
    <button
      type="button"
      disabled={!table.is_active || busy || blocked}
      title={blocked ? "Abra o caixa para ocupar esta mesa" : undefined}
      onClick={onClick}
      className={`relative flex min-h-24 flex-col items-start justify-between rounded-xl border p-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed ${classes}`}
    >
      <div className="flex w-full items-center justify-between gap-1">
        <span className="font-display text-lg">{String(table.table_number).padStart(2, "0")}</span>
        {table.state === "print_failed" && <AlertTriangle className="h-4 w-4" />}
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide">
          {!table.is_active
            ? "Inativa"
            : busy
              ? "Abrindo…"
              : table.state === "free"
                ? "Livre"
                : table.state === "print_failed"
                  ? "Impressão"
                  : "Ocupada"}
        </p>
        {table.session && (
          <p className="mt-0.5 text-xs font-semibold tabular-nums">
            {formatBRL(table.session.subtotal)}
          </p>
        )}
      </div>
    </button>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${color}`} /> {label}
    </span>
  );
}

function DiningSessionDialog({
  table,
  open,
  cashOpen,
  onOpenChange,
}: {
  table: DiningTableView | null;
  open: boolean;
  cashOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const catalogFn = useServerFn(getDiningCatalog);
  const addFn = useServerFn(addDiningConsumption);
  const cancelFn = useServerFn(cancelEmptyDiningSession);
  const closeFn = useServerFn(closeDiningSession);
  const catalogQuery = useQuery({
    queryKey: ["dining-catalog"],
    queryFn: () => catalogFn(),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

  const [cart, setCart] = useState<DiningCartItem[]>([]);
  const [batchRequestKey, setBatchRequestKey] = useState(() => crypto.randomUUID());
  const [serviceEnabled, setServiceEnabled] = useState(false);
  const [servicePercent, setServicePercent] = useState(10);
  const [paymentMethod, setPaymentMethod] = useState<DiningPaymentMethod>("nao_informado");
  const [changeFor, setChangeFor] = useState("");
  const [cashAmount, setCashAmount] = useState("");
  const [secondaryPaymentMethod, setSecondaryPaymentMethod] =
    useState<Exclude<DiningPaymentMethod, "misto" | "nao_informado" | "dinheiro">>("pix");
  const currentSession = table?.session ?? null;
  const sessionId = getOpenDiningSessionId(table);

  useEffect(() => {
    setCart([]);
    setBatchRequestKey(crypto.randomUUID());
    setServiceEnabled(false);
    setServicePercent(10);
    setPaymentMethod("nao_informado");
    setChangeFor("");
    setCashAmount("");
    setSecondaryPaymentMethod("pix");
  }, [sessionId]);

  const catalog = catalogQuery.data;
  const cartTotal = useMemo(() => {
    if (!catalog) return 0;
    return cart.reduce((sum, item) => {
      const product = catalog.products.find((entry) => entry.id === item.product_id);
      const addons = (item.addons ?? []).reduce((addonSum, entry) => {
        const addon = catalog.addons.find((candidate) => candidate.id === entry.addon_id);
        return addonSum + (addon?.price ?? 0) * entry.quantity;
      }, 0);
      return sum + ((product?.price ?? 0) + addons) * item.quantity;
    }, 0);
  }, [cart, catalog]);

  const addMutation = useMutation({
    mutationFn: (input: { sessionId: string; requestKey: string; items: DiningCartItem[] }) =>
      addFn({
        data: {
          sessionId: input.sessionId,
          requestKey: input.requestKey,
          items: input.items,
        },
      }),
    onSuccess: () => {
      setCart([]);
      setBatchRequestKey(crypto.randomUUID());
      toast.success("Novo lote enviado para a cozinha.");
      void queryClient.invalidateQueries({ queryKey: ["dining-tables"] });
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const closeMutation = useMutation({
    mutationFn: (targetSessionId: string) =>
      closeFn({
        data: {
          sessionId: targetSessionId,
          serviceChargePercent: serviceEnabled ? servicePercent : 0,
          paymentMethod,
          secondaryPaymentMethod: paymentMethod === "misto" ? secondaryPaymentMethod : null,
          cashAmount:
            paymentMethod === "misto" && Number(cashAmount) > 0 ? Number(cashAmount) : null,
          changeFor:
            paymentMethod === "dinheiro" && Number(changeFor) > 0 ? Number(changeFor) : null,
        },
      }),
    onMutate: () => {
      const tableId = table?.id;
      if (tableId) freeTableInCache(queryClient, tableId);
      onOpenChange(false);
      return { tableId };
    },
    onSuccess: () => {
      toast.success("Comanda fechada. Recibo disponível na estação de impressão.");
      void queryClient.invalidateQueries({ queryKey: ["print-jobs"] });
    },
    onError: (error) => toast.error((error as Error).message),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["dining-tables"] });
    },
  });
  const cancelMutation = useMutation({
    mutationFn: (targetSessionId: string) => cancelFn({ data: { sessionId: targetSessionId } }),
    onMutate: () => {
      const tableId = table?.id;
      if (tableId) freeTableInCache(queryClient, tableId);
      onOpenChange(false);
    },
    onSuccess: () => {
      toast.success("Mesa liberada.");
    },
    onError: (error) => toast.error((error as Error).message),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["dining-tables"] });
    },
  });

  if (!table || !currentSession) return null;
  const pendingSession = sessionId?.startsWith("optimistic-") ?? false;
  const subtotal = currentSession.subtotal;
  const totals = calculateServiceCharge(subtotal, serviceEnabled ? servicePercent : 0);

  function addProduct(productId: string) {
    setCart((current) => {
      const existing = current.find((item) => item.product_id === productId);
      if (existing) {
        return current.map((item) =>
          item === existing ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [...current, { product_id: productId, quantity: 1, addons: [] }];
    });
  }

  function adjustQuantity(index: number, delta: number) {
    setCart((current) =>
      current
        .map((item, itemIndex) =>
          itemIndex === index ? { ...item, quantity: item.quantity + delta } : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }

  function toggleAddon(index: number, addonId: string) {
    setCart((current) =>
      current.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        const addons = item.addons ?? [];
        const hasAddon = addons.some((addon) => addon.addon_id === addonId);
        return {
          ...item,
          addons: hasAddon
            ? addons.filter((addon) => addon.addon_id !== addonId)
            : [...addons, { addon_id: addonId, quantity: 1 }],
        };
      }),
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-5xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            Mesa {table.table_number} · {formatBRL(subtotal)}
          </DialogTitle>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto lg:grid-cols-[1.4fr_1fr] lg:overflow-hidden">
          <div className="space-y-4 lg:min-h-0 lg:overflow-y-auto lg:pr-2">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Catálogo
              </p>
              {catalogQuery.isLoading && (
                <p className="text-sm text-muted-foreground">Carregando…</p>
              )}
              {catalogQuery.error && (
                <p className="mb-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  Não foi possível carregar os produtos: {(catalogQuery.error as Error).message}
                </p>
              )}
              {!catalogQuery.isLoading && !catalogQuery.error && catalog?.products.length === 0 && (
                <p className="rounded-lg border border-border bg-background/50 p-3 text-sm text-muted-foreground">
                  Nenhum produto ativo disponível no catálogo.
                </p>
              )}
              {!cashOpen && (
                <p className="mb-2 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-300">
                  O catálogo será liberado automaticamente quando o caixa for aberto.
                </p>
              )}
              {pendingSession && (
                <p className="mb-2 rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm text-primary">
                  Abrindo a comanda da mesa… Os produtos serão liberados em instantes.
                </p>
              )}
              <div className="space-y-5">
                {(catalog?.categories ?? []).map((category) => {
                  const products = (catalog?.products ?? []).filter(
                    (product) => product.category_id === category.id,
                  );
                  if (products.length === 0) return null;
                  return (
                    <section key={category.id} aria-labelledby={`dining-category-${category.id}`}>
                      <div className="mb-2 flex items-center gap-2">
                        <h3
                          id={`dining-category-${category.id}`}
                          className="font-display text-lg text-primary"
                        >
                          {category.name}
                        </h3>
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
                          {products.length}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {products.map((product) => (
                          <button
                            key={product.id}
                            type="button"
                            disabled={!cashOpen || pendingSession}
                            onClick={() => addProduct(product.id)}
                            className="group overflow-hidden rounded-xl border border-border bg-background/60 text-left transition hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            <span className="relative block aspect-[4/3] overflow-hidden bg-secondary/60">
                              {product.image_url ? (
                                <img
                                  src={product.image_url}
                                  alt={product.name}
                                  loading="lazy"
                                  className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.03]"
                                />
                              ) : (
                                <span className="grid h-full place-items-center text-muted-foreground">
                                  <ImageOff className="h-6 w-6" aria-hidden="true" />
                                  <span className="sr-only">Produto sem foto</span>
                                </span>
                              )}
                            </span>
                            <span className="block p-2.5">
                              <span className="line-clamp-2 block text-sm font-semibold text-foreground">
                                {product.name}
                              </span>
                              <span className="mt-1 block text-xs font-semibold text-primary">
                                {formatBRL(product.price)}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>

            {cart.length > 0 && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold">Novo lote</p>
                  <span className="text-sm font-semibold text-primary">{formatBRL(cartTotal)}</span>
                </div>
                <div className="space-y-3">
                  {cart.map((item, index) => {
                    const product = catalog?.products.find((entry) => entry.id === item.product_id);
                    const availableAddons = (catalog?.addons ?? []).filter((addon) =>
                      product?.addon_ids.includes(addon.id),
                    );
                    return (
                      <div
                        key={`${item.product_id}-${index}`}
                        className="rounded-lg bg-background/70 p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">{product?.name}</span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => adjustQuantity(index, -1)}
                              className="h-7 w-7 rounded border border-border"
                            >
                              −
                            </button>
                            <span className="w-5 text-center text-sm tabular-nums">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => adjustQuantity(index, 1)}
                              className="h-7 w-7 rounded border border-border"
                            >
                              +
                            </button>
                          </div>
                        </div>
                        {availableAddons.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {availableAddons.map((addon) => {
                              const selected = item.addons?.some(
                                (entry) => entry.addon_id === addon.id,
                              );
                              return (
                                <button
                                  key={addon.id}
                                  type="button"
                                  onClick={() => toggleAddon(index, addon.id)}
                                  className={`rounded-full border px-2 py-1 text-[11px] ${selected ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground"}`}
                                >
                                  + {addon.name} · {formatBRL(addon.price)}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  disabled={
                    addMutation.isPending ||
                    pendingSession ||
                    !cashOpen ||
                    !sessionId ||
                    cart.length === 0
                  }
                  onClick={() => {
                    if (!cashOpen) {
                      toast.error("Abra o caixa antes de adicionar produtos à mesa.");
                      return;
                    }
                    if (!sessionId) {
                      toast.error("A comanda desta mesa não está mais aberta. Atualize a grade.");
                      return;
                    }
                    addMutation.mutate({
                      sessionId,
                      requestKey: batchRequestKey,
                      items: [...cart],
                    });
                  }}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                  {addMutation.isPending ? "Enviando…" : "Enviar somente este lote à cozinha"}
                </button>
              </div>
            )}
          </div>

          <div className="space-y-4 lg:sticky lg:top-0 lg:h-fit lg:self-start">
            <div className="rounded-xl border border-border bg-background/50 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Consumo da mesa
              </p>
              {currentSession.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum item lançado.</p>
              ) : (
                <ul className="space-y-2">
                  {currentSession.items.map((item) => (
                    <li
                      key={item.id}
                      className="border-b border-border/60 pb-2 text-sm last:border-0"
                    >
                      <div className="flex justify-between gap-2">
                        <span>
                          {item.quantity}× {item.product_name_snapshot}
                        </span>
                        <span>{formatBRL(item.line_total)}</span>
                      </div>
                      {item.addons.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          + {item.addons.map((addon) => addon.addon_name_snapshot).join(", ")}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-border bg-background/50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Taxa de serviço</p>
                  <p className="text-xs text-muted-foreground">Desligada por padrão</p>
                </div>
                <Switch checked={serviceEnabled} onCheckedChange={setServiceEnabled} />
              </div>
              {serviceEnabled && (
                <label className="mt-3 block text-xs text-muted-foreground">
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
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
                  />
                </label>
              )}
              <label className="mt-3 block text-xs text-muted-foreground">
                Pagamento
                <select
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value as DiningPaymentMethod)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
                >
                  {Object.entries(PAYMENT_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {paymentMethod === "dinheiro" && (
                <label className="mt-3 block text-xs text-muted-foreground">
                  Troco para
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={changeFor}
                    onChange={(event) => setChangeFor(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
                  />
                </label>
              )}
              {paymentMethod === "misto" && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs text-muted-foreground">
                    Valor em dinheiro
                    <input
                      type="number"
                      min={0.01}
                      max={totals.total}
                      step={0.01}
                      value={cashAmount}
                      onChange={(event) => setCashAmount(event.target.value)}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
                    />
                  </label>
                  <label className="block text-xs text-muted-foreground">
                    Restante em
                    <select
                      value={secondaryPaymentMethod}
                      onChange={(event) =>
                        setSecondaryPaymentMethod(
                          event.target.value as typeof secondaryPaymentMethod,
                        )
                      }
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
                    >
                      <option value="pix">PIX</option>
                      <option value="cartao_credito">Crédito</option>
                      <option value="cartao_debito">Débito</option>
                    </select>
                  </label>
                </div>
              )}
              <div className="mt-4 space-y-1 border-t border-border pt-3 text-sm">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{formatBRL(subtotal)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Taxa</span>
                  <span>{formatBRL(totals.service)}</span>
                </div>
                <div className="flex justify-between font-display text-lg text-primary">
                  <span>Total</span>
                  <span>{formatBRL(totals.total)}</span>
                </div>
              </div>
              <button
                type="button"
                disabled={
                  closeMutation.isPending ||
                  currentSession.items.length === 0 ||
                  cart.length > 0 ||
                  (paymentMethod === "misto" &&
                    !(Number(cashAmount) > 0 && Number(cashAmount) < totals.total))
                }
                onClick={() => {
                  if (!sessionId) {
                    toast.error("A comanda desta mesa não está mais aberta. Atualize a grade.");
                    return;
                  }
                  closeMutation.mutate(sessionId);
                }}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-primary bg-primary/10 px-4 py-2.5 text-sm font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ReceiptText className="h-4 w-4" />
                {closeMutation.isPending ? "Fechando…" : "Fechar e gerar recibo"}
              </button>
              {cart.length > 0 && (
                <p className="mt-2 text-center text-[11px] text-amber-400">
                  Envie o novo lote antes de fechar.
                </p>
              )}
              {currentSession.items.length === 0 && cart.length === 0 && (
                <button
                  type="button"
                  disabled={cancelMutation.isPending}
                  onClick={() => {
                    if (!sessionId) {
                      toast.error("A comanda desta mesa não está mais aberta. Atualize a grade.");
                      return;
                    }
                    cancelMutation.mutate(sessionId);
                  }}
                  className="mt-2 w-full rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  {cancelMutation.isPending ? "Liberando…" : "Liberar mesa sem consumo"}
                </button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
