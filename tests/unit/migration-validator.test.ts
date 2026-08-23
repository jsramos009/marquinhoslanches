import { describe, expect, test } from "bun:test";
import {
  ALLOWED_TABLES,
  validateMigrationSql,
} from "../../scripts/validate-isolated-migration.mjs";

const validSkeleton = [...ALLOWED_TABLES]
  .map((table) => `create table public.${table} (id uuid primary key);`)
  .join("\n");

describe("allowlist da migração isolada", () => {
  test("aceita somente as novas tabelas", () => {
    expect(validateMigrationSql(validSkeleton)).toEqual([]);
  });

  test.each([
    "create policy leak on public.orders for select using (true);",
    "create trigger leak after update on public.products execute function public.print_hook();",
    "update public.orders o set status = 'x';",
    "alter function public.handle_new_user() security definer;",
    "grant all on public.orders to service_role;",
    "revoke usage on schema public from anon;",
    "create procedure public.print_escape() language sql as $$ select 1 $$;",
    "create domain public.print_money as numeric check (value >= 0);",
    "create aggregate public.print_sum(numeric) (sfunc = numeric_add, stype = numeric);",
    "create trigger print_touch after update on public.print_jobs execute function public.print_hook();",
  ])("rejeita operação em objeto preexistente: %s", (maliciousSql) => {
    expect(validateMigrationSql(`${validSkeleton}\n${maliciousSql}`)).not.toEqual([]);
  });
});
