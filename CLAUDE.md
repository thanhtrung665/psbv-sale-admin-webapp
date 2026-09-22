# CLAUDE.md — PSBV Sales Agent Platform

## Project Context

Bạn đang làm việc trên **PSBV Sales Agent Platform** — một hệ thống CRM B2B nội bộ cho team Sale Admin của công ty PSBV Trading & Service Co., Ltd. Hệ thống tự động hóa vòng đời giao dịch xuất nhập khẩu: từ tiếp nhận Inquiry → gửi RFO cho hãng → AI bóc tách Quote → tính CBU → sinh Quotation PDF → gửi email qua MS Graph.

## Quick Start

```bash
# Development
npm run dev

# Check TypeScript
npx tsc --noEmit

# Check Lint
npm run lint

# Database migrations
npx prisma migrate dev

# Generate Prisma client
npx prisma generate
```

---

## Architecture

### Tech Stack
- **Frontend:** Next.js 14 (App Router) + React 18 + TypeScript
- **Styling:** Tailwind CSS + shadcn/ui
- **Database:** PostgreSQL + Prisma ORM 7
- **Auth:** NextAuth.js v4 + bcrypt
- **AI:** Google Gemini API (document parsing)
- **Documents:** APITemplate.io (PDF generation)
- **Email:** Microsoft Graph API (Outlook)
- **Storage:** Supabase Storage

### Project Structure
```
src/
├── app/                    # Next.js App Router
│   ├── (auth)/           # Login page
│   ├── (dashboard)/      # Auth-gated pages
│   │   ├── layout.tsx   # Dashboard shell + Sidebar
│   │   ├── rfq/         # RFQ management
│   │   │   ├── [id]/
│   │   │   │   ├── rfo-review/    # RFO review page
│   │   │   │   ├── cbu-calc/     # CBU calculation page
│   │   │   │   ├── mvpo/         # MVPO creation page
│   │   │   │   └── quote-preview/ # Quotation preview page
│   │   │   ├── page.tsx  # RFQ list
│   │   │   └── new/      # Create new RFQ
│   │   ├── clients/      # Client management
│   │   ├── tasks/        # Task management
│   │   └── system-users/ # User management (Admin)
│   └── api/              # API Routes (server-side)
│       ├── rfq/          # RFQ CRUD + operations
│       ├── email/        # Email endpoints
│       └── auth/         # NextAuth
├── components/
│   ├── ui/              # shadcn/ui components
│   ├── rfq/             # RFQ-specific components
│   └── shared/          # Sidebar, etc.
└── lib/
    ├── ms-graph.ts      # MS Graph API client
    ├── email-builder.ts  # Email HTML templates
    ├── cbu/             # CBU engine v2 (SPEC §11.8): calculateCbu(), pools, pricing, checks, profiles/
    └── utils.ts         # Utilities (cn() helper)

lib/                     # ⚠️ thư mục gốc, KHÔNG phải src/lib (webpack alias @/lib trỏ vào đây); không còn cbu-engine.ts (đã xoá ở Phase C5)
```

---

## Key Domain Concepts

| Term | Description |
|------|-------------|
| **RFQ** | Request for Quotation — Đơn yêu cầu báo giá |
| **RFO** | Request for Offer — Phiếu gửi hãng hỏi giá |
| **CBU** | Cost Build Up — Tính giá thành bao gồm tất cả chi phí |
| **DDP** | Delivered Duty Paid — Giá đã bao gồm thuế, vận chuyển |
| **MVPO** | Manufacturer's Vendor Purchase Order — Đơn đặt hàng |
| **CI/PL** | Commercial Invoice / Packing List — Chứng từ hải quan |

---

## RFQ Status Lifecycle

```
INQUIRY_RECEIVED → RFO_PENDING_ADMIN → RFO_SENT_TO_SUPPLIER →
SUPPLIER_QUOTED → CBU_PENDING_ADMIN → QUOTATION_DRAFTED → QUOTED_TO_CLIENT
```

1. **INQUIRY_RECEIVED**: Khách gửi yêu cầu (AI bóc tách)
2. **RFO_PENDING_ADMIN**: Chờ Sale Admin duyệt RFO
3. **RFO_SENT_TO_SUPPLIER**: Đã gửi RFO cho hãng
4. **SUPPLIER_QUOTED**: Hãng đã báo giá (AI bóc tách Quote)
5. **CBU_PENDING_ADMIN**: Chờ Sale Admin tính CBU
6. **QUOTATION_DRAFTED**: Đã sinh PDF Quotation nháp
7. **QUOTED_TO_CLIENT**: Đã gửi báo giá cho khách

---

## CBU Module (đang tái cấu trúc — CBU v2)

**Trạng thái (22/09/2026):** Phase C0–C5 **xong** (C4 = profile `FCA_DAP` Baker Hughes: `src/lib/cbu/profiles/fca-dap.ts`, kịch bản = điều khoản thanh toán, `quoteBasis` FCA/DAP, bỏ chặn "Nước ngoài" ở modal; C5 = sửa payload Quotation PDF, xoá trang legacy + adapter cũ) — engine v2 khớp Excel từng dòng; lưu/đọc + API v2 (`src/lib/cbu/db/`, `/api/rfq/[id]/cbu`) tính lại phía server; giao diện mới ở `src/components/cbu/` (logic thuần ở `src/lib/cbu/ui/`) là **duy nhất** (trang cũ `?legacy=1`, adapter `calculateCBU()`, route `calculate-cbu`, và `lib/cbu-engine.ts` đã bị xoá); **có kịch bản Air/Sea + so sánh** (kịch bản đầu = nền ở cột phẳng RFQ, kịch bản được chọn quyết định giá lưu và tổng — SPEC §11.3). 314 test pass. **Migration bước 1 đã áp lên DB thật (22/09); bước 2 (backfill `marginPercent`) CHỈ áp sau khi deploy code.** Đặc tả: `SPEC.md` §11 · Theo dõi: `PROGRESS.md` §6.

### Nguồn sự thật nghiệp vụ
`documents/CBU_docx/` — 4 file `.md` do đội nghiệp vụ chuyển từ Excel:
- `CBU_Margin_Input/…AC0084_DDP_VN_MARGIN_INPUT.md` · `CBU_DDPPrice_Input/…PRICE_INPUT.md` — profile `DDP_IMPORT` (Hoàng Sơn, Air/Sea)
- `CBU_BakerHughes_MarginnInput/…` · `CBU_BakerHughes_PriceInput/…` — profile `FCA_DAP` (Baker Hughes, FCA/DAP, Payment/Net 60)
- `CBU_ANALYSIS_REPORT.md` — **LỖI THỜI (27/08), đừng làm theo**: 3 "lỗi" nó nêu không phải lỗi, bản sửa logistics của nó chưa đúng.

### Quy tắc bắt buộc khi đụng vào CBU
1. **Đơn vị %**: mọi `…Percent` / `…Rate` / `…Pct` là số phần trăm (3 = 3%). Engine chia 100 (`pctToFrac`). **Không** khôi phục kiểu auto-detect "≤ 1 là phân số" (`pct()` cũ — đó là lỗi P0-6).
2. **Trọng lượng chuẩn** của engine v2 = tổng trọng lượng của dòng (lb) = `RFQItem.extWeightLbs` (`totalWeightLb`). Trọng lượng/đơn vị = `ext ÷ qty`. Riêng adapter cũ, `netWeightLbs` = **một đơn vị** (đúng nghĩa DB) — đừng trộn hai nghĩa (đó là lỗi P0-5).
3. **Công thức lõi** (đã kiểm chứng khớp Excel — SPEC §11.4): pool logistics = freight + thông quan + nội địa + **insurance**, phân bổ theo trọng lượng; bank fee = phí NH phân bổ theo Material + chi phí vốn; `Duty = (Material + Logistics) × %Duty`; `DDP = ROUNDUP(base ÷ (1 − margin − q·(1+c)), 2)`; Commission/CIT tính **sau** khi có giá bán.
4. **Chi phí theo lô hàng mặc định = 0**; chỉ tham số chính sách (biểu phí NH, bảo hiểm, days/year, lb→kg, bước làm tròn VND) mới có mặc định, và đặt ở **một** file.
5. **Server là nguồn quyết định giá**: API tính lại từ input; không ghi số client gửi lên. Đã thực hiện ở `src/lib/cbu/db/service.ts` — route chỉ validate (Zod) rồi gọi service; đừng thêm đường ghi giá/tổng trực tiếp từ body.
6. **Mỗi phiên tính phải qua các check** C1–C4 (SPEC §11.4); finalize bị chặn khi check lỗi.
7. **Golden test lấy số từ file md**, không sửa fixture cho khớp code. Bug này từng bị che vì hai lỗi triệt tiêu ở mức tổng — luôn so **từng dòng**, không chỉ tổng.
8. **Tên chỉ số trên giao diện CBU dùng đúng tiếng Anh của workbook** (cột, tham số, KPI, hàng tổng hợp: `Material Cost`, `Unit Cost`, `DDP Price (USD)`, `Sales Price`, `% Margin`, `TOTAL BANK FEE`, `Incoterm 1 — FCA`, `Freight per Logistic (reference)`…). Lấy từ 4 file md trước, giữ nguyên chữ hoa/viết tắt; tiếng Việt chỉ cho giải thích (hint), thông báo, nút. Không tự đặt tên tiếng Việt cho thuật ngữ đã có trong workbook. Nhãn nằm ở `src/lib/cbu/ui/draft.ts` (`PARAM_FIELDS`, `FCA_DAP_TEXT`) và các component trong `src/components/cbu/`.

### Cảnh báo migration
DB đang **lệch migration cả ở mức cột** so với `prisma/migrations`. **Không chạy `npx prisma migrate dev`** — Prisma sẽ đề nghị reset và xoá dữ liệu. Migration CBU được viết **SQL tay, idempotent** (`prisma/migrations/20260921120000_cbu_v2/migration.sql`); kiểm chứng bằng `node scripts/verify-cbu-migration.mjs` (Postgres nhúng, không đụng DB thật). Migration tách 2 bước: `20260921120000_cbu_v2` (chỉ thêm cột/default — an toàn với code cũ) và `20260921120100_cbu_v2_margin_cleanup` (backfill `marginPercent` — **chỉ sau khi code mới đã deploy**, vì `GET /api/rfq/[id]` bản cũ ép `null → 0` và trang cũ coi đó là override 0%). Thứ tự bắt buộc: **backup → bước 1 → deploy code → bước 2** (deploy mà chưa áp bước 1 thì mọi truy vấn `RFQ` lỗi). **Trạng thái: bước 1 ĐÃ áp lên Supabase (22/09/2026), bước 2 chưa.** Máy dev chạy nhánh này với .env trỏ Supabase cần bước 1 (nếu thiếu, mọi truy vấn RFQ lỗi và trang CBU không tải được). Đừng ghi vào DB dùng chung (Supabase) khi chưa được người dùng cho phép rõ ràng. Migration Prisma mới cho phần CBU cũng nên viết tay và có script kiểm chứng tương tự. Xem SPEC §11.8.

### Lệnh hữu ích
```bash
npm test -- --runInBand          # 14 suite / 314 test phải xanh (--runInBand: worker song song có thể hết RAM trên máy yếu)
node scripts/verify-cbu-migration.mjs  # kiểm chứng migration SQL tay (không cần DB)
npx tsx scripts/cbu-audit.ts --help    # audit giá đã lưu vs engine v2 (chỉ đọc, cần DATABASE_URL)
npx tsx scripts/dev-cbu-sandbox.ts     # sandbox: Postgres nhúng + dữ liệu AC0084 + next dev (localhost:3100), KHÔNG dùng DB thật
node scripts/e2e-cbu-sandbox.cjs       # 48 kiểm tra API end-to-end trên sandbox, gồm Baker (đổi dữ liệu — khởi động lại sandbox trước mỗi lần chạy lại)
npx jest __tests__/cbu            # chỉ test CBU (golden AC0084 + AC0481, tích hợp, render)
node scripts/gen-cbu-fixture.mjs  # sinh lại fixture từ file md (không sửa tay fixture)
npx tsc --noEmit                  # phải 0 lỗi
```

---

## Important Patterns

### 1. API Routes
- Tất cả API routes nằm trong `src/app/api/`
- Dùng Next.js App Router conventions
- Import `authOptions` từ `@/lib/auth` để get session
- Prisma client từ `@/lib/prisma`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // ... handler
}
```

### 2. Auth Guards
- Dashboard layout đã có auth check (`@/components/shared/sidebar`)
- API routes cần check session manually
- Role-based access: `ADMIN` và `SALE_ADMIN`

### 3. Email Sending
- **MS Graph (Primary):** Dùng `sendEmailViaGraph()` từ `@/lib/ms-graph`
  - Auto lấy token từ Azure AD credentials
  - Hỗ trợ PDF attachments
  - Email gửi từ `drilling@psbvn.com`

```typescript
import { sendEmailViaGraph } from "@/lib/ms-graph";

await sendEmailViaGraph({
  to: "recipient@example.com",
  subject: "Subject",
  bodyHtml: "<p>HTML content</p>",
  attachmentUrl: "https://...", // Optional
  fileName: "document.pdf"      // Optional
});
```

### 4. AI Document Parsing
- Dùng Gemini API qua `lib/gemini.ts`, `lib/gemini-quote.ts`
- AI config lưu trong database (`AiConfig` model)

### 5. PDF Generation
- Dùng APITemplate.io qua `/api/rfq/generate-document`
- Templates: Quotation, MVPO

---

## Environment Variables

**Critical** (phải có trên Vercel):
```bash
DATABASE_URL
NEXTAUTH_SECRET
NEXTAUTH_URL
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
GOOGLE_GEMINI_API_KEY
APITEMPLATE_API_KEY
APITEMPLATE_QUOTATION_TEMPLATE_ID
APITEMPLATE_MVPO_TEMPLATE_ID
AZURE_TENANT_ID
AZURE_CLIENT_ID
AZURE_CLIENT_SECRET
MS_GRAPH_MAILBOX=drilling@psbvn.com
```

**Local-only** (gitignored):
```bash
RESEND_API_KEY
```

---

## Common Tasks

### Add new API endpoint
1. Tạo file trong `src/app/api/[module]/[action]/route.ts`
2. Dùng template pattern ở trên
3. Test với Postman/curl

### Add new component
1. Đặt trong folder phù hợp (`components/ui/`, `components/rfq/`)
2. Nếu cần UI primitives, kiểm tra shadcn/ui trước
3. Dùng `cn()` từ `@/lib/utils` cho className

### Modify CBU calculation
- **Đọc mục "CBU Module" bên dưới trước.** Đổi công thức = sửa golden test trước, rồi mới sửa engine.
- Engine v2: `src/lib/cbu/` — dùng `import { calculateCbu } from "@/lib/cbu"`. Adapter cũ `calculateCBU()` và shim `lib/cbu-engine.ts` đã bị xoá ở Phase C5 — không còn tồn tại, đừng import.
- Trang `cbu-calc/page.tsx` **chỉ hiển thị và gọi engine** — không chứa công thức.

### Add new email template
- Email builder trong `src/lib/email-builder.ts`
- Các functions: `buildRfoEmailHtml()`, `buildQuotationEmailHtml()`

---

## Testing

### Test Email System
```bash
node scripts/test-ms-graph.mjs
```

### Test MS Graph Connection
```bash
# Gửi test email
curl -X POST http://localhost:3000/api/email/test-ms \
  -H "Content-Type: application/json" \
  -d '{"to":"test@example.com","subject":"Test","body":"<p>Test</p>"}'
```

---

## Deployment

- **Platform:** Vercel
- **Trigger:** Auto-deploy on GitHub push to `main`
- **Build:** `npm run build`

Sau khi push lên GitHub, Vercel sẽ tự động build và deploy.

---

## Code Style

- **TypeScript:** Strict mode, avoid `any`
- **Naming:** camelCase for variables/functions, PascalCase for components
- **Imports:** Use path aliases (`@/...`)
- **API Routes:** REST conventions, return JSON with appropriate HTTP status
- **Error Handling:** Always wrap in try/catch, log errors, return user-friendly messages

---

## Troubleshooting

### Build fails on Vercel but works locally
1. Kiểm tra tất cả imports có resolve không
2. Kiểm tra environment variables trên Vercel
3. Chạy `npm run build` locally để xem lỗi

### Email not sending
1. Kiểm tra MS Graph credentials
2. Chạy `node scripts/test-ms-graph.mjs` để test
3. Kiểm tra `MS_GRAPH_MAILBOX` đúng email

### Prisma errors
1. Chạy `npx prisma generate` để regenerate client
2. Chạy `npx prisma migrate deploy` để apply migrations

---

## Resources

- [Next.js 14 Docs](https://nextjs.org/docs)
- [Prisma Docs](https://prisma.io/docs)
- [shadcn/ui](https://ui.shadcn.com)
- [Microsoft Graph API](https://docs.microsoft.com/en-us/graph/api/)
- [Gemini API](https://ai.google.dev/docs)
