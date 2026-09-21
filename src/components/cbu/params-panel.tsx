"use client";

import * as React from "react";
import {
  FIELDS_BY_GROUP,
  defaultAsString,
  fieldScope,
  isParamModified,
  localizeField,
  modifiedCount,
  paramErrorKey,
  scenarioErrorKey,
  type Draft,
  type DraftScenario,
  type FieldErrors,
  type ParamField,
} from "@/lib/cbu/ui/draft";
import { fmtUsd } from "@/lib/cbu/ui/format";
import type { CbuResult } from "@/lib/cbu/types";
import { ParamInput, ParamSection } from "./param-section";

interface Props {
  draft: Draft;
  /** The scenario whose own parameters are being edited (and whose numbers are shown). */
  scenario: DraftScenario;
  errors: FieldErrors;
  result: CbuResult;
  onChange: (path: string, value: string) => void;
  onScenarioChange: (path: string, value: string) => void;
}

const grid = (cols: string) => `grid gap-x-4 gap-y-3 ${cols}`;

/**
 * The parameters, in the order a Sale Admin needs them (SPEC §11.9-1): what is typed on every order is open;
 * tariffs and policy stay collapsed behind a "Mặc định" badge. Which parameters exist, and which belong to a
 * scenario, depends on the CBU model (profile).
 */
export function ParamsPanel({ draft, scenario, errors, result, onChange, onScenarioChange }: Props) {
  const profile = draft.profile;
  const multiple = draft.scenarios.length > 1;

  const shared = (f: ParamField, showHint?: boolean) => {
    const field = localizeField(f, profile);
    return (
      <ParamInput
        key={f.path}
        field={field}
        value={draft.params[f.path] ?? ""}
        error={errors[paramErrorKey(f.path)]}
        modified={isParamModified(draft, f)}
        defaultValue={defaultAsString(f, profile)}
        onChange={onChange}
        showHint={showHint}
      />
    );
  };
  const own = (f: ParamField) => (
    <ParamInput
      key={f.path}
      field={localizeField(f, profile)}
      value={scenario.fields[f.path] ?? ""}
      error={errors[scenarioErrorKey(scenario.id, f.path)]}
      defaultValue={defaultAsString(f, profile)}
      onChange={onScenarioChange}
      showHint={profile === "FCA_DAP"}
    />
  );
  const byScope = (group: ParamField["group"], scope: "shared" | "scenario") =>
    FIELDS_BY_GROUP(group).filter((f) => fieldScope(f, profile) === scope);

  // ── Baker Hughes: FCA / DAP ──────────────────────────────────────────────────
  if (profile === "FCA_DAP") {
    const all = [...FIELDS_BY_GROUP("basic"), ...FIELDS_BY_GROUP("freight"), ...FIELDS_BY_GROUP("policy"), ...FIELDS_BY_GROUP("advanced")];
    const sharedOf = (pred: (f: ParamField) => boolean) => all.filter((f) => fieldScope(f, profile) === "shared" && pred(f));
    const terms = all.filter((f) => fieldScope(f, profile) === "scenario");
    const bank = sharedOf((f) => f.path.startsWith("bank."));
    const advanced = sharedOf((f) => f.group === "advanced");
    const basic = sharedOf((f) => f.group === "basic");
    return (
      <div className="space-y-3">
        <ParamSection title="Pricing Parameters" defaultOpen>
          <div className={grid("grid-cols-2 lg:grid-cols-4")}>{basic.map((f) => shared(f, true))}</div>
        </ParamSection>

        <ParamSection
          key={scenario.id}
          title={multiple ? `Payment terms & Freight — ${scenario.label}` : "Payment terms & Freight"}
          defaultOpen
          summary={result.dap ? <>Incoterm 2 — DAP <strong className="font-semibold text-slate-700">{fmtUsd(result.dap.totalUsd)}</strong> (incl. Freight {fmtUsd(result.dap.freightUsd)})</> : undefined}
        >
          <div className={grid("grid-cols-2 md:grid-cols-5")}>{terms.map((f) => own(f))}</div>
        </ParamSection>

        <ParamSection title="Bank Fee" modified={modifiedCount(draft, bank)} summary={<>TOTAL FEE {fmtUsd(result.pools.bankTotalUsd)}</>}>
          <div className={grid("grid-cols-2 md:grid-cols-3 lg:grid-cols-4")}>{bank.map((f) => shared(f))}</div>
        </ParamSection>

        <ParamSection title="Nâng cao" modified={modifiedCount(draft, advanced)}>
          <div className={grid("grid-cols-2 md:grid-cols-3")}>{advanced.map((f) => shared(f))}</div>
        </ParamSection>
      </div>
    );
  }

  // ── Hoàng Sơn: DDP nhập khẩu ────────────────────────────────────────────────
  const policy = byScope("policy", "shared");
  const advanced = byScope("advanced", "shared");
  const { pools } = result;
  return (
    <div className="space-y-3">
      <ParamSection title="Pricing Parameters" defaultOpen>
        <div className={grid("grid-cols-2 lg:grid-cols-4")}>{byScope("basic", "shared").map((f) => shared(f, true))}</div>
      </ParamSection>

      <ParamSection
        // remounted per scenario so the collapsed/open state and the field ids never leak between scenarios
        key={scenario.id}
        title={multiple ? `Logistic — ${scenario.label}` : "Logistic"}
        defaultOpen
        summary={
          <>
            Total Logistic + Insurance <strong className="font-semibold text-slate-700">{fmtUsd(pools.logisticsPoolUsd)}</strong>
            {pools.insuranceUsd > 0 && <> · gồm bảo hiểm {fmtUsd(pools.insuranceUsd)}</>}
          </>
        }
      >
        <div className={grid("grid-cols-2 md:grid-cols-4")}>{byScope("freight", "scenario").map((f) => own(f))}</div>
      </ParamSection>

      <ParamSection
        title="Insurance, Bank Fee & Financing"
        modified={modifiedCount(draft, policy)}
        summary={<>Total Bank fee & Financial cost {fmtUsd(result.totals.bankFeeUsd)}</>}
      >
        <div className={grid("grid-cols-2 md:grid-cols-3 lg:grid-cols-4")}>{policy.map((f) => shared(f))}</div>
      </ParamSection>

      <ParamSection title="Nâng cao" modified={modifiedCount(draft, advanced)}>
        <div className={grid("grid-cols-2 md:grid-cols-3 lg:grid-cols-5")}>{advanced.map((f) => shared(f))}</div>
      </ParamSection>
    </div>
  );
}
