# PSBV Sales Agent Platform — Specification

## 1. Project Overview

**PSBV Sales Agent Platform** là hệ thống CRM nội bộ B2B được xây dựng cho team Sale Admin của PSBV Trading & Service Co., Ltd. Hệ thống tự động hóa toàn bộ vòng đời giao dịch xuất nhập khẩu — từ tiếp nhận Inquiry, hỏi giá hãng (RFO), bóc tách báo giá (AI), tính CBU (Cost Build Up), soạn Quotation, đến quản lý đơn đặt hàng MVPO và chứng từ hải quan.

### 1.1 Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 14 (App Router) + React 18 + TypeScript |
| **Styling** | Tailwind CSS + shadcn/ui components |
| **Database** | PostgreSQL + Prisma ORM 7 |
| **Auth** | NextAuth.js v4 + bcrypt |
| **AI** | Google Gemini API 0.24 |
| **Document** | APITemplate.io |
| **Storage** | Supabase Storage |
| **Email** | Microsoft Graph API (transport duy nhất — xem §5.3) |
| **Deployment** | Vercel |

---

## 2. Business Domain

### 2.1 Core Business Flow

```
┌─────────────────┐
│  INQUIRY        │  Khách hàng gửi yêu cầu báo giá (email/PDF)
│  RECEIVED       │  ─────────────────────────────────────────────
└────────┬────────┘
         │ AI Parse (Gemini)
         ▼
┌─────────────────┐
│  RFO            │  Sale Admin kiểm tra, điều chỉnh items
│  PENDING_ADMIN  │  ─────────────────────────────────────────────
└────────┬────────┘
         │ Gửi RFO cho hãng
         ▼
┌─────────────────┐
│  RFO_SENT_      │  Đang chờ hãng trả lời
│  TO_SUPPLIER    │  ─────────────────────────────────────────────
└────────┬────────┘
         │ Nhận Quote từ hãng
         ▼
┌─────────────────┐
│  SUPPLIER_      │  AI bóc tách PDF Quote từ hãng
│  QUOTED          │  ─────────────────────────────────────────────
└────────┬────────┘
         │ Tính CBU
         ▼
┌─────────────────┐
│  CBU_PENDING_    │  Sale Admin nhập phí logistics, bank...
│  ADMIN          │  ─────────────────────────────────────────────
└────────┬────────┘
         │ Tạo Quotation PDF
         ▼
┌─────────────────┐
│  QUOTATION_     │  Preview & edit quotation
│  DRAFTED        │  ─────────────────────────────────────────────
└────────┬────────┘
         │ Gửi Quotation
         ▼
┌─────────────────┐
│  QUOTED_        │  Gửi báo giá cho khách qua MS Graph
│  TO_CLIENT      │  ─────────────────────────────────────────────
└─────────────────┘
```

### 2.2 Key Business Concepts

| Term | Description |
|------|-------------|
| **RFQ** | Request for Quotation — Đơn yêu cầu báo giá |
| **RFO** | Request for Offer — Phiếu gửi hãng hỏi giá |
| **CBU** | Cost Build Up — Tính giá thành bao gồm tất cả chi phí |
| **DDP** | Delivered Duty Paid — Giá đã bao gồm thuế, vận chuyển |
| **MVPO** | Manufacturer's Vendor Purchase Order — Đơn đặt hàng gửi nhà cung cấp |
| **CI/PL** | Commercial Invoice / Packing List — Chứng từ hải quan |

### 2.3 CBU Calculation Parameters

CBU engine tính toán giá DDP với 30+ parameters (engine v2 ở `src/lib/cbu/` đã sửa các lỗi sai số của bản cũ — đặc tả đầy đủ ở **§11 CBU Module v2**; `bookingExchangeRate` không còn được engine v2 dùng):

| Category | Parameters |
|----------|------------|
| **Tỷ giá** | exchangeRate, bookingExchangeRate, vndRoundingStep, lbToKg |
| **Logistics** | freightCost, freightFixed, freightRatePerKg, chargeableWeightKg, clearanceCost, inlandCost |
| **Bảo hiểm** | insuredValuePercent, insuranceRatePercent, minInsuranceUsd |
| **Ngân hàng** | remittanceRatePercent, bankVatFactor, minRemittanceFeeUsd, receiveRatePercent |
| **Chi phí vốn** | percentValueFinanced, interestRatePercent, financingDays |
| **Thuế & phí** | dutyPercent, commissionPercent, citPercent |

---

## 3. Database Schema

### 3.1 Entity Relationship Diagram

```
┌─────────────┐       1:N        ┌─────────────┐       1:N        ┌─────────────┐
│    User     │◄────────────────│     RFQ     │◄───────────────│   RFQItem   │
├─────────────┤                 ├─────────────┤                 ├─────────────┤
│ id          │                 │ id          │                 │ id          │
│ email       │                 │ rfqCode     │                 │ rfqId (FK)  │
│ password    │                 │ clientId(FK)│                 │ lineNo      │
│ name        │                 │ status       │                 │ rawPartNumber│
│ role        │                 │ ...CBU fields│                 │ supplierUnit│
│ isActive    │                 │ ...logistics │                 │ ...CBU calcs│
└─────────────┘                 └─────────────┘                 └─────────────┘
       │                                 │
       │ 1:N                             │ 1:N
       ▼                                 ▼
┌─────────────┐                  ┌─────────────┐
│    Task     │                  │  Document   │
└─────────────┘                  └─────────────┘

┌─────────────┐       1:N        ┌─────────────┐
│   Client    │──────────────────│     RFQ     │
├─────────────┤                 └─────────────┘
│ id          │
│ name        │
│ companyName │
│ email       │
└─────────────┘

┌─────────────┐
│  Supplier   │
├─────────────┤
│ id          │
│ name        │
│ companyName │
│ email       │
│ ccEmails    │
└─────────────┘
```

### 3.2 Enums

```prisma
enum Role {
  ADMIN       // Master Admin: Toàn quyền + Quản lý User
  SALE_ADMIN  // Sale Admin: Vận hành, CBU, Dashboard
}

enum OrderStatus {
  INQUIRY_RECEIVED          // 1. Khách gửi Yêu cầu
  RFO_PENDING_ADMIN         // 2. Chờ duyệt RFO
  RFO_SENT_TO_SUPPLIER      // 3. Đã gửi Hãng
  SUPPLIER_QUOTED           // 4. Hãng đã báo giá
  CBU_PENDING_ADMIN         // 5. Chờ tính CBU
  QUOTATION_DRAFTED         // 6. Đã sinh Quotation PDF
  QUOTED_TO_CLIENT          // 7. Đã gửi báo giá
}

enum TaskStatus {
  PENDING
  IN_PROGRESS
  DONE
}
```

---

## 4. Application Architecture

### 4.1 Directory Structure

```
psbv-sales-agent-saas/
├── prisma/
│   ├── schema.prisma          # Database schema
│   └── migrations/            # Prisma migrations
│
├── src/
│   ├── app/                   # Next.js App Router
│   │   ├── (auth)/          # Auth routes (login)
│   │   ├── (dashboard)/      # Dashboard routes (auth-gated)
│   │   │   ├── layout.tsx   # Dashboard shell
│   │   │   ├── overview/     # Dashboard overview
│   │   │   ├── rfq/         # RFQ management
│   │   │   │   ├── page.tsx           # RFQ list
│   │   │   │   ├── new/page.tsx       # Create RFQ
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx        # RFQ detail
│   │   │   │       ├── rfo-review/    # RFO review & send
│   │   │   │       ├── cbu-calc/      # CBU calculation (được dựng lại theo §11)
│   │   │   │       ├── mvpo/          # MVPO creation
│   │   │   │       └── quote-preview/ # Quotation preview
│   │   │   ├── clients/       # Client management
│   │   │   ├── tasks/        # Task management
│   │   │   ├── database/     # Database browser
│   │   │   ├── system-users/ # User management
│   │   │   └── ai-config/   # AI configuration
│   │   │
│   │   └── api/              # API Routes
│   │       ├── auth/         # NextAuth endpoints
│   │       ├── rfq/          # RFQ CRUD + operations
│   │       ├── clients/      # Client CRUD
│   │       ├── users/        # User CRUD
│   │       ├── tasks/        # Task CRUD
│   │       ├── email/        # Email endpoints
│   │       └── ai-config/    # AI config
│   │
│   ├── components/
│   │   ├── ui/              # shadcn/ui base components
│   │   ├── shared/          # Sidebar, Logout
│   │   ├── providers/        # Auth provider
│   │   ├── rfq/             # RFQ-specific components
│   │   └── cbu/             # (mới, §11.8) Workspace CBU: bảng dòng hàng, tham số, kịch bản
│   │
│   └── lib/                  # Utilities
│       ├── cbu/              # (mới, §11.8) CBU engine v2: math, pools, pricing, profiles, checks
│       ├── utils.ts          # cn() helper
│       ├── auth.ts           # NextAuth config
│       ├── prisma.ts        # Prisma client
│       ├── ms-graph.ts      # MS Graph API client
│       └── email-builder.ts  # Email templates
│
├── .env                      # Environment variables (gitignored)
├── next.config.mjs          # Next.js config
└── package.json
```

### 4.2 API Routes

| Group | Endpoints |
|-------|-----------|
| **RFQ** | `GET/POST /api/rfq`, `GET/PUT/DELETE /api/rfq/[id]` |
| **RFQ Items** | `GET/PUT /api/rfq/[id]/items` |
| **RFQ Status** | `GET/PUT /api/rfq/[id]/status` |
| **CBU** | `POST /api/rfq/[id]/calculate-cbu` *(hiện tại; sẽ thành alias của API v2)* · v2 (§11.8): `GET/PUT /api/rfq/[id]/cbu`, `POST /api/rfq/[id]/cbu/finalize` |
| **Documents** | `POST /api/rfq/[id]/generate-pdf`, `POST /api/rfq/generate-document` |
| **Email** | `POST /api/rfq/[id]/send-quote`, `POST /api/rfq/[id]/send-rfo` |
| **AI Parsing** | `POST /api/rfq/parse-inquiry`, `POST /api/rfq/parse-supplier-quote` |
| **Auth** | `GET/POST /api/auth/[...nextauth]` |
| **Clients** | `GET/POST /api/clients`, `GET/PUT/DELETE /api/clients/[id]` |
| **Users** | `GET/POST /api/users`, `GET/PUT/DELETE /api/users/[id]` |
| **Tasks** | `GET/POST /api/tasks`, `GET/PUT/DELETE /api/tasks/[id]` |

---

## 5. Key Features

### 5.1 RFQ Lifecycle Management

| Feature | Status | Description |
|---------|--------|-------------|
| Tiếp nhận Inquiry | ✅ | Upload PDF, AI bóc tách dữ liệu |
| Tạo RFQ từ Email | ✅ | Xử lý file upload với Gemini |
| Gửi RFO cho Hãng | ✅ | Sinh email RFO, đính kèm file |
| Bóc tách Quote | ✅ | Gemini AI parse supplier quote |
| Tính CBU & DDP | ⚠️ | Chạy được nhưng **sai số** (phân bổ logistics, đơn vị %) và UI khó dùng — đang tái cấu trúc, xem **§11 CBU Module v2** |
| Sinh Quotation PDF | ✅ | APITemplate.io → PDF |
| Preview & Edit Quotation | ✅ | Split-view editor |
| Gửi Quotation | ✅ | MS Graph API → Outlook |
| Tạo MVPO | ✅ | Purchase Order template |
| CI/PL Editing | 🔄 | In progress |
| COC/COO Management | 🔄 | In progress |

### 5.2 AI Integration

| Module | File | Purpose |
|--------|------|---------|
| Inquiry Parsing | `src/lib/gemini-inquiry.ts` | Parse customer inquiry PDF |
| Quote Parsing | `src/lib/gemini-quote.ts` | Parse supplier quote |
| PO Parsing | `src/lib/gemini-po.ts` | Parse customer PO |

### 5.3 Email System

| Provider | File | Usage |
|----------|------|-------|
| MS Graph | `src/lib/ms-graph.ts` | Duy nhất — mọi email (RFO, Quotation, dispatch, mail nhanh) qua Outlook, hỗ trợ PDF attachment optional |

Resend/nodemailer đã gỡ bỏ hoàn toàn ở Sprint 2 (22/09/2026) — trước đó `send-rfo` và `send-rfq` (quick-email-modal) gửi thật qua sandbox domain `onboarding@resend.dev`, không phải domain công ty. Xem PROGRESS.md §4 SPRINT 2.

### 5.4 Document Generation

| Type | Template ID | Status |
|------|------------|--------|
| QUOTATION_CLIENT_PDF | `APITEMPLATE_QUOTATION_TEMPLATE_ID` | ✅ Active |
| MVPO_SUPPLIER_PDF | `APITEMPLATE_MVPO_TEMPLATE_ID` | ✅ Active |
| COMMERCIAL_INVOICE_PDF | TBD | ⏳ Planned |
| CERTIFICATE_COC_COO_PDF | TBD | ⏳ Planned |

---

## 6. Environment Variables

```bash
# Database
DATABASE_URL=postgresql://...

# Auth
NEXTAUTH_URL=https://...
NEXTAUTH_SECRET=...
AUTH_GITHUB_ID=...
AUTH_GITHUB_SECRET=...

# Supabase
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...

# AI
GOOGLE_GEMINI_API_KEY=...

# Document
APITEMPLATE_API_KEY=...
APITEMPLATE_QUOTATION_TEMPLATE_ID=...
APITEMPLATE_MVPO_TEMPLATE_ID=...

# MS Graph (Email)
AZURE_TENANT_ID=...
AZURE_CLIENT_ID=...
AZURE_CLIENT_SECRET=...
MS_GRAPH_MAILBOX=drilling@psbvn.com

# Email (Backup)
RESEND_API_KEY=...
```

---

## 7. Development Commands

```bash
# Install dependencies
npm install

# Development
npm run dev

# Build
npm run build

# Database
npx prisma migrate dev      # Create migration
npx prisma migrate deploy   # Apply migrations
npx prisma generate         # Generate client
npx prisma db seed          # Seed data

# Lint
npm run lint

# TypeScript check
npx tsc --noEmit
```

---

## 8. Testing Email

```bash
# Test MS Graph connection
node scripts/test-ms-graph.mjs
```

---

## 9. Deployment

**Target:** Vercel (Next.js 14 App Router)

Vercel tự động deploy khi có push lên GitHub.

**Required Environment Variables on Vercel:**
- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_GEMINI_API_KEY`
- `APITEMPLATE_API_KEY`
- `APITEMPLATE_QUOTATION_TEMPLATE_ID`
- `APITEMPLATE_MVPO_TEMPLATE_ID`
- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`
- `MS_GRAPH_MAILBOX`

---

## 10. Roadmap

### Phase 1.5 — CBU Module v2 (ưu tiên trước Phase 2)
Sửa đúng công thức theo workbook đã chuẩn hoá, lưu/đọc đầy đủ, dựng lại giao diện, thêm kịch bản Air/Sea và profile Baker Hughes (FCA/DAP). Chi tiết & tiêu chí nghiệm thu: **§11**. Theo dõi tiến độ: `PROGRESS.md` §6.

### Phase 2 — Feature Completion (v0.2)
- [ ] CI/PL Editing với template
- [ ] COC/COO document handling
- [ ] Email Review Agent (human-in-the-loop)
- [ ] Dashboard analytics (revenue, margin KPIs)

### Phase 3 — Automation (v0.3)
- [ ] Full AI Agent orchestration
- [ ] Automated follow-up emails
- [ ] Webhook integration
- [ ] Real-time notifications

### Phase 4 — Scale (v1.0)
- [ ] Multi-tenant support
- [ ] Mobile responsive enhancements
- [ ] Offline mode (PWA)
- [ ] Advanced reporting & exports

---

## 11. CBU Module v2 — Đặc tả cập nhật (Logic + Giao diện)

> **Trạng thái (22/09/2026):** ✅ **Phase C0–C5 xong.** C3 xong cả kịch bản Air/Sea + so sánh, C4 xong Baker Hughes / `FCA_DAP`, C5 xong: payload Quotation PDF sửa (`unit_price` = `ddpPriceUsd` per unit, `amount` = × qty — bug P2-5), trang legacy (`?legacy=1`), adapter `calculateCBU()`, route `calculate-cbu`, và shim `lib/cbu-engine.ts` **đã bị xoá** — giao diện mới ở `/rfq/[id]/cbu-calc` là **duy nhất**. Engine v2 ở `src/lib/cbu/` khớp Excel từng dòng (cả hai profile); lưu/đọc + API v2 ở `src/lib/cbu/db/`; 314 test pass, `tsc` 0 lỗi, `next build` thành công. **Migration bước 1 ĐÃ áp lên DB Supabase thật** (22/09, có sao lưu; chỉ thêm cột/default, dữ liệu không đổi); **bước 2 (backfill `marginPercent`) CHƯA áp — chỉ áp sau khi deploy code mới** (xem §11.8).
> **Nguồn sự thật nghiệp vụ:** 4 file markdown trong `documents/CBU_docx/` (đội nghiệp vụ đã phân tích, chỉnh sửa và chuyển từ Excel). `CBU_ANALYSIS_REPORT.md` (27/08) **đã lỗi thời** — xem §11.2.
> **Đã kiểm chứng:** công thức ở §11.4 được chạy thử bằng một prototype và tái tạo **khớp đến từng dòng** các số trong file markdown Hoàng Sơn (AIR: cost 24,576.98 · revenue $32,793.20 · 890,800,000 VND; SEA: 21,477.91 · $28,652.40 · 778,800,000 VND).

### 11.1 Mục tiêu

| # | Mục tiêu | Đo bằng |
|---|----------|---------|
| G1 | **Đúng số**: engine cho kết quả trùng workbook đã chuẩn hoá | Golden test khớp file md, sai số ≤ 5e-5 (USD), VND khớp tuyệt đối |
| G2 | **Lưu/đọc đầy đủ**: mở lại RFQ thấy đúng những gì đã nhập | Round-trip test: lưu → tải lại → kết quả không đổi |
| G3 | **Server là nguồn quyết định giá**: không tin số client gửi lên | API tự tính lại từ input, bỏ qua total/items do client gửi |
| G4 | **Giao diện tối giản, dễ dùng**: nhập hằng ngày ≤ 8 ô trước khi ra giá | Xem §11.9 |
| G5 | **Bao phủ 2 mẫu nghiệp vụ**: DDP nhập khẩu (Hoàng Sơn) và FCA/DAP (Baker Hughes), có kịch bản Air/Sea, Payment/Net 60 | §11.3 |
| G6 | **Tự kiểm**: mọi phiên tính có dòng CHECK như Excel (=0) | §11.4 (Invariants) |

**Ngoài phạm vi (không làm ở v2):** multi-currency EUR, nhiều shipment/forwarder trên cùng 1 kịch bản, phê duyệt margin nhiều cấp, dashboard analytics, xử lý COC/COO.

### 11.2 Hiện trạng đã kiểm chứng (chạy code thật với dữ liệu AC0084)

Kiểm chứng bằng cách nạp 16 dòng AIR của AC0084 vào `lib/cbu-engine.ts` hiện tại và so với Excel.

| # | Phát hiện | Bằng chứng | Mức |
|---|-----------|------------|:---:|
| F1 | **Phân bổ logistics sai ~2 bậc độ lớn.** Engine dùng `netWeightLbs` theo hai nghĩa trái ngược: `extWeight = net × qty` (coi là *đơn vị*) nhưng `weightPerUnit = net ÷ qty` (coi là *tổng dòng*) | Σ(logistics+insurance)×qty = **14.78** trong khi pool = **4,253** (chỉ 0.35%). Excel: bằng pool | 🔴 P0 |
| F2 | **`pct()` tự đoán đơn vị**: giá trị ≤ 1 bị coi là *phân số*. Duty 1% → 100%; Insurance rate `0.01` (=0.01%) → 1%; Remittance `0.2` (=0.2%) → 20% | Duty 1% trên base 100 → **100** (đúng: 1). Insurance **253.23** (Excel 15.00). Bank fee dòng 1 **0.975** (Excel 0.025, gấp 39 lần) | 🔴 P0 |
| F2b | **F1 và F2 lệch ngược chiều nên triệt tiêu ở mức tổng** — tổng cost chỉ lệch +0.8% (24,775.72 vs 24,576.98) nên nhìn tổng tưởng đúng; sai nằm ở từng dòng (giá bán dòng 1: 7.49 vs **7.10**, +5.5%). Đây cũng là lý do test "pass" sau khi sửa fixture `0.2 → 0.002` | | 🔴 |
| F3 | **Duty base**: Excel = `(Material + Logistics đã phân bổ, GỒM insurance) × %Duty`; engine cũ loại insurance ra khỏi base. *(C1 sửa khớp Excel; 22/09 đổi tiếp sang CIF thực theo quyết định Q2 — xem §11.12)* | Lệch nhỏ khi Duty > 0 | 🟠 |
| F4 | **Mặc định chi phí lô hàng không nhất quán**: Excel không có `docFee`; schema mặc định 0 nhưng trang/route fallback **15** (`safeNum(rawData.docFee, 15)`, `docFee ?? 15`) — hiện ít kích hoạt vì Prisma trả 0, nhưng là bẫy. Ngược lại `clearanceCost 150` / `inlandCost 100` (số của một lô mẫu) **đang là mặc định thật** trong schema → mọi RFQ mới tự mang 250 USD chi phí | Đọc `schema.prisma`, `cbu-calc/page.tsx`, `calculate-cbu/route.ts` | 🟡 |
| F5 | **Không lưu được**: `cbuMode`, `targetMarginPercent`, `commissionRate`, `citOnCommission`, `marginOverrideUsd` không có cột DB; route không ghi `supplierUnitPrice` / trọng lượng đã sửa → mở lại là mất | Đọc `prisma/schema.prisma` + `calculate-cbu/route.ts` | 🟠 |
| F6 | **Mở lại RFQ đã lưu → margin 0%**: `RFQItem.marginPercent` có `@default(25)`; route ghi `item.marginPercent ?? 0` (dòng không ghi đè → `null` → **0**); trang tải lại coi `0` là override hợp lệ (`!== null`) → mọi dòng thành margin 0%, giá bán = giá vốn. Trước lần lưu đầu thì mọi dòng mang override ngầm 25%. Cả hai trường hợp làm Target margin toàn đơn mất tác dụng | Suy ra từ đọc code (chưa chạy trên DB) | 🔴 |
| F7 | **Route tin số client**: nhận `items` + tổng đã tính từ trình duyệt và ghi thẳng DB; không Zod | Ai có session đều ghi được giá tuỳ ý | 🟠 |
| F8 | **Tàn dư đã bị loại khỏi workbook**: `bookingExchangeRate` + `effectiveMarginPct` (md §9: "như đã làm với ExchangeRate_Booking"); fallback tỷ giá không thống nhất (engine 25,500 / trang 26,500) | | 🟡 |
| F9 | **Thiếu năng lực workbook đã có**: kịch bản Air/Sea song song + chênh lệch (112,000,000 VND); Baker Hughes (FCA/DAP, Payment-with-Order / Net 60); dòng CHECK; nhóm khách "Nước ngoài" đang bị chặn | | 🟡 |
| F11 | **VAT factor dùng chung**: engine cũ nhân 1.1 cho cả phí *receive*; md ghi remittance = **1.10**, receive = **1.00** (đã sửa ở C1: hai tham số riêng `remitVatFactor`, `receiveVatFactor`) | Đọc md §7 | 🟡 |
| F10 | **UI**: card `max-h-[90vh]` lồng scroll trong page; ~25 ô nhập ở 3 panel hiển thị cùng lúc; 3 bảng tóm tắt căn bằng hack `pt-[45px]` / `pt-[124px]`; cột màu cầu vồng (xanh/tím/lục/xám); nhãn Anh–Việt lẫn lộn; 900 dòng trong 1 file | Đọc `cbu-calc/page.tsx` | 🟡 |

**Trạng thái sửa (21/09/2026):** F1–F4, F11 ✅ engine (C1) · F5, F6, F7 ✅ mã nguồn (C2; cần áp migration để có hiệu lực trên DB thật) · F8 ✅ engine không còn dùng, dọn khỏi UI/DB ở C3 · F9 → C3 (Air/Sea) và C4 (Baker Hughes) · F10 → C3.

**Đính chính `CBU_ANALYSIS_REPORT.md`:** ba "lỗi" nó nêu **không phải lỗi**: (§3.1) *Insurance tính 2 lần* — không, insurance nằm trong pool cùng driver trọng lượng, khớp Excel; (§3.3) *Financing tính 2 lần* — không, `totalFinancingCostUsd` chỉ là số hiển thị, không cộng vào cost; (§3.4) *Commission/CIT ở PRICE_INPUT* — đúng theo md. Bản sửa "logistics allocation" ngày 27/08 (dùng `weight_per_unit ÷ totalWeight`) **cũng chưa đúng** vì `totalWeight` vẫn tính theo nghĩa còn lại (F1).

### 11.3 Hai profile CBU và mô hình kịch bản

Một **CBU sheet** = 1 profile + 1 mode + tham số chung + **N kịch bản** (dùng chung dòng hàng). Kịch bản chỉ ghi đè phần khác nhau giữa các phương án báo giá.

| | `DDP_IMPORT` (mẫu Hoàng Sơn · AC0084) | `FCA_DAP` (mẫu Baker Hughes · AC0481) |
|---|---|---|
| Nhóm khách | Nội địa (VN) | Nước ngoài (MY…) — bỏ chặn "đang phát triển" ở modal CBU |
| Giá đầu ra | DDP USD (+ VND) | Sales Price **FCA** và **DAP** (= FCA + cước) |
| Cấu phần chi phí | Material + Bank/Fin + Logistics + Duty + Commission + CIT | Material + Financial cost (phí NH phân bổ + lãi tín dụng) |
| Kịch bản mặc định | **Air** / **Sea** (khác khối logistics) | **Payment with Order** / **Net 60** (khác ngày tín dụng) |
| Làm tròn giá USD | `ROUNDUP(x, 2)` | `ROUNDUP(x, 0)` |
| Mode | `MARGIN_INPUT` · `PRICE_INPUT` | `MARGIN_INPUT` · `PRICE_INPUT` |
| Ghi đè theo dòng | Margin % và Margin $/unit (ưu tiên $) | Margin % |
| Việc dùng chung | pool bank fee · chi phí vốn · làm tròn · CHECK · server recompute | |

**Đã triển khai (C3).** Kịch bản = một phương án vận chuyển trên **cùng các dòng hàng**. Lưu trong `RFQ.cbuConfig = { schemaVersion, chosenScenarioId, scenarios: [{ id, label, overrides, prices }] }`.

- **Kịch bản đầu tiên là nền**: logistics của nó là các cột phẳng `RFQ.freight*/clearanceCost/inlandCost/docFee` và `overrides` luôn rỗng. Kịch bản sau chỉ lưu phần khác nền (hiện chỉ **logistics**) trong `overrides`. Các tham số còn lại (tỷ giá, margin, hoa hồng, ngân hàng, bảo hiểm, chi phí vốn…) và các dòng hàng (giá gốc, trọng lượng, thuế, ghi đè margin) **dùng chung** mọi kịch bản.
- **`prices`** = giá bán nhập của từng dòng theo kịch bản (chế độ `PRICE_INPUT`; workbook có giá riêng cho Air và Sea). Lưu tường minh sau mỗi lần lưu; config cũ chưa có `prices` thì lấy giá đã lưu trên dòng làm mặc định (tương thích).
- **Kịch bản được chọn** (`chosenScenarioId`) quyết định các cột kết quả mà Quotation đọc: `RFQItem.ddpPriceUsd/unitCostUsd/...` và tổng của `RFQ`. Cột phẳng logistics của RFQ luôn là kịch bản nền, **không** phải kịch bản được chọn.
- **Finalize chỉ chặn theo kịch bản được chọn** (các phương án chỉ để so sánh có thể chưa đủ dữ liệu).
- API: `saveCbuSchema` nhận `scenarios[]` (1–4, id duy nhất, chỉ `overrides.logistics`) và `chosenScenarioId`; bỏ qua `scenarios` = giữ nguyên các kịch bản đã lưu; client cũ gửi giá theo dòng (`items[].ddpPriceUsdInput`) được gán cho kịch bản đầu. `sheet.scenarios[]` trả kết quả từng kịch bản để so sánh.
- Giao diện: thanh tab phương án (thêm = sao chép phương án đang xem, đổi tên, xoá, dấu ✓ = dùng cho Quotation), bảng **So sánh phương án** (pool logistics, giá vốn, doanh thu $ / ₫, lãi, margin, chênh lệch so với phương án được chọn — với AC0084: Air − Sea = 112,000,000 ₫ đúng workbook) và nút "Chọn phương án này". Đã kiểm chứng: Air 890,800,000 ₫, Sea 778,800,000 ₫ (từng dòng khớp md).

### 11.4 Công thức chuẩn — `DDP_IMPORT` (đã kiểm chứng với md)

Quy ước: mọi `…Pct` **nhập theo phần trăm (3 = 3%)**; engine luôn chia 100, **không tự đoán**.

```
# (1) Dòng hàng i — đơn vị TRỌNG LƯỢNG chuẩn: tổng dòng, pound (= cột F Excel = RFQItem.extWeightLbs)
w_i   = extWeightLb_i ÷ qty_i × lbToKg                  # kg / đơn vị
W     = Σ qty_i × w_i          M = Σ qty_i × material_i # tổng của shipment (kịch bản)

# (2) Pool logistics (Sheet Logistic)
freight   = freightAllIn > 0 ? freightAllIn : freightFixed + freightRate × chargeableKg
insurance = MAX( (M + freight) × insuredPct × insuranceRate , minInsurance )   # dùng cột "Insurance", KHÔNG dùng "Min insurance"
pool      = freight + clearance + inland + otherLogistics + insurance          # otherLogistics mặc định 0

# (3) Pool phí ngân hàng (Sheet Bank Fee)
remit     = origin == "Local" ? 0 : MAX( remitRate × remitVat(1.10) × M , minRemit )
receive   = country == "VN"   ? 0 : MAX( receiveRate × receiveVat(1.00) × receiveBase , minReceive )   # receiveBase NHẬP TAY (tránh vòng lặp)
bankTotal = remit + receive + otherBank

# (4) Từng dòng (Sheet Margin Analysis)
financing_i  = material_i × pctFinanced × (interest × days ÷ daysPerYear)
bankFee_i    = financing_i + bankTotal × material_i ÷ M           # cột J "Bank fee & Financial cost"
logistics_i  = pool × w_i ÷ W                                     # cột K (đã gồm insurance) — dùng để cộng vào base_i
freightShare_i  = freight × w_i ÷ W                               # phần cước quốc tế phân bổ cho dòng i
insuranceShare_i = insurance × w_i ÷ W                            # phần bảo hiểm phân bổ cho dòng i
dutyBase_i   = material_i + freightShare_i + insuranceShare_i     # CIF thực — KHÔNG dùng cột L Excel (Material + logistics_i,
               #  vốn gồm cả clearance/inland/other không thuộc trị giá tính thuế). Quyết định Q2, 22/09/2026 — xem §11.12
duty_i       = dutyBase_i × dutyPct_i
base_i       = material_i + bankFee_i + logistics_i + duty_i + custom_i
k            = 1 − commissionPct × (1 + citPct)

MARGIN_INPUT:
  marginUsd_i > 0 ? ddp_i = ROUNDUP( (base_i + marginUsd_i) ÷ k , 2 )
                  : ddp_i = ROUNDUP( base_i ÷ (k − m_i) , 2 )     # m_i = marginPctOverride_i ?? targetMargin
PRICE_INPUT:
  ddp_i = giá nhập tay

commission_i = commissionPct × ddp_i          cit_i = citPct × commission_i
unitCost_i   = base_i + commission_i + cit_i  # = Material + Bank + Logistics + Duty + Commission + CIT
margin_i     = ddp_i − unitCost_i             margin%_i = margin_i ÷ ddp_i   (luôn là KẾT QUẢ)
ddpVnd_i     = ROUNDUP( ddp_i × fx ÷ vndStep ) × vndStep
Tổng: TotalRevenueVnd = Σ qty × ddpVnd · TotalCost = Σ qty × unitCost · NominalMargin% = Σ qty×margin ÷ Σ qty×ddp
Bảo vệ: nếu (k − m_i) ≤ ε → cảnh báo trên dòng, KHÔNG trả giá vô nghĩa.
```

**Invariants tự kiểm (tương ứng dòng CHECK Excel — phải = 0, dung sai 1e-6):**

| ID | Kiểm tra |
|----|----------|
| C1 | `unitCost_i − (material + bankFee + logistics + duty + commission + cit) = 0` |
| C2 | `Σ qty×(bankFee_i − financing_i) − bankTotal = 0` |
| C3 | `Σ qty×logistics_i − pool = 0` (chỉ khi W > 0) |
| C4 | MARGIN_INPUT: `margin%_i ≥ margin mục tiêu_i − 1e-9` (do ROUNDUP chỉ làm tăng) |

Engine trả `checks: { id, label, delta, ok }[]`; UI hiện một chip "✓ Đối soát khớp" hoặc danh sách dòng lệch. **Chốt CBU (finalize) bị chặn nếu có check lỗi.**

### 11.5 Công thức — `FCA_DAP` (Baker Hughes)

```
# Bank pool: remit = MAX(0.2% × 1.1 × M, min 50) ; receive = MAX(rate × base, min) khi Country ≠ VN   (Q4 dưới đây)
financing_i = bankTotal × material_i ÷ M
            + material_i × pctFinanced × (interest × creditDays ÷ daysPerYear)
              # Payment with Order: pctFinanced = 0 → chỉ còn phần phí NH
              # Net 60: pctFinanced = 100%, interest = 15%, creditDays = 45  (file gốc hardcode 15%×45/360)
unitCost_i  = material_i + financing_i
salesFca_i  = MARGIN_INPUT ? ROUNDUP( unitCost_i ÷ (1 − marginPct_i) , 0 ) : giá nhập
salesDap    = Σ qty_i × salesFca_i + freightManual          # cước nhập tay ở cấp đơn (P16), cộng vào TỔNG
freightRef  = pool freight (sheet Logistic) — chỉ tham khảo; cảnh báo nếu |freightRef − freightManual| > 0
```

Thống nhất chi phí vốn giữa hai profile: `financing = material × pctFinanced × interest × days ÷ daysPerYear` (DDP: 50%·15%·15 ngày/360; Baker Net 60: 100%·15%·45 ngày/360).
Số kiểm chứng Baker: FCA unit cost 108.33 → giá **131** (total 3,930, margin 680); Net 60: unit cost 110.31 → giá **133** (total 3,990) + cước 1,100 = DAP **5,090**; Payment with Order: DAP 131 → 3,930 + cước 1,800 = **5,730**.

**Đã triển khai (C4, 22/09/2026)** — `src/lib/cbu/profiles/fca-dap.ts`, golden `__tests__/cbu/fca-dap.golden.test.ts` (số lấy từ md Baker, fixture `ac0481.ts`):
- Mỗi dòng có **hai khối giá trên cùng giá vốn**: FCA (`financial = phí NH phân bổ theo material`, **không** có lãi tín dụng) và DAP (`FCA + material × pctFinanced × lãi × ngày ÷ daysPerYear`). `price = ROUNDUP(unitCost ÷ (1 − margin), 0)` (làm tròn USD nguyên); PRICE_INPUT nhập cả giá FCA lẫn giá DAP theo từng kịch bản.
- **Kịch bản = điều khoản thanh toán** (Payment with Order: 0%/0 ngày · Net 60: 100%/45 ngày, lãi 15%). Trục kịch bản của Baker là `pctFinanced`, `interestPct`, `financingDays` và cước; các tham số còn lại (biểu phí NH, margin mục tiêu, nước đích) dùng chung.
- **Chào giá DAP = Σ qty × giá DAP + một khoản cước trọn gói** (Excel G16 = G15 + P16). Tái dùng hai trường cước của mô hình chung: `logistics.freightAllInUsd` = **cước báo giá** (cộng vào tổng), `logistics.freightFixedUsd` = **cước theo bảng Logistic** (chỉ đối chiếu). Khác nhau ⇒ **cảnh báo** (Net 60: 1,100 vs 1,800 ⇒ chênh $700), không làm hỏng check.
- Không có thuế nhập khẩu, hoa hồng, CIT, bảo hiểm, phân bổ logistics theo trọng lượng ⇒ trọng lượng không bắt buộc, các trường này ẩn khỏi UI; `fx` và bước làm tròn VND vẫn nhập được vì tổng VND của RFQ phụ thuộc chúng.
- **Cơ sở báo giá `quoteBasis` (FCA | DAP)** lưu trong `cbuConfig`; mặc định suy từ Incoterm của RFQ (`DAP`/`DDP` ⇒ DAP, còn lại FCA). Quyết định khối giá nào được lưu vào `RFQItem.ddpPriceUsd` và tổng RFQ (cơ sở DAP: tổng **đã gồm** cước trọn gói). Kịch bản được chọn quyết định như ở DDP.
- Profile lưu ở `RFQ.cbuProfile`; `profileFromRfq` đọc cột này. Chuyển mô hình trong giao diện có bước xác nhận vì nó **đặt lại** tham số/kịch bản về mặc định của mô hình mới (dòng hàng và giá gốc giữ nguyên). Vào từ modal "Nước ngoài" với sheet chưa từng tính ⇒ tự chuyển sang Baker.
- Mặc định Baker (`PROFILE_DEFAULTS.FCA_DAP`): margin mục tiêu 17%, làm tròn USD 0 chữ số, hoa hồng/CIT 0, nước đích MY, phí nhận tiền min $35, lãi 15%; vì phí nhận tiền chưa chốt (Q4) nên `bank.receiveBaseUsd` vẫn **nhập tay**.

### 11.6 Quy ước bắt buộc (áp dụng cho code mới)

1. **Đơn vị %**: UI, DB, API đều dùng số phần trăm (3 = 3%). Chỉ engine chia 100. Cấm auto-detect. *(DB hiện đã lưu theo quy ước này — không cần migrate dữ liệu, chỉ sửa cách engine đọc.)*
2. **Trọng lượng**: chuẩn là **tổng trọng lượng dòng (lb)** = `RFQItem.extWeightLbs`; `netWeightLbs` = `ext ÷ qty` là giá trị dẫn xuất. Nếu `ext` trống thì lấy `netWeightLbs × qty`.
3. **Chi phí theo shipment mặc định = 0** (cước, thông quan, nội địa, phí khác). Các con số 150 / 100 / 15 trong code là *ví dụ của 1 lô hàng*, không phải mặc định. Chỉ **tham số chính sách** (biểu phí NH, điều khoản bảo hiểm, days/year, lb→kg, bước làm tròn VND, tỷ giá) có mặc định — đặt ở **một** file `defaults.ts`.
4. **Không gọi `.toFixed()` trong engine**; mọi số ra khỏi engine phải hữu hạn.
5. **Server tính lại** trước khi lưu; số client chỉ để hiển thị.
6. **Đổi công thức = đổi golden test trước** (TDD). Không sửa fixture cho khớp code.

### 11.7 Phân loại biến → cách hiển thị trong UI

Theo nhãn nhóm mà đội nghiệp vụ đã gắn trong các file md.

| Nhóm | Ví dụ | Trong UI | Nguồn dữ liệu |
|------|-------|----------|---------------|
| 🗄️ DATABASE | Part No, Description, Supplier, Qty, Total Weight, Material Cost; Customer, Country, Goods origin, Incoterm, Payment terms, Inquiry date | **Chỉ đọc** (chữ xám). Trọng lượng & Material cho phép "Sửa" có chủ đích (AI hay bóc thiếu) và gắn nhãn *đã chỉnh*; ghi ngược `RFQItem` | `RFQ`, `RFQItem` |
| 🟦 INPUT | Job No., %Duty, Commission q, CIT c, cước / thông quan / nội địa, Receive base, Margin override, **DDP Price (mode PRICE)** | Ô nhập: viền mảnh + chữ xanh (giữ quy ước Excel "xanh = nhập") | `RFQ.cbuConfig`, `RFQItem` |
| 🟧 DEFAULT | Tỷ giá, Target margin, biểu phí NH, điều khoản bảo hiểm, days/year, bước làm tròn, lb→kg | Panel tham số **thu gọn**, nhãn "Mặc định" + nút "Khôi phục" khi đã sửa | `defaults.ts` → `cbuConfig` |
| 🟧 DEFAULT\* "(Bỏ)" | Target margin, % Value financed, Interest rate, Financing days | **Giữ nguyên trong engine** (vẫn nằm trong công thức). UI đưa vào "Nâng cao" — chờ quyết định **Q1** | như trên |
| ⚙️ COMPUTED / 🟩 LINK | Weight kg, Bank fee, Logistics, Duty, Commission, CIT, Unit cost, Margin, các tổng | Chỉ đọc, chữ đen; tooltip hiện công thức | Engine |

### 11.8 Kiến trúc & mô hình dữ liệu

**Cấu trúc mã**

```
src/lib/cbu/
  types.ts              # CbuInput, CbuScenario, CbuResult, CbuCheck
  math.ts               # n(), g(), roundUp(), roundUpToStep(), pctToFrac()   ← không còn pct() đoán đơn vị
  defaults.ts           # MỘT nơi duy nhất chứa mặc định chính sách (+ theo profile)
  pools.ts              # freight, insurance, bank pool, financing
  pricing.ts            # closed-form, override $, price-input
  profiles/ddp-import.ts · profiles/fca-dap.ts
  checks.ts             # C1–C4
  params.ts             # resolveParams(): partial/garbage → CbuParams đầy đủ, hữu hạn
  legacy.ts             # adapter calculateCBU() cho code cũ (xoá ở C5)
  index.ts              # calculateCbu(lines, params) — API mới
lib/cbu-engine.ts       # re-export mỏng của legacy.ts → xoá khi hợp nhất lib/ (Sprint 2)
# Trạng thái C1: đã có types, math, defaults, params, pools, pricing, checks, profiles/ddp-import, index, legacy.
# (cây thư mục dưới đây là thiết kế ban đầu; profiles/fca-dap, schemas và components/cbu đã có từ C2–C4.)
src/lib/schemas/cbu.schemas.ts   # Zod cho GET/PUT/finalize
src/components/cbu/     # xem §11.9
```
Engine là hàm **thuần**, chỉ import tương đối (không `@/`) để chạy giống nhau ở client, server và Jest.

**Thay đổi Prisma** (tối thiểu, theo phase — xem cảnh báo migration bên dưới)

| Model | Thay đổi | Ghi chú |
|-------|----------|---------|
| `RFQ` | `cbuProfile String? @default("DDP_IMPORT")`, `cbuMode String? @default("MARGIN_INPUT")`, `targetMarginPercent Float? @default(25)`, `commissionRate Float? @default(3)`, `citOnCommission Float? @default(20)` | Sửa F5. `targetMarginPercent` **mặc định 25, không để null**: trang cũ đọc `safeNum(null, 25)` thành 0 (vì `Number(null) = 0`) làm giá về margin 0% |
| `RFQ` | `cbuConfig Json?` (`schemaVersion`, `chosenScenarioId`, `scenarios[]` với `overrides`), `cbuCalculatedAt DateTime?` | Chỉ giữ kịch bản + ghi đè; tham số nền ở cột phẳng (xem §11.3) |
| `RFQ` | đổi mặc định `clearanceCost`, `inlandCost` từ 150/100 → **0**; `exchangeRate` 25500 → 26500 (khớp schema) | Q6 (mặc định tạm). Chỉ ảnh hưởng RFQ tạo mới; giá trị đã lưu giữ nguyên |
| `RFQItem` | `marginOverrideUsd Float?`; **bỏ `@default(25)` của `marginPercent`** (null = dùng Target) | Sửa F6. **Backfill (bước 2 của migration, sau khi deploy code):** `marginPercent IN (0, 25)` → NULL (hai giá trị này chỉ là dấu vết của default cũ và `?? 0`, không mang thông tin); giá trị khác giữ nguyên. Bảng sao lưu `_cbu_v2_margin_backup` được tạo trước khi sửa. *(Điều chỉnh so với bản đầu: không dùng điều kiện theo trạng thái RFQ, vì RFQ đã `QUOTATION_DRAFTED` cũng mang giá trị 0 do lỗi và sẽ mở lại thành margin 0%.)* |
| `RFQItem` | dùng `extWeightLbs` làm trọng lượng chuẩn (không thêm cột) | §11.6-2 |

> ⚠️ **Cảnh báo migration:** DB đang **lệch migration ở cả mức cột** (ví dụ `init` không có `clearanceCost`, `docFee`, `customColumns`…; `exchangeRate` mặc định 25500 còn schema là 26500). **Không chạy `prisma migrate dev`** — Prisma sẽ đề nghị *reset* và xoá dữ liệu.
>
> **Cách đã chọn (đã làm ở C2): migration SQL viết tay, idempotent, tách 2 bước** — chỉ đụng `RFQ` và `RFQItem`, dùng `ADD COLUMN IF NOT EXISTS` / `SET DEFAULT` / `DROP DEFAULT` / `CREATE TABLE IF NOT EXISTS` nên chạy đúng dù DB ở trạng thái lệch nào và chạy lại nhiều lần không hại.
>
> - **Bước 1** `prisma/migrations/20260921120000_cbu_v2` — *chỉ thêm* cột và đổi default. Code production hiện tại (chưa biết các cột này) vẫn chạy bình thường.
> - **Bước 2** `prisma/migrations/20260921120100_cbu_v2_margin_cleanup` — sao lưu, bỏ default và backfill `RFQItem.marginPercent`. **Chỉ áp sau khi code mới đã chạy**: `GET /api/rfq/[id]` bản cũ ép `null → 0` và trang cũ coi 0 là override 0%, nên backfill trước khi deploy sẽ biến các dòng đó thành margin 0% (điều này được phát hiện khi chuẩn bị áp lên DB thật và đã có kiểm tra tự động).
>
> Đối chiếu bằng `prisma migrate diff` (phần đổi schema khớp từng câu lệnh) và **kiểm chứng bằng `node scripts/verify-cbu-migration.mjs`** (Postgres nhúng, không đụng DB thật): áp trên `init`, mỗi bước chạy 2 lần, **sau bước 1 dữ liệu và default `marginPercent` không đổi**, bước 2 backfill và sao lưu đúng.
>
> **Thứ tự triển khai bắt buộc:** (1) backup DB → (2) áp **bước 1** → (3) deploy code → (4) áp **bước 2**. Nếu deploy code mà chưa áp bước 1, mọi truy vấn `RFQ` sẽ lỗi vì Prisma client chọn các cột chưa tồn tại. Nếu phải rollback code, chạy khối ROLLBACK ở cuối file bước 2 *trước*. Cách áp: dán file vào Supabase SQL editor (chạy một lần cả khối) hoặc `npx prisma db execute --file …`; rồi `npx prisma migrate resolve --applied <tên>` (bảng `_prisma_migrations` có tồn tại, hiện chỉ ghi `init`). Cuối mỗi file có khối ROLLBACK thủ công.

**API v2** (mọi route: `getServerSession` + role `ADMIN`/`SALE_ADMIN`, body qua Zod)

| Route | Việc |
|-------|------|
| `GET /api/rfq/[id]/cbu` | Trả meta RFQ, dòng hàng (đã chuẩn hoá trọng lượng), cấu hình đã merge với mặc định, kết quả lưu gần nhất |
| `PUT /api/rfq/[id]/cbu` | Lưu nháp: chỉ nhận **input**; server chạy engine, ghi kết quả + `checks`; status → `CBU_PENDING_ADMIN` |
| `POST /api/rfq/[id]/cbu/finalize` | Như PUT + điều kiện: mọi check OK, mọi dòng có giá > 0 và trọng lượng > 0; status → `QUOTATION_DRAFTED`; đẩy kịch bản `isChosen` xuống cột phẳng |
| `POST /api/rfq/[id]/calculate-cbu` | **Deprecated alias** cho trang cũ: đọc body cũ, **bỏ qua mọi kết quả/tổng client gửi**, chuyển sang input v2 rồi qua cùng service (server tính lại). Lỗi 422 được gộp vào `error` để trang cũ hiển thị được |

**Đã triển khai (C2):** `src/lib/cbu/db/{mapping,service,legacy-body,audit,errors,http}.ts`, `src/lib/schemas/cbu.schemas.ts` (Zod: mọi % là số phần trăm, margin < 100%, khoá lặp bị từ chối, khoá thừa bị loại bỏ), 3 route. Chi tiết hành vi:

- **GET** trả `sheet`: thông tin RFQ, tham số đã hợp nhất mặc định, từng dòng (trọng lượng **tổng dòng**, override), `result` **tính lại mới** từ input đã lưu, và `saved` (số đã lưu trong DB, để so lệch).
- **PUT (nháp) / finalize:** nhận **chỉ input**; đọc dòng hàng từ DB (chống sửa dòng không thuộc RFQ → 400), áp chỉnh sửa, chạy engine, ghi trong một transaction; rồi đọc lại DB để trả đúng thứ mà lần tải sau sẽ thấy.
- **Trạng thái:** nháp → `CBU_PENDING_ADMIN` (kể cả RFQ đang `QUOTATION_DRAFTED`, vì Quotation nháp không còn khớp số); finalize → `QUOTATION_DRAFTED`; **`QUOTED_TO_CLIENT` không bao giờ bị hạ** (giá đã gửi là lịch sử; response kèm ghi chú). *Đây là quyết định của tôi khi làm C2 — bản cũ hạ mọi trạng thái về `CBU_PENDING_ADMIN`.*
- **Cổng finalize (422 + danh sách lý do, không ghi gì):** có ít nhất một dòng; mọi check C1–C4 đạt; mỗi dòng có giá bán hợp lệ, giá gốc > 0 và trọng lượng > 0.
- Trọng lượng lưu: `extWeightLbs` = tổng dòng (chuẩn), `netWeightLbs` = `ext ÷ qty`.
- **Audit:** `scripts/cbu-audit.ts` (chỉ đọc; lõi thuần ở `db/audit.ts` có test) xuất CSV giá đã lưu so với giá v2; dùng `omit` nên chạy được **trước** khi áp migration. Là *ước lượng* (bản cũ không lưu hoa hồng/CIT/margin mục tiêu nên dựng lại từ mặc định) — xem chú thích đầu file.

Kèm script chỉ-đọc `scripts/cbu-audit.ts`: tính lại mọi RFQ đã ở `QUOTATION_DRAFTED`/`QUOTED_TO_CLIENT` bằng engine v2 và xuất CSV chênh lệch giá — phục vụ quyết định thương mại về các báo giá đã gửi (Sprint 0 của `PROGRESS.md`).

### 11.9 Thiết kế giao diện (tối giản · thân thiện · hiện đại)

**Nguyên tắc**

1. **Hiển thị dần (progressive disclosure):** mặc định chỉ thấy thứ Sale Admin gõ mỗi ngày — tỷ giá, margin mục tiêu, hoa hồng, CIT, cước/thông quan/nội địa, và 3 ô mỗi dòng (Trọng lượng · Giá gốc · %Duty). Biểu phí NH, bảo hiểm, chi phí vốn, làm tròn nằm trong mục thu gọn có nhãn "Mặc định".
2. **Mỗi khái niệm một chỗ:** bỏ 3 bảng tóm tắt riêng; số pool (Logistics $4,015, Bank+Fin $110…) hiện ngay trên tiêu đề từng mục tham số.
3. **Một trang, một cuộn:** bỏ card `max-h-[90vh]` lồng scroll; header dính, footer dính, bảng cuộn ngang chỉ ở nhóm cột chi tiết.
4. **Màu có nghĩa:** nền trung tính; **xanh dương = ô nhập**; **xanh lá / đỏ chỉ dùng cho margin** (tốt / âm); cam cho cảnh báo. Bỏ nền cột tím–lục–xanh.
5. **Phản hồi tức thì:** tổng và margin cập nhật khi gõ; dòng margin âm nền đỏ nhạt; dòng thiếu trọng lượng có chấm cam + tooltip "logistics chưa phân bổ được".
6. **Số dễ đọc:** `tabular-nums`, canh phải, USD 2 số lẻ, kg 4 số lẻ, VND theo `vi-VN`; bỏ ký hiệu `$` lặp ở từng ô (đặt trong tiêu đề cột).
7. **Nhãn Việt hoá, giữ thuật ngữ Excel trong tooltip** để người quen bảng tính đối chiếu được (vd. "Giá bán DDP (USD)" — *DDP Price*).

**Bố cục (desktop-first, ≥1024px; dưới đó các panel xếp dọc)**

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ ←  RFQ-2026-0123 · Hoang Son · DDP Vung Tau · 30/70          [Lưu nháp]  [Hoàn tất  →]   │ header dính
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ (● Nhập Margin | ○ Nhập Giá bán)    Kịch bản: [ Air ] [ Sea ] [ + ]         ✓ Đối soát khớp │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ Doanh thu 890.8M ₫   Giá vốn $24,577   Margin 25.05% ●   Air − Sea: +112.0M ₫  [So sánh] │ KPI strip
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ ▾ Cơ bản       Tỷ giá [26,500]  Margin mục tiêu [25]%  Hoa hồng [3]%  CIT [20]%          │
│ ▾ Vận chuyển & bảo hiểm · Air        Cước [3,750]  Thông quan [150]  Nội địa [100]        │
│      Pool logistics $4,015 (gồm bảo hiểm $15)                                              │
│ ▸ Ngân hàng & chi phí vốn  · Pool $110.22  [Mặc định]      ▸ Nâng cao  [Mặc định]          │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│  #  Part No / Mô tả          SL   KL (lb)  Giá gốc  %Thuế │ Chi phí ▸ │ Giá vốn  Giá bán $  Giá bán ₫   Margin │
│  1  A23-170 · 7 5/8" BASIC  320   121.6    4.37    0     │  (thu gọn) │  5.32     7.10     190,000    25.0% │
│  …                                                                                          │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ TỔNG   4,080 · 2,273 lb · $19,271                          Doanh thu 890,800,000 ₫  · 25.05% │ footer dính
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

**Hành vi**

| Vùng | Hành vi |
|------|---------|
| Mode | Segmented control. `PRICE_INPUT`: ẩn cột margin, cột "Giá bán $" thành ô nhập, margin thực là kết quả. `MARGIN_INPUT`: cột "Ghi đè margin" (% và $) ẩn sau nút *Ghi đè margin* vì hiếm dùng |
| Kịch bản | Tab Air/Sea (hoặc Payment/Net 60); `+` nhân bản kịch bản hiện tại. Nút **So sánh** mở bảng cạnh nhau (doanh thu, giá vốn, margin, Δ) và chọn phương án đưa vào Quotation |
| Nhóm cột "Chi phí" | Thu gọn mặc định (chỉ thấy Giá vốn). Mở ra: Bank+Fin · Logistics · Duty · Commission · CIT |
| Dòng | Bấm dòng → ngăn kéo **Cấu trúc giá**: thanh xếp chồng Material / Bank+Fin / Logistics / Duty / Hoa hồng+CIT / Margin, kèm $ và % giá bán (chỉ CSS, không thêm thư viện biểu đồ) |
| Ô nhập | Giữ chuỗi trong state, parse khi blur (chấp nhận `1,5` và `1.5`); `Enter`/`Tab` xuống dòng dưới cùng cột; **dán nhiều dòng từ Excel** vào một cột |
| Mặc định | Ô đã sửa khác mặc định có chấm "Đã sửa" + nút khôi phục |
| Kiểm tra | Chip "Đối soát" (C1–C4). Lỗi liệt kê dòng lệch. Cảnh báo (margin âm, thiếu trọng lượng, `k − m ≤ 0`, receiveBase = 0 khi Country ≠ VN) hiện **tại dòng/ô liên quan**, không gom một khung |
| Lưu | "Lưu nháp" luôn khả dụng; "Hoàn tất" chỉ bật khi hợp lệ, có xác nhận tóm tắt ("Tạo Quotation nháp: 16 dòng · $32,793.20 · margin 25.05%"). Cảnh báo khi rời trang có thay đổi chưa lưu; thông báo bằng `toast` |
| Trạng thái | Skeleton khi tải, trạng thái rỗng khi chưa có dòng hàng (link về bước Quote), lỗi mạng có nút thử lại |

**Truy cập & tương thích:** nhãn `<label>` cho mọi ô; KPI dùng `aria-live="polite"`; tương phản AA; ô nhập cao tối thiểu 32px; điều hướng bàn phím đầy đủ.

**Đã triển khai ở C3 (lát cắt 1, 21/09/2026)** — `src/components/cbu/` + `src/lib/cbu/ui/`: header dính (RFQ, khách, Incoterm, thanh toán, nguồn→đích, trạng thái, "Chưa lưu"), chọn chế độ (segmented), KPI (doanh thu ₫/$, giá vốn, margin có màu, trọng lượng), chip Đối soát, 4 mục tham số thu gọn được (Cơ bản · Vận chuyển mở sẵn; Bảo hiểm/ngân hàng/vốn · Nâng cao thu gọn với nhãn *Mặc định / Đã sửa N* và nút khôi phục), bảng dòng hàng (nhóm cột Nhập liệu / Chi phí / Kết quả; Enter, ↑↓ chuyển dòng; dán nhiều ô từ Excel; cột chi phí và ghi đè margin bật/tắt; hàng mở rộng hiện thanh cấu trúc giá), footer dính (Hoàn tác · Lưu nháp · Hoàn tất), hộp thoại xác nhận có kiểm tra trước bằng cùng quy tắc của server, chặn rời trang khi chưa lưu. Tính toán tức thì ở client bằng đúng engine; server tính lại khi lưu. **Khác với thiết kế ban đầu:** "ngăn kéo Cấu trúc giá" → *hàng mở rộng tại chỗ* (giữ ngữ cảnh, đơn giản, dễ truy cập). **Chưa làm:** tooltip công thức trên tiêu đề cột, dọn `bookingExchangeRate` khỏi DB/UI cũ. *(Kịch bản Air/Sea + so sánh: xong 22/09, xem §11.3.)*

**Thành phần** (`src/components/cbu/`)

```
cbu-workspace.tsx       # container: state (useReducer) + gọi engine (useMemo) + lưu
cbu-header.tsx · mode-switch.tsx · scenario-tabs.tsx · kpi-strip.tsx · checks-badge.tsx
param-section.tsx       # nhóm thu gọn, nhãn Mặc định/Đã sửa, khôi phục
basic-params.tsx · logistics-panel.tsx · bank-finance-panel.tsx · advanced-params.tsx
items-table.tsx · item-row.tsx (React.memo) · num-cell.tsx (parse khi blur, dán nhiều dòng)
price-breakdown-drawer.tsx · scenario-compare.tsx
```
Dùng lại `src/components/ui/` (table, input, select, badge, dialog, popover, toast). Cần bổ sung Tabs, Tooltip, Collapsible, Sheet dựng trên `@base-ui/react` (đã có trong dependencies) — **không thêm thư viện nặng**. Trang cũ giữ truy cập qua `?legacy=1` một bản phát hành để đối chiếu, rồi xoá.

### 11.10 Chiến lược kiểm thử

| Lớp | Nội dung |
|-----|----------|
| **Golden** | `__tests__/cbu/fixtures/ac0084.ts`: 16 dòng × (AIR, SEA) với giá trị kỳ vọng lấy từ md (Bank fee, Logistics, Commission, Unit cost, DDP USD/VND) và tổng (24,576.98 / 32,793.20 / 890,800,000 · 21,477.91 / 28,652.40 / 778,800,000). Dung sai 5e-5; VND khớp tuyệt đối |
| | `PRICE_INPUT`: nạp DDP từ kết quả MARGIN → unit cost y hệt, margin % = 25.05% (round-trip) |
| | `ac0481.ts`: FCA 131 (total 3,930, margin 680); Net 60: 133/đơn vị + cước 1,100 → DAP 5,090 |
| **Hồi quy có tên** | F1 (Σ logistics×qty = pool), F2 (duty 1% → 1%; insurance 15.00; bank fee dòng 1 = 0.025), F3 (duty base gồm insurance), F4 (chi phí lô hàng mặc định = 0), F6 (`marginPercent` null giữ nguyên qua lưu/đọc, không thành 0) |
| **Thuộc tính** | Bảo toàn pool; `unitCost` = tổng cấu phần; `margin% ≥ mục tiêu`; giá đơn điệu theo cost; mọi số hữu hạn với input rác (null/NaN/chuỗi) |
| **API** | Zod từ chối input sai; server bỏ qua total/items client gửi (gửi tổng sai → kết quả lưu vẫn đúng); round-trip lưu → tải |
| **UI** | Sau khi có hạ tầng test ở Sprint 3: `num-cell` (parse `1,5`, dán nhiều dòng), `param-section` (Mặc định/Đã sửa/khôi phục). Trước đó: checklist kiểm tay §11.11-C3 |
| **Tiên quyết** | Sửa `jest.config.js` (`moduleNameMapper` cho `@/`) — hiện 3/4 suite fail |

### 11.11 Kế hoạch triển khai

Thứ tự **C1 trước UI**: giá sai đang đi ra khách hàng, còn giao diện chỉ là tiện dụng. Ước lượng ≈ 14.5 ngày công (1 dev).

| Phase | Nội dung | Ước lượng | Tiêu chí nghiệm thu |
|-------|----------|:---------:|---------------------|
| **C0 · Chuẩn bị** | Sửa `jest.config.js`; commit 4 file md + cập nhật tài liệu; dựng fixtures từ md; đánh dấu `CBU_ANALYSIS_REPORT.md` lỗi thời | 0.5d | `npm test` chạy được; fixtures nạp được |
| **C1 · Engine đúng** *(TDD)* | Viết golden test **trước** (phải fail); dựng `src/lib/cbu/`: `pctToFrac`, trọng lượng chuẩn, pool, duty base gồm insurance, bỏ `docFee` mặc định, bỏ `bookingExchangeRate`/`effectiveMargin`, `checks`; giữ adapter `calculateCBU()` | 2d | Golden AIR/SEA/PRICE_INPUT pass; hồi quy F1–F4 pass; `tsc --noEmit` 0 lỗi. *Tương ứng P0-5, P0-6* |
| **C2 · Lưu/đọc & API** ✅ *code xong 21/09* | Migration SQL tay (5 cột RFQ + `cbuConfig` + `marginOverrideUsd` + bỏ default 25 + backfill); Zod; route v2 + server recompute; alias `calculate-cbu`; `scripts/cbu-audit.ts` | 2d | Round-trip đúng *(đã kiểm chứng bằng DB giả)*; gửi tổng sai vẫn lưu đúng *(đã kiểm chứng)*; audit script chạy trên DB dev *(**chưa** — cần DB)* |
| **C3 · Dựng lại UI** | Workspace + components §11.9; kịch bản Air/Sea + so sánh; `?legacy=1` | 5d | Kiểm tay: nhập một RFQ mới ≤ 8 ô trước khi ra giá; mở lại RFQ đã lưu thấy đúng; không còn cuộn lồng; Lighthouse a11y ≥ 90 |
| **C4 · Profile `FCA_DAP`** ✅ *xong 22/09* | Engine profile Baker Hughes; kịch bản Payment/Net 60; UI FCA/DAP; bỏ chặn nhóm "Nước ngoài" | 3d | Golden `ac0481` pass; DAP = FCA + cước tay; cảnh báo chênh cước — ✅ *xong 22/09* (29 golden + 23 test tích hợp + 10 test render + 15 kiểm tra e2e) |
| **C5 · Hạ nguồn & hoàn thiện** ✅ *xong 22/09* | Sửa payload Quotation PDF (`unit_price` = `ddpPriceUsd` per unit, `amount` = × qty) — `src/app/api/rfq/generate-document/route.ts` *(tương ứng P2-5)*; xoá trang legacy (`legacy-page.tsx`, link "Giao diện cũ"), adapter `calculateCBU()` (`src/lib/cbu/legacy.ts`), shim `lib/cbu-engine.ts`, route alias `calculate-cbu`, `legacyBodyToSaveInput`, `legacyCalculateCbuSchema`, component mồ côi `cbu-form.tsx`, và test tương ứng; cập nhật CLAUDE.md/SPEC.md/PROGRESS.md | 2d | PDF khớp UI ✅; xoá trang legacy ✅; `npm test` 314/314 pass, `tsc --noEmit` 0 lỗi, `npm run lint` không thêm cảnh báo mới, `next build` thành công |

**Rủi ro & giảm thiểu:** (1) *Giá lịch sử đã gửi khách lệch* → chạy `cbu-audit.ts` trước C2, quyết định thương mại do quản lý PSBV; (2) *Migration trên DB lệch* → cảnh báo §11.8; (3) *Người dùng quen bảng cũ* → `?legacy=1` + giữ thuật ngữ Excel trong tooltip; (4) *Hai thư mục `lib/` và `src/lib/`* → engine mới đặt ở `src/lib/cbu/`, shim ở `lib/` đến khi hợp nhất (Sprint 2).

### 11.12 Câu hỏi mở cần quyết định nghiệp vụ

**Đã chốt 22/09/2026** (7/8 — chỉ Q3 chưa rõ, Q8 ngoài phạm vi kỹ thuật). Cột "Trạng thái" ghi có cần sửa code hay quyết định trùng khớp mặc định tạm sẵn có.

| # | Câu hỏi | Quyết định | Trạng thái |
|---|---------|--------------|------------|
| Q1 | 4 tham số gắn "(Bỏ)": *Target margin, % Value financed, Interest rate, Financing days* — thật sự loại khỏi công thức, hay chỉ ẩn khỏi màn hình chính? Lưu ý Target margin là gốc của mode MARGIN_INPUT | **Ẩn đi** (chỉ ẩn khỏi màn hình chính, giữ nguyên trong công thức) | ✅ Không cần sửa — đã đúng từ C3: `targetMarginPct` ở nhóm "basic" (Target margin là input hàng ngày), 3 tham số còn lại đã ở nhóm "policy" (thu gọn) trong `src/lib/cbu/ui/draft.ts` |
| Q2 | Cơ sở tính thuế: Excel dùng `Material + toàn bộ Logistics (gồm thông quan, nội địa, bảo hiểm)`. CIF thực tế chỉ gồm `hàng + cước quốc tế + bảo hiểm`. Giữ theo Excel? | **Theo CIF thực** (đổi khỏi mặc định tạm "Theo Excel") | ✅ Đã sửa 22/09: `dutyBase_i = material_i + freightShare_i + insuranceShare_i` thay vì `material_i + logistics_i` — `src/lib/cbu/profiles/ddp-import.ts`. Chỉ ảnh hưởng dòng có `dutyPct > 0` (AC0084 golden = 0 nên không đổi số vàng; test hồi quy F3 trong `ddp-import.golden.test.ts` đã cập nhật công thức kỳ vọng). Baker (`FCA_DAP`) không có Duty, không ảnh hưởng |
| Q3 | Named range `AirLogisticsPool = Logistic!M5 + Logistic!R5` trỏ vào cột **R = "Min insurance"** chứ không phải **S = "Insurance"**. Hai giá trị trùng nhau (15) trong file mẫu nên chưa lộ; khi phí bảo hiểm tính ra > mức tối thiểu, Excel sẽ sai. Xác nhận là lỗi công thức trong file gốc? | **Không rõ** — chưa chốt | ⏳ Giữ mặc định tạm: engine dùng **S (Insurance tính ra)** |
| Q4 | Baker Hughes — phí *International receive*: nhãn 0.05% nhưng công thức 0.005%; Min $35 (Hoàng Sơn: $5); base = DAP revenue (rủi ro vòng lặp). Dùng số nào và có nhập tay base như DDP không? | **Nhập tay** (base) | ✅ Không cần sửa — đã đúng từ C4: `PROFILE_DEFAULTS.FCA_DAP.bank.minReceiveUsd = 35`, `receiveBaseUsd` mặc định 0 và là ô nhập trong `defaults.ts`/`draft.ts` |
| Q5 | Bỏ hẳn `bookingExchangeRate` và "Effective margin" (md ghi đã loại khỏi workbook)? | **Bỏ** khỏi UI/engine, giữ cột DB | ✅ Không cần sửa — đã bỏ khỏi engine/UI từ C3; `CbuParams` không có 2 trường này |
| Q6 | Mặc định Thông quan 150 / Nội địa 100 (schema hiện có, F4) là số của 1 lô mẫu — đặt về 0 và để trống bắt buộc nhập? | **0** | ✅ Không cần sửa — đã đúng từ C2: `CBU_DEFAULTS.logistics.clearanceUsd/inlandUsd = 0` trong `defaults.ts`, migration `20260921120000_cbu_v2` đổi default cột DB |
| Q7 | Baker Hughes — tỷ giá 25,500, hệ số lb→kg 0.46 và trọng lượng 43.2 lb đang hardcode trong công thức; dùng tham số chung (0.4536) và dữ liệu DB? | **Tham số chung** | ✅ Không cần sửa — đã đúng từ C4: Baker dùng `fx`/`lbToKg` chung, không hardcode (weight/duty/insurance vốn đã ẩn hoàn toàn ở Baker) |
| Q8 | Với RFQ đã `QUOTED_TO_CLIENT` có giá lệch do F1/F2: giữ nguyên giá đã báo, hay báo lại? | Ngoài phạm vi kỹ thuật — chờ quản lý PSBV | ⏳ Không có RFQ nào ở `QUOTED_TO_CLIENT` tính đến 21/09 (audit §6.4) nên chưa cấp bách; AC0005 (margin=0% bất thường) vẫn chờ Sale Admin xác nhận |

### 11.13 Định nghĩa "Xong" (Definition of Done)

- Golden test AC0084 (AIR/SEA/PRICE) và AC0481 pass; hồi quy F1–F4, F6 pass; `npm test` xanh toàn bộ; `npx tsc --noEmit` 0 lỗi; `npm run lint` không lỗi mới.
- Lưu → tải lại một RFQ cho **kết quả giống hệt**; API bỏ qua số client gửi.
- Chip "Đối soát" luôn ✓ trên dữ liệu mẫu; finalize bị chặn khi có check lỗi.
- `PROGRESS.md` §6 tích đủ; `CLAUDE.md` mô tả đúng vị trí engine.
