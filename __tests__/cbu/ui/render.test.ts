/**
 * Render smoke tests for the CBU workspace components (server-side render, no browser).
 * They catch runtime errors and check that the right numbers / states reach the markup. Interaction is covered by the
 * pure tests in draft.test.ts and by the sandbox; a React Testing Library setup is planned for Sprint 3.
 */
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { calculateCbu } from "../../../src/lib/cbu";
import { CBU_DEFAULTS } from "../../../src/lib/cbu/defaults";
import type { CbuSheet } from "../../../src/lib/cbu/db/service";
import { draftToEngine, sheetToDraft, type Draft } from "../../../src/lib/cbu/ui/draft";
import { ItemsTable } from "../../../src/components/cbu/items-table";
import { ParamsPanel } from "../../../src/components/cbu/params-panel";
import { ChecksBadge, ModeSwitch } from "../../../src/components/cbu/workspace-bar";
import { NumCell } from "../../../src/components/cbu/num-cell";
import { AC0084_AIR, AC0084_LOGISTICS, AC0084_PARAMS } from "../fixtures/ac0084";

const h = React.createElement;

function sheet(): CbuSheet {
  const l = AC0084_LOGISTICS.air;
  return {
    rfq: { id: "r1", rfqCode: "X", status: "SUPPLIER_QUOTED", incoTerm: null, paymentTerm: null, supplierName: null, clientName: null },
    profile: "DDP_IMPORT",
    mode: "MARGIN_INPUT",
    params: { ...CBU_DEFAULTS, fx: AC0084_PARAMS.fx, logistics: { ...CBU_DEFAULTS.logistics, freightFixedUsd: l.freightFixedUsd, freightRatePerKg: l.freightRatePerKg, chargeableKg: l.chargeableKg, clearanceUsd: l.clearanceUsd, inlandUsd: l.inlandUsd } },
    items: AC0084_AIR.map((r) => ({
      id: `l${r.lineNo}`, lineNo: r.lineNo, rawPartNumber: r.partNo, rawDescription: `Insert ${r.partNo}`, uom: "PCS", qty: r.qty,
      materialUsd: r.materialUsd, totalWeightLb: r.totalWeightLb, dutyPct: r.dutyPct,
      marginPctOverride: null, marginUsdOverride: null, ddpPriceUsdInput: null, savedDdpPriceUsd: null,
    })),
    result: {} as CbuSheet["result"],
    saved: { calculatedAt: null, totalCostUsd: null, totalRevenueUsd: null, totalRevenueVnd: null, totalMarginUsd: null, actualMarginPct: null },
  };
}

function table(draft: Draft, over: Partial<React.ComponentProps<typeof ItemsTable>> = {}) {
  const e = draftToEngine(draft);
  const result = calculateCbu(e.lines, e.params);
  return renderToStaticMarkup(
    h(ItemsTable, {
      draft, result, errors: e.errors, targetMarginPct: 25, showCosts: false, showOverrides: false,
      expanded: new Set<string>(), onToggleExpanded: () => {}, onItemChange: () => {}, onPasteBlock: () => false, ...over,
    })
  );
}

describe("ItemsTable", () => {
  it("shows the Excel price of line 1 (7.10 / 190.000 ₫), the totals and one row per line", () => {
    const html = table(sheetToDraft(sheet()));
    expect(html).toContain("7.10");
    expect(html).toContain("190.000");
    expect(html).toContain("890.800.000"); // total revenue VND in the footer
    expect((html.match(/data-cell="\d+:0"/g) ?? []).length).toBe(16); // one weight input per line
  });

  it("default view hides the cost and override columns; the toggles add them", () => {
    const draft = sheetToDraft(sheet());
    expect(table(draft)).not.toContain("Logistics");
    expect(table(draft, { showCosts: true })).toContain("Ngân hàng + vốn");
    expect(table(draft, { showOverrides: true })).toContain("Margin riêng");
  });

  it("PRICE_INPUT: the price becomes an input and the override columns disappear", () => {
    const draft = sheetToDraft(sheet());
    draft.mode = "PRICE_INPUT";
    draft.items[0].ddpPriceUsdInput = "7.1";
    const html = table(draft, { showOverrides: true });
    expect(html).toContain("Giá bán nhập");
    expect(html).not.toContain("Margin riêng");
    expect(html).toContain('data-cell="0:3"'); // weight, material, duty, price
  });

  it("a line below cost is marked as a loss; a missing weight shows a warning marker", () => {
    const draft = sheetToDraft(sheet());
    draft.mode = "PRICE_INPUT";
    draft.items[0].ddpPriceUsdInput = "1";
    draft.items[1].totalWeightLb = "";
    const html = table(draft);
    expect(html).toContain("bg-red-50/50");
    expect(html).toContain("Thiếu trọng lượng");
  });

  it("invalid input is flagged on the cell (aria-invalid) and never crashes the render", () => {
    const draft = sheetToDraft(sheet());
    draft.items[2].materialUsd = "abc";
    expect(table(draft)).toContain('aria-invalid="true"');
  });

  it("an expanded row renders the price structure bar and legend", () => {
    const html = table(sheetToDraft(sheet()), { expanded: new Set(["l1"]) });
    expect(html).toContain("Cấu trúc giá bán");
    expect(html).toContain("Hoa hồng + CIT");
  });
});

describe("ParamsPanel", () => {
  const render = (draft: Draft) => {
    const e = draftToEngine(draft);
    return renderToStaticMarkup(h(ParamsPanel, { draft, errors: e.errors, result: calculateCbu(e.lines, e.params), onChange: () => {} }));
  };

  it("opens the everyday sections, keeps policy / advanced collapsed behind a 'Mặc định' badge", () => {
    const html = render(sheetToDraft(sheet()));
    expect(html).toContain("Tỷ giá USD → VND"); // basic, open
    expect(html).toContain("Cước cố định"); // freight, open
    expect(html).not.toContain("Phí chuyển tiền trả hãng"); // policy, collapsed
    expect((html.match(/Mặc định/g) ?? []).length).toBe(2);
    expect(html).toContain("Pool logistics");
    expect(html).toContain("$4,015.00");
  });

  it("an out-of-range parameter shows its message", () => {
    const d = sheetToDraft(sheet());
    d.params["targetMarginPct"] = "100";
    expect(render(d)).toContain("Phải nhỏ hơn 100");
  });
});

describe("small pieces", () => {
  it("ChecksBadge: ok / failed / invalid inputs", () => {
    const ok = [{ id: "C1" as const, label: "x", delta: 0, ok: true }];
    const bad = [{ id: "C3" as const, label: "y", delta: 2, ok: false }];
    expect(renderToStaticMarkup(h(ChecksBadge, { checks: ok, invalidInputs: 0 }))).toContain("Đối soát khớp");
    expect(renderToStaticMarkup(h(ChecksBadge, { checks: bad, invalidInputs: 0 }))).toContain("Đối soát lệch: C3");
    expect(renderToStaticMarkup(h(ChecksBadge, { checks: ok, invalidInputs: 3 }))).toContain("3 ô nhập chưa hợp lệ");
  });

  it("ModeSwitch marks the active mode (radio semantics)", () => {
    const html = renderToStaticMarkup(h(ModeSwitch, { mode: "PRICE_INPUT", onChange: () => {} }));
    expect(html).toMatch(/aria-checked="true"[^>]*>Nhập giá bán/);
    expect(html).toMatch(/aria-checked="false"[^>]*>Nhập margin/);
  });

  it("NumCell exposes an accessible name and its grid position", () => {
    const html = renderToStaticMarkup(h(NumCell, { value: "1", onChange: () => {}, label: "Giá gốc — dòng 3", row: 2, col: 1 }));
    expect(html).toContain('aria-label="Giá gốc — dòng 3"');
    expect(html).toContain('data-cell="2:1"');
  });
});
