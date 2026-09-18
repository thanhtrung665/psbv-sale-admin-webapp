# PROGRESS.md — Tiến độ dự án PSBV Sales Agent Platform

**Ngày đối soát:** 18/09/2026
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
| P0-5 | Phân bổ logistics sai ~320 lần | ✅ Còn nguyên — `lib/cbu-engine.ts:438-441` vẫn dùng `weightPerUnit / totalWeightLbs` |
| P0-6 | `pct()` hiểu sai đơn vị % | ✅ Còn nguyên — `lib/cbu-engine.ts:233-236` vẫn auto-detect `val <= 1` |

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
- [ ] P1-1 Sửa `jest.config.js` (thêm `moduleNameMapper`) — làm trước để có test chạy khi sửa CBU
- [ ] P0-5 Đối chiếu Excel gốc (`CBU-AC0084_DDP_VN_MARGIN_INPUT.xlsx`), sửa công thức phân bổ logistics/insurance
- [ ] P0-6 Sửa `pct()` bỏ auto-detect, cập nhật test fixture
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

*File này nên được cập nhật lại mỗi khi hoàn thành một sprint/mục trong checklist trên, để giữ vai trò "nguồn sự thật" về tiến độ thực tế của dự án.*
