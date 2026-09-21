"use client";

import * as React from "react";
import { FIELDS_BY_GROUP, modifiedCount, type Draft, type FieldErrors } from "@/lib/cbu/ui/draft";
import { fmtUsd } from "@/lib/cbu/ui/format";
import type { CbuResult } from "@/lib/cbu/types";
import { ParamInput, ParamSection } from "./param-section";

interface Props {
  draft: Draft;
  errors: FieldErrors;
  result: CbuResult;
  onChange: (path: string, value: string) => void;
}

/**
 * The parameters, in the order a Sale Admin needs them (SPEC §11.9-1): what is typed on every order is open;
 * tariffs and policy stay collapsed behind a "Mặc định" badge.
 */
export function ParamsPanel({ draft, errors, result, onChange }: Props) {
  const basic = FIELDS_BY_GROUP("basic");
  const freight = FIELDS_BY_GROUP("freight");
  const policy = FIELDS_BY_GROUP("policy");
  const advanced = FIELDS_BY_GROUP("advanced");
  const { pools } = result;

  const grid = (cols: string) => `grid gap-x-4 gap-y-3 ${cols}`;

  return (
    <div className="space-y-3">
      <ParamSection title="Cơ bản" defaultOpen>
        <div className={grid("grid-cols-2 lg:grid-cols-4")}>
          {basic.map((f) => (
            <ParamInput key={f.path} field={f} draft={draft} errors={errors} onChange={onChange} showHint />
          ))}
        </div>
      </ParamSection>

      <ParamSection
        title="Vận chuyển"
        defaultOpen
        summary={
          <>
            Pool logistics <strong className="font-semibold text-slate-700">{fmtUsd(pools.logisticsPoolUsd)}</strong>
            {pools.insuranceUsd > 0 && <> · gồm bảo hiểm {fmtUsd(pools.insuranceUsd)}</>}
          </>
        }
      >
        <div className={grid("grid-cols-2 md:grid-cols-4")}>
          {freight.map((f) => (
            <ParamInput key={f.path} field={f} draft={draft} errors={errors} onChange={onChange} />
          ))}
        </div>
      </ParamSection>

      <ParamSection
        title="Bảo hiểm, ngân hàng & chi phí vốn"
        modified={modifiedCount(draft, policy)}
        summary={<>Ngân hàng + chi phí vốn {fmtUsd(result.totals.bankFeeUsd)}</>}
      >
        <div className={grid("grid-cols-2 md:grid-cols-3 lg:grid-cols-4")}>
          {policy.map((f) => (
            <ParamInput key={f.path} field={f} draft={draft} errors={errors} onChange={onChange} />
          ))}
        </div>
      </ParamSection>

      <ParamSection title="Nâng cao" modified={modifiedCount(draft, advanced)}>
        <div className={grid("grid-cols-2 md:grid-cols-3 lg:grid-cols-5")}>
          {advanced.map((f) => (
            <ParamInput key={f.path} field={f} draft={draft} errors={errors} onChange={onChange} />
          ))}
        </div>
      </ParamSection>
    </div>
  );
}
