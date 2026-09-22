// src/lib/cbu/pricing.ts
// Selling price of one line (Excel column P) and everything that depends on it.
//
// WHY A CLOSED FORM: commission is charged ON the selling price and is ALSO a cost, so
// cost → price → commission → cost is circular. Solving for the price algebraically removes the loop:
//
//   ddp = ROUNDUP( base ÷ (k − m) , d )          k = 1 − q·(1 + c)
//   ddp = ROUNDUP( (base + margin$) ÷ k , d )    when a $/unit override is set

import { EPS, pctToFrac, roundUp } from "./math";
import type { CbuLineInput, CbuMode } from "./types";

export interface PriceContext {
  mode: CbuMode;
  /** Sum of the price-independent costs of the line: material + bank + logistics + duty + custom. */
  base: number;
  /** Commission rate q as a fraction. */
  q: number;
  /** CIT rate c as a fraction. */
  c: number;
  /** Target margin as a percent number, used when the line has no override. */
  targetMarginPct: number;
  usdDecimals: number;
}

export interface PriceOutcome {
  ddpPriceUsd: number;
  /** Set when the price could not be derived (margin + commission ≥ 100%, or no price typed). */
  warning?: string;
}

/** Margin % to aim for on this line: its own override (0 is valid), else the order-wide target. */
export function activeMarginPct(line: CbuLineInput, targetMarginPct: number): number {
  const o = line.marginPctOverride;
  return o !== null && o !== undefined && Number.isFinite(Number(o)) ? Number(o) : targetMarginPct;
}

export function priceLine(line: CbuLineInput, ctx: PriceContext): PriceOutcome {
  if (ctx.mode === "PRICE_INPUT") {
    const typed = Number(line.ddpPriceUsdInput);
    const price = Number.isFinite(typed) && typed > 0 ? typed : 0;
    return price > 0 ? { ddpPriceUsd: price } : { ddpPriceUsd: 0, warning: "Chưa nhập giá bán (DDP Price)." };
  }

  const k = 1 - ctx.q * (1 + ctx.c);
  const usd = Number(line.marginUsdOverride);

  // Highest priority: fixed margin $ per unit.
  if (Number.isFinite(usd) && usd > 0) {
    if (k > EPS) return { ddpPriceUsd: roundUp((ctx.base + usd) / k, ctx.usdDecimals) };
    return {
      ddpPriceUsd: roundUp(ctx.base + usd, ctx.usdDecimals),
      warning: "Commission vượt 100% — không tính được giá bán theo margin $/unit.",
    };
  }

  const marginPct = activeMarginPct(line, ctx.targetMarginPct);
  const denominator = k - pctToFrac(marginPct);
  if (denominator > EPS) return { ddpPriceUsd: roundUp(ctx.base / denominator, ctx.usdDecimals) };

  return {
    ddpPriceUsd: roundUp(ctx.base, ctx.usdDecimals),
    warning:
      `Margin ${marginPct}% + commission ${ctx.q * 100}% (kèm CIT) vượt 100% — ` +
      `không tính được giá bán, đã trả về giá vốn.`,
  };
}
