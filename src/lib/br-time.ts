export const BR_TIME_ZONE = "America/Sao_Paulo";

const BR_OFFSET_MS = 3 * 60 * 60 * 1000;

export function brStartOfDay(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date, 3, 0, 0, 0));
}

export function brDateKey(value: Date | string = new Date()): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BR_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function brStartOfToday(): Date {
  return brStartOfDay(brDateKey());
}

export function brStartOfMonth(): Date {
  const brNow = new Date(Date.now() - BR_OFFSET_MS);
  return new Date(Date.UTC(brNow.getUTCFullYear(), brNow.getUTCMonth(), 1, 3, 0, 0, 0));
}

export function formatBRDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: BR_TIME_ZONE });
}