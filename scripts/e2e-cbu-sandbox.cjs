// End-to-end check of the CBU API against the LOCAL sandbox (see scripts/dev-cbu-sandbox.ts) — never against a real database.
// Start the sandbox first (it seeds AC0084-SANDBOX / DEMO-CHECKS / AC0481-SANDBOX), then:  node scripts/e2e-cbu-sandbox.cjs
// It CHANGES the sandbox data (saves, finalizes); restart the sandbox to get clean data again.

const BASE = "http://localhost:3100";
let cookie = "";
const jar = (res) => {
  const set = res.headers.getSetCookie?.() ?? [];
  const map = new Map(cookie.split("; ").filter(Boolean).map((c) => c.split(/=(.*)/s).slice(0, 2)));
  for (const c of set) { const [kv] = c.split(";"); const [k, v] = kv.split(/=(.*)/s); map.set(k, v); }
  cookie = [...map].map(([k, v]) => `${k}=${v}`).join("; ");
};
const call = async (method, path, body, opts = {}) => {
  const res = await fetch(BASE + path, {
    method, redirect: "manual",
    headers: { cookie, ...(body ? { "content-type": opts.form ? "application/x-www-form-urlencoded" : "application/json" } : {}) },
    body: body ? (opts.form ? new URLSearchParams(body).toString() : JSON.stringify(body)) : undefined,
  });
  jar(res);
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text.slice(0, 200); }
  return { status: res.status, json };
};
const ok = (name, cond, extra = "") => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); if (!cond) process.exitCode = 1; };

(async () => {
  const csrf = await call("GET", "/api/auth/csrf");
  await call("POST", "/api/auth/callback/credentials", { csrfToken: csrf.json.csrfToken, email: "sandbox@psbv.local", password: "sandbox123", json: "true" }, { form: true });
  const sess = await call("GET", "/api/auth/session");
  ok("signed in", !!sess.json?.user, JSON.stringify(sess.json?.user?.email));

  const unauth = await fetch(BASE + "/api/rfq/r1/cbu");
  ok("401 without a session", unauth.status === 401, String(unauth.status));

  // 1. GET recomputes from stored inputs and matches Excel
  const g1 = await call("GET", "/api/rfq/r1/cbu");
  const s1 = g1.json.sheet;
  ok("GET 200 with sheet", g1.status === 200 && !!s1, String(g1.status));
  ok("16 items, DDP line 1 = 7.10, total VND = 890,800,000", s1?.items.length === 16 && s1.result.lines[0].ddpPriceUsd === 7.1 && s1.result.totals.revenueVnd === 890800000);
  ok("all self-checks pass", s1.result.checks.every((c) => c.ok));
  ok("status before = SUPPLIER_QUOTED, nothing saved yet", s1.rfq.status === "SUPPLIER_QUOTED" && s1.saved.calculatedAt === null);

  // 2. PUT draft: params + a line edit + a margin override
  const put = await call("PUT", "/api/rfq/r1/cbu", {
    params: { targetMarginPct: 30 },
    items: [{ id: "r1-l1", marginPctOverride: 40, dutyPct: 5 }],
    totalRevenueUsd: 1, items_forged: 1, // must be ignored
  });
  ok("PUT 200", put.status === 200, JSON.stringify(put.json).slice(0, 120));
  ok("status → CBU_PENDING_ADMIN", put.json.statusChange?.to === "CBU_PENDING_ADMIN");

  // 3. reload = what was saved (params, override, null overrides untouched)
  const g2 = (await call("GET", "/api/rfq/r1/cbu")).json.sheet;
  ok("target margin 30 persisted", g2.params.targetMarginPct === 30);
  ok("line 1 override 40 + duty 5 persisted", g2.items[0].marginPctOverride === 40 && g2.items[0].dutyPct === 5);
  ok("other lines keep NULL override (not 0/25)", g2.items.slice(1).every((i) => i.marginPctOverride === null));
  ok("saved totals recorded", g2.saved.totalRevenueUsd > 0 && g2.saved.calculatedAt !== null, JSON.stringify(g2.saved));
  ok("reload result equals the result the PUT returned", JSON.stringify(g2.result) === JSON.stringify(put.json.sheet.result));

  // 4. legacy GET rfq/[id] keeps null (F6) and returns new columns
  const legacyGet = (await call("GET", "/api/rfq/r1")).json;
  ok("GET /api/rfq/[id]: line 2 marginPercent stays null, target persisted",
    legacyGet.items[1].marginPercent === null && legacyGet.targetMarginPercent === 30 && legacyGet.cbuMode === "MARGIN_INPUT");

  // 5. validation
  const bad = await call("PUT", "/api/rfq/r1/cbu", { params: { targetMarginPct: 100 } });
  ok("400 for margin 100%", bad.status === 400, String(bad.status));
  const ghost = await call("PUT", "/api/rfq/r1/cbu", { items: [{ id: "nope", dutyPct: 1 }] });
  ok("400 for a line that is not on this RFQ", ghost.status === 400, String(ghost.status));
  const nf = await call("GET", "/api/rfq/does-not-exist/cbu");
  ok("404 for unknown RFQ", nf.status === 404, String(nf.status));

  // 6. finalize gate on DEMO-CHECKS (line 2 no weight, line 5 no material)
  const blocked = await call("POST", "/api/rfq/r2/cbu/finalize", {});
  ok("finalize blocked with 422 + reasons", blocked.status === 422 && blocked.json.details.length >= 2, JSON.stringify(blocked.json.details));
  const r2 = (await call("GET", "/api/rfq/r2/cbu")).json.sheet;
  ok("blocked finalize wrote nothing (status unchanged)", r2.rfq.status === "SUPPLIER_QUOTED" && r2.saved.calculatedAt === null);

  // 7. finalize OK on r1 (reset margin first so it is the Excel case)
  const fin = await call("POST", "/api/rfq/r1/cbu/finalize", { params: { targetMarginPct: 25 }, items: [{ id: "r1-l1", marginPctOverride: null, dutyPct: 0 }] });
  ok("finalize 200 → QUOTATION_DRAFTED", fin.status === 200 && fin.json.statusChange.to === "QUOTATION_DRAFTED", JSON.stringify(fin.json.statusChange));
  ok("finalized numbers = Excel (7.10 / 890,800,000)", fin.json.sheet.result.lines[0].ddpPriceUsd === 7.1 && fin.json.sheet.result.totals.revenueVnd === 890800000);

  // 8. legacy alias: forged results ignored, per-unit weight
  const alias = await call("POST", "/api/rfq/r1/calculate-cbu", {
    finalize: false, cbuMode: "MARGIN_INPUT", targetMarginPercent: 25, commissionRate: 3, citOnCommission: 20,
    totalRevenueUsd: 999999, totalRevenueVnd: 1, items: [{ id: "r1-l1", supplierUnitPrice: 4.37, netWeightLbs: 0.38, dutyPercent: 0, marginPercent: null, marginOverrideUsd: 0, targetDdpPriceUsd: 0, ddpPriceUsd: 0.01 }],
  });
  ok("legacy alias 200 and ignores forged totals", alias.status === 200 && alias.json.sheet.result.totals.revenueVnd === 890800000, `status→${alias.json.status}`);
  ok("finalized RFQ falls back to CBU_PENDING_ADMIN on a draft save", alias.json.status === "CBU_PENDING_ADMIN");

  // 9. scenarios: Air (base) + Sea over the same lines (AC0084 workbook)
  const scen = await call("PUT", "/api/rfq/r1/cbu", {
    params: { targetMarginPct: 25 },
    items: [{ id: "r1-l1", marginPctOverride: null, dutyPct: 0 }],
    scenarios: [
      { id: "air", label: "Air" },
      { id: "sea", label: "Sea", overrides: { logistics: { freightFixedUsd: 800, freightRatePerKg: 0, chargeableKg: 0 } } },
    ],
    chosenScenarioId: "sea",
  });
  ok("scenarios PUT 200", scen.status === 200, JSON.stringify(scen.json).slice(0, 100));
  const [sa, ss] = scen.json.sheet?.scenarios ?? [];
  ok("Air = 890,800,000 ₫ and Sea = 778,800,000 ₫ (Excel blocks)", sa?.result.totals.revenueVnd === 890800000 && ss?.result.totals.revenueVnd === 778800000);
  ok("Air − Sea = 112,000,000 ₫ (workbook 'Revenue difference')", sa && ss && sa.result.totals.revenueVnd - ss.result.totals.revenueVnd === 112000000);
  ok("chosen = sea: saved RFQ totals follow Sea", scen.json.sheet.chosenScenarioId === "sea" && scen.json.sheet.saved.totalRevenueVnd === 778800000, String(scen.json.sheet.saved.totalRevenueVnd));
  const legacyView = (await call("GET", "/api/rfq/r1")).json;
  ok("what the Quotation reads (item price / totals) = the CHOSEN scenario (6.41, not 7.10)", legacyView.items[0].ddpPriceUsd === 6.41 && legacyView.totalRevenueVnd === 778800000, `${legacyView.items[0].ddpPriceUsd}`);
  ok("flat freight columns keep the BASE (Air) scenario", legacyView.freightFixed === 500 && legacyView.freightRatePerKg === 2.5, `${legacyView.freightFixed}/${legacyView.freightRatePerKg}`);
  const again = (await call("GET", "/api/rfq/r1/cbu")).json.sheet;
  ok("reload returns the same scenarios and chosen id", JSON.stringify(again.scenarios) === JSON.stringify(scen.json.sheet.scenarios) && again.chosenScenarioId === "sea");
  const badChosen = await call("PUT", "/api/rfq/r1/cbu", { chosenScenarioId: "zzz" });
  ok("400 for a chosen scenario that does not exist", badChosen.status === 400, String(badChosen.status));
  const dup = await call("PUT", "/api/rfq/r1/cbu", { scenarios: [{ id: "a", label: "A" }, { id: "a", label: "B" }] });
  ok("400 for duplicated scenario ids", dup.status === 400, String(dup.status));
  const finSea = await call("POST", "/api/rfq/r1/cbu/finalize", { chosenScenarioId: "air" });
  ok("finalize with the other scenario chosen → QUOTATION_DRAFTED, totals = Air", finSea.status === 200 && finSea.json.sheet.saved.totalRevenueVnd === 890800000, String(finSea.status));

  // 10. Baker Hughes (FCA_DAP): switch the model, two payment terms as scenarios, FCA / DAP basis (AC0481 workbook)
  const b0 = (await call("GET", "/api/rfq/r3/cbu")).json.sheet;
  ok("r3 starts as a plain DDP RFQ; quote basis defaults from the Incoterm (FCA)", b0.profile === "DDP_IMPORT" && b0.quoteBasis === "FCA");
  const baker = {
    profile: "FCA_DAP",
    quoteBasis: "DAP",
    // the FIRST scenario is the base: its terms are the flat params (as the UI sends them); only the others carry overrides
    params: { targetMarginPct: 17, destinationCountry: "MY", bank: { minReceiveUsd: 35, receiveBaseUsd: 3930 }, goodsOrigin: "Oversea", pctFinanced: 0, financingDays: 0, interestPct: 15, logistics: { freightAllInUsd: 1800, freightFixedUsd: 1800 } },
    scenarios: [
      { id: "pwo", label: "Payment with Order" },
      { id: "net60", label: "Net 60 Days", overrides: { pctFinanced: 100, financingDays: 45, interestPct: 15, logistics: { freightAllInUsd: 1100, freightFixedUsd: 1800 } } },
    ],
    chosenScenarioId: "net60",
  };
  const bp = await call("PUT", "/api/rfq/r3/cbu", baker);
  ok("Baker PUT 200", bp.status === 200, JSON.stringify(bp.json).slice(0, 160));
  const bs = bp.json.sheet;
  const [pwo, net60] = bs?.scenarios ?? [];
  ok("profile persisted as FCA_DAP", bs?.profile === "FCA_DAP" && bs.result.profile === "FCA_DAP");
  ok("FCA price 131 (Excel), bank pool $85 (remit 50 + receive 35)", pwo?.result.lines[0].fca.priceUsd === 131 && pwo.result.pools.bankTotalUsd === 85, String(pwo?.result.pools?.bankTotalUsd));
  ok("Payment with Order: DAP 131, total 5,730 = 30 × 131 + 1,800", pwo?.result.lines[0].dap.priceUsd === 131 && pwo.result.dap.totalUsd === 5730, String(pwo?.result.dap?.totalUsd));
  ok("Net 60: DAP 133, goods 3,990, total 5,090 = + 1,100 freight", net60?.result.lines[0].dap.priceUsd === 133 && net60.result.dap.goodsRevenueUsd === 3990 && net60.result.dap.totalUsd === 5090, String(net60?.result.dap?.totalUsd));
  ok("Net 60: freight differs from the Logistic sheet by $700 → warning, not a failed check", net60?.result.dap.freightMismatchUsd === 700 && net60.result.checks.every((c) => c.ok) && net60.result.warnings.length > 0);
  ok("all self-checks pass in both terms", bs.scenarios.every((s) => s.result.checks.every((c) => c.ok)));
  const bLegacy = (await call("GET", "/api/rfq/r3")).json;
  ok("DAP basis + Net 60: what the Quotation reads = 133 per unit, RFQ total $5,090", bLegacy.items[0].ddpPriceUsd === 133 && bLegacy.totalRevenueUsd === 5090, `${bLegacy.items[0].ddpPriceUsd} / ${bLegacy.totalRevenueUsd}`);
  ok("saved profile column = FCA_DAP", bLegacy.cbuProfile === "FCA_DAP");
  const bReload = (await call("GET", "/api/rfq/r3/cbu")).json.sheet;
  ok("reload returns the same scenarios, basis and chosen term", JSON.stringify(bReload.scenarios) === JSON.stringify(bs.scenarios) && bReload.quoteBasis === "DAP" && bReload.chosenScenarioId === "net60");
  const toFca = await call("PUT", "/api/rfq/r3/cbu", { ...baker, quoteBasis: "FCA" });
  const fcaLegacy = (await call("GET", "/api/rfq/r3")).json;
  ok("FCA basis: item price 131 and total $3,930 (no freight)", toFca.status === 200 && fcaLegacy.items[0].ddpPriceUsd === 131 && fcaLegacy.totalRevenueUsd === 3930, `${fcaLegacy.items[0].ddpPriceUsd} / ${fcaLegacy.totalRevenueUsd}`);
  const badBasis = await call("PUT", "/api/rfq/r3/cbu", { quoteBasis: "CIF" });
  ok("400 for an unknown quote basis / profile", badBasis.status === 400 && (await call("PUT", "/api/rfq/r3/cbu", { profile: "XYZ" })).status === 400);
  const bFin = await call("POST", "/api/rfq/r3/cbu/finalize", { chosenScenarioId: "pwo" });
  ok("finalize Baker (no weight needed) → QUOTATION_DRAFTED", bFin.status === 200 && bFin.json.statusChange?.to === "QUOTATION_DRAFTED", `${bFin.status} ${JSON.stringify(bFin.json).slice(0, 100)}`);
  // the DDP RFQ is untouched by all of this
  const r1 = (await call("GET", "/api/rfq/r1/cbu")).json.sheet;
  ok("r1 (DDP) still DDP_IMPORT with its own totals", r1.profile === "DDP_IMPORT" && r1.result.totals.revenueVnd === 890800000);
})().catch((e) => { console.error("ERROR", e); process.exit(1); });
