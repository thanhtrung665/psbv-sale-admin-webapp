/**
 * Render smoke tests for the Baker Hughes (FCA_DAP) views: the two-block line table, the payment-term parameters,
 * the model / basis switches and the scenario comparison. Numbers come from the Baker workbook (fixtures/ac0481.ts).
 */
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { calculateCbu } from "../../../src/lib/cbu";
import { loadCbuSheet, saveCbuSheet } from "../../../src/lib/cbu/db/service";
import { draftToEngine, setItemValue, sharedFieldsFor, sheetToDraft, type Draft } from "../../../src/lib/cbu/ui/draft";
import { FcaDapTable } from "../../../src/components/cbu/fca-dap-table";
import { ParamsPanel } from "../../../src/components/cbu/params-panel";
import { ScenarioCompare } from "../../../src/components/cbu/scenario-compare";
import { BasisSwitch, ProfileSwitch } from "../../../src/components/cbu/workspace-bar";
import { AC0481_SCENARIOS as S } from "../fixtures/ac0481";
import { bakerItems, bakerRfq, makeDb } from "../fixtures/baker-db";

const h = React.createElement;

const TERMS = [
  { id: "pwo", label: "Payment with Order" },
  { id: "net60", label: "Net 60 Days", overrides: { pctFinanced: 100, financingDays: 45, logistics: { freightAllInUsd: S.net60.freightQuotedUsd } } },
];

async function bakerDraft(mode: "MARGIN_INPUT" | "PRICE_INPUT" = "MARGIN_INPUT"): Promise<Draft> {
  const { db } = makeDb(bakerRfq(), bakerItems());
  const { sheet } = await saveCbuSheet(db, "b1", { mode, scenarios: TERMS.map((t) => (mode === "PRICE_INPUT" ? { ...t, prices: { l1: 131 }, dapPrices: { l1: t.id === "pwo" ? 131 : 133 } } : t)) }, "draft");
  return sheetToDraft(sheet);
}

function table(draft: Draft, scenarioId = draft.chosenId) {
  const e = draftToEngine(draft, scenarioId);
  return renderToStaticMarkup(
    h(FcaDapTable, {
      draft, scenarioId, result: calculateCbu(e.lines, e.params), errors: e.errors, targetMarginPct: 17,
      onItemChange: () => {}, onPasteBlock: () => false,
    })
  );
}

describe("FcaDapTable", () => {
  it("Payment with Order: FCA and DAP blocks with 131 / 131, the DAP summary strip totals 5,730", async () => {
    const html = table(await bakerDraft(), "pwo");
    expect(html).toContain("Incoterm 1 — FCA");
    expect(html).toContain("Incoterm 2 — DAP");
    expect(html).toContain("131");
    expect(html).toContain("Incoterm 2 — DAP");
    expect(html).toContain("5,730");
    expect(html).not.toContain("Khác Freight per Logistic"); // quoted freight = the Logistic sheet
  });

  it("Net 60: DAP is 133, total 5,090, and the freight mismatch against the Logistic sheet is shown", async () => {
    const html = table(await bakerDraft(), "net60");
    expect(html).toContain("133");
    expect(html).toContain("5,090");
    expect(html).toContain("Khác Freight per Logistic (reference)");
  });

  it("MARGIN_INPUT edits material and margin only; PRICE_INPUT adds the FCA and DAP price inputs", async () => {
    const m = table(await bakerDraft("MARGIN_INPUT"), "pwo");
    expect(m).toContain("% Margin");
    expect(m).not.toContain("Sales Price (DAP)"); // the price cells are not inputs in this mode
    expect((m.match(/data-cell="0:\d"/g) ?? []).length).toBe(2);

    const p = table(await bakerDraft("PRICE_INPUT"), "pwo");
    expect(p).toContain("Sales Price (FCA)");
    expect(p).toContain("Sales Price (DAP)");
    expect(p).not.toContain("Margin % override");
    expect((p.match(/data-cell="0:\d"/g) ?? []).length).toBe(3);
  });

  it("an invalid DAP price is flagged on its own cell and does not crash the render", async () => {
    const d = await bakerDraft("PRICE_INPUT");
    const bad = setItemValue(d, "pwo", "l1", "dapPriceUsdInput", "12x");
    expect(table(bad, "pwo")).toContain('aria-invalid="true"');
  });

  it("an empty material cost renders without NaN", async () => {
    const d = await bakerDraft();
    d.items[0].materialUsd = "";
    expect(table(d, "pwo")).not.toContain("NaN");
  });
});

describe("ParamsPanel · Baker Hughes", () => {
  const render = (draft: Draft, scenarioId = draft.chosenId) => {
    const e = draftToEngine(draft, scenarioId);
    const scenario = draft.scenarios.find((s) => s.id === scenarioId)!;
    return renderToStaticMarkup(h(ParamsPanel, { draft, scenario, errors: e.errors, result: calculateCbu(e.lines, e.params), onChange: () => {}, onScenarioChange: () => {} }));
  };

  it("shows the payment terms and freight of the scenario, and none of the DDP-only parameters", async () => {
    const html = render(await bakerDraft(), "net60");
    expect(html).toContain("% Value financed");
    expect(html).toContain("Credit (days)");
    expect(html).toContain("Freight (quoted)");
    expect(html).toContain("Freight per Logistic (reference)");
    expect(html).toContain("% Margin");
    expect(html).not.toContain("Commission rate");
    expect(html).not.toContain("CIT");
    expect(html).not.toContain("Min insurance");
    expect(html).not.toContain("%Duty");
  });

  it("keeps the exchange rate and VND rounding editable (they decide the VND totals saved on the RFQ)", async () => {
    expect(render(await bakerDraft())).toContain("USD--&gt;VND"); // "Pricing Parameters", open
    // the rounding step sits in the collapsed "Nâng cao" section, but it must be a shared parameter of the model
    expect(sharedFieldsFor("FCA_DAP").map((f) => f.path)).toEqual(expect.arrayContaining(["fx", "vndRoundingStep"]));
  });

  it("the second term carries its own values (100% financed, 45 days)", async () => {
    const html = render(await bakerDraft(), "net60");
    expect(html).toMatch(/value="100"/);
    expect(html).toMatch(/value="45"/);
  });
});

describe("model and basis switches", () => {
  it("ProfileSwitch marks the active model; the basis switch only offers FCA / DAP", () => {
    const p = renderToStaticMarkup(h(ProfileSwitch, { profile: "FCA_DAP", onChange: () => {} }));
    expect(p).toMatch(/aria-checked="true"[^>]*>FCA \/ DAP/);
    expect(p).toMatch(/aria-checked="false"[^>]*>DDP nhập khẩu/);

    const b = renderToStaticMarkup(h(BasisSwitch, { basis: "DAP", onChange: () => {} }));
    expect(b).toMatch(/aria-checked="true"[^>]*>DAP</);
    expect(b).toMatch(/aria-checked="false"[^>]*>FCA</);
    expect(b).not.toContain("DDP");
  });
});

describe("ScenarioCompare · payment terms", () => {
  it("compares the two payment terms by DAP total and marks the chosen one", async () => {
    const { db } = makeDb(bakerRfq(), bakerItems());
    const { sheet } = await saveCbuSheet(db, "b1", { scenarios: TERMS, chosenScenarioId: "net60" }, "draft");
    const draft = sheetToDraft(await loadCbuSheet(db, "b1"));
    expect(draft.chosenId).toBe("net60");
    const html = renderToStaticMarkup(
      h(ScenarioCompare, {
        scenarios: draft.scenarios,
        results: Object.fromEntries(sheet.scenarios.map((s) => [s.id, s.result])),
        chosenId: draft.chosenId, activeId: "pwo", targetMarginPct: 17, profile: "FCA_DAP", onChoose: () => {}, onView: () => {},
      })
    );
    expect(html).toContain("Payment with Order");
    expect(html).toContain("Net 60 Days");
    expect(html).toContain("5,730");
    expect(html).toContain("5,090");
  });
});
