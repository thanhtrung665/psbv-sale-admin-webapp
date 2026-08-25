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
| **Email** | Microsoft Graph API + Resend (backup) |
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

CBU engine tính toán giá DDP với 30+ parameters:

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
│   │   │   │       ├── cbu-calc/      # CBU calculation
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
│   │   └── rfq/             # RFQ-specific components
│   │
│   └── lib/                  # Utilities
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
| **CBU** | `POST /api/rfq/[id]/calculate-cbu` |
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
| Tính CBU & DDP | ✅ | Full CBU engine 30+ params |
| Sinh Quotation PDF | ✅ | APITemplate.io → PDF |
| Preview & Edit Quotation | ✅ | Split-view editor |
| Gửi Quotation | ✅ | MS Graph API → Outlook |
| Tạo MVPO | ✅ | Purchase Order template |
| CI/PL Editing | 🔄 | In progress |
| COC/COO Management | 🔄 | In progress |

### 5.2 AI Integration

| Module | File | Purpose |
|--------|------|---------|
| Inquiry Parsing | `lib/gemini.ts` | Parse customer inquiry PDF |
| Quote Parsing | `lib/gemini-quote.ts` | Parse supplier quote |
| PO Parsing | `lib/gemini-po.ts` | Parse customer PO |

### 5.3 Email System

| Provider | File | Usage |
|----------|------|-------|
| MS Graph | `lib/ms-graph.ts` | Primary - Outlook email với attachments |
| Resend | `lib/email.ts` | Backup - General email |

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
