export type DayHours = {
  enabled: boolean;
  open: string; // "HH:MM"
  close: string; // "HH:MM" — pode ser < open p/ virar madrugada
};

export type OperatingHours = {
  monday: DayHours;
  tuesday: DayHours;
  wednesday: DayHours;
  thursday: DayHours;
  friday: DayHours;
  saturday: DayHours;
  sunday: DayHours;
};

export const DAY_KEYS: (keyof OperatingHours)[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

export const DAY_LABELS: Record<keyof OperatingHours, string> = {
  monday: "Segunda",
  tuesday: "Terça",
  wednesday: "Quarta",
  thursday: "Quinta",
  friday: "Sexta",
  saturday: "Sábado",
  sunday: "Domingo",
};

export function defaultOperatingHours(): OperatingHours {
  const base: DayHours = { enabled: true, open: "18:00", close: "23:00" };
  return {
    monday: { ...base },
    tuesday: { ...base },
    wednesday: { ...base },
    thursday: { ...base },
    friday: { ...base },
    saturday: { ...base },
    sunday: { ...base, enabled: false },
  };
}

export function parseOperatingHours(raw: string | null | undefined): OperatingHours {
  const def = defaultOperatingHours();
  if (!raw) return def;
  try {
    const p = JSON.parse(raw);
    for (const k of DAY_KEYS) {
      const d = p?.[k];
      if (d && typeof d === "object") {
        def[k] = {
          enabled: Boolean(d.enabled),
          open: typeof d.open === "string" ? d.open : def[k].open,
          close: typeof d.close === "string" ? d.close : def[k].close,
        };
      }
    }
  } catch {
    /* fallback default */
  }
  return def;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
  return (isFinite(h) ? h : 0) * 60 + (isFinite(m) ? m : 0);
}

// Ordem JS: 0 = domingo, 1 = segunda...
const JS_TO_KEY: (keyof OperatingHours)[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export function isOpenNow(
  hours: OperatingHours,
  now: Date = new Date(),
): { open: boolean; today: DayHours; nextOpenLabel?: string } {
  // Sempre avaliar no fuso America/Sao_Paulo (independe do fuso do cliente/SSR)
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const wdMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const wd = wdMap[parts.find((p) => p.type === "weekday")?.value ?? "Sun"] ?? 0;
  const hh = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const mm = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  const dayKey = JS_TO_KEY[wd];
  const today = hours[dayKey];
  const minsNow = (isFinite(hh) ? hh : 0) * 60 + (isFinite(mm) ? mm : 0);
  let open = false;
  if (today.enabled) {
    const a = toMinutes(today.open);
    const b = toMinutes(today.close);
    if (b > a) open = minsNow >= a && minsNow < b;
    else if (b < a) open = minsNow >= a || minsNow < b; // vira madrugada
  }
  // Fallback: verifica se ainda estamos dentro do horário do dia anterior que virou
  if (!open) {
    const prevKey = JS_TO_KEY[(wd + 6) % 7];
    const prev = hours[prevKey];
    if (prev.enabled) {
      const a = toMinutes(prev.open);
      const b = toMinutes(prev.close);
      if (b < a && minsNow < b) open = true;
    }
  }

  let nextOpenLabel: string | undefined;
  if (!open) {
    for (let i = 0; i < 7; i++) {
      const key = JS_TO_KEY[(wd + i) % 7];
      const d = hours[key];
      if (!d.enabled) continue;
      if (i === 0 && minsNow < toMinutes(d.open)) {
        nextOpenLabel = `hoje às ${d.open}`;
      } else if (i > 0) {
        nextOpenLabel = `${DAY_LABELS[key]} às ${d.open}`;
      } else {
        continue;
      }
      break;
    }
  }
  return { open, today, nextOpenLabel };
}