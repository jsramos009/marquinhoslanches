import { describe, expect, test } from "bun:test";
import {
  calculateServiceCharge,
  canReduceActiveTables,
  type DiningTableView,
} from "../../src/lib/dining-domain";

describe("taxa de serviço", () => {
  test("começa desligada", () => {
    expect(calculateServiceCharge(100, 0)).toEqual({ service: 0, total: 100 });
  });

  test("arredonda centavos e aceita o limite de 30%", () => {
    expect(calculateServiceCharge(33.33, 10)).toEqual({ service: 3.33, total: 36.66 });
    expect(calculateServiceCharge(10.01, 30)).toEqual({ service: 3, total: 13.01 });
  });

  test("rejeita percentuais fora do intervalo", () => {
    expect(() => calculateServiceCharge(10, -1)).toThrow();
    expect(() => calculateServiceCharge(10, 30.01)).toThrow();
  });
});

describe("redução de mesas", () => {
  const table = (number: number, occupied = false): DiningTableView => ({
    id: String(number),
    table_number: number,
    is_active: true,
    state: occupied ? "occupied" : "free",
    session: occupied
      ? {
          id: `s${number}`,
          customer_name: null,
          notes: null,
          opened_at: "",
          subtotal: 0,
          items: [],
        }
      : null,
  });

  test("permite desativar somente o topo livre", () => {
    expect(canReduceActiveTables([table(29), table(30)], 29)).toBe(true);
    expect(canReduceActiveTables([table(29), table(30, true)], 29)).toBe(false);
  });

  test("preserva os limites 1–30", () => {
    expect(canReduceActiveTables([], 0)).toBe(false);
    expect(canReduceActiveTables([], 31)).toBe(false);
  });
});
