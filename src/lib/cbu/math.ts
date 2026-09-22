// src/lib/cbu/math.ts
// Numeric primitives for the CBU engine. Pure, dependency-free, relative imports only.
//
// RULE (SPEC §11.6-1): every percentage in this module is a plain percent number
// (3 means 3%). There is deliberately NO "auto-detect fraction vs percent" helper —
// that heuristic (values <= 1 treated as fractions) was defect F2/P0-6.

export const EPS = 1e-9;

/** Guarantee a finite number; anything else (NaN, Infinity, "abc", undefined) becomes `fallback`. */
export function n(v: unknown, fallback = 0): number {
  const num = Number(v);
  return Number.isFinite(num) ? num : fallback;
}

/** Optional numeric input: null / undefined / "" / non-finite fall back, everything else is parsed. */
export function g(v: unknown, fallback: number): number {
  if (v === null || v === undefined || v === "") return fallback;
  return n(v, fallback);
}

/** Percent number (3 = 3%) → fraction (0.03). Always divides by 100. */
export function pctToFrac(percent: unknown): number {
  return n(percent) / 100;
}

/** Excel ROUNDUP(value, decimals) for non-negative values; immune to binary float dust. */
export function roundUp(value: number, decimals = 2): number {
  const f = Math.pow(10, decimals);
  return Math.ceil(n(value) * f - EPS) / f;
}

/** Round UP to the next multiple of `step` (Excel: ROUNDUP(x / step, 0) * step). */
export function roundUpToStep(value: number, step: number): number {
  const s = n(step);
  if (s <= 0) return n(value);
  return Math.ceil(n(value) / s - EPS) * s;
}

/** value / divisor, or 0 when the divisor is not strictly positive. */
export function safeDiv(value: number, divisor: number): number {
  return divisor > 0 ? value / divisor : 0;
}
