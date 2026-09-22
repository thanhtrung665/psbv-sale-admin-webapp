// src/lib/cbu/db/scenarios.ts
// Scenarios (SPEC §11.3): several logistics options priced over the SAME lines (Air / Sea).
//
//  - the FIRST scenario is the base: its params are the flat RFQ columns, its `overrides` are empty;
//  - later scenarios keep only what differs from the base (today: logistics);
//  - lines (material, weight, duty, margin overrides) are shared; typed prices (PRICE_INPUT) are per scenario;
//  - the CHOSEN scenario is the one whose results are saved on the items / RFQ totals (what the Quotation reads).

import { resolveParams } from "../params";
import type { CbuLineInput, CbuParams, CbuParamsInput } from "../types";
import type { SaveCbuInput } from "../../schemas/cbu.schemas";
import { badInput } from "./errors";
import { mergeParams, type CbuConfig, type CbuItemEdit } from "./mapping";

export interface ScenarioState {
  id: string;
  label: string;
  overrides: CbuParamsInput;
  /** undefined = legacy config: fall back to the price stored on the item. (FCA_DAP: the FCA prices.) */
  prices?: Record<string, number>;
  /** FCA_DAP: the typed DAP price per line id. */
  dapPrices?: Record<string, number>;
}

/**
 * Stored config + what the client sent → the scenarios to calculate and which one is chosen.
 * `lines` are the shared lines AFTER the client's edits (they carry the stored / edited price in `ddpPriceUsdInput`).
 */
export function resolveScenarios(
  stored: CbuConfig,
  input: Pick<SaveCbuInput, "scenarios" | "chosenScenarioId"> & { items?: CbuItemEdit[] },
  lines: CbuLineInput[]
): { scenarios: ScenarioState[]; chosenId: string } {
  let list: ScenarioState[];

  if (input.scenarios) {
    list = input.scenarios.map((s, i) => ({
      id: s.id,
      label: s.label,
      overrides: i === 0 ? {} : ((s.overrides ?? {}) as CbuParamsInput),
      prices: s.prices ?? {},
      dapPrices: s.dapPrices ?? {},
    }));
  } else {
    list = stored.scenarios.map((s) => ({ ...s, overrides: s.overrides ?? {} }));
    // Clients that predate scenarios send the price on the line: it belongs to the first scenario.
    const priceEdits = (input.items ?? []).filter((e) => e.ddpPriceUsdInput !== undefined);
    if (priceEdits.length > 0) {
      const first = list[0];
      const prices: Record<string, number> = { ...(first.prices ?? Object.fromEntries(lines.filter((l) => l.ddpPriceUsdInput != null).map((l) => [l.id, l.ddpPriceUsdInput as number]))) };
      for (const e of priceEdits) {
        if (e.ddpPriceUsdInput === null || e.ddpPriceUsdInput === undefined) delete prices[e.id];
        else prices[e.id] = e.ddpPriceUsdInput;
      }
      list[0] = { ...first, prices };
    }
  }

  const ids = list.map((s) => s.id);
  const wanted = input.chosenScenarioId ?? (input.scenarios ? undefined : stored.chosenScenarioId);
  const chosenId = wanted ?? (ids.includes(stored.chosenScenarioId) ? stored.chosenScenarioId : ids[0]);
  if (!ids.includes(chosenId)) {
    throw badInput("Kịch bản được chọn không tồn tại.", [`Không có kịch bản "${chosenId}". Hiện có: ${ids.join(", ")}.`]);
  }
  return { scenarios: list, chosenId };
}

/** Effective params of a scenario: the shared/base params, with this scenario's overrides on top (index 0 = base). */
export function scenarioParams(base: CbuParamsInput, s: ScenarioState, index: number): CbuParams {
  return resolveParams(index === 0 ? base : mergeParams(base, s.overrides));
}

/** The shared lines carrying THIS scenario's typed prices (blank = null). Legacy configs fall back to the item price. */
export function scenarioLines(lines: CbuLineInput[], s: ScenarioState): CbuLineInput[] {
  return lines.map((l) => ({
    ...l,
    ddpPriceUsdInput: s.prices ? (s.prices[l.id] ?? null) : (l.ddpPriceUsdInput ?? null),
    dapPriceUsdInput: s.dapPrices?.[l.id] ?? null,
  }));
}

/** The prices worth persisting: in PRICE_INPUT the ones actually used, otherwise exactly what was stored/typed. */
export function pricesToPersist(s: ScenarioState, sLines: CbuLineInput[], priceMode: boolean): Record<string, number> {
  if (!priceMode && s.prices) return s.prices;
  const out: Record<string, number> = {};
  for (const l of sLines) if (l.ddpPriceUsdInput != null && l.ddpPriceUsdInput > 0) out[l.id] = l.ddpPriceUsdInput;
  return out;
}

/** FCA_DAP: the typed DAP prices of a scenario. */
export function dapPricesToPersist(s: ScenarioState, sLines: CbuLineInput[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of sLines) if (l.dapPriceUsdInput != null && l.dapPriceUsdInput > 0) out[l.id] = l.dapPriceUsdInput;
  return s.dapPrices && Object.keys(out).length === 0 ? s.dapPrices : out;
}
