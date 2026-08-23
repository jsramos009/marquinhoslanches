type DynamicError = { message: string } | null;

export type DynamicResult = {
  data: unknown;
  error: DynamicError;
};

export interface DynamicQuery extends PromiseLike<DynamicResult> {
  select(columns?: string): DynamicQuery;
  eq(column: string, value: unknown): DynamicQuery;
  neq(column: string, value: unknown): DynamicQuery;
  in(column: string, values: readonly unknown[]): DynamicQuery;
  gte(column: string, value: unknown): DynamicQuery;
  lte(column: string, value: unknown): DynamicQuery;
  order(column: string, options?: { ascending?: boolean }): DynamicQuery;
  range(from: number, to: number): DynamicQuery;
  limit(count: number): DynamicQuery;
  single(): DynamicQuery;
  maybeSingle(): DynamicQuery;
  update(values: Record<string, unknown>): DynamicQuery;
  upsert(
    values: Record<string, unknown> | Record<string, unknown>[],
    options?: { onConflict?: string; ignoreDuplicates?: boolean },
  ): DynamicQuery;
}

export type DynamicDatabase = {
  from(table: string): DynamicQuery;
  rpc(name: string, parameters?: Record<string, unknown>): DynamicQuery;
};

export function asDynamicDatabase(client: unknown): DynamicDatabase {
  return client as DynamicDatabase;
}
