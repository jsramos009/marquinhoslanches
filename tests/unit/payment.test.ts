import { describe, expect, test } from "bun:test";
import { calculateCashChange } from "../../src/lib/payment";

describe("troco em pedidos", () => {
  test("usa o total completo, incluindo o frete", () => {
    const subtotal = 35;
    const deliveryFee = 8;

    expect(calculateCashChange(50, subtotal + deliveryFee)).toBe(7);
  });

  test("rejeita valor entregue menor que o total com frete", () => {
    expect(calculateCashChange(40, 43)).toBeNull();
  });

  test("arredonda o troco para centavos", () => {
    expect(calculateCashChange(50, 43.33)).toBe(6.67);
  });
});
