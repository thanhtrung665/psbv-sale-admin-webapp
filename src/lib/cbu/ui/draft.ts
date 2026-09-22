// src/lib/cbu/ui/draft.ts
// The editable state of the CBU workspace and its conversions. Pure (no React, no I/O) so it is unit-tested.
//
// Inputs are kept as STRINGS while the user types (lag-free typing, "1,5" and "1.5" both accepted) and are parsed
// only when they feed the engine or the save request. A blank parameter means "use the default value" on both the
// preview and the server side, so what is shown is always what would be saved.

import type { SaveCbuInput } from "../../schemas/cbu.schemas";
import { defaultsFor } from "../params";
import type { CbuLineInput, CbuMode, CbuParamsInput, CbuProfile, QuoteBasis } from "../types";
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
export type FieldUnit = "%" | "$" | "kg" | "₫" | "days" | "x" | "";

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
  { path: "fx", label: "Exchange rate (quote) USD→VND", hint: "Quy giá bán USD sang VND", unit: "₫", group: "basic", kind: "number", min: 0, exclusiveMin: true, max: 1e6 },
  { path: "targetMarginPct", label: "Target margin (m)", hint: "Lãi gộp trên giá bán — áp cho dòng chưa ghi đè", unit: "%", group: "basic", kind: "number", maxExclusive: 100 },
  { path: "commissionPct", label: "Commission rate (q)", hint: "Tính trên giá bán DDP", unit: "%", group: "basic", kind: "number", maxExclusive: 100 },
  { path: "citPct", label: "CIT on commission (c)", hint: "Thuế nhà thầu, tính trên số tiền hoa hồng", unit: "%", group: "basic", kind: "number", max: 100 },
  // Vận chuyển
  { path: "logistics.freightFixedUsd", label: "Fixed charge (USD)", hint: "Fixed charge do forwarder báo", unit: "$", group: "freight", kind: "number" },
  { path: "logistics.freightRatePerKg", label: "Rate (USD/kg)", hint: "USD cho mỗi kg tính cước", unit: "$", group: "freight", kind: "number" },
  { path: "logistics.chargeableKg", label: "Chargeable weight (kg)", hint: "Chargeable weight do forwarder báo", unit: "kg", group: "freight", kind: "number" },
  { path: "logistics.freightAllInUsd", label: "FREIGHT (USD) all-in", hint: "Nếu > 0 sẽ thay cho cước cố định + đơn giá × trọng lượng", unit: "$", group: "freight", kind: "number" },
  { path: "logistics.clearanceUsd", label: "Clearance (USD)", unit: "$", group: "freight", kind: "number" },
  { path: "logistics.inlandUsd", label: "Inland (USD)", unit: "$", group: "freight", kind: "number" },
  { path: "logistics.otherUsd", label: "Other logistics (USD)", hint: "Không có trong Excel — mặc định 0", unit: "$", group: "freight", kind: "number" },
  // Bảo hiểm, ngân hàng & chi phí vốn
  { path: "insurance.insuredValuePct", label: "% Insured value", hint: "% của (hàng + cước)", unit: "%", group: "policy", kind: "number", max: 1000 },
  { path: "insurance.ratePct", label: "Insurance rate", hint: "% trên giá trị bảo hiểm", unit: "%", group: "policy", kind: "number", max: 100 },
  { path: "insurance.minUsd", label: "Min insurance (USD)", unit: "$", group: "policy", kind: "number" },
  { path: "bank.remitRatePct", label: "International remittance — Rate", unit: "%", group: "policy", kind: "number", max: 100 },
  { path: "bank.remitVatFactor", label: "International remittance — VAT factor", hint: "1.1 = 0.2% phí + 10% VAT", unit: "x", group: "policy", kind: "number", max: 10 },
  { path: "bank.minRemitUsd", label: "International remittance — Min fee (USD)", unit: "$", group: "policy", kind: "number" },
  { path: "bank.receiveRatePct", label: "International receive — Rate", hint: "Chỉ áp dụng khi khách ngoài VN", unit: "%", group: "policy", kind: "number", max: 100 },
  { path: "bank.minReceiveUsd", label: "International receive — Min fee (USD)", unit: "$", group: "policy", kind: "number" },
  { path: "bank.receiveBaseUsd", label: "International receive — Base amount (USD)", hint: "Nhập tay — cơ sở tính phí nhận tiền (không lấy từ doanh thu để tránh vòng lặp)", unit: "$", group: "policy", kind: "number" },
  { path: "bank.otherUsd", label: "Other bank charges (USD)", unit: "$", group: "policy", kind: "number" },
  { path: "pctFinanced", label: "% Value financed", hint: "% giá trị hàng bị đọng vốn", unit: "%", group: "policy", kind: "number", max: 100 },
  { path: "interestPct", label: "Interest rate p.a.", unit: "%", group: "policy", kind: "number", max: 1000 },
  { path: "financingDays", label: "Financing days", unit: "days", group: "policy", kind: "number", max: 3650 },
  // Nâng cao
  { path: "goodsOrigin", label: "Goods origin", hint: "Local: miễn phí chuyển tiền quốc tế", unit: "", group: "advanced", kind: "select", options: ["Oversea", "Local"] },
  { path: "destinationCountry", label: "Country", hint: "VN: miễn phí nhận tiền từ khách", unit: "", group: "advanced", kind: "text" },
  { path: "daysPerYear", label: "Days per year", hint: "Cơ sở quy đổi lãi suất", unit: "days", group: "advanced", kind: "number", min: 1, max: 400 },
  { path: "vndRoundingStep", label: "VND rounding step", hint: "Giá VND làm tròn LÊN bội số này", unit: "₫", group: "advanced", kind: "number", max: 1e6 },
  { path: "lbToKg", label: "Conversion factor lb → kg", hint: "Đặt 1 nếu trọng lượng đã nhập bằng kg", unit: "x", group: "advanced", kind: "number", min: 0, exclusiveMin: true, max: 10 },
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

// ─── Profiles: which parameters exist, and where they live ────────────────────

export type FieldScope = "shared" | "scenario" | "hidden";

/**
 * Baker Hughes (FCA_DAP): no duty, commission, CIT, insurance, allocation of logistics.
 * The quote is in USD, but the RFQ totals saved in VND depend on `fx` and the rounding step, so they stay editable:
 * a hidden field would fall back to the default in the browser while the server used the RFQ's value.
 */
const FCA_DAP_SCOPE: Record<string, FieldScope> = {
  fx: "shared",
  vndRoundingStep: "shared",
  targetMarginPct: "shared",
  "bank.remitRatePct": "shared",
  "bank.remitVatFactor": "shared",
  "bank.minRemitUsd": "shared",
  "bank.receiveRatePct": "shared",
  "bank.minReceiveUsd": "shared",
  "bank.receiveBaseUsd": "shared",
  "bank.otherUsd": "shared",
  goodsOrigin: "shared",
  destinationCountry: "shared",
  daysPerYear: "shared",
  // payment terms and freight are the scenario axis (Payment with Order / Net 60)
  "logistics.freightAllInUsd": "scenario",
  "logistics.freightFixedUsd": "scenario",
  pctFinanced: "scenario",
  interestPct: "scenario",
  financingDays: "scenario",
};

/** Where a parameter lives for a profile: shared by every scenario, specific to one scenario, or not used. */
export function fieldScope(f: ParamField, profile: CbuProfile): FieldScope {
  if (profile === "FCA_DAP") return FCA_DAP_SCOPE[f.path] ?? "hidden";
  return f.group === "freight" ? "scenario" : "shared";
}

export const sharedFieldsFor = (profile: CbuProfile) => PARAM_FIELDS.filter((f) => fieldScope(f, profile) === "shared");
export const scenarioFieldsFor = (profile: CbuProfile) => PARAM_FIELDS.filter((f) => fieldScope(f, profile) === "scenario");

/** Profile-specific wording for the same parameter (the Baker workbook reuses two freight fields). */
const FCA_DAP_TEXT: Record<string, { label?: string; hint?: string }> = {
  fx: { label: "USD-->VND" },
  "logistics.freightAllInUsd": { label: "Freight (quoted)", hint: "Cước trọn gói cộng vào Incoterm 2 — DAP (Excel P16)" },
  "logistics.freightFixedUsd": { label: "Freight per Logistic (reference)", hint: "Chỉ để đối chiếu — cảnh báo nếu khác cước báo giá" },
  pctFinanced: { label: "% Value financed", hint: "0% = Payment with Order · 100% = Net 60" },
  interestPct: { label: "Interest rate p.a.", hint: "Tính chi phí tín dụng cho giá DAP" },
  financingDays: { label: "Credit (days)", hint: "Net 60 days: 45" },
  targetMarginPct: { label: "% Margin", hint: "Áp cho dòng chưa nhập % Margin riêng" },
  "bank.receiveBaseUsd": { hint: "Nhập tay — cơ sở tính phí nhận tiền (Bank Fee!L7)" },
};

/** The field with the wording of the given profile. */
export function localizeField(f: ParamField, profile: CbuProfile): ParamField {
  const t = profile === "FCA_DAP" ? FCA_DAP_TEXT[f.path] : undefined;
  return t ? { ...f, ...t } : f;
}

/** Default value (as the input string) of a parameter for a profile. */
export function defaultAsString(f: ParamField, profile: CbuProfile = "DDP_IMPORT"): string {
  const def = getPath(defaultsFor(profile), f.path);
  return f.kind === "number" ? numToStr(def as number) : String(def ?? "");
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

/** Editable columns of the line table. The prices live in the SCENARIO (they differ Air vs Sea, or per payment term). */
export type ItemField = "totalWeightLb" | "materialUsd" | "dutyPct" | "marginPctOverride" | "marginUsdOverride" | "ddpPriceUsdInput" | "dapPriceUsdInput";
type StoredItemField = Exclude<ItemField, "ddpPriceUsdInput" | "dapPriceUsdInput">;
type PriceField = "ddpPriceUsdInput" | "dapPriceUsdInput";
const isPriceField = (f: ItemField): f is PriceField => f === "ddpPriceUsdInput" || f === "dapPriceUsdInput";

/** One option over the same lines: a logistics option (Air / Sea) or a payment term (Payment with Order / Net 60). */
export interface DraftScenario {
  id: string;
  label: string;
  /** Strings of the scenario-scope parameters of the profile, keyed by their PARAM_FIELDS path. */
  fields: Record<string, string>;
  /** Typed price per line id (PRICE_INPUT). FCA_DAP: the FCA price. */
  prices: Record<string, string>;
  /** FCA_DAP: the typed DAP price per line id. */
  dapPrices: Record<string, string>;
}

export interface Draft {
  profile: CbuProfile;
  /** FCA_DAP: which price is saved on the lines / totals. */
  quoteBasis: QuoteBasis;
  mode: CbuMode;
  /** The SHARED parameters of the profile, keyed by PARAM_FIELDS[].path. */
  params: Record<string, string>;
  items: DraftItem[];
  scenarios: DraftScenario[];
  /** The scenario priced into the Quotation. */
  chosenId: string;
}

const stringsOf = (fields: ParamField[], source: unknown): Record<string, string> =>
  Object.fromEntries(
    fields.map((f) => {
      const v = getPath(source, f.path);
      return [f.path, f.kind === "number" ? numToStr(v as number) : String(v ?? "")];
    })
  );

export function sheetToDraft(sheet: CbuSheet): Draft {
  const profile = sheet.profile;
  const scenarioFields = scenarioFieldsFor(profile);
  return {
    profile,
    quoteBasis: sheet.quoteBasis,
    mode: sheet.mode,
    params: stringsOf(sharedFieldsFor(profile), sheet.params),
    chosenId: sheet.chosenScenarioId,
    scenarios: sheet.scenarios.map((sc) => ({
      id: sc.id,
      label: sc.label,
      fields: stringsOf(scenarioFields, sc.params),
      prices: Object.fromEntries(Object.entries(sc.prices).map(([id, v]) => [id, numToStr(v)])),
      dapPrices: Object.fromEntries(Object.entries(sc.dapPrices ?? {}).map(([id, v]) => [id, numToStr(v)])),
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

/**
 * Switch the CBU model (Hoàng Sơn DDP ⇄ Baker Hughes FCA/DAP). Parameters and scenarios restart from the new model's
 * defaults — Baker starts with the two payment terms of the workbook — and the lines are kept. Typed prices are cleared
 * (they belong to the old model's prices).
 */
export function switchProfile(draft: Draft, profile: CbuProfile): Draft {
  if (draft.profile === profile) return draft;
  const D = defaultsFor(profile);
  const fields = stringsOf(scenarioFieldsFor(profile), D);
  const scenarios: DraftScenario[] =
    profile === "FCA_DAP"
      ? [
          { id: "pwo", label: "Payment with Order", fields: { ...fields, pctFinanced: "0", financingDays: "0" }, prices: {}, dapPrices: {} },
          { id: "net60", label: "Net 60 Days", fields: { ...fields, pctFinanced: "100", financingDays: "45" }, prices: {}, dapPrices: {} },
        ]
      : [{ id: "default", label: "Mặc định", fields, prices: {}, dapPrices: {} }];
  return { ...draft, profile, quoteBasis: "FCA", params: stringsOf(sharedFieldsFor(profile), D), scenarios, chosenId: scenarios[0].id };
}

/** The value shown in a line cell. Prices are read from the given scenario, everything else from the line. */
export function getItemValue(draft: Draft, scenarioId: string, item: DraftItem, field: ItemField): string {
  if (isPriceField(field)) {
    const s = draft.scenarios.find((x) => x.id === scenarioId);
    return (field === "ddpPriceUsdInput" ? s?.prices : s?.dapPrices)?.[item.id] ?? "";
  }
  return item[field];
}

export function setItemValue(draft: Draft, scenarioId: string, itemId: string, field: ItemField, value: string): Draft {
  if (isPriceField(field)) {
    const key = field === "ddpPriceUsdInput" ? "prices" : "dapPrices";
    return { ...draft, scenarios: draft.scenarios.map((s) => (s.id === scenarioId ? { ...s, [key]: { ...s[key], [itemId]: value } } : s)) };
  }
  return { ...draft, items: draft.items.map((i) => (i.id === itemId ? { ...i, [field as StoredItemField]: value } : i)) };
}

export function setScenarioField(draft: Draft, scenarioId: string, path: string, value: string): Draft {
  return { ...draft, scenarios: draft.scenarios.map((s) => (s.id === scenarioId ? { ...s, fields: { ...s.fields, [path]: value } } : s)) };
}

// ─── Scenario operations ─────────────────────────────────────────────────────

export const MAX_SCENARIOS = 4;

/** Copies `fromId` (its parameters and prices) into a new scenario at the end. Returns the new draft and its id. */
export function addScenario(draft: Draft, fromId: string): { draft: Draft; id: string } | null {
  if (draft.scenarios.length >= MAX_SCENARIOS) return null;
  const source = draft.scenarios.find((s) => s.id === fromId) ?? draft.scenarios[0];
  let n = draft.scenarios.length + 1;
  while (draft.scenarios.some((s) => s.id === `s${n}`)) n++;
  const id = `s${n}`;
  const next: DraftScenario = { id, label: `Phương án ${draft.scenarios.length + 1}`, fields: { ...source.fields }, prices: { ...source.prices }, dapPrices: { ...source.dapPrices } };
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
  dapPriceUsdInput: { max: 1e9 },
};

export const itemErrorKey = (id: string, field: ItemField) => `items.${id}.${field}`;
export const paramErrorKey = (path: string) => `params.${path}`;
/** Error key of a scenario-specific parameter. */
export const scenarioErrorKey = (scenarioId: string, path: string) => `scenarios.${scenarioId}.${path}`;
/** Error key of a typed price (per scenario, per line). FCA_DAP DAP prices use `dapPriceErrorKey`. */
export const priceErrorKey = (scenarioId: string, itemId: string) => `prices.${scenarioId}.${itemId}`;
export const dapPriceErrorKey = (scenarioId: string, itemId: string) => `dapPrices.${scenarioId}.${itemId}`;

export interface EngineInput {
  params: CbuParamsInput;
  lines: CbuLineInput[];
  errors: FieldErrors;
}

/** One parameter's raw text → its value (blank = the profile's default) or an error message. */
function readParam(f: ParamField, raw: string, profile: CbuProfile): { value?: number | string; error?: string } {
  const D = defaultsFor(profile);
  if (f.kind !== "number") {
    const t = raw.trim();
    return { value: t === "" ? (getPath(D, f.path) as string) : t };
  }
  const p = parseNumber(raw);
  if (!p.ok) return { error: "Không phải số hợp lệ" };
  if (p.value === null) return { value: getPath(D, f.path) as number };
  const range = checkRange(p.value, f);
  return range ? { error: range } : { value: p.value };
}

/**
 * Draft → engine input for ONE scenario (default: the chosen one): shared params + that scenario's parameters + the
 * shared lines carrying that scenario's typed prices. Blank params take the profile's default; blank overrides and
 * prices are null; invalid text is an error (the value is left out, never guessed).
 */
export function draftToEngine(draft: Draft, scenarioId: string = draft.chosenId): EngineInput {
  const errors: FieldErrors = {};
  const scenario = draft.scenarios.find((s) => s.id === scenarioId) ?? draft.scenarios[0];
  const profile = draft.profile;
  const params: Record<string, unknown> = { mode: draft.mode, profile, quoteBasis: draft.quoteBasis };

  for (const f of sharedFieldsFor(profile)) {
    const r = readParam(f, draft.params[f.path] ?? "", profile);
    if (r.error) errors[paramErrorKey(f.path)] = r.error;
    else setPath(params, f.path, r.value);
  }
  for (const f of scenarioFieldsFor(profile)) {
    const r = readParam(f, scenario?.fields[f.path] ?? "", profile);
    if (r.error) errors[scenarioErrorKey(scenario.id, f.path)] = r.error;
    else setPath(params, f.path, r.value);
  }

  const readPrice = (raw: string | undefined, key: string): number | null => {
    const p = parseNumber(raw ?? "");
    if (!p.ok) {
      errors[key] = "Không phải số hợp lệ";
      return null;
    }
    if (p.value === null) return null;
    const err = checkRange(p.value, ITEM_FIELD_LIMITS.ddpPriceUsdInput);
    if (err) {
      errors[key] = err;
      return null;
    }
    return p.value;
  };

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
    return {
      id: it.id,
      lineNo: it.lineNo,
      qty: it.qty,
      materialUsd: num("materialUsd", 0) ?? 0,
      totalWeightLb: num("totalWeightLb", 0) ?? 0,
      dutyPct: num("dutyPct", 0) ?? 0,
      marginPctOverride: num("marginPctOverride", null),
      marginUsdOverride: num("marginUsdOverride", null),
      ddpPriceUsdInput: readPrice(scenario?.prices[it.id], priceErrorKey(scenario.id, it.id)),
      dapPriceUsdInput: profile === "FCA_DAP" ? readPrice(scenario?.dapPrices[it.id], dapPriceErrorKey(scenario.id, it.id)) : null,
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
  const { mode, profile, quoteBasis, ...rest } = base.params as CbuParamsInput & { mode?: CbuMode; profile?: CbuProfile; quoteBasis?: QuoteBasis };
  void mode;
  void profile;
  void quoteBasis;
  const scenarioPaths = scenarioFieldsFor(draft.profile).map((f) => f.path);
  const priceMap = (lines: CbuLineInput[], pick: (l: CbuLineInput) => number | null | undefined) => {
    const out: Record<string, number> = {};
    for (const l of lines) {
      const v = pick(l);
      if (v != null && v > 0) out[l.id] = v;
    }
    return out;
  };
  return {
    mode: draft.mode,
    profile: draft.profile,
    quoteBasis: draft.quoteBasis,
    // the FIRST scenario is the base: its parameters travel in `params` (the flat RFQ columns)
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
      const overrides: Record<string, unknown> = {};
      if (i > 0) for (const path of scenarioPaths) setPath(overrides, path, getPath(e.params, path));
      return {
        id: s.id,
        label: s.label.trim() || s.id,
        ...(i > 0 ? { overrides } : {}),
        prices: priceMap(e.lines, (l) => l.ddpPriceUsdInput),
        ...(draft.profile === "FCA_DAP" ? { dapPrices: priceMap(e.lines, (l) => l.dapPriceUsdInput) } : {}),
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
  const def = getPath(defaultsFor(draft.profile), f.path);
  if (f.kind !== "number") return raw !== String(def);
  const p = parseNumber(raw);
  return !p.ok || p.value !== def;
}

export function modifiedCount(draft: Draft, fields: ParamField[]): number {
  return fields.filter((f) => isParamModified(draft, f)).length;
}

// ─── Table columns ────────────────────────────────────────────────────────────

/**
 * The editable columns of the line table, LEFT TO RIGHT as they appear on screen. The index in this list is the
 * column number used by keyboard navigation and by paste, so the order must match the visual order.
 */
export function editableColumns(mode: CbuMode, showOverrides: boolean, profile: CbuProfile = "DDP_IMPORT"): ItemField[] {
  if (profile === "FCA_DAP") {
    // Baker: material cost + margin % per line (MARGIN_INPUT) or the two typed prices FCA / DAP (PRICE_INPUT).
    return mode === "PRICE_INPUT" ? ["materialUsd", "ddpPriceUsdInput", "dapPriceUsdInput"] : ["materialUsd", "marginPctOverride"];
  }
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
