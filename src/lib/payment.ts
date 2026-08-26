function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateCashChange(amountPaid: number, orderTotal: number): number | null {
  const paid = Number(amountPaid);
  const total = Number(orderTotal);

  if (!Number.isFinite(paid) || !Number.isFinite(total) || paid <= 0 || total < 0) {
    return null;
  }

  const change = roundCurrency(paid - total);
  return change >= 0 ? change : null;
}
