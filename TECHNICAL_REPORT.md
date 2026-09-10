# BÁO CÁO KỸ THUẬT
## Hệ thống PSBV Sales Agent Platform
### Version 0.1.0 — Internal CRM B2B cho Team Sale

---

**Ngày phát hành:** Tháng 8/2026  
**Tác giả:** PSBV Trading & Service Co., Ltd. — Technical Team  
**Phương thức triển khai:** Vercel (Next.js 14)  
**Trạng thái hiện tại:** MVP — 70% tính năng hoàn thiện

---

## MỤC LỤC

1. [Tổng quan Dự án](#1-tổng-quan-dự-án)
2. [Kiến trúc Hệ thống](#2-kiến-trúc-hệ-thống)
3. [Cấu trúc Database](#3-cấu-trúc-database)
4. [Danh mục Tính năng](#4-danh-mục-tính-năng)
5. [API Endpoints](#5-api-endpoints)
6. [AI Integration Layer](#6-ai-integration-layer)
7. [Document Generation Pipeline](#7-document-generation-pipeline)
8. [Email Communication System](#8-email-communication-system)
9. [Frontend Components](#9-frontend-components)
10. [Third-Party Integrations](#10-third-party-integrations)
11. [Deployment & DevOps](#11-deployment--devops)
12. [Đánh giá & Roadmap](#12-đánh-giá--roadmap)

---

## 1. TỔNG QUAN DỰ ÁN

### 1.1 Giới thiệu

**PSBV Sales Agent Platform** là hệ thống CRM nội bộ được xây dựng riêng cho team Sale Admin của công ty PSBV Trading & Service Co., Ltd. Hệ thống tự động hóa toàn bộ vòng đời giao dịch B2B — từ tiếp nhận Inquiry của khách hàng, hỏi giá hãng, bóc tách báo giá, tính CBU (Cost Build Up), soạn Quotation, đến quản lý đơn đặt hàng MVPO và các chứng từ hải quan (CI/PL/COC/COO).

### 1.2 Business Context

Quy trình kinh doanh xuất nhập khẩu truyền thống đòi hỏi:
- Thao tác thủ công với nhiều file PDF từ khách hàng và nhà cung cấp (supplier)
- Tính toán chi phí CBU phức tạp với nhiều biến số (tỷ giá, logistics, bảo hiểm, ngân hàng, thuế, v.v.)
- Soạn thảo và gửi email với các đính kèm PDF theo template công ty
- Theo dõi trạng thái đơn hàng qua nhiều giai đoạn

Hệ thống này giải quyết các vấn đề trên bằng cách:
- Sử dụng **AI (Gemini)** để bóc tách dữ liệu từ PDF
- Tự động hóa tính toán CBU với engine có kiểm soát
- Sinh PDF tự động qua **APITemplate.io**
- Gửi email qua **Microsoft Graph API (Outlook)**

### 1.3 Tech Stack Summary

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | Next.js 14 (App Router) + React 18 + TypeScript | SSR/CSR UI |
| **Styling** | Tailwind CSS + shadcn/ui components | Design System |
| **Database** | PostgreSQL + Prisma ORM 7 | Data persistence |
| **Auth** | NextAuth.js v4 + bcrypt | User authentication |
| **AI** | Google Gemini API 0.24 | PDF parsing & data extraction |
| **Document** | APITemplate.io | PDF template rendering |
| **Storage** | Supabase Storage | File/blob storage |
| **Email** | Microsoft Graph API | Outlook email dispatch |
| **Deployment** | Vercel | Serverless hosting |

---

## 2. KIẾN TRÚC HỆ THỐNG

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BROWSER CLIENT                                  │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Next.js 14 App Router (Server Components + Client Components)      │   │
│  │  ├── Dashboard Layout (Auth-gated)                                  │   │
│  │  ├── RFQ Pages (List, New, Detail, CBU-Calc, MVPO, Quote-Preview)  │   │
│  │  ├── Clients, Tasks, Database, System-Users, AI-Config pages        │   │
│  │  └── Modals (GenerateFileModal, ProcessFileModal, QuickEmailModal)  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          VERCEL SERVERLESS                                  │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                        Next.js API Routes                             │   │
│  │  /api/rfq/*          — RFQ CRUD + CBU + Document Generation          │   │
│  │  /api/email/*        — Email dispatch                                │   │
│  │  /api/clients/*      — Client management                             │   │
│  │  /api/database/*     — Direct DB queries                             │   │
│  │  /api/tasks/*        — Task assignment                               │   │
│  │  /api/users/*        — User management                               │   │
│  │  /api/ai-config/*   — AI configuration                              │   │
│  │  /api/agent/*       — AI Agent (placeholder)                        │   │
│  │  /api/suppliers/*   — Supplier suggestions                          │   │
│  │  /api/auth/*        — NextAuth session                              │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│  ┌─────────────┐  ┌─────────────┐  │  ┌─────────────┐  ┌──────────────┐  │
│  │   Gemini    │  │ APITemplate │  │  │ Supabase    │  │ MS Graph     │  │
│  │   API      │  │   .io       │  │  │ Storage     │  │   API        │  │
│  │ (AI Parse) │  │  (PDF Gen)  │  │  │ (Blobs)     │  │  (Outlook)   │  │
│  └─────────────┘  └─────────────┘  │  └─────────────┘  └──────────────┘  │
│                                     │                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    PostgreSQL Database (Neon/Vercel Postgres)        │   │
│  │  User, Client, RFQ, RFQItem, Document, Task, AiConfig, MasterPart,  │   │
│  │  Supplier                                                            │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Directory Structure

```
psbv-sales-agent-saas/
│
├── prisma/
│   ├── schema.prisma          # Database schema (PostgreSQL)
│   ├── migrations/            # Prisma migrations
│   └── seed.ts                # Seed data script
│
├── src/
│   │
│   ├── app/                   # Next.js App Router
│   │   │
│   │   ├── (auth)/            # Auth route group (login page)
│   │   │   └── login/page.tsx
│   │   │
│   │   ├── (dashboard)/       # Dashboard route group (auth-gated)
│   │   │   ├── layout.tsx     # Dashboard shell with Sidebar
│   │   │   ├── overview/      # Dashboard overview page
│   │   │   ├── rfq/          # RFQ management
│   │   │   │   ├── page.tsx                # RFQ list
│   │   │   │   ├── new/page.tsx            # Create new RFQ
│   │   │   │   ├── [id]/
│   │   │   │   │   ├── rfo-review/         # RFO review page
│   │   │   │   │   ├── cbu-calc/           # CBU calculation page
│   │   │   │   │   ├── mvpo/               # MVPO creation page
│   │   │   │   │   └── quote-preview/       # Quotation preview page
│   │   │   ├── clients/        # Client management page
│   │   │   ├── tasks/         # Task management page
│   │   │   ├── database/       # Database browser page
│   │   │   ├── system-users/   # User management page (Admin only)
│   │   │   └── ai-config/      # AI configuration page (Admin only)
│   │   │
│   │   ├── api/               # API Routes (Backend)
│   │   │   ├── auth/          # NextAuth endpoints
│   │   │   ├── rfq/           # RFQ CRUD + operations
│   │   │   │   ├── route.ts                    # GET list, POST create
│   │   │   │   ├── [id]/
│   │   │   │   │   ├── route.ts                # GET, PUT, DELETE single RFQ
│   │   │   │   │   ├── items/route.ts          # RFQ items CRUD
│   │   │   │   │   ├── status/route.ts         # Status update
│   │   │   │   │   ├── calculate-cbu/route.ts  # Save CBU results
│   │   │   │   │   ├── generate-pdf/route.ts  # Generate PDF
│   │   │   │   │   ├── send-rfo/route.ts      # Send RFO email
│   │   │   │   │   ├── send-quote/route.ts    # Send quotation email
│   │   │   │   │   └── parse-supplier-quote/  # Parse supplier quote
│   │   │   │   ├── parse-inquiry/             # Parse customer inquiry
│   │   │   │   ├── parse-customer-po/         # Parse customer PO
│   │   │   │   ├── parse-supplier-quote/      # Parse supplier quote
│   │   │   │   ├── quick-parse-quote/         # Quick quote parsing
│   │   │   │   ├── extract-quote-data/        # Extract quote data (AI)
│   │   │   │   ├── save-parsed-quote/         # Save parsed quote
│   │   │   │   ├── save-supplier-quote/       # Save supplier quote
│   │   │   │   ├── save-customer-po/          # Save customer PO
│   │   │   │   ├── create-manual/             # Manual RFQ creation
│   │   │   │   ├── search-codes/              # Search RFQ codes
│   │   │   │   ├── generate-document/         # Generic document generation
│   │   │   │   └── send-dispatch/             # Send dispatch email
│   │   │   ├── email/
│   │   │   │   └── send-rfq/                  # Email dispatch endpoint
│   │   │   ├── clients/             # Client CRUD
│   │   │   ├── database/           # Direct DB access
│   │   │   ├── tasks/              # Task CRUD
│   │   │   ├── users/              # User CRUD
│   │   │   ├── ai-config/          # AI config CRUD
│   │   │   ├── agent/              # AI Agent endpoint (placeholder)
│   │   │   ├── suppliers/          # Supplier suggestions
│   │   │   ├── pdf/
│   │   │   │   └── split-cipl/     # Split CI/PL PDF
│   │   │   └── parse-quote/        # Generic quote parsing
│   │   │
│   │   ├── layout.tsx             # Root layout (AuthProvider)
│   │   ├── page.tsx               # Root redirect page
│   │   └── globals.css            # Global styles
│   │
│   ├── components/
│   │   ├── ui/                   # shadcn/ui base components
│   │   │   ├── button.tsx, input.tsx, dialog.tsx, ...
│   │   │   └── (others: badge, table, select, toast, textarea, popover, label)
│   │   │
│   │   ├── shared/               # Shared components
│   │   │   ├── sidebar.tsx       # Dashboard navigation sidebar
│   │   │   └── logout-button.tsx # Logout button
│   │   │
│   │   ├── providers/
│   │   │   └── auth-provider.tsx # Auth context provider
│   │   │
│   │   ├── rfq/                  # RFQ-specific components
│   │   │   ├── generate-file-modal.tsx    # Document generation modal
│   │   │   ├── process-file-modal.tsx     # AI file processing modal
│   │   │   ├── quick-email-modal.tsx      # Quick email compose modal
│   │   │   ├── cbu-form.tsx               # CBU form component
│   │   │   ├── process-quote-modal.tsx     # Quote processing modal
│   │   │   ├── smart-rfq-selector.tsx      # Smart RFQ search component
│   │   │   └── RfqSelector.tsx            # RFQ code selector
│   │   │
│   │   └── agent/
│   │       └── email-review-card.tsx       # Email review card component
│   │
│   └── lib/                       # Utility libraries
│       ├── utils.ts              # cn() helper (clsx + tailwind-merge)
│       ├── auth.ts               # NextAuth configuration
│       ├── prisma.ts             # Prisma client singleton
│       ├── email.ts              # Email sending utilities
│       ├── email-builder.ts      # HTML email template builder
│       ├── cbu-engine.ts         # CBU calculation engine (client-side)
│       ├── rfq-code.ts           # RFQ code generator
│       ├── ms-graph.ts           # Microsoft Graph API utilities
│       ├── gemini.ts             # Gemini AI client (inquiry parsing)
│       ├── gemini-quote.ts       # Gemini AI client (quote parsing)
│       └── gemini-po.ts          # Gemini AI client (PO parsing)
│
├── next.config.mjs               # Next.js configuration
├── package.json                   # Dependencies
├── tailwind.config.ts            # Tailwind CSS configuration
├── tsconfig.json                  # TypeScript configuration
└── postcss.config.mjs            # PostCSS configuration
```

---

## 3. CẤU TRÚC DATABASE

### 3.1 Entity Relationship Diagram

```
┌─────────────┐       1:N        ┌─────────────┐       1:N        ┌─────────────┐
│    User     │◄────────────────│     RFQ     │◄───────────────│   RFQItem   │
├─────────────┤                 ├─────────────┤                 ├─────────────┤
│ id          │                 │ id          │                 │ id          │
│ email       │                 │ rfqCode     │                 │ rfqId (FK)  │
│ password    │                 │ clientId(FK)│                 │ lineNo      │
│ name        │                 │ status      │                 │ rawPartNumber│
│ role        │                 │ ...CBU fields│               │ supplierUnit│
│ isActive    │                 │ ...logistics │                │ ...CBU calcs│
└─────────────┘                 └─────────────┘                 └─────────────┘
       │                                 │
       │ 1:N                             │ 1:N
       ▼                                 ▼
┌─────────────┐                  ┌─────────────┐
│    Task     │                  │  Document   │
├─────────────┤                  ├─────────────┤
│ id          │                  │ id          │
│ title       │                  │ rfqId (FK)  │
│ status      │                  │ type        │
│ assigneeId  │                  │ fileUrl     │
│ creatorId   │                  │ createdAt   │
└─────────────┘                  └─────────────┘

┌─────────────┐       1:N        ┌─────────────┐       1:N
│   Client    │──────────────────│     RFQ     │
├─────────────┤                 └─────────────┘
│ id          │
│ name        │
│ companyName │
│ email       │
└─────────────┘

┌─────────────┐       1:N
│  Supplier   │
├─────────────┤
│ id          │
│ name        │
│ companyName │
│ email       │
│ ccEmails    │
└─────────────┘

┌─────────────┐
│  AiConfig   │
├─────────────┤
│ id          │
│ name        │
│ apiKey      │
│ modelName   │
│ inquiryPrompt│
│ quotePrompt │
│ toolsConfig │
│ resendApiKey│
└─────────────┘

┌─────────────┐
│ MasterPart  │
├─────────────┤
│ id          │
│ partNumber  │
│ description │
│ uom         │
└─────────────┘
```

### 3.2 Enum Definitions

**Role:**
```prisma
enum Role {
  ADMIN       // Master Admin: Toàn quyền hệ thống + Quản lý User
  SALE_ADMIN  // Sale Admin: Toàn quyền Vận hành, Tính CBU, Duyệt & Xem Dashboard
}
```

**OrderStatus (RFQ Lifecycle):**
```prisma
enum OrderStatus {
  INQUIRY_RECEIVED          // 1. Khách gửi Yêu cầu (AI bóc)
  RFO_PENDING_ADMIN         // 2. Chờ Sale Admin / Admin kiểm tra & duyệt RFO
  RFO_SENT_TO_SUPPLIER      // 3. Đã gửi Hãng (Đang đợi Hãng trả Quote)
  SUPPLIER_QUOTED           // 4. Hãng đã báo giá (AI bóc PDF Quote)
  CBU_PENDING_ADMIN         // 5. Chờ Sale Admin / Admin nhập phí & chạy CBU
  QUOTATION_DRAFTED         // 6. Đã tính CBU & Sinh file PDF Quotation nháp
  QUOTED_TO_CLIENT          // 7. Đã duyệt & Phát hành Báo giá gửi Khách
}
```

### 3.3 Key Fields Explanation

**RFQ Model — CBU Parameters:**

| Nhóm | Trường | Mô tả | Default |
|------|--------|-------|---------|
| **Tỷ giá** | `exchangeRate` | Tỷ giá VND/USD | 26,500 |
| | `bookingExchangeRate` | Tỷ giá booking | null |
| | `vndRoundingStep` | Bước làm tròn VND | 10,000 |
| | `lbToKg` | Hệ số chuyển đổi lbs → kg | 0.4536 |
| **Điều kiện** | `goodsOrigin` | Nguồn hàng | "Oversea" |
| | `destinationCountry` | Quốc gia đích | "VN" |
| **Logistics** | `freightCost` | Cước vận (all-in) | 0 |
| | `freightFixed` | Cước cố định | 0 |
| | `freightRatePerKg` | Cước theo kg | 0 |
| | `chargeableWeightKg` | Trọng lượng tính cước | 0 |
| | `clearanceCost` | Phí thông quan | 150 |
| | `inlandCost` | Phí nội địa | 100 |
| **Bảo hiểm** | `insuredValuePercent` | % giá trị được bảo hiểm | 110% |
| | `insuranceRatePercent` | Tỷ lệ bảo hiểm | 0.01% |
| | `minInsuranceUsd` | Phí bảo hiểm tối thiểu | $15 |
| **Ngân hàng** | `remittanceRatePercent` | Phí chuyển tiền | 0.2% |
| | `bankVatFactor` | Hệ số VAT ngân hàng | 1.1 |
| | `minRemittanceFeeUsd` | Phí chuyển tối thiểu | $50 |
| | `receiveRatePercent` | Tỷ lệ nhận tiền | 0.05% |
| **Chi phí vốn** | `percentValueFinanced` | % giá trị được tài trợ | 50% |
| | `interestRatePercent` | Lãi suất | 15% |
| | `financingDays` | Số ngày tài trợ | 15 |

---

## 4. DANH MỤC TÍNH NĂNG

### 4.1 Đã hoàn thành (70%)

| # | Tính năng | Module | Trạng thái | Mô tả |
|---|-----------|--------|------------|-------|
| 1 | Tiếp nhận Inquiry | RFQ | ✅ Hoàn thành | Upload file PDF/tài liệu, AI bóc tách dữ liệu |
| 2 | Tạo RFQ từ Email/Upload | RFQ | ✅ Hoàn thành | Xử lý file upload với AI OCR + Gemini |
| 3 | Gửi RFO cho Hãng | RFQ | ✅ Hoàn thành | Sinh email RFO, đính kèm file |
| 4 | Bóc tách Quote từ Hãng | RFQ | ✅ Hoàn thành | Gemini AI parse PDF supplier quote |
| 5 | Tính CBU & DDP | RFQ | ✅ Hoàn thành | Full CBU engine với 30+ parameters |
| 6 | Sinh Quotation PDF | RFQ | ✅ Hoàn thành | APITemplate.io → PDF → Supabase |
| 7 | Preview & Edit Quotation | RFQ | ✅ Hoàn thành | Split-view editor với real-time preview |
| 8 | Gửi Quotation cho Khách | RFQ | ✅ Hoàn thành | MS Graph API → Outlook email |
| 9 | Tạo MVPO (Purchase Order) | RFQ | ✅ Hoàn thành | Sinh PO gửi supplier với template |
| 10 | Quản lý Khách hàng | CRM | ✅ Hoàn thành | CRUD client records |
| 11 | Quản lý Users & Phân quyền | Admin | ✅ Hoàn thành | ADMIN vs SALE_ADMIN roles |
| 12 | Task Management | Tasks | ✅ Hoàn thành | Giao việc, theo dõi trạng thái |
| 13 | AI Configuration | Admin | ✅ Hoàn thành | Cấu hình Gemini API key, prompts |
| 14 | Supplier Management | Master Data | ✅ Hoàn thành | Lưu thông tin nhà cung cấp |
| 15 | Document Storage | Storage | ✅ Hoàn thành | Upload/retrieve files từ Supabase |

### 4.2 Đang phát triển (20%)

| # | Tính năng | Module | Trạng thái | Ghi chú |
|---|-----------|--------|------------|---------|
| 16 | CI/PL Editing | Document | 🔄 Đang làm | Chỉnh sửa Commercial Invoice theo template |
| 17 | COC/COO Management | Document | 🔄 Đang làm | Nhận và xử lý chứng từ gốc |
| 18 | Split CI/PL PDF | Document | 🔄 Đang làm | `/api/pdf/split-cipl` route exists |
| 19 | Email Review Agent | AI | 🔄 Đang làm | Email review card component ready |
| 20 | Dashboard Analytics | Overview | 🔄 Đang làm | Revenue, margin, pipeline metrics |

### 4.3 Chưa triển khai (10%)

| # | Tính năng | Module | Trạng thái |
|---|-----------|--------|------------|
| 21 | Full AI Agent Orchestration | Agent | ⏳ Pending |
| 22 | Automated Follow-ups | Automation | ⭕ Planned |
| 23 | Multi-currency Support | Finance | ⭕ Planned |
| 24 | Import/Export Data | Data | ⭕ Planned |
| 25 | Audit Trail & Logging | Compliance | ⭕ Planned |

---

## 5. API ENDPOINTS

### 5.1 RFQ Management

| Method | Endpoint | Handler | Mô tả |
|--------|----------|---------|-------|
| `GET` | `/api/rfq` | `GET` | List RFQs (filter by status) |
| `POST` | `/api/rfq` | `POST` | Create new RFQ |
| `GET` | `/api/rfq/search-codes` | `GET` | Search RFQ by code |
| `GET` | `/api/rfq/[id]` | `GET` | Get single RFQ with items |
| `PUT` | `/api/rfq/[id]` | `PUT` | Update RFQ fields |
| `DELETE` | `/api/rfq/[id]` | `DELETE` | Delete RFQ draft |
| `GET` | `/api/rfq/[id]/status` | `GET/PUT` | Get/Update RFQ status |
| `GET` | `/api/rfq/[id]/items` | `GET/PUT` | Get/Update RFQ items |
| `POST` | `/api/rfq/[id]/calculate-cbu` | `POST` | Save CBU calculation |
| `POST` | `/api/rfq/[id]/send-rfo` | `POST` | Send RFO email to supplier |
| `POST` | `/api/rfq/[id]/send-quote` | `POST` | Send quotation to client |
| `POST` | `/api/rfq/[id]/parse-supplier-quote` | `POST` | AI parse supplier quote PDF |

### 5.2 AI & Document Processing

| Method | Endpoint | Handler | Mô tả |
|--------|----------|---------|-------|
| `POST` | `/api/rfq/parse-inquiry` | `POST` | AI parse customer inquiry |
| `POST` | `/api/rfq/parse-customer-po` | `POST` | AI parse customer PO |
| `POST` | `/api/rfq/parse-supplier-quote` | `POST` | AI parse supplier quote |
| `POST` | `/api/rfq/quick-parse-quote` | `POST` | Quick quote parsing |
| `POST` | `/api/rfq/extract-quote-data` | `POST` | Extract + match quote data |
| `POST` | `/api/rfq/save-parsed-quote` | `POST` | Save parsed quote to DB |
| `POST` | `/api/rfq/save-supplier-quote` | `POST` | Save supplier quote |
| `POST` | `/api/rfq/save-customer-po` | `POST` | Save customer PO |
| `POST` | `/api/rfq/create-manual` | `POST` | Manual RFQ creation |
| `POST` | `/api/rfq/generate-document` | `POST` | Generate PDF via APITemplate |
| `GET` | `/api/download-pdf` | `GET` | Download generated PDF |
| `POST` | `/api/pdf/split-cipl` | `POST` | Split CI/PL PDF |
| `POST` | `/api/parse-quote` | `POST` | Generic quote parsing |

### 5.3 Email Dispatch

| Method | Endpoint | Handler | Mô tả |
|--------|----------|---------|-------|
| `POST` | `/api/email/send-rfq` | `POST` | Send email via Resend |
| `POST` | `/api/rfq/send-dispatch` | `POST` | Send dispatch via MS Graph |

### 5.4 Master Data

| Method | Endpoint | Handler | Mô tả |
|--------|----------|---------|-------|
| `GET/POST` | `/api/clients` | `GET/POST` | List/Create clients |
| `GET/PUT/DEL` | `/api/clients/[id]` | `GET/PUT/DELETE` | Client CRUD |
| `GET/POST` | `/api/users` | `GET/POST` | List/Create users |
| `GET/PUT/DEL` | `/api/users/[id]` | `GET/PUT/DELETE` | User CRUD |
| `GET/POST` | `/api/database` | `GET/POST` | Database queries |
| `GET/POST` | `/api/database/orders` | `GET/POST` | Order queries |
| `GET/POST` | `/api/database/users` | `GET/POST` | User queries |
| `GET/POST` | `/api/ai-config` | `GET/POST` | AI configuration |
| `GET/POST` | `/api/tasks` | `GET/POST` | Task management |
| `GET/PUT/DEL` | `/api/tasks/[id]` | `GET/PUT/DELETE` | Task CRUD |
| `GET` | `/api/suppliers/suggest` | `GET` | Supplier autocomplete |

### 5.5 Auth

| Method | Endpoint | Handler | Mô tả |
|--------|----------|---------|-------|
| `GET/POST` | `/api/auth/[...nextauth]` | `GET/POST` | NextAuth handlers |
| `GET` | `/api/auth/session` | `GET` | Get current session |

---

## 6. AI INTEGRATION LAYER

### 6.1 Gemini API Integration

Hệ thống sử dụng **Google Gemini API** để bóc tách dữ liệu từ PDF và tài liệu scan. Có 3 module chính:

**6.1.1 Inquiry Parsing (`lib/gemini.ts`)**
- Input: Customer inquiry document (PDF/email)
- Output: Structured RFQ data (client info, items, quantities)
- Prompt: Configurable via `AiConfig.inquiryPrompt`

**6.1.2 Quote Parsing (`lib/gemini-quote.ts`)**
- Input: Supplier quote PDF
- Output: Line items (part number, description, unit price, weight)
- Features: Fuzzy matching với existing RFQ items
- Prompt: Configurable via `AiConfig.quotePrompt`

**6.1.3 PO Parsing (`lib/gemini-po.ts`)**
- Input: Customer Purchase Order
- Output: Customer PO details, line items

### 6.2 AI Agent Architecture (Placeholder)

File `src/app/api/agent/route.ts` định nghĩa schema cho AI Agent với 2 tools:

```typescript
// Tool 1: prepare_email_dispatch
{
  name: "prepare_email_dispatch",
  description: "Prepares an email with a PDF attachment for human review",
  parameters: {
    rfqCode: string,
    to: string,
    subject: string,
    bodyHtml: string,
    attachmentUrl: string,
    suggestedFileName: string
  }
}

// Tool 2: generate_pdf_document
{
  name: "generate_pdf_document",
  description: "Generates a PDF document and returns its URL",
  parameters: {
    rfqCode: string,
    docType: string
  }
}
```

> **Note:** Hiện tại đây là placeholder. Agent orchestration layer cần được implement để tự động hóa các workflows phức tạp.

---

## 7. DOCUMENT GENERATION PIPELINE

### 7.1 APITemplate.io Integration

```
┌──────────────┐     ┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Frontend   │────►│  generate-doc   │────►│ APITemplate  │────►│  Supabase       │
│  (RFQ Data)  │     │    API Route    │     │    .io       │     │   Storage       │
└──────────────┘     └─────────────────┘     └──────────────┘     └─────────────────┘
                              │
                              │ Template ID from env
                              ▼
                      APITEMPLATE_QUOTATION_TEMPLATE_ID
                      APITEMPLATE_MVPO_TEMPLATE_ID
```

### 7.2 Supported Document Types

| Type | Mô tả | Template |
|------|-------|---------|
| `QUOTATION_CLIENT_PDF` | Báo giá gửi khách hàng | `APITEMPLATE_QUOTATION_TEMPLATE_ID` |
| `MVPO_SUPPLIER_PDF` | Purchase Order gửi nhà cung cấp | `APITEMPLATE_MVPO_TEMPLATE_ID` |
| `COMMERCIAL_INVOICE_PDF` | Hóa đơn thương mại (CI) | TBD |
| `CERTIFICATE_COC_COO_PDF` | Giấy chứng nhận COC/COO | TBD |

### 7.3 Document Generation Flow

```typescript
// 1. Frontend calls API with rfqCode + docType
POST /api/rfq/generate-document
{ rfqCode: "AC0485", docType: "QUOTATION_CLIENT_PDF" }

// 2. API fetches RFQ from DB with items

// 3. API builds payload based on docType
const payload = {
  client_name: "...",
  quote_no: "AC0485",
  items: [...],
  total_amount: "1,234.56",
  // ...
};

// 4. API calls APITemplate.io
fetch(`https://rest.apitemplate.io/v2/create-pdf?template_id=${templateId}`, {
  method: 'POST',
  headers: { 'X-API-KEY': apiKey },
  body: JSON.stringify(payload)
});

// 5. API downloads generated PDF

// 6. API uploads to Supabase Storage
supabase.storage.from("documents").upload(`rfq/${rfqCode}/${fileName}`, pdfBuffer);

// 7. API returns public URL
{ success: true, url: "https://...", fileName: "AC0485_Quotation_xxx.pdf" }
```

---

## 8. EMAIL COMMUNICATION SYSTEM

### 8.1 Email Delivery Options

| Provider | Usage | Implementation |
|----------|-------|----------------|
| **Resend** (`lib/email.ts`) | General email sending | Nodemailer wrapper |
| **Microsoft Graph API** (`lib/ms-graph.ts`) | Outlook email with attachments | `sendMail` endpoint |

### 8.2 Email Actions

| Action | Provider | Mô tả |
|--------|----------|-------|
| `SEND_RFO_SUPPLIER` | MS Graph | Gửi Request for Quotation cho hãng |
| `SEND_QUOTATION_CLIENT` | MS Graph | Gửi Quotation cho khách hàng |
| `SEND_INTERNAL_APPROVAL` | MS Graph | Gửi phê duyệt nội bộ |

### 8.3 MS Graph Email Flow

```typescript
// 1. Download PDF from Supabase
const fileRes = await fetch(pdfUrl);
const arrayBuffer = await fileRes.arrayBuffer();
const base64String = Buffer.from(arrayBuffer).toString("base64");

// 2. Build email message with attachment
const message = {
  message: {
    subject: "Your Quotation - PSBV",
    body: { contentType: "HTML", content: bodyHtml },
    toRecipients: [{ emailAddress: { address: to } }],
    ccRecipients: parseEmails(cc),
    attachments: [{
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: "Quotation_AC0485.pdf",
      contentType: "application/pdf",
      contentBytes: base64String,
    }],
  },
  saveToSentItems: "true",
};

// 3. Send via MS Graph
fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
  method: "POST",
  headers: { "Authorization": `Bearer ${accessToken}` },
  body: JSON.stringify(message)
});
```

### 8.4 Email Builder (`lib/email-builder.ts`)

Cung cấp helper functions để build HTML email templates:
- `buildRfoEmailHtml()` — RFO email template
- `buildOrderTableHtml()` — Order items table in HTML

---

## 9. FRONTEND COMPONENTS

### 9.1 Page Structure

```
src/app/(dashboard)/
├── layout.tsx              # Auth-gated layout with Sidebar
├── overview/page.tsx       # Dashboard overview
├── rfq/
│   ├── page.tsx            # RFQ list (filterable by status)
│   ├── new/page.tsx        # Create new RFQ
│   └── [id]/
│       ├── rfo-review/     # RFO review & send
│       ├── cbu-calc/       # CBU calculation (19-column table)
│       ├── mvpo/           # MVPO creation (split-view editor)
│       └── quote-preview/  # Quotation preview
├── clients/page.tsx        # Client management
├── tasks/page.tsx          # Task management
├── database/page.tsx       # Database browser
├── system-users/page.tsx   # User management (Admin)
└── ai-config/page.tsx      # AI config (Admin)
```

### 9.2 Key UI Components

**RFQ Components:**
- `GenerateFileModal` — Modal để chọn RFQ và loại document cần tạo
- `ProcessFileModal` — Modal để upload và AI parse files
- `QuickEmailModal` — Modal soạn và gửi email nhanh
- `SmartRfqSelector` — Search component với autocomplete
- `RfqSelector` — Generic RFQ code selector
- `CBUForm` — CBU input form component

**UI Components (shadcn/ui):**
- `Button`, `Input`, `Dialog`, `Select`
- `Table`, `Badge`, `Label`, `Popover`, `Textarea`, `Toast`

### 9.3 CBU Calculation Page (`/rfq/[id]/cbu-calc`)

Full CBU engine interface với:
- **3 Settings Panels:** Tỷ giá & Điều kiện, Logistics, Bank & Finance
- **3 Summary Tables:** Logistics Table, Bank Fee & Finance Table, Insurance Table
- **19-Column Margin Analysis Table:** Part Number, Qty, Unit Price, Material Amount, Net Weight, Duty %, Commission %, CIT %, Duty Amount, Logistics Apportionment, Bank+Fin Apportionment, Unit Cost, Margin %, Unit DDP, Total DDP USD, Total DDP VND, Profit
- **Sticky Summary Row:** Total Material, Total Cost, DDP Revenue, Effective Margin
- **Live Calculation:** Real-time recalculation on input change
- **Target Margin Calculator:** Apply target margin % to all items

---

## 10. THIRD-PARTY INTEGRATIONS

### 10.1 Integration Matrix

| Service | Provider | Purpose | Status |
|---------|----------|---------|--------|
| **Gemini API** | Google | AI document parsing | ✅ Active |
| **APITemplate.io** | APITemplate | PDF generation | ✅ Active |
| **Supabase** | Supabase | Storage + Auth helper | ✅ Active |
| **Microsoft Graph** | Microsoft | Outlook email | ✅ Active |
| **PostgreSQL** | Vercel Postgres / Neon | Database | ✅ Active |
| **Resend** | Resend | Transactional email (backup) | ✅ Available |

### 10.2 Environment Variables

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

# Google AI
GOOGLE_GEMINI_API_KEY=...

# APITemplate
APITEMPLATE_API_KEY=...
APITEMPLATE_QUOTATION_TEMPLATE_ID=...
APITEMPLATE_MVPO_TEMPLATE_ID=...

# Microsoft Graph
MS_GRAPH_ACCESS_TOKEN=...

# Email (Resend - backup)
RESEND_API_KEY=...
```

---

## 11. DEPLOYMENT & DEVOPS

### 11.1 Deployment Target

**Vercel** — Serverless deployment với:
- Next.js 14 App Router
- Serverless Functions cho API routes
- Edge caching cho static assets
- Environment variables management

### 11.2 Build Configuration

```javascript
// next.config.mjs
experimental: {
  serverComponentsExternalPackages: [
    'html-pdf-node',
    'inline-css',
    'batch',
    'emitter',
    'pdf2pic',
    'tesseract.js'
  ],
}
```

### 11.3 Database Migrations

```bash
# Generate migration
npx prisma migrate dev --name init

# Apply migrations (production)
npx prisma migrate deploy

# Generate Prisma client
npx prisma generate

# Seed database
npx prisma db seed
```

---

## 12. ĐÁNH GIÁ & ROADMAP

### 12.1 Strengths

1. **Clean Architecture** — Tách biệt rõ ràng giữa frontend (Next.js App Router) và backend (API Routes)
2. **Type Safety** — Full TypeScript coverage với Prisma-generated types
3. **AI Integration** — Gemini integration cho document parsing hoạt động tốt
4. **CBU Engine** — Comprehensive cost calculation với 30+ parameters
5. **PDF Generation** — APITemplate.io integration cho professional documents
6. **Email Integration** — Microsoft Graph API cho Outlook email dispatch
7. **Role-Based Access** — ADMIN và SALE_ADMIN roles với proper auth guards
8. **Modern UI** — shadcn/ui + Tailwind CSS với responsive design

### 12.2 Areas for Improvement

1. **AI Agent Orchestration** — Hiện tại chỉ là placeholder; cần implement full agent loop
2. **Error Handling** — Một số API routes có error handling chưa consistent
3. **Validation** — Cần thêm Zod validation cho API inputs
4. **Testing** — Chưa có unit tests hoặc integration tests
5. **CI/CD** — Chưa có automated testing pipeline
6. **Logging** — Cần thêm structured logging (e.g., Pino) cho debugging
7. **Rate Limiting** — Chưa implement rate limiting trên API routes
8. **Caching** — Chưa tận dụng Next.js caching strategies tối ưu

### 12.3 Technical Debt

| Item | Priority | Ghi chú |
|------|----------|---------|
| Add Zod validation | Medium | Validate all API inputs |
| Implement unit tests | High | Critical for CBU engine |
| Add error boundaries | Medium | Prevent white screens |
| Optimize bundle size | Low | Code splitting already in place |
| Add SWR/infinite query | Medium | Replace multiple useEffect fetches |
| Implement audit logging | Low | Track all data changes |

### 12.4 Roadmap (Next Milestones)

**Phase 2 — Feature Completion (v0.2):**
- [ ] CI/PL Editing với template
- [ ] COC/COO document handling
- [ ] Email Review Agent (human-in-the-loop)
- [ ] Dashboard analytics (revenue, margin KPIs)

**Phase 3 — Automation (v0.3):**
- [ ] Full AI Agent orchestration
- [ ] Automated follow-up emails
- [ ] Webhook integration với suppliers
- [ ] Real-time notifications

**Phase 4 — Scale (v1.0):**
- [ ] Multi-tenant support
- [ ] Mobile responsive enhancements
- [ ] Offline mode (PWA)
- [ ] Advanced reporting & exports

---

## APPENDIX

### A. Package Dependencies Summary

**Core:**
- `next@14.2.35` — React framework
- `react@18`, `react-dom@18` — UI library
- `typescript@5` — Type safety

**Database:**
- `@prisma/client@7.9.1` — Prisma ORM
- `prisma@7.9.1` — Database migrations
- `pg@8.22.0` — PostgreSQL driver

**Auth:**
- `next-auth@4.24.15` — Authentication
- `bcryptjs@3.0.3` — Password hashing
- `@supabase/ssr@0.12.4` — Supabase helpers

**AI & APIs:**
- `@google/generative-ai@0.24.1` — Gemini API client
- `@microsoft/microsoft-graph-client@3.0.7` — MS Graph client
- `resend@6.18.1` — Email API
- `nodemailer@7.0.13` — Email transport

**Document Processing:**
- `pdf-lib@1.17.1` — PDF manipulation
- `pdf2pic@3.2.0` — PDF to image conversion
- `tesseract.js@7.0.0` — OCR engine

**UI:**
- `tailwindcss@3.4.1` — CSS framework
- `lucide-react@1.27.0` — Icons
- `class-variance-authority@0.7.1` — Component variants
- `@base-ui/react@1.6.0` — Radix-based components
- `cmdk@1.1.1` — Command menu
- `shadcn@4.16.0` — UI component installer

**Utilities:**
- `swr@2.5.1` — Data fetching
- `dotenv@17.4.2` — Environment variables
- `tailwind-merge@3.6.0` — Class merging
- `clsx@2.1.1` — Conditional classes

### B. Key File Reference

| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | Complete database schema |
| `src/lib/cbu-engine.ts` | CBU calculation logic (client-side) |
| `src/lib/gemini-quote.ts` | Supplier quote AI parser |
| `src/app/api/rfq/generate-document/route.ts` | PDF generation API |
| `src/app/(dashboard)/rfq/[id]/cbu-calc/page.tsx` | CBU calculation UI |
| `src/app/(dashboard)/rfq/[id]/mvpo/page.tsx` | MVPO creation UI |
| `src/lib/ms-graph.ts` | Microsoft Graph email client |

---

*Báo cáo này được tạo tự động từ phân tích codebase. Thông tin có thể không phản ánh 100% trạng thái thực tế nếu có thay đổi gần đây chưa được commit.*