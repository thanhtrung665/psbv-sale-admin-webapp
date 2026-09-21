// src/lib/cbu/ui/draft.ts
// The editable state of the CBU workspace and its conversions. Pure (no React, no I/O) so it is unit-tested.
//
// Inputs are kept as STRINGS while the user types (lag-free typing, "1,5" and "1.5" both accepted) and are parsed
// only when they feed the engine or the save request. A blank parameter means "use the default value" on both the
// preview and the server side, so what is shown is always what would be saved.

import type { SaveCbuInput } from "../../schemas/cbu.schemas";
import { CBU_DEFAULTS } from "../defaults";
import type { CbuLineInput, CbuMode, CbuParams, CbuParamsInput } from "../types";
import type { CbuSheet } from "../db/service";

// ─── Number parsing ─────────────────────────────────────────────────────────

export type ParsedNumber = { ok: true; value: number | null } | { ok: false };

/**
 * "" → null (blank). Accepts "4.37", "4,37" (decimal comma), "1,234.5" and "1,234" (comma + exactly 3 digits =
 * thousands separator), and tolerates "$", "%" and spaces because values are often pasted from Excel.
 */
export function parseNumber(raw: string): ParsedNumber {
  let s = String(raw ?? "").replace(/[\s $%]/g, "");
  if (s === "") return { ok: true, value: null };
  if (/^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  else if (/^[+-]?\d*,\d+$/.test(s)) s = s.replace(",", ".");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return { ok: false };
  const v = Number(s);
  return Number.isFinite(v) ? { ok: true, value: v } : { ok: false };
}

/** Number → input string without float noise ("0.38", not "0.38000000000000006"). */
export function numToStr(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "";
  return String(Number(v.toPrecision(12)));
}

// ─── Parameter fields (drive the panels, the defaults badges and the conversions) ─────────────

export type FieldGroup = "basic" | "freight" | "policy" | "advanced";
export type FieldUnit = "%" | "$" | "kg" | "₫" | "ngày" | "x" | "";

export interface ParamField {
  /** Dotted path inside CbuParams. */
  path: string;
  label: string;
  hint?: string;
  unit: FieldUnit;
  group: FieldGroup;
  kind: "number" | "text" | "select";
  options?: string[];
  /** Inclusive lower bound (default 0) and exclusive upper bound, mirroring the server schema. */
  min?: number;
  exclusiveMin?: boolean;
  maxExclusive?: number;
  max?: number;
}

export const PARAM_FIELDS: ParamField[] = [
  // Cơ bản
  { path: "fx", label: "Tỷ giá USD → VND", hint: "Quy giá bán USD sang VND", unit: "₫", group: "basic", kind: "number", min: 0, exclusiveMin: true, max: 1e6 },
  { path: "targetMarginPct", label: "Margin mục tiêu", hint: "Lãi gộp trên giá bán — áp cho dòng chưa ghi đè", unit: "%", group: "basic", kind: "number", maxExclusive: 100 },
  { path: "commissionPct", label: "Hoa hồng", hint: "Tính trên giá bán DDP", unit: "%", group: "basic", kind: "number", maxExclusive: 100 },
  { path: "citPct", label: "CIT trên hoa hồng", hint: "Thuế nhà thầu, tính trên số tiền hoa hồng", unit: "%", group: "basic", kind: "number", max: 100 },
  // Vận chuyển
  { path: "logistics.freightFixedUsd", label: "Cước cố định", hint: "Fixed charge do forwarder báo", unit: "$", group: "freight", kind: "number" },
  { path: "logistics.freightRatePerKg", label: "Đơn giá cước", hint: "USD cho mỗi kg tính cước", unit: "$", group: "freight", kind: "number" },
  { path: "logistics.chargeableKg", label: "Trọng lượng tính cước", hint: "Chargeable weight do forwarder báo", unit: "kg", group: "freight", kind: "number" },
  { path: "logistics.freightAllInUsd", label: "Cước trọn gói", hint: "Nếu > 0 sẽ thay cho cước cố định + đơn giá × trọng lượng", unit: "$", group: "freight", kind: "number" },
  { path: "logistics.clearanceUsd", label: "Thông quan", unit: "$", group: "freight", kind: "number" },
  { path: "logistics.inlandUsd", label: "Vận chuyển nội địa", unit: "$", group: "freight", kind: "number" },
  { path: "logistics.otherUsd", label: "Phí vận chuyển khác", hint: "Không có trong Excel — mặc định 0", unit: "$", group: "freight", kind: "number" },
  // Bảo hiểm, ngân hàng & chi phí vốn
  { path: "insurance.insuredValuePct", label: "Giá trị bảo hiểm", hint: "% của (hàng + cước)", unit: "%", group: "policy", kind: "number", max: 1000 },
  { path: "insurance.ratePct", label: "Phí bảo hiểm", hint: "% trên giá trị bảo hiểm", unit: "%", group: "policy", kind: "number", max: 100 },
  { path: "insurance.minUsd", label: "Bảo hiểm tối thiểu", unit: "$", group: "policy", kind: "number" },
  { path: "bank.remitRatePct", label: "Phí chuyển tiền trả hãng", unit: "%", group: "policy", kind: "number", max: 100 },
  { path: "bank.remitVatFactor", label: "Hệ số VAT phí chuyển tiền", hint: "1.1 = 0.2% phí + 10% VAT", unit: "x", group: "policy", kind: "number", max: 10 },
  { path: "bank.minRemitUsd", label: "Chuyển tiền tối thiểu", unit: "$", group: "policy", kind: "number" },
  { path: "bank.receiveRatePct", label: "Phí nhận tiền từ khách", hint: "Chỉ áp dụng khi khách ngoài VN", unit: "%", group: "policy", kind: "number", max: 100 },
  { path: "bank.minReceiveUsd", label: "Nhận tiền tối thiểu", unit: "$", group: "policy", kind: "number" },
  { path: "bank.receiveBaseUsd", label: "Giá trị hợp đồng", hint: "Nhập tay — cơ sở tính phí nhận tiền (không lấy từ doanh thu để tránh vòng lặp)", unit: "$", group: "policy", kind: "number" },
  { path: "bank.otherUsd", label: "Phí ngân hàng khác", unit: "$", group: "policy", kind: "number" },
  { path: "pctFinanced", label: "Tỷ lệ vốn tài trợ", hint: "% giá trị hàng bị đọng vốn", unit: "%", group: "policy", kind: "number", max: 100 },
  { path: "interestPct", label: "Lãi suất năm", unit: "%", group: "policy", kind: "number", max: 1000 },
  { path: "financingDays", label: "Số ngày tài trợ", unit: "ngày", group: "policy", kind: "number", max: 3650 },
  // Nâng cao
  { path: "goodsOrigin", label: "Nguồn hàng", hint: "Local: miễn phí chuyển tiền quốc tế", unit: "", group: "advanced", kind: "select", options: ["Oversea", "Local"] },
  { path: "destinationCountry", label: "Quốc gia đích", hint: "VN: miễn phí nhận tiền từ khách", unit: "", group: "advanced", kind: "text" },
  { path: "daysPerYear", label: "Số ngày / năm", hint: "Cơ sở quy đổi lãi suất", unit: "ngày", group: "advanced", kind: "number", min: 1, max: 400 },
  { path: "vndRoundingStep", label: "Bước làm tròn VND", hint: "Giá VND làm tròn LÊN bội số này", unit: "₫", group: "advanced", kind: "number", max: 1e6 },
  { path: "lbToKg", label: "Hệ số lb → kg", hint: "Đặt 1 nếu trọng lượng đã nhập bằng kg", unit: "x", group: "advanced", kind: "number", min: 0, exclusiveMin: true, max: 10 },
];

export const FIELDS_BY_GROUP = (g: FieldGroup) => PARAM_FIELDS.filter((f) => f.group === g);

export function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
}

function setPath(target: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split(".");
  let o = target;
  keys.slice(0, -1).forEach((k) => {
    o[k] = (o[k] as Record<string, unknown>) ?? {};
    o = o[k] as Record<string, unknown>;
  });
  o[keys[keys.length - 1]] = value;
}

// ─── Draft ────────────────────────────────────────────────────────────────────

export interface DraftItem {
  id: string;
  lineNo: number;
  rawPartNumber: string;
  rawDescription: string;
  uom: string;
  qty: number;
  /** TOTAL weight of the line, lb. */
  totalWeightLb: string;
  materialUsd: string;
  dutyPct: string;
  marginPctOverride: string;
  marginUsdOverride: string;
}

/** Editable columns of the line table. `ddpPriceUsdInput` lives in the SCENARIO (prices differ Air vs Sea). */
export type ItemField = "totalWeightLb" | "materialUsd" | "dutyPct" | "marginPctOverride" | "marginUsdOverride" | "ddpPriceUsdInput";
type StoredItemField = Exclude<ItemField, "ddpPriceUsdInput">;

/** One logistics option over the same lines (Air / Sea). SPEC §11.3. */
export interface DraftScenario {
  id: string;
  label: string;
  /** Strings of the SCENARIO_FIELDS, keyed by their PARAM_FIELDS path. */
  logistics: Record<string, string>;
  /** Typed DDP price per line id (PRICE_INPUT). */
  prices: Record<string, string>;
}

export interface Draft {
  mode: CbuMode;
  /** The SHARED parameters (everything but logistics), keyed by PARAM_FIELDS[].path. */
  params: Record<string, string>;
  items: DraftItem[];
  scenarios: DraftScenario[];
  /** The scenario priced into the Quotation. */
  chosenId: string;
}

/** Parameters that vary per scenario vs. the ones shared by all of them. */
export const SCENARIO_FIELDS = PARAM_FIELDS.filter((f) => f.group === "freight");
export const SHARED_FIELDS = PARAM_FIELDS.filter((f) => f.group !== "freight");

export function sheetToDraft(sheet: CbuSheet): Draft {
  const params: Record<string, string> = {};
  for (const f of SHARED_FIELDS) {
    const v = getPath(sheet.params, f.path);
    params[f.path] = f.kind === "number" ? numToStr(v as number) : String(v ?? "");
  }
  return {
    mode: sheet.mode,
    params,
    chosenId: sheet.chosenScenarioId,
    scenarios: sheet.scenarios.map((sc) => ({
      id: sc.id,
      label: sc.label,
      logistics: Object.fromEntries(SCENARIO_FIELDS.map((f) => [f.path, numToStr(getPath({ logistics: sc.logistics }, f.path) as number)])),
      prices: Object.fromEntries(Object.entries(sc.prices).map(([id, v]) => [id, numToStr(v)])),
    })),
    items: sheet.items.map((i) => ({
      id: i.id,
      lineNo: i.lineNo,
      rawPartNumber: i.rawPartNumber,
      rawDescription: i.rawDescription,
      uom: i.uom,
      qty: i.qty,
      totalWeightLb: numToStr(i.totalWeightLb),
      materialUsd: numToStr(i.materialUsd),
      dutyPct: numToStr(i.dutyPct),
      marginPctOverride: numToStr(i.marginPctOverride),
      marginUsdOverride: numToStr(i.marginUsdOverride),
    })),
  };
}

/** The value shown in a line cell. Prices are read from the given scenario, everything else from the line. */
export function getItemValue(draft: Draft, scenarioId: string, item: DraftItem, field: ItemField): string {
  if (field === "ddpPriceUsdInput") return draft.scenarios.find((s) => s.id === scenarioId)?.prices[item.id] ?? "";
  return item[field];
}

export function setItemValue(draft: Draft, scenarioId: string, itemId: string, field: ItemField, value: string): Draft {
  if (field === "ddpPriceUsdInput") {
    return { ...draft, scenarios: draft.scenarios.map((s) => (s.id === scenarioId ? { ...s, prices: { ...s.prices, [itemId]: value } } : s)) };
  }
  return { ...draft, items: draft.items.map((i) => (i.id === itemId ? { ...i, [field as StoredItemField]: value } : i)) };
}

export function setScenarioField(draft: Draft, scenarioId: string, path: string, value: string): Draft {
  return { ...draft, scenarios: draft.scenarios.map((s) => (s.id === scenarioId ? { ...s, logistics: { ...s.logistics, [path]: value } } : s)) };
}

// ─── Scenario operations ─────────────────────────────────────────────────────

export const MAX_SCENARIOS = 4;

/** Copies `fromId` (its logistics and prices) into a new scenario at the end. Returns the new draft and its id. */
export function addScenario(draft: Draft, fromId: string): { draft: Draft; id: string } | null {
  if (draft.scenarios.length >= MAX_SCENARIOS) return null;
  const source = draft.scenarios.find((s) => s.id === fromId) ?? draft.scenarios[0];
  let n = draft.scenarios.length + 1;
  while (draft.scenarios.some((s) => s.id === `s${n}`)) n++;
  const id = `s${n}`;
  const next: DraftScenario = { id, label: `Phương án ${draft.scenarios.length + 1}`, logistics: { ...source.logistics }, prices: { ...source.prices } };
  return { draft: { ...draft, scenarios: [...draft.scenarios, next] }, id };
}

/** Removing the chosen scenario makes the first remaining one chosen. The last scenario cannot be removed. */
export function removeScenario(draft: Draft, id: string): Draft {
  if (draft.scenarios.length <= 1) return draft;
  const scenarios = draft.scenarios.filter((s) => s.id !== id);
  return { ...draft, scenarios, chosenId: draft.chosenId === id ? scenarios[0].id : draft.chosenId };
}

export function renameScenario(draft: Draft, id: string, label: string): Draft {
  return { ...draft, scenarios: draft.scenarios.map((s) => (s.id === id ? { ...s, label } : s)) };
}

export const setChosen = (draft: Draft, id: string): Draft => (draft.scenarios.some((s) => s.id === id) ? { ...draft, chosenId: id } : draft);

// ─── Validation & conversion ─────────────────────────────────────────────────

export type FieldErrors = Record<string, string>;

function checkRange(v: number, f: { min?: number; exclusiveMin?: boolean; max?: number; maxExclusive?: number }): string | null {
  const min = f.min ?? 0;
  if (f.exclusiveMin ? v <= min : v < min) return f.exclusiveMin ? "Phải lớn hơn 0" : "Không được âm";
  if (f.maxExclusive !== undefined && v >= f.maxExclusive) return `Phải nhỏ hơn ${f.maxExclusive}`;
  if (f.max !== undefined && v > f.max) return `Tối đa ${f.max}`;
  return null;
}

const ITEM_FIELD_LIMITS: Record<ItemField, { max?: number; maxExclusive?: number }> = {
  totalWeightLb: { max: 1e9 },
  materialUsd: { max: 1e9 },
  dutyPct: { max: 100 },
  marginPctOverride: { maxExclusive: 100 },
  marginUsdOverride: { max: 1e9 },
  ddpPriceUsdInput: { max: 1e9 },
};

export const itemErrorKey = (id: string, field: ItemField) => `items.${id}.${field}`;
export const paramErrorKey = (path: string) => `params.${path}`;
/** Error key of a scenario-specific parameter (logistics). */
export const scenarioErrorKey = (scenarioId: string, path: string) => `scenarios.${scenarioId}.${path}`;
/** Error key of a typed price (per scenario, per line). */
export const priceErrorKey = (scenarioId: string, itemId: string) => `prices.${scenarioId}.${itemId}`;

export interface EngineInput {
  params: CbuParamsInput;
  lines: CbuLineInput[];
  errors: FieldErrors;
}

/** One parameter's raw text → its value (blank = the engine default) or an error message. */
function readParam(f: ParamField, raw: string): { value?: number | string; error?: string } {
  if (f.kind !== "number") {
    const t = raw.trim();
    return { value: t === "" ? (getPath(CBU_DEFAULTS, f.path) as string) : t };
  }
  const p = parseNumber(raw);
  if (!p.ok) return { error: "Không phải số hợp lệ" };
  if (p.value === null) return { value: getPath(CBU_DEFAULTS, f.path) as number };
  const range = checkRange(p.value, f);
  return range ? { error: range } : { value: p.value };
}

/**
 * Draft → engine input for ONE scenario (default: the chosen one): shared params + that scenario's logistics + the
 * shared lines carrying that scenario's typed prices. Blank params take the default; blank overrides and prices are
 * null; invalid text is an error (the value is left out, never guessed).
 */
export function draftToEngine(draft: Draft, scenarioId: string = draft.chosenId): EngineInput {
  const errors: FieldErrors = {};
  const scenario = draft.scenarios.find((s) => s.id === scenarioId) ?? draft.scenarios[0];
  const params: Record<string, unknown> = { mode: draft.mode };

  for (const f of SHARED_FIELDS) {
    const r = readParam(f, draft.params[f.path] ?? "");
    if (r.error) errors[paramErrorKey(f.path)] = r.error;
    else setPath(params, f.path, r.value);
  }
  for (const f of SCENARIO_FIELDS) {
    const r = readParam(f, scenario?.logistics[f.path] ?? "");
    if (r.error) errors[scenarioErrorKey(scenario.id, f.path)] = r.error;
    else setPath(params, f.path, r.value);
  }

  const lines: CbuLineInput[] = draft.items.map((it) => {
    const num = (field: StoredItemField, blank: number | null): number | null => {
      const p = parseNumber(it[field]);
      if (!p.ok) {
        errors[itemErrorKey(it.id, field)] = "Không phải số hợp lệ";
        return blank;
      }
      if (p.value === null) return blank;
      const err = checkRange(p.value, ITEM_FIELD_LIMITS[field]);
      if (err) {
        errors[itemErrorKey(it.id, field)] = err;
        return blank;
      }
      return p.value;
    };
    const price = ((): number | null => {
      const p = parseNumber(scenario?.prices[it.id] ?? "");
      if (!p.ok) {
        errors[priceErrorKey(scenario.id, it.id)] = "Không phải số hợp lệ";
        return null;
      }
      if (p.value === null) return null;
      const err = checkRange(p.value, ITEM_FIELD_LIMITS.ddpPriceUsdInput);
      if (err) {
        errors[priceErrorKey(scenario.id, it.id)] = err;
        return null;
      }
      return p.value;
    })();
    return {
      id: it.id,
      lineNo: it.lineNo,
      qty: it.qty,
      materialUsd: num("materialUsd", 0) ?? 0,
      totalWeightLb: num("totalWeightLb", 0) ?? 0,
      dutyPct: num("dutyPct", 0) ?? 0,
      marginPctOverride: num("marginPctOverride", null),
      marginUsdOverride: num("marginUsdOverride", null),
      ddpPriceUsdInput: price,
    };
  });

  return { params: params as CbuParamsInput, lines, errors };
}

/** Every input error across ALL scenarios — what gates the Save button. */
export function allErrors(draft: Draft): FieldErrors {
  return draft.scenarios.reduce<FieldErrors>((acc, s) => ({ ...acc, ...draftToEngine(draft, s.id).errors }), {});
}

/** Everything the server needs — inputs only, complete, so a save always reproduces what the preview shows. */
export function draftToSaveInput(draft: Draft): SaveCbuInput {
  const base = draftToEngine(draft, draft.scenarios[0].id);
  const { mode, ...rest } = base.params as CbuParamsInput & { mode?: CbuMode };
  void mode;
  return {
    mode: draft.mode,
    // the FIRST scenario is the base: its logistics travel in `params` (the flat RFQ columns)
    params: rest as SaveCbuInput["params"],
    items: base.lines.map((l) => ({
      id: l.id,
      materialUsd: l.materialUsd,
      totalWeightLb: l.totalWeightLb,
      dutyPct: l.dutyPct ?? 0,
      marginPctOverride: l.marginPctOverride ?? null,
      marginUsdOverride: l.marginUsdOverride ?? null,
    })),
    scenarios: draft.scenarios.map((s, i) => {
      const e = draftToEngine(draft, s.id);
      const prices: Record<string, number> = {};
      for (const l of e.lines) if (l.ddpPriceUsdInput != null && l.ddpPriceUsdInput > 0) prices[l.id] = l.ddpPriceUsdInput;
      return {
        id: s.id,
        label: s.label.trim() || s.id,
        ...(i > 0 ? { overrides: { logistics: e.params.logistics } } : {}),
        prices,
      };
    }) as SaveCbuInput["scenarios"],
    chosenScenarioId: draft.chosenId,
  };
}

export const isDirty = (a: Draft, b: Draft): boolean => JSON.stringify(a) !== JSON.stringify(b);

// ─── Params: default badges ──────────────────────────────────────────────────

/** True when a parameter's current input differs from the engine default (blank counts as default). */
export function isParamModified(draft: Draft, f: ParamField): boolean {
  const raw = (draft.params[f.path] ?? "").trim();
  if (raw === "") return false;
  const def = getPath(CBU_DEFAULTS as CbuParams, f.path);
  if (f.kind !== "number") return raw !== String(def);
  const p = parseNumber(raw);
  return !p.ok || p.value !== def;
}

export function modifiedCount(draft: Draft, fields: ParamField[]): number {
  return fields.filter((f) => isParamModified(draft, f)).length;
}

export function defaultAsString(f: ParamField): string {
  const def = getPath(CBU_DEFAULTS, f.path);
  return f.kind === "number" ? numToStr(def as number) : String(def ?? "");
}

// ─── Table columns ────────────────────────────────────────────────────────────

/**
 * The editable columns of the line table, LEFT TO RIGHT as they appear on screen. The index in this list is the
 * column number used by keyboard navigation and by paste, so the order must match the visual order.
 */
export function editableColumns(mode: CbuMode, showOverrides: boolean): ItemField[] {
  const cols: ItemField[] = ["totalWeightLb", "materialUsd", "dutyPct"];
  if (mode === "MARGIN_INPUT" && showOverrides) cols.push("marginPctOverride", "marginUsdOverride");
  if (mode === "PRICE_INPUT") cols.push("ddpPriceUsdInput");
  return cols;
}

// ─── Paste from Excel ────────────────────────────────────────────────────────

/** Splits clipboard text (rows by newline, cells by tab) and drops trailing empty rows. */
export function parseClipboardMatrix(text: string): string[][] {
  const rows = text.replace(/\r/g, "").split("\n").map((r) => r.split("\t"));
  while (rows.length > 0 && rows[rows.length - 1].every((c) => c.trim() === "")) rows.pop();
  return rows;
}

/**
 * Writes a pasted block into the line table starting at (`startRow`, `startCol`). `columns` are the editable
 * columns currently visible, left to right; a pasted price goes to the given scenario. Cells outside the table are ignored.
 */
export function applyPaste(draft: Draft, scenarioId: string, startRow: number, startCol: number, matrix: string[][], columns: ItemField[]): Draft {
  let out = draft;
  matrix.forEach((cells, r) => {
    const item = draft.items[startRow + r];
    if (!item) return;
    cells.forEach((cell, c) => {
      const field = columns[startCol + c];
      if (field) out = setItemValue(out, scenarioId, item.id, field, cell.replace(/[\s $%]/g, ""));
    });
  });
  return out;
}
