# PROGRESS.md — Tiến độ dự án PSBV Sales Agent Platform

**Ngày đối soát:** 18/09/2026 · **Cập nhật 21/09/2026:** thêm §6 — kế hoạch & theo dõi **CBU Module v2**; **Phase C0–C2 đã hoàn thành về mã nguồn** (engine v2, lưu/đọc + API, migration SQL tay đã kiểm chứng; 182 test pass) — **migration chưa áp lên DB thật**
**Cơ sở đối soát:** `SPEC.md`, `CLAUDE.md`, `TECHNICAL_REPORT_V2.md`, `SECURITY_AND_REMEDIATION.md` (cả 3 báo cáo lập ngày 11/09/2026) so với mã nguồn thực tế tại thời điểm hôm nay.
**Phương pháp:** Đọc trực tiếp source code + chạy lại các lệnh kiểm chứng (`npm test`, `npx tsc --noEmit`, `git log`, grep) — không suy đoán.

---

## 1. Tóm tắt điều hành

**Phát hiện quan trọng nhất của lần đối soát này:** kể từ khi `TECHNICAL_REPORT_V2.md` và `SECURITY_AND_REMEDIATION.md` được lập (11/09/2026), **chưa có bất kỳ commit code nào mới**:

```
$ git log --oneline 0b02859..HEAD
(rỗng — 0 commit)
```

`HEAD` hiện vẫn là `0b02859`, và working tree hiện tại **giống hệt** trạng thái "working tree changes" mà hai báo cáo đã phân tích. Bản thân hai file báo cáo (`SECURITY_AND_REMEDIATION.md`, `TECHNICAL_REPORT_V2.md`) cũng mới chỉ ở trạng thái `git add`, chưa commit.

→ **Toàn bộ 25 phát hiện trong `SECURITY_AND_REMEDIATION.md` vẫn còn nguyên**, kể cả 6 mục P0. Đã verify lại trực tiếp hôm nay (xem mục 3).

Điều này khớp với ý của người dùng: phần **tính năng nghiệp vụ** (feature) đã tương đối hoàn chỉnh — nhưng phần **củng cố kỹ thuật/bảo mật** (Sprint 0–3 trong `SECURITY_AND_REMEDIATION.md`) **chưa được bắt đầu**. Đây là hai việc khác nhau và cần tách bạch trong kế hoạch tiếp theo.

---

## 2. Đối soát tính năng với SPEC.md

### 2.1 Cập nhật so với bảng "Key Features" trong SPEC.md §5.1

| Feature | SPEC.md ghi | Thực tế hôm nay | Ghi chú |
|---------|:-----------:|:----------------:|---------|
| Tiếp nhận Inquiry (AI parse) | ✅ | ✅ | `lib/gemini-inquiry.ts` hoạt động |
| Gửi RFO cho hãng | ✅ | ✅ | |
| Bóc tách Quote (AI) | ✅ | ✅ | `lib/gemini-quote.ts` |
| Tính CBU & DDP | ✅ | ⚠️ **Chạy được nhưng SAI SỐ** | Engine chạy, nhưng 2 lỗi tính toán nghiêm trọng (xem mục 3) |
| Sinh Quotation PDF | ✅ | ⚠️ Chạy được, PDF có cột **unit_price/amount sai** | P2-5 |
| Preview & Edit Quotation | ✅ | ✅ | |
| Gửi Quotation (MS Graph) | ✅ | ✅ | |
| Tạo MVPO | ✅ | ✅ | |
| **CI/PL Editing** | 🔄 *"In progress"* | ✅ **Thực tế đã xong** | SPEC.md đang lỗi thời — module CIPL đã có đủ 3 API routes (`extract`/`save`/`[rfqId]`), 1 trang UI 380 dòng, model DB riêng. **Nhưng CIPL chưa có trong sidebar điều hướng** — chỉ vào được qua modal hoặc URL trực tiếp |
| **COC/COO Management** | 🔄 *"In progress"* | ❌ **Chưa làm thật** | `CERTIFICATE_COC_COO_PDF` rơi vào nhánh `else`, dùng nhầm template Quotation (P3-5) — cần sửa mô tả trong SPEC.md cho đúng thực tế |

**Việc cần làm:** cập nhật SPEC.md §5.1 — đổi CI/PL từ 🔄 sang ✅ (kèm ghi chú thiếu sidebar), giữ COC/COO ở 🔄 nhưng làm rõ nó đang "giả" (dùng nhầm template) chứ không phải "đang dở dang".

### 2.2 Chênh lệch khác giữa SPEC.md và thực tế

- SPEC.md §4.1 (cấu trúc thư mục) không liệt kê `src/app/(dashboard)/rfq/[id]/cipl/`, `src/app/api/cipl/*`, `src/lib/schemas/`, `src/lib/validation.ts` — cần bổ sung.
- SPEC.md §6 thiếu biến môi trường `APITEMPLATE_CIPL_TEMPLATE_ID` (đã có trong code và `.env` thực tế) và `GEMINI_API_KEY` (code dùng `GEMINI_API_KEY`, không phải `GOOGLE_GEMINI_API_KEY` như SPEC.md/CLAUDE.md ghi — cần xác nhận lại tên biến chính xác đang dùng trên Vercel).
- Roadmap "Phase 2" trong SPEC.md liệt kê "CI/PL Editing" và "COC/COO" như work chưa bắt đầu — thực tế CI/PL đã xong, chỉ còn COC/COO + "Dashboard analytics" + "Email Review Agent" (route `/api/agent` hiện là **mock placeholder**, trả cứng `mockToolCall` — xác nhận qua đọc trực tiếp `src/app/api/agent/route.ts`).

---

## 3. Đối soát kỹ thuật & bảo mật — verify lại hôm nay (18/09/2026)

Tất cả các mục dưới đây đã được **kiểm chứng lại trực tiếp** hôm nay, không chỉ trích dẫn báo cáo cũ.

### 3.1 Vẫn còn nguyên — 6/6 lỗi P0

| ID | Vấn đề | Verify hôm nay |
|----|--------|-----------------|
| P0-1 | Open proxy/SSRF ở `api/download-pdf/route.ts` | ✅ Còn nguyên — code vẫn `fetch(url)` không auth, không allow-list |
| P0-2 | `api/pdf/split-cipl/route.ts` không xác thực | ✅ Còn nguyên — grep `getServerSession` → 0 kết quả |
| P0-3 | Mass assignment `PATCH /api/rfq/[id]` | ✅ Còn nguyên — `data: body` đi thẳng vào Prisma, dòng 117 |
| P0-4 | Rò rỉ API key qua response `generate-pdf` | Chưa verify riêng lần này, giả định còn nguyên (không có commit nào sửa) |
| P0-5 | Phân bổ logistics sai ~320 lần | ✅ Còn nguyên — `lib/cbu-engine.ts:438-441` vẫn dùng `weightPerUnit / totalWeightLbs`. **21/09 chạy thật với AC0084:** Σ logistics phân bổ = 14.78 so với pool 4,253 (0.35%). Nguyên nhân gốc: `netWeightLbs` bị dùng theo 2 nghĩa trái ngược (×qty ở tổng trọng lượng, ÷qty ở phân bổ). Bản "sửa" 27/08 chưa đúng. Chi tiết: SPEC §11.2 F1 |
| P0-6 | `pct()` hiểu sai đơn vị % | ✅ Còn nguyên — `lib/cbu-engine.ts:233-236` vẫn auto-detect `val <= 1`. **21/09 đo được:** duty 1% → 100%; bank fee dòng 1 = 0.975 (Excel 0.025, ×39); insurance 253.23 (Excel 15.00). P0-5 và P0-6 lệch ngược chiều nên **triệt tiêu ở mức tổng** (cost chỉ lệch +0.8%) — che mất lỗi khi nhìn tổng |

### 3.2 Vẫn còn nguyên — hạ tầng test & validation

```
$ npm test
Test Suites: 3 failed, 1 passed, 4 total
Tests:       10 passed, 10 total     ← vẫn chỉ 10/52, y hệt báo cáo

$ npx tsc --noEmit
(0 lỗi — TypeScript vẫn sạch)

$ grep -rln 'from "@/lib/validation"\|from "@/lib/schemas"' src/app/api
(0 kết quả — Zod vẫn 0/43 route)

$ find src/app/api -name "route.ts" | wc -l
43   ← khớp báo cáo

$ ls prisma/migrations/
20260729114302_init/   ← vẫn chỉ 1 migration, 7/11 model thiếu migration

$ grep SUPABASE_SERVICE_ROLE_KEY .env
(không có — fallback base64-vào-DB vẫn đang kích hoạt khi chạy local)
```

**Kết luận:** Không có lý do để tin bất kỳ mục P0–P3 nào trong `SECURITY_AND_REMEDIATION.md` đã được xử lý. Coi toàn bộ báo cáo đó là **danh sách việc cần làm hiện hành**, không phải lịch sử.

---

## 4. Kế hoạch thực thi tiếp theo

Giữ nguyên roadmap 4 sprint đã thiết kế sẵn trong `SECURITY_AND_REMEDIATION.md` §7 (đã đúng, chỉ chưa ai chạy) — không cần thiết kế lại. Đây là bảng theo dõi, cập nhật trạng thái khi từng mục được làm xong.

### SPRINT 0 — Vá khẩn cấp (2 ngày) — **CHƯA BẮT ĐẦU**

- [ ] P0-2 Auth cho `split-cipl` + giới hạn 20MB
- [ ] P0-1 Viết lại `download-pdf`: auth + allow-list host + sanitise filename (gộp luôn P1-4)
- [ ] P0-4 Gỡ API key khỏi response lỗi `generate-pdf` + **rotate `APITEMPLATE_API_KEY`**
- [ ] P0-3 Wire `updateRfqSchema` (đã viết sẵn, test sẵn) vào `PATCH /api/rfq/[id]`
- [x] P1-1 Sửa `jest.config.js` (thêm `moduleNameMapper`) — *xong 21/09 (CBU C0)*: 4/4 suite chạy được
- [x] P0-5 *(phần engine — xong 21/09, CBU C1)* Đối chiếu Excel gốc (`CBU-AC0084_DDP_VN_MARGIN_INPUT.xlsx`), sửa công thức phân bổ logistics/insurance → **thực hiện trong CBU v2 Phase C1** (§6, SPEC §11.11); fixture lấy từ file md, không sửa fixture cho khớp code
- [x] P0-6 *(phần engine — xong 21/09, CBU C1)* Sửa `pct()` bỏ auto-detect → `pctToFrac = v/100`. Lỗi lưu/đọc F5–F7 đã sửa ở C2 (mã nguồn). ⚠️ **Còn lại để nghiệm thu trọn vẹn:** áp migration lên DB thật, và rà **giá đã lưu/đã gửi khách** bằng `scripts/cbu-audit.ts` (Q8 — quyết định thương mại)
- [ ] Chạy đối chiếu các RFQ đã gửi khách để phát hiện sai lệch giá do P0-5/P0-6 (**quyết định thương mại cần cấp quản lý**, không phải việc kỹ thuật thuần)
- [ ] Nghiệm thu: `npm test` 52/52 pass, `npx tsc --noEmit` 0 lỗi

### SPRINT 1 — Củng cố (5 ngày) — **CHƯA BẮT ĐẦU**

- [ ] Wire Zod vào 6 route còn lại (`clients` POST/PUT, `tasks` POST, `rfq/create-manual`, `rfq/save-supplier-quote`, `rfq/save-customer-po`)
- [ ] Backup DB + sinh migration cho 7 model thiếu (`Task`, `AiConfig`, `MasterPart`, `Supplier`, `CiplRecord`, `CiplItem`, `TaskStatus`)
- [ ] Bổ sung `SUPABASE_SERVICE_ROLE_KEY`, bỏ fallback base64-vào-DB
- [ ] Rate limiting cho route AI (`parse-*`, `cipl/extract`)
- [ ] Sửa `unit_price`/`amount` sai trong payload quotation PDF (P2-5)

### SPRINT 2 — Kiến trúc & chất lượng (5 ngày) — **CHƯA BẮT ĐẦU**

- [ ] Thêm `@@index` cho mọi FK trong `schema.prisma`
- [ ] Hợp nhất `lib/` và `src/lib/`, gỡ alias webpack trong `next.config.mjs` (đặc biệt: chuyển ràng buộc "no client info" của `lib/email-builder.ts` sang bản giữ lại)
- [ ] Thống nhất email transport về MS Graph, verify domain `psbvn.com`
- [ ] `z.nativeEnum` thay 4 nơi hardcode `OrderStatus`
- [ ] Zod validate output của 4 module Gemini

### SPRINT 3 — Test & CI/CD (5 ngày) — **CHƯA BẮT ĐẦU**

- [ ] Cài `@testing-library/react` + `jest-environment-jsdom`, mở rộng `testMatch` sang `.tsx`
- [ ] Integration test cho route đã wire Zod
- [ ] Component test cho form chính (`cbu-form`, `cipl/page`)
- [ ] GitHub Actions CI (`tsc --noEmit` + `lint` + `test` mỗi PR)

### Sau khi 4 sprint trên xong — hạng mục tính năng còn thiếu

- [ ] Thêm CIPL vào sidebar điều hướng chính thức
- [ ] Template APITemplate riêng cho COC/COO (hiện dùng nhầm template Quotation)
- [ ] Dashboard analytics (revenue, margin KPI) — SPEC.md Phase 2
- [ ] `/api/agent` hiện là mock — cần thiết kế lại nếu muốn triển khai Email Review Agent thật (SPEC.md Phase 2/3)
- [ ] Đổi mật khẩu seed mặc định `Admin@123` trên production nếu chưa đổi (P3-3)

---

## 5. Khuyến nghị ưu tiên ngay bây giờ

1. **Commit hai file báo cáo** (`TECHNICAL_REPORT_V2.md`, `SECURITY_AND_REMEDIATION.md`) và `PROGRESS.md` này — hiện chúng chỉ nằm ở staging area, chưa có trong lịch sử git, dễ mất nếu ai đó chạy `git reset`.
2. **Bắt đầu Sprint 0 trước khi làm thêm tính năng mới.** Hai lỗi P0-5/P0-6 ảnh hưởng trực tiếp đến giá bán gửi khách hàng — mỗi ngày trì hoãn là mỗi ngày rủi ro báo giá sai tiếp tục phát sinh.
3. Sau Sprint 0, **rà soát các RFQ đã ở trạng thái `QUOTED_TO_CLIENT`** để xác định có báo giá nào bị lệch giá do 2 lỗi CBU hay không — đây là quyết định cần cấp quản lý PSBV, không chỉ là việc kỹ thuật.
4. Cập nhật SPEC.md mục 5.1 và roadmap để phản ánh đúng: CI/PL đã xong (chỉ thiếu sidebar), COC/COO vẫn giả.

---

## 6. CBU Module v2 — Tính lại logic & dựng lại giao diện

**Cập nhật:** 21/09/2026 · **Đặc tả đầy đủ:** `SPEC.md` §11 · **Trạng thái tổng:** ✅ C0–C1 xong · ✅ C2 xong về mã nguồn, ⏳ chờ áp migration lên DB thật · ⏳ C3–C5 chưa làm

### 6.1 Việc đã làm (chỉ phân tích + tài liệu)

- [x] Đọc 4 file md CBU mới (Hoàng Sơn Margin/Price, Baker Hughes Margin/Price) và đối chiếu với `lib/cbu-engine.ts`, `cbu-calc/page.tsx`, `calculate-cbu/route.ts`, `prisma/schema.prisma`.
- [x] **Chạy thật** engine hiện tại với 16 dòng AIR của AC0084 → xác nhận lỗi bằng số (không chỉ đọc code).
- [x] **Prototype công thức chuẩn** (theo md) tái tạo khớp Excel cả AIR lẫn SEA: cost 24,576.98 · revenue $32,793.20 · 890,800,000 VND · logistics 4,015 · bank+fin 110.2225 (AIR); 21,477.91 · $28,652.40 · 778,800,000 VND · 1,065 (SEA). → công thức ở SPEC §11.4 là **đã kiểm chứng**.
- [x] Viết SPEC §11 (logic, profile, kiến trúc, UI, test, kế hoạch, câu hỏi mở); cập nhật `CLAUDE.md`; đánh dấu `CBU_ANALYSIS_REPORT.md` là lỗi thời.
- [x] **C0 + C1 (code, 21/09):** chi tiết ở §6.3. Kết quả: `npm test` 5/5 suite · 112/112 test; `npx tsc --noEmit` 0 lỗi; `npm run lint` không thêm cảnh báo mới.
- [x] Phát hiện thêm khi làm C1: **F11** — engine cũ dùng chung VAT 1.1 cho phí *receive*, md ghi 1.00.

### 6.2 Phát hiện chính (chi tiết ở SPEC §11.2)

| # | Vấn đề | Mức | Nguồn xác nhận |
|---|--------|:---:|----------------|
| F1 | Phân bổ logistics sai (Σ phân bổ 14.78 vs pool 4,253) — `netWeightLbs` dùng 2 nghĩa | 🔴 | Đã chạy |
| F2 | `pct()` tự đoán đơn vị: duty 1%→100%, bank fee ×39, insurance 253 vs 15 | 🔴 | Đã chạy |
| F2b | F1 & F2 triệt tiêu ở mức tổng (+0.8%) nên che lỗi; giá dòng 1: 7.49 vs 7.10 | 🔴 | Đã chạy |
| F6 | Mở lại RFQ đã lưu → margin mọi dòng = 0% (`marginPercent ?? 0` + default 25) | 🔴 | Đọc code, **chưa chạy trên DB** |
| F3 | Duty base thiếu insurance so với Excel | 🟠 | Đã chạy |
| F5 | Không lưu `cbuMode`, target margin, commission, CIT, margin override, giá gốc/trọng lượng đã sửa | 🟠 | Đọc code |
| F7 | Route tin số client tính sẵn, không Zod | 🟠 | Đọc code |
| F4 | Mặc định chi phí lô hàng (150/100, docFee 15/0) không nhất quán | 🟡 | Đọc code |
| F8 | Còn `bookingExchangeRate`/effective margin đã bị loại khỏi workbook | 🟡 | Đọc code + md |
| F9 | Thiếu Air/Sea song song, Baker Hughes (FCA/DAP, Net 60), dòng CHECK | 🟡 | md |
| F10 | UI: nhiều ô cùng lúc, cuộn lồng, hack `pt-[124px]`, 900 dòng/1 file | 🟡 | Đọc code |

**Đính chính:** 3 "lỗi" trong `CBU_ANALYSIS_REPORT.md` (insurance/financing tính 2 lần, commission ở PRICE_INPUT) **không phải lỗi**; bản sửa logistics ngày 27/08 chưa đúng.

### 6.3 Checklist thực thi (thứ tự bắt buộc: C1 trước UI)

#### Phase C0 · Chuẩn bị (0.5d) — ✅ xong 21/09

- [x] Sửa `jest.config.js` (`moduleNameMapper` cho `@/`, src trước rồi root — khớp tsconfig) — cũng là P1-1 của Sprint 0
- [x] Commit 4 file md + tài liệu + code C0–C1 — nhánh `feat/cbu-v2-engine` (2 commit: `80d3587` code, `3c15e3f` docs); **chưa push, chưa merge vào `main`**
- [x] Fixture `__tests__/cbu/fixtures/ac0084.ts` **sinh bằng script** `scripts/gen-cbu-fixture.mjs` từ md (không gõ tay)
- [ ] Fixture `ac0481.ts` (Baker Hughes) — dời sang Phase C4 cùng engine profile FCA_DAP

#### Phase C1 · Engine đúng — TDD (2d) *(= P0-5, P0-6)* — ✅ xong 21/09

- [x] Golden test viết **trước**, xác nhận đỏ (thiếu module), rồi mới viết engine
- [x] `src/lib/cbu/`: `math.ts` (`pctToFrac`), trọng lượng chuẩn = tổng dòng lb, `pools.ts`, `pricing.ts`, `checks.ts` (C1–C4), `profiles/ddp-import.ts`, `params.ts`, `defaults.ts`
- [x] Duty base gồm insurance; chi phí lô hàng mặc định 0; VAT remittance/receive tách riêng
- [~] `bookingExchangeRate`/effective margin: engine v2 **không còn** dùng; adapter cũ vẫn trả `effectiveMarginPct` (đo ở tỷ giá báo giá) để trang cũ không vỡ — xoá hẳn ở C3
- [x] Adapter `calculateCBU()` (`src/lib/cbu/legacy.ts`) + shim `lib/cbu-engine.ts`
- [x] Nghiệm thu: golden AIR/SEA/PRICE_INPUT pass (≤6e-5 USD, VND tuyệt đối), hồi quy F1–F4 + F6-engine pass, `tsc` 0 lỗi
- [x] Bộ test cũ `__tests__/cbu-engine.test.ts` **đã xoá**: nó mã hoá hành vi sai (`commissionPercent: 0.03` coi là 3%, dòng đơn kỳ vọng logistics 0.039, chú thích "which is wrong!"). Thay bằng golden (62 test) + `legacy-adapter.test.ts` (8 test)

**Quyết định kỹ thuật đã đưa ra ở C1 (cần biết khi review):**

- Adapter cũ: `netWeightLbs` = trọng lượng **một đơn vị** (đúng nghĩa DB), tổng dòng = × qty. `logisticsPerUnit` **đã gồm insurance** (cột K Excel); `insurancePerUnit` chỉ để tham khảo — cộng cả hai là tính 2 lần.
- Adapter cũ dùng Commission/CIT của **dòng đầu** cho cả đơn (trang hiện luôn gán cùng giá trị); khác nhau giữa các dòng → cảnh báo.
- Mặc định tỷ giá thống nhất **26,500** (trước: engine 25,500 / trang 26,500).

**⚠️ Thay đổi hành vi nhìn thấy được:** vì trang `cbu-calc` hiện gọi engine mới, khi triển khai giá DDP hiển thị sẽ **thay đổi** (trở nên đúng, ví dụ dòng 1 AC0084: 7.49 → 7.10). Cần thông báo cho Sale Admin trước khi deploy. Các RFQ đã lưu giữ nguyên giá cũ cho đến khi mở lại và lưu.

#### Phase C2 · Lưu/đọc & API (2d) — ✅ mã nguồn xong 21/09 · ⏳ chờ áp DB

- [x] Migration **SQL tay, idempotent** `prisma/migrations/20260921120000_cbu_v2/` (7 cột RFQ + `marginOverrideUsd` + bỏ default `marginPercent` + backfill 0/25→NULL có bảng sao lưu + mặc định `clearanceCost`/`inlandCost` = 0). Đối chiếu `prisma migrate diff`; kiểm chứng `node scripts/verify-cbu-migration.mjs` trên Postgres nhúng (chỉ có `init`, chạy 2 lần, backfill đúng). Lần chạy đầu **bắt được một lỗi thật**: `clearanceCost`/`inlandCost` không có trong `init` nên `ALTER COLUMN` hỏng → đã sửa bằng `ADD COLUMN IF NOT EXISTS` trước
- [x] `src/lib/schemas/cbu.schemas.ts` (Zod) + `GET/PUT /api/rfq/[id]/cbu` + `POST …/cbu/finalize`; server tính lại, bỏ qua số client
- [x] `calculate-cbu` thành alias (đọc body cũ, bỏ qua kết quả client); `GET /api/rfq/[id]` không còn ép `marginPercent ?? 0` (nguyên nhân thứ hai của F6)
- [x] `scripts/cbu-audit.ts` (chỉ đọc, CSV chênh lệch giá; lõi thuần có test)
- [x] Test: mapping (26) · service với DB giả trên dữ liệu AC0084 (17) · Zod (21) · audit (6). Đã thử **phá cố ý** hai điểm (null→0, bỏ `extWeightLbs`) → test bắt được (6 và 8 test fail). `next build` thành công, 3 route có mặt
- [x] Nghiệm thu bằng DB giả: lưu→tải giống hệt (kể cả `marginPercent = null`); body cũ với tổng/giá bị giả mạo vẫn lưu đúng số Excel; finalize bị chặn (422, không ghi gì) khi thiếu trọng lượng
- [ ] **Backup DB rồi áp migration lên DB thật — cần người có quyền DB** (SPEC §11.8: áp migration **trước** khi deploy code, nếu không mọi truy vấn `RFQ` lỗi)
- [ ] Chạy `npx tsx scripts/cbu-audit.ts --out audit.csv` trên DB thật (chạy được cả trước lẫn sau migration) và đưa CSV cho quản lý PSBV → Q8
- [ ] Thử tay end-to-end trên môi trường có DB: mở RFQ → lưu nháp → tải lại → finalize (chưa làm được vì không có DB/phiên đăng nhập; các route chỉ được kiểm chứng ở mức service + build)

**Quyết định kỹ thuật ở C2 (cần biết khi review):**

- Backfill `marginPercent IN (0, 25)` → NULL cho **mọi** RFQ (không theo trạng thái như SPEC bản đầu): RFQ đã `QUOTATION_DRAFTED` cũng mang 0 do lỗi và sẽ mở lại thành margin 0%. Ngoại lệ: một override 0% thật trong quá khứ sẽ mất (khôi phục được từ `_cbu_v2_margin_backup`).
- `targetMarginPercent` mặc định **25** thay vì null (trang cũ đọc null thành 0%).
- Lưu nháp **không hạ** trạng thái `QUOTED_TO_CLIENT` (bản cũ hạ mọi trạng thái); RFQ `QUOTATION_DRAFTED` vẫn quay về `CBU_PENDING_ADMIN`.
- Tham số nền ở cột phẳng RFQ, `cbuConfig` chỉ giữ kịch bản + ghi đè (không sao chép hai nơi) — khác chút với SPEC bản đầu, đã cập nhật §11.3.
- `receiveVatFactor` (1.00) và số chữ số làm tròn USD là hằng số chính sách — không lưu, client không sửa được.

#### Phase C3 · Dựng lại UI (5d)

- [ ] Workspace + components (SPEC §11.9), Tabs/Tooltip/Collapsible/Sheet dựng trên `@base-ui/react`
- [ ] Mode switch, kịch bản Air/Sea + so sánh, chip Đối soát, ngăn kéo Cấu trúc giá, dán nhiều dòng từ Excel
- [ ] Giữ `?legacy=1` một bản phát hành
- [ ] Nghiệm thu: RFQ mới ra giá với ≤ 8 ô nhập; mở lại RFQ thấy đúng; không cuộn lồng; a11y ≥ 90

#### Phase C4 · Profile `FCA_DAP` — Baker Hughes (3d)

- [ ] Engine profile + kịch bản Payment/Net 60; UI FCA/DAP; bỏ chặn nhóm "Nước ngoài" ở modal CBU (`rfq/page.tsx`)
- [ ] Nghiệm thu: golden `ac0481` (FCA 131 · Net 60 = 133/đv · DAP 5,090)

#### Phase C5 · Hạ nguồn & hoàn thiện (2d) *(= P2-5)*

- [ ] Sửa payload Quotation PDF (`unit_price` = `ddpPriceUsd`, `amount` = × qty) theo kịch bản đã chọn
- [ ] Xoá trang legacy + code cũ; đọc lại tài liệu

### 6.4 Chờ quyết định nghiệp vụ (SPEC §11.12)

Không chặn C1–C3 vì đã có mặc định tạm; cần trả lời trước khi chốt C4/C5:

- [ ] **Q1** 4 tham số "(Bỏ)": loại thật khỏi công thức hay chỉ ẩn? *(đang giữ trong công thức)*
- [ ] **Q2** Cơ sở tính thuế: theo Excel (Material + toàn bộ Logistics) hay CIF thực (hàng + cước quốc tế + bảo hiểm)?
- [ ] **Q3** Named range pool trỏ cột **R (Min insurance)** thay vì **S (Insurance)** — có phải lỗi trong Excel gốc?
- [ ] **Q4** Baker Hughes: phí *International receive* (0.05% hay 0.005%; min $35 hay $5; base nhập tay?)
- [ ] **Q5–Q7** Bỏ `bookingExchangeRate`/effective margin · mặc định thông quan/nội địa về 0 · Baker dùng tham số chung (lb→kg 0.4536)
- [ ] **Q8** RFQ đã `QUOTED_TO_CLIENT` có giá lệch: giữ giá đã báo hay báo lại? *(quyết định thương mại — cấp quản lý PSBV)*

### 6.5 Lưu ý phối hợp với các sprint khác

- C0 trùng P1-1, C1 trùng P0-5/P0-6, C2 dùng Zod của Sprint 1 và cần "migration cho 7 model thiếu" hoàn tất **trước** khi áp migration CBU, C5 trùng P2-5. Nên làm **cùng một nhịp** với Sprint 0/1 thay vì tách riêng.
- Engine mới đặt ở `src/lib/cbu/` để không phụ thuộc việc hợp nhất `lib/` và `src/lib/` (Sprint 2).

---

*File này nên được cập nhật lại mỗi khi hoàn thành một sprint/mục trong checklist trên, để giữ vai trò "nguồn sự thật" về tiến độ thực tế của dự án.*
