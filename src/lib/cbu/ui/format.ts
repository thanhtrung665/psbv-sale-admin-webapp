// src/lib/cbu/ui/format.ts
// Display formatting for the CBU workspace. Numbers are right-aligned + tabular in the UI, so the only job here is
// consistent decimals and separators (SPEC §11.9-6): USD 2 dp, kg 4 dp, VND with vi-VN grouping, no "$" on every cell.

const nfCache = new Map<string, Intl.NumberFormat>();
function nf(locale: string, min: number, max: number): Intl.NumberFormat {
  const key = `${locale}|${min}|${max}`;
  let f = nfCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, { minimumFractionDigits: min, maximumFractionDigits: max });
    nfCache.set(key, f);
  }
  return f;
}

const finite = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** 1234.5 → "1,234.50". Non-finite → "0.00". */
export function fmtNum(v: unknown, decimals = 2): string {
  return nf("en-US", decimals, decimals).format(finite(v));
}

/** Money in USD with a leading sign and "$": 5.5 → "$5.50", -1.2 → "-$1.20". */
export function fmtUsd(v: unknown, decimals = 2): string {
  const n = finite(v);
  return `${n < 0 ? "-" : ""}$${nf("en-US", decimals, decimals).format(Math.abs(n))}`;
}

/** VND, whole dong, vi-VN grouping: 890800000 → "890.800.000". */
export function fmtVnd(v: unknown): string {
  return nf("vi-VN", 0, 0).format(Math.round(finite(v)));
}

/** 25.0447 → "25.04%". */
export function fmtPct(v: unknown, decimals = 2): string {
  return `${fmtNum(v, decimals)}%`;
}

/** Margin state used to colour a margin figure: green when healthy, amber when thin, red when negative. */
export type MarginTone = "good" | "thin" | "loss" | "none";
export function marginTone(marginPct: number, hasPrice: boolean, targetPct: number): MarginTone {
  if (!hasPrice) return "none";
  if (marginPct < 0) return "loss";
  // "thin" = clearly below the order's target margin (the ROUNDUP uplift can only raise it slightly above target)
  if (marginPct < targetPct - 1) return "thin";
  return "good";
}
