// End-to-end check of the CBU API against the LOCAL sandbox (see scripts/dev-cbu-sandbox.ts) — never against a real database.
// Start the sandbox first (it seeds AC0084-SANDBOX / DEMO-CHECKS), then:  node scripts/e2e-cbu-sandbox.cjs
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
})().catch((e) => { console.error("ERROR", e); process.exit(1); });
