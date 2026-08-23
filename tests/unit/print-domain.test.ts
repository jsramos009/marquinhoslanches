import { describe, expect, test } from "bun:test";
import { isCompleteOnlineOrder, onlineScanWindow, thermalHtml } from "../../src/lib/print-domain";

describe("reconciliação de pedidos online", () => {
  test("aceita somente pedidos com itens e totais completos", () => {
    expect(
      isCompleteOnlineOrder({
        subtotal: 30,
        discount: 2,
        delivery_fee: 5,
        total: 33,
        items: [{ line_total: 10 }, { line_total: 20 }],
      }),
    ).toBe(true);
    expect(
      isCompleteOnlineOrder({
        subtotal: 30,
        discount: 0,
        delivery_fee: 0,
        total: 30,
        items: [],
      }),
    ).toBe(false);
  });

  test("rejeita total inconsistente", () => {
    expect(
      isCompleteOnlineOrder({
        subtotal: 30,
        discount: 0,
        delivery_fee: 0,
        total: 29,
        items: [{ line_total: 30 }],
      }),
    ).toBe(false);
  });

  test("usa cursor incremental com sobreposição curta", () => {
    expect(
      onlineScanWindow(
        "2026-08-22T10:00:00.000Z",
        "2026-08-22T12:00:00.000Z",
        new Date("2026-08-22T12:01:00.000Z"),
      ),
    ).toEqual({
      from: "2026-08-22T11:55:00.000Z",
      through: "2026-08-22T12:01:00.000Z",
    });
  });

  test("nunca pesquisa antes da ativação", () => {
    expect(
      onlineScanWindow("2026-08-22T10:00:00.000Z", null, new Date("2026-08-22T10:01:00.000Z")).from,
    ).toBe("2026-08-22T10:00:00.000Z");
  });
});

test("HTML térmico escapa conteúdo inserido pelo cliente", () => {
  const html = thermalHtml(
    {
      source: "dining_batch",
      table_number: 1,
      items: [{ name: "<script>alert(1)</script>", quantity: 1, addons: [] }],
    },
    "kitchen_ticket",
  );
  expect(html).not.toContain("<script>alert(1)</script>");
  expect(html).toContain("&lt;script&gt;");
});

test("recibo térmico detalha pagamento misto", () => {
  const html = thermalHtml(
    {
      source: "dining_receipt",
      table_number: 2,
      subtotal: 50,
      total: 55,
      payment_method: "misto",
      cash_amount: 20,
      secondary_payment_method: "pix",
      items: [{ name: "Combo", quantity: 1, line_total: 50, addons: [] }],
    },
    "customer_receipt",
  );
  expect(html).toContain("Dinheiro");
  expect(html).toContain("PIX");
  expect(html).toContain("35,00");
});

test("impressão manual identifica uma comanda de mesa ainda aberta", () => {
  const html = thermalHtml(
    {
      source: "dining_receipt",
      session_id: "sessao-aberta",
      table_number: 7,
      opened_at: "2026-08-23T20:00:00.000Z",
      subtotal: 28,
      total: 28,
      payment_method: "nao_informado",
      items: [{ name: "X-Tudo", quantity: 1, line_total: 28, addons: [] }],
    },
    "customer_receipt",
  );
  expect(html).toContain("COMANDA");
  expect(html).toContain("MESA 7");
  expect(html).toContain("X-Tudo");
});
