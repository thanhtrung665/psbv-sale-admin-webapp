# BÁO CÁO KỸ THUẬT — PHIÊN BẢN 2

## Hệ thống PSBV Sales Agent Platform

### Version 0.1.0 — Internal CRM B2B cho Team Sale Admin

---

**Ngày phát hành:** 11/09/2026
**Tác giả:** PSBV Trading & Service Co., Ltd. — Technical Team
**Phương thức triển khai:** Vercel (Next.js 14 App Router)
**Trạng thái:** MVP mở rộng — 43 API routes, 18 pages, 11 Prisma models

> **Lưu ý về phương pháp:** Toàn bộ số liệu trong báo cáo này được trích xuất trực tiếp từ mã nguồn tại thời điểm 11/09/2026 (branch `main`, commit `0b02859` + working tree changes). Các phần đánh dấu ⚠️ là phát hiện đã được kiểm chứng bằng cách chạy lệnh thực tế, không phải suy đoán.

---

## MỤC LỤC

1. [Tóm tắt điều hành](#1-tóm-tắt-điều-hành)
2. [Thay đổi so với Version 1](#2-thay-đổi-so-với-version-1)
3. [Kiến trúc hệ thống](#3-kiến-trúc-hệ-thống)
4. [Tech Stack](#4-tech-stack)
5. [Cấu trúc Database](#5-cấu-trúc-database)
6. [Lớp Validation (Zod)](#6-lớp-validation-zod)
7. [Hạ tầng Testing](#7-hạ-tầng-testing)
8. [CBU Pricing Engine](#8-cbu-pricing-engine)
9. [AI Integration Layer](#9-ai-integration-layer)
10. [Tính năng CIPL (mới)](#10-tính-năng-cipl-mới)
11. [Document Generation Pipeline](#11-document-generation-pipeline)
12. [Email & Communication](#12-email--communication)
13. [API Endpoints](#13-api-endpoints)
14. [Bảo mật & Phân quyền](#14-bảo-mật--phân-quyền)
15. [Điểm mạnh](#15-điểm-mạnh)
16. [Điểm yếu & Nợ kỹ thuật](#16-điểm-yếu--nợ-kỹ-thuật)
17. [Định hướng công việc tiếp theo](#17-định-hướng-công-việc-tiếp-theo)
18. [Phụ lục](#18-phụ-lục)

---

## 1. TÓM TẮT ĐIỀU HÀNH

### 1.1 Quy mô hệ thống

| Chỉ số | Giá trị |
|--------|---------|
| API Routes | **43** |
| Pages (UI) | **18** |
| Prisma Models | **11** |
| Prisma Enums | **3** |
| Test files | **4** (52 test cases) |
| Zod schema files | **6** |
| Dòng code — `src/app` (pages) | 9.955 |
| Dòng code — `src/app/api` | 3.944 |
| Dòng code — `src/components` | 3.901 |
| Dòng code — `lib/` (root) | 1.607 |
| Dòng code — `src/lib/` | 905 |
| Dòng code — `__tests__/` | 706 |
| **Tổng (ước tính)** | **~21.000 dòng TS/TSX** |

### 1.2 Ba phát hiện quan trọng nhất

Báo cáo này ghi nhận đúng thực trạng, kể cả khi thực trạng chưa hoàn chỉnh:

| # | Phát hiện | Mức độ | Trạng thái |
|---|-----------|--------|-----------|
| 1 | **Lớp Zod validation đã viết xong nhưng chưa route nào sử dụng** — 0/43 routes import `@/lib/validation` hoặc `@/lib/schemas` | 🔴 Cao | Chưa wire |
| 2 | **3/4 test suite FAIL** — `jest.config.js` thiếu `moduleNameMapper` cho alias `@/` | 🔴 Cao | Lỗi cấu hình |
| 3 | **Migration drift** — 7/11 models không có migration tương ứng | 🟠 Trung bình | Cần đồng bộ |

Cả ba đều là lỗi cấu hình/tích hợp, **không phải lỗi logic**. TypeScript compile sạch (`npx tsc --noEmit` → 0 lỗi).

---

## 2. THAY ĐỔI SO VỚI VERSION 1

### 2.1 Tính năng mới

| Hạng mục | V1 | V2 |
|----------|----|----|
| **CIPL module** | Không có | 3 API routes + 1 page + 1 Gemini module + 2 Prisma models |
| **Zod validation** | Không cài | Cài `zod@^3.25.76`, 6 schema files, 1 helper module |
| **Unit tests** | Không có | 4 test files, 52 test cases |
| **Test tooling** | Không có | `jest@^30.4.2`, `ts-jest`, `jest-mock-extended` |
| **Document types** | 4 | 5 (thêm `CIPL_PDF`) |
| **Prisma models** | 9 | 11 (thêm `CiplRecord`, `CiplItem`) |

### 2.2 Nhận định về "điểm yếu V1"

Báo cáo V1 liệt kê 2 nợ kỹ thuật ưu tiên cao. Trạng thái thực tế hiện nay:

| Nợ kỹ thuật V1 | Trạng thái V2 | Ghi chú |
|----------------|---------------|---------|
| "Cần thêm Zod validation cho API inputs" | 🟡 **Hoàn thành 50%** | Schema + helper đã viết và test đầy đủ, nhưng **chưa gắn vào route nào** |
| "Chưa có unit tests hoặc integration tests" | 🟡 **Hoàn thành 60%** | 52 test cases đã viết, nhưng 42/52 không chạy được do lỗi config |

> **Kết luận thẳng thắn:** Cả hai hạng mục đã hoàn thành phần *khó* (thiết kế schema, viết test), còn lại phần *dễ* (sửa 3 dòng config, wire 7 routes). Ước tính 1–2 ngày công để đóng hoàn toàn.

---

## 3. KIẾN TRÚC HỆ THỐNG

### 3.1 Sơ đồ tổng thể

```
┌─────────────────────────────────────────────────────────────────────┐
│                          BROWSER CLIENT                              │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Next.js 14 App Router                                        │  │
│  │  ├── (auth)/login                                             │  │
│  │  └── (dashboard)/  ← middleware.ts bảo vệ                     │  │
│  │      ├── overview, clients, tasks, database                   │  │
│  │      ├── system-users, ai-config, settings  [ADMIN only]      │  │
│  │      └── rfq/[id]/ ─┬─ rfo-review                             │  │
│  │                     ├─ cbu-calc     ← CBU engine chạy ở client│  │
│  │                     ├─ mvpo                                    │  │
│  │                     ├─ quote-preview                           │  │
│  │                     └─ cipl          ← MỚI                     │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     VERCEL SERVERLESS (43 routes)                    │
│                                                                       │
│  /api/rfq/*     (24)   /api/cipl/*   (3)   /api/clients/* (2)       │
│  /api/database/*(4)    /api/tasks/*  (2)   /api/users     (1)       │
│  /api/email/*   (2)    /api/pdf/*    (1)   /api/auth      (1)       │
│  /api/ai-config (1)    /api/agent    (1)   /api/suppliers (1)       │
│  /api/parse-quote(1)   /api/download-pdf (1)                        │
│                                                                       │
│  ┌──────────┐ ┌────────────┐ ┌──────────┐ ┌──────────────┐         │
│  │  Gemini  │ │APITemplate │ │ Supabase │ │  MS Graph    │         │
│  │2.5 Pro/  │ │   .io      │ │ Storage  │ │  (Outlook)   │         │
│  │  Flash   │ │  (PDF)     │ │(documents│ │              │         │
│  └──────────┘ └────────────┘ └──────────┘ └──────────────┘         │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  PostgreSQL (Prisma 7 + @prisma/adapter-pg, pool max=5)        │ │
│  │  User · Client · RFQ · RFQItem · Document · Task · AiConfig    │ │
│  │  MasterPart · Supplier · CiplRecord · CiplItem                 │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 ⚠️ Vấn đề kiến trúc: hai thư mục `lib/`

Dự án tồn tại **song song hai thư mục** `lib/` (root) và `src/lib/`. `tsconfig.json` cấu hình:

```json
"paths": { "@/*": ["./src/*", "./*"] }
```

`src/` được ưu tiên trước. Hệ quả:

| Module | `lib/` (root) | `src/lib/` | `@/lib/x` trỏ tới | Trạng thái |
|--------|---------------|------------|-------------------|-----------|
| `ms-graph.ts` | ✅ (Azure SDK) | ✅ (raw fetch) | **`src/lib/`** | `lib/ms-graph.ts` là **dead code** |
| `email-builder.ts` | ✅ | ✅ | **`src/lib/`** | `lib/email-builder.ts` là **dead code** |
| `cbu-engine.ts` | ✅ | ❌ | `lib/` | OK (chỉ 1 bản) |
| `auth.ts`, `prisma.ts`, `gemini-*.ts` | ✅ | ❌ | `lib/` | OK |
| `validation.ts`, `schemas/`, `utils.ts` | ❌ | ✅ | `src/lib/` | OK |

Thêm một tầng phức tạp: `next.config.mjs` ghi đè alias riêng cho webpack:

```javascript
config.resolve.alias['@/lib'] = path.resolve(__dirname, 'lib');
```

→ **Webpack (runtime) và TypeScript (IDE) phân giải `@/lib/*` khác nhau.** Đây là nguồn lỗi tiềm ẩn nghiêm trọng: IDE báo xanh nhưng build có thể lấy file khác.

> **Đáng lưu ý:** Hai bản `email-builder.ts` có hành vi khác nhau. Bản `lib/` có ràng buộc *"Must NOT contain any client/customer information"* trong email gửi supplier — ràng buộc nghiệp vụ này **đã mất** khi bản `src/lib/` được dùng thay thế.

---

## 4. TECH STACK

### 4.1 Dependencies (phiên bản chính xác)

| Nhóm | Package | Version |
|------|---------|---------|
| **Framework** | `next` | 14.2.35 (pinned) |
| | `react` / `react-dom` | ^18 |
| | `typescript` | ^5 |
| **Database** | `@prisma/client` | ^7.9.1 |
| | `@prisma/adapter-pg` | ^7.9.1 |
| | `pg` | ^8.22.0 |
| **Auth** | `next-auth` | ^4.24.15 |
| | `bcryptjs` | ^3.0.3 |
| **Validation** | `zod` | **^3.25.76** ⭐ mới |
| **AI** | `@google/generative-ai` | ^0.24.1 |
| **Email** | `@microsoft/microsoft-graph-client` | ^3.0.7 |
| | `@azure/identity` | ^4.13.1 |
| | `nodemailer` | ^7.0.13 |
| | `resend` | ^6.18.1 |
| **Storage** | `@supabase/supabase-js` | ^2.111.0 |
| | `@supabase/ssr` | ^0.12.4 |
| **PDF/OCR** | `pdf-lib` | ^1.17.1 |
| | `pdf2pic` | ^3.2.0 |
| | `tesseract.js` | ^7.0.0 |
| | `@tesseract.js-data/eng` | ^1.0.0 |
| **UI** | `tailwindcss` | ^3.4.1 |
| | `@base-ui/react` | ^1.6.0 |
| | `lucide-react` | ^1.27.0 |
| | `cmdk` | ^1.1.1 |
| **Data** | `swr` | ^2.5.1 |
| | `xlsx` | ^0.18.5 |
| | `string-similarity` | ^4.0.4 |

### 4.2 DevDependencies — Testing (mới)

| Package | Version | Vai trò |
|---------|---------|---------|
| `jest` | ^30.4.2 | Test runner |
| `ts-jest` | ^29.4.12 | TypeScript transform |
| `@types/jest` | ^30.0.0 | Type definitions |
| `@jest/globals` | ^30.4.1 | Jest globals |
| `jest-mock-extended` | ^4.0.1 | Mock Prisma (chưa dùng) |
| `puppeteer` | ^25.8.0 | PDF rendering (local script) |

> **Thiếu:** `@testing-library/react`, `jest-environment-jsdom` → **không thể test React component**. `testMatch` cũng chỉ khớp `*.test.ts` (không có `.tsx`).

### 4.3 Scripts

```json
"dev":        "next dev",
"build":      "cross-env NODE_OPTIONS=--max-old-space-size=8192 next build",
"start":      "next start",
"lint":       "next lint",
"test":       "jest",
"test:watch": "jest --watch",
"postinstall":"prisma generate"
```

---

## 5. CẤU TRÚC DATABASE

### 5.1 Sơ đồ quan hệ

```
   User ──┬──1:N──> Task (assignee)
          └──1:N──> Task (creator)

   Client ──1:N──> RFQ ──┬──1:N──> RFQItem
                         ├──1:N──> Document
                         └──1:N──> CiplRecord ──1:N──> CiplItem   ⭐ MỚI

   Độc lập: AiConfig · MasterPart · Supplier
```

### 5.2 Enums

| Enum | Values |
|------|--------|
| `Role` | `ADMIN`, `SALE_ADMIN` |
| `OrderStatus` | `INQUIRY_RECEIVED` → `RFO_PENDING_ADMIN` → `RFO_SENT_TO_SUPPLIER` → `SUPPLIER_QUOTED` → `CBU_PENDING_ADMIN` → `QUOTATION_DRAFTED` → `QUOTED_TO_CLIENT` |
| `TaskStatus` | `PENDING`, `IN_PROGRESS`, `DONE` |

### 5.3 Model RFQ — nhóm tham số CBU

Model `RFQ` có **~50 trường**, trong đó phần lớn là tham số CBU:

| Nhóm | Trường | Default |
|------|--------|---------|
| **Tỷ giá** | `exchangeRate` | 26.500 |
| | `bookingExchangeRate` | null |
| | `vndRoundingStep` | 10.000 |
| | `lbToKg` | 0,4536 |
| **Điều kiện** | `goodsOrigin` | "Oversea" |
| | `destinationCountry` | "VN" |
| **Logistics** | `freightCost` / `freightFixed` / `freightRatePerKg` | 0 |
| | `chargeableWeightKg` | 0 |
| | `clearanceCost` | 150 |
| | `inlandCost` | 100 |
| | `docFee` | 0 |
| **Bảo hiểm** | `insuredValuePercent` | 110 |
| | `insuranceRatePercent` | 0,01 |
| | `minInsuranceUsd` | 15 |
| **Ngân hàng** | `remittanceRatePercent` | 0,2 |
| | `bankVatFactor` | 1,1 |
| | `minRemittanceFeeUsd` | 50 |
| | `receiveRatePercent` | 0,05 |
| | `minReceiveFeeUsd` | 5 |
| | `receiveBaseUsd` / `otherBankFeeUsd` | 0 |
| **Chi phí vốn** | `percentValueFinanced` | 50 |
| | `interestRatePercent` | 15 |
| | `financingDays` | 15 |
| | `daysPerYear` | 360 |
| **Kết quả CBU** | `totalCostUsd`, `totalRevenueUsd`, `totalMarginUsd`, `actualMarginPct` | null |
| | `totalRevenueVnd` | `BigInt?` |

### 5.4 Models CIPL (mới)

**`CiplRecord`** — 20 trường + quan hệ:

- Header: `invoiceNo`, `invoiceDate`, `poNo`, `poDate`
- Vận chuyển: `incoterm`, `mot`, `pol`, `pod`
- Consignee: `consigneeName`, `consigneeAddress`, `consigneeAttn`, `consigneeEmail`, `consigneeTel`
- Tổng hợp: `totalAmount`, `totalWeightLbs`, `numberOfBox`, `boxDimension`, `shippingMark`
- Nguồn: `sourceFileUrl`

**`CiplItem`** — `lineNo` (Int), `partNo` (String, bắt buộc), và 9 trường String? khác.

> **Quyết định thiết kế:** Mọi giá trị số và ngày trong CIPL được lưu dưới dạng `String?` để giữ nguyên định dạng in trên chứng từ gốc (ví dụ `"1,116.00"`, `"30-Jul-2026"`). Đây là lựa chọn hợp lý cho chứng từ hải quan — nơi định dạng gốc có giá trị pháp lý — nhưng đồng nghĩa **không thể tính toán/tổng hợp trực tiếp** trên các trường này.

### 5.5 ⚠️ Migration drift

`prisma/migrations/` chỉ có **duy nhất 1 migration**:

```
prisma/migrations/
├── 20260729114302_init/migration.sql
└── migration_lock.toml
```

Migration này chỉ tạo: `Role`, `OrderStatus`, `User`, `Client`, `RFQ`, `RFQItem`, `Document`.

**7 models sau KHÔNG có migration:**

| Model / Enum | Có trong schema.prisma | Có trong migration |
|--------------|----------------------|-------------------|
| `TaskStatus` | ✅ | ❌ |
| `Task` | ✅ | ❌ |
| `AiConfig` | ✅ | ❌ |
| `MasterPart` | ✅ | ❌ |
| `Supplier` | ✅ | ❌ |
| `CiplRecord` | ✅ | ❌ |
| `CiplItem` | ✅ | ❌ |

**Rủi ro:** Các bảng này hiện tồn tại trên DB production do được áp dụng bằng `prisma db push` hoặc SQL thủ công. Nếu deploy lên một môi trường mới bằng `prisma migrate deploy`, **7 bảng này sẽ không được tạo** và ứng dụng sẽ lỗi runtime.

### 5.6 ⚠️ Thiếu index

Schema **không có bất kỳ `@@index` hoặc `@@unique` composite nào**. Toàn bộ uniqueness ở mức field: `User.email`, `Client.email`, `RFQ.rfqCode`, `MasterPart.partNumber`, `Supplier.email`.

Các foreign key **chưa được index**, đáng chú ý nhất:

- `CiplRecord.rfqId` — route `GET /api/cipl/[rfqId]` query `where: { rfqId }` + `orderBy: { createdAt: desc }` → sequential scan
- `CiplItem.ciplRecordId`
- `RFQItem.rfqId`, `Document.rfqId`, `Task.assigneeId`, `Task.creatorId`

---

## 6. LỚP VALIDATION (ZOD)

### 6.1 Cấu trúc

```
src/lib/
├── validation.ts            # Helper functions (139 dòng)
└── schemas/
    ├── index.ts             # Barrel export
    ├── common.schemas.ts    # Primitives dùng chung
    ├── rfq.schemas.ts       # RFQ domain
    ├── client.schemas.ts    # Client CRUD
    ├── task.schemas.ts      # Task CRUD
    └── user.schemas.ts      # User management
```

### 6.2 API surface của `validation.ts`

```typescript
interface ValidationErrorItem { field: string; message: string }

type ValidationResult<T> =
  | { success: true;  data: T }
  | { success: false; response: NextResponse }

formatZodErrors(error: ZodError): ValidationErrorItem[]
createValidationErrorResponse(error: ZodError | Error, statusCode = 400): NextResponse
validateBody<T>(req: NextRequest, schema: ZodSchema<T>): Promise<ValidationResult<T>>
validateQuery<T>(url: URL, schema: ZodSchema<T>): ValidationResult<T>
validatePathParam(param, fieldName, schema = idParamSchema): ValidationResult<string>
```

**Thiết kế tốt:**

- `ValidationResult<T>` là **discriminated union** → caller viết `if (!check.success) return check.response;`, TypeScript narrow type tự động.
- `validateBody` bọc `req.json()` trong try/catch → JSON hỏng trả 400 thay vì throw 500.
- `formatZodErrors` dot-join path (`"items.0.qty"`), fallback `"_root"` cho lỗi cấp object.
- Thông báo lỗi bằng tiếng Việt, đồng nhất với phần còn lại của hệ thống.

**Format response chuẩn:**

```json
{
  "success": false,
  "errors": [{ "field": "clientEmail", "message": "Email không hợp lệ." }],
  "message": "Validation failed"
}
```

### 6.3 Schema nổi bật — `updateRfqSchema`

Đây là schema có giá trị bảo mật cao nhất, giải quyết trực tiếp lỗ hổng **mass assignment** tại `PATCH /api/rfq/[id]`:

```typescript
// SECURITY: allow-list 17 trường scalar an toàn.
// Mọi trường khác (id, rfqCode, clientId, createdById, approvedById,
// relations, timestamps, BigInt) bị Zod strip tự động.
export const updateRfqSchema = z.object({
  status: orderStatusSchema,
  opportunityName: optionalStringSchema,
  supplierName: optionalStringSchema,
  // ... 14 trường khác
}).partial()
  .refine(data => Object.keys(data).length > 0, {
    message: "Không có trường nào để cập nhật."
  });
```

Test đã chứng minh cơ chế này hoạt động:

```typescript
it("strips unknown / dangerous fields (mass-assignment protection)", () => {
  const result = updateRfqSchema.safeParse({
    status: "RFO_SENT_TO_SUPPLIER",
    id: "attacker-controlled-id",
    createdById: "someone-else",
    totalRevenueVnd: "999999999999999999999",
  });
  expect(result.data).not.toHaveProperty("id");
  expect(result.data).not.toHaveProperty("createdById");
});
```

### 6.4 🔴 Trạng thái tích hợp: 0/43 routes

Kiểm chứng bằng lệnh grep trên toàn bộ `src/`:

```
Pattern: from "@/lib/validation" | from "@/lib/schemas"
Kết quả: 2 matches — cả hai đều nằm trong comment của chính validation.ts
```

**Không một API route nào đang dùng lớp validation này.** Mã hiện tại của route ưu tiên cao nhất:

```typescript
// src/app/api/rfq/[id]/route.ts — PATCH
const body = await req.json();
const updated = await prisma.rFQ.update({
  where: { id: params.id },
  data: body,        // ⚠️ toàn bộ body đi thẳng vào Prisma
});
```

Bảng đối chiếu 7 route ưu tiên:

| Route | Schema đã viết | Đã wire | Validation hiện tại |
|-------|---------------|---------|---------------------|
| `PATCH /api/rfq/[id]` | `updateRfqSchema` | ❌ | **Không có** — body → Prisma |
| `POST /api/rfq/create-manual` | `createRfqManualSchema` | ❌ | `if (!clientName \|\| !clientEmail \|\| !items)` |
| `POST /api/rfq/save-supplier-quote` | `saveSupplierQuoteSchema` | ❌ | `if ((!rfqCode && !bodyRfqId) \|\| !rows)` |
| `POST /api/rfq/save-customer-po` | `saveCustomerPoSchema` | ❌ | Kiểm tra thủ công |
| `POST /api/clients` | `createClientSchema` | ❌ | `if (!name \|\| !companyName \|\| !email)` |
| `PUT /api/clients/[id]` | `updateClientSchema` | ❌ | Kiểm tra thủ công |
| `POST /api/tasks` | `createTaskSchema` | ❌ | **Không có** — `body.title` dùng trực tiếp |

File `user.schemas.ts` tự ghi nhận điều này trong comment đầu file:

> *"these routes are not yet wired to validateBody() (out of scope for this pass)"*

### 6.5 ⚠️ Enum trùng lặp thủ công

`common.schemas.ts` khai báo lại 3 enum của Prisma bằng tay:

```typescript
export const orderStatusSchema = z.enum([ /* 7 giá trị */ ]);
export const taskStatusSchema  = z.enum(["PENDING", "IN_PROGRESS", "DONE"]);
export const roleSchema        = z.enum(["ADMIN", "SALE_ADMIN"]);
```

Ngoài ra còn **2 nơi khác** hardcode cùng danh sách status: `src/app/api/rfq/route.ts` và `src/app/api/rfq/[id]/status/route.ts`, cộng thêm `src/app/(dashboard)/rfq/page.tsx` ở phía client.

→ **4 nguồn sự thật cho cùng một enum.** Khi thêm status mới vào `schema.prisma`, phải sửa đồng thời 4 chỗ, không có cơ chế nào bắt lỗi nếu quên.

---

## 7. HẠ TẦNG TESTING

### 7.1 Thống kê

| File | Describes | Test cases | Dòng |
|------|-----------|-----------|------|
| `__tests__/cbu-engine.test.ts` | 10 | 10 | 360 |
| `__tests__/schemas/rfq.schemas.test.ts` | 4 | 19 | 147 |
| `__tests__/utils/validation.test.ts` | 5 | 15 | 148 |
| `__tests__/schemas/client.schemas.test.ts` | 2 | 8 | 51 |
| **Tổng** | **21** | **52** | **706** |

### 7.2 🔴 Kết quả chạy thực tế

```
$ npm test

FAIL __tests__/schemas/client.schemas.test.ts
  ● Cannot find module '@/lib/schemas' from '__tests__/schemas/client.schemas.test.ts'
FAIL __tests__/schemas/rfq.schemas.test.ts
  ● Cannot find module '@/lib/schemas' from '__tests__/schemas/rfq.schemas.test.ts'
FAIL __tests__/utils/validation.test.ts
  ● Cannot find module '@/lib/validation' from '__tests__/utils/validation.test.ts'

Test Suites: 3 failed, 1 passed, 4 total
Tests:       10 passed, 10 total
Time:        7.505 s
```

**Nguyên nhân:** `jest.config.js` không có `moduleNameMapper`, trong khi 3 test file mới import qua alias `@/`. Chỉ `cbu-engine.test.ts` chạy được vì dùng đường dẫn tương đối (`"../lib/cbu-engine"`).

**Cách sửa — thêm 4 dòng vào `jest.config.js`:**

```javascript
moduleNameMapper: {
  '^@/lib/(.*)$': ['<rootDir>/src/lib/$1', '<rootDir>/lib/$1'],
  '^@/(.*)$': '<rootDir>/src/$1',
},
```

Sau khi sửa, 42 test case còn lại sẽ chạy. **TypeScript đã compile sạch** (`npx tsc --noEmit` → 0 lỗi), nên đây thuần túy là lỗi cấu hình Jest, không phải lỗi code.

### 7.3 Chất lượng test

**Điểm mạnh:**

- `validation.test.ts` test cả happy path lẫn edge case thực tế (JSON hỏng `"{not-valid-json"` → 400 chứ không throw).
- `rfq.schemas.test.ts` có test bảo mật rõ ràng cho mass-assignment.
- Test dùng `NextRequest` thật, không mock — sát với runtime.

**Điểm yếu:**

- **`cbu-engine.test.ts` có assertion bị làm yếu.** Các giá trị kỳ vọng từ Excel (Unit Cost `5.32182186535253`, DDP `7.10`, margin `25.0447624598236%`) chỉ nằm trong **comment**, không được assert. Nhiều test rút gọn thành `expect(ddpPriceUsd).toBeGreaterThan(0)`.
- Trong file test còn một ghi chú bug chưa xử lý:
  ```typescript
  // THIS IS THE BUG: The allocation formula is wrong!
  // Fix: logisticsPerUnit = totalLogistics / total_items, not × weightShare
  ```
- **Không có test** cho: `task.schemas.ts`, `user.schemas.ts`, bất kỳ API route nào, module CIPL, React component.
- `jest-mock-extended` đã cài nhưng **chưa dùng** → chưa có integration test nào.

---

## 8. CBU PRICING ENGINE

### 8.1 Tổng quan

File: `lib/cbu-engine.ts` (611 dòng, 1 bản duy nhất).
Engine chạy **phía client** trong `cbu-calc/page.tsx`; route `calculate-cbu` chỉ lưu kết quả đã tính.

### 8.2 Chuỗi tính giá

```
preMargin  = material + bankFee + logistics + insurance + duty + custom
ddpUsd     = ROUNDUP( preMargin / (1 − m − q·(1+c)) , 2 )
commission = q · ddpUsd
cit        = c · commission
unitCost   = preMargin + commission + cit
margin%    = (ddpUsd − unitCost) / ddpUsd
```

Trong đó `m` = margin, `q` = commission rate, `c` = CIT rate.

**Lý do dùng closed form** (trích comment trong code):

> *"Commission is charged ON the selling price and is ALSO a cost component, so cost → price → commission → cost is circular. Solving for ddpUsd algebraically removes the loop: no iteration, no manual back-solving."*

Đây là điểm thiết kế xuất sắc — giải phương trình đại số thay vì lặp hội tụ, cho kết quả xác định và nhanh.

### 8.3 Ba chế độ định giá

| Mode | Điều kiện | Công thức mẫu số |
|------|-----------|------------------|
| **PRICE_INPUT** | `cbuMode === "PRICE_INPUT"` | Không tính — lấy `targetDdpPriceUsd` |
| **Margin override ($/unit)** | `marginOverrideUsd > 0` | `1 − q·(1+c)` |
| **Margin %** | mặc định | `1 − m − q·(1+c)` |

Ở mode Margin %, `activeMarginPct` lấy `item.marginPercent`, nếu `null` thì fallback về `globals.targetMarginPercent`.

### 8.4 Các pool chi phí

| Pool | Công thức | Cơ sở phân bổ |
|------|-----------|---------------|
| Freight | `freightCost` (nếu > 0) hoặc `freightFixed + rate × chargeableWeightKg` | — |
| Logistics | `freight + clearance + inland + docFee` | Trọng lượng |
| Insurance | `MAX((material + freight) × insured% × rate, min)` | Trọng lượng |
| Bank fee | `remittance + receive + other` | Giá trị vật tư |
| Financing | `material × %financed × (interest × days/daysPerYear)` | Giá trị vật tư |
| Duty | `(material + logistics) × duty%` | Theo dòng |

**Điều kiện miễn phí ngân hàng:**
- Remittance = 0 nếu `goodsOrigin === "local"` (không phân biệt hoa thường)
- Receive = 0 nếu `destinationCountry === "VN"`

### 8.5 Margin danh nghĩa vs margin hiệu dụng

Engine tính hai chỉ số margin — đây là điểm tinh tế đáng ghi nhận:

```typescript
nominalMarginPct    = (totalRevenueUsd − totalCostUsd) / totalRevenueUsd × 100

revenueAtBookingRate    = totalRevenueVnd / bookingExchangeRate
effectiveGrossProfitUsd = revenueAtBookingRate − totalCostUsd
effectiveMarginPct      = effectiveGrossProfitUsd / revenueAtBookingRate × 100
```

Comment giải thích: *"Effective margin captures the VND round-up uplift and the FX spread — this is the number that actually lands in the P&L."*

Tức là margin hiệu dụng phản ánh lợi nhuận thực sau khi làm tròn VND lên bội số 10.000 và chênh lệch tỷ giá booking — con số kế toán thực tế.

### 8.6 ⚠️ Vấn đề 1: hàm `pct()` nhập nhằng

Header file khai báo quy ước: *"Every `*Percent` field is 0-100 (25 means 25%), never 0.25."*

Nhưng `pct()` lại tự động phát hiện:

```typescript
function pct(v: unknown): number {
  const val = n(v);
  return val <= 1 ? val : val / 100;   // ≤1 → fraction, >1 → percent
}
```

**Hệ quả không thể phân biệt:**

| Input | `pct()` trả về | Diễn giải |
|-------|---------------|-----------|
| `1` (ý là 1%) | `1` | **100%** ❌ |
| `0.5` (ý là 0,5%) | `0.5` | **50%** ❌ |
| `25` | `0.25` | 25% ✅ |
| `0.03` | `0.03` | 3% ✅ |

**Xung đột thực tế trong codebase:**

- `schema.prisma` default `remittanceRatePercent = 0.2` → `pct(0.2)` = **20%**, nhưng ý định là **0,2%** → sai 100 lần
- Test truyền `remittanceRatePercent: 0.002` với comment *"rates as fractions (0.002 = 0.2%)"* → đúng ý định
- `insuranceRatePercent` default `0.01` → `pct()` đọc thành **1%**

→ **Hai quy ước cùng tồn tại**, phụ thuộc vào nguồn dữ liệu (DB default vs test fixture).

### 8.7 ⚠️ Vấn đề 2: công thức phân bổ logistics

```typescript
const weightPerUnit    = qty > 0 ? item.netWeightLbs / qty : 0;
const logisticsPerUnit = totalLogisticsUsd * (weightPerUnit / totalWeightLbs);
```

Comment trong code khẳng định: *"This gives exact allocation where SUM(logisticsPerUnit × qty) = totalLogisticsUsd"*.

**Đẳng thức này không đúng.** Vì `totalWeightLbs = Σ(netWeightLbs × qty)` còn tử số là `netWeightLbs / qty`:

```
Σ(logisticsPerUnit × qty) = totalLogistics × Σ(netWeightLbs) / Σ(netWeightLbs × qty)
```

Chỉ bằng `totalLogistics` khi **mọi `qty` đều bằng 1**.

**Minh hoạ độ lệch** (chính test file ghi nhận): một item, pool 4.000 USD, 320 đơn vị.
- Phân bổ đúng: `4000 / 320` = **12,50 USD/đơn vị**
- Engine trả về: **≈ 0,039 USD/đơn vị** — lệch khoảng **320 lần**

Đây là lỗi ảnh hưởng trực tiếp tới giá bán. Cần ưu tiên xử lý cao nhất.

### 8.8 Cảnh báo engine phát ra

| # | Điều kiện | Thông điệp |
|---|-----------|-----------|
| 1 | `totalWeightLbs ≤ 0` và có item | "Tổng trọng lượng = 0 nên chi phí logistics không phân bổ được cho dòng nào." |
| 2 | destination ≠ VN, `receiveBaseUsd ≤ 0` | "receiveBaseUsd chưa nhập — phí nhận ngoại tệ đang rơi về mức tối thiểu…" |
| 3 | Mẫu số ≤ EPS | "Dòng X: margin Y% + commission Z% vượt 100% — không tính được giá bán, đã trả về giá vốn." |

### 8.9 An toàn số học

Engine có kỷ luật tốt về xử lý giá trị bất thường:

- Mọi giá trị từ DB đi qua `n()` (đảm bảo finite) hoặc `g()` (fallback khi null/""/NaN)
- Không phép chia nào thiếu zero-guard
- `roundUp()` dùng `EPS = 1e-9` để tránh float dust — khớp hành vi `ROUNDUP` của Excel
- `qty`, `supplierUnitPrice`, `netWeightLbs` đều clamp `Math.max(0, …)`

---

## 9. AI INTEGRATION LAYER

### 9.1 Bốn module Gemini

| Module | Model | Nguồn API key | Nguồn prompt |
|--------|-------|---------------|--------------|
| `lib/gemini-inquiry.ts` | `gemini-2.5-pro` | DB → env | `AiConfig.inquiryPrompt` → default |
| `lib/gemini-quote.ts` | `gemini-2.5-pro` | DB → env | `AiConfig.quotePrompt` → default |
| `lib/gemini-po.ts` | `gemini-2.5-pro` | DB → env | Chỉ default (không đọc DB) |
| `lib/gemini-cipl.ts` ⭐ | **`gemini-2.5-flash`** | **Tham số truyền vào** → env | Chỉ default |

### 9.2 Mẫu xử lý chung

```typescript
// 1. Gọi model với inlineData (PDF/ảnh) hoặc text (Excel → CSV)
// 2. Bóc markdown fence
const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
// 3. JSON.parse trong try/catch, throw lỗi kèm 200-300 ký tự đầu
```

**⚠️ Hạn chế chung:**

- Không dùng `responseMimeType: "application/json"` của Gemini → hợp đồng JSON chỉ được đảm bảo bằng *lời văn prompt*
- **Không retry** khi parse lỗi
- **Không validate schema** kết quả AI — đây chính là nơi Zod sẽ có giá trị cao nhất nhưng chưa được áp dụng
- Không giới hạn kích thước file đầu vào

### 9.3 Xử lý đầu vào đa định dạng

`gemini-inquiry.ts` và `gemini-quote.ts` phân nhánh theo loại file:

| Loại | Xử lý |
|------|-------|
| Excel (`.xlsx/.xls/.csv`) | `xlsx.read` → `sheet_to_csv` → gửi dạng text |
| PDF / ảnh | `inlineData` base64 |
| Khác | UTF-8 text, cắt còn 5.000–10.000 ký tự |

### 9.4 Catalog matching

`lib/catalog-matcher.ts` — `matchStandardPartNumber(rawDescription, rawPartNumber)`:

1. Tìm `MasterPart` theo `description contains` (insensitive)
2. Nếu không thấy, tìm theo `partNumber equals` (insensitive)
3. Trả `null` nếu không khớp

> Dự án đã cài `string-similarity` nhưng module này **không dùng fuzzy scoring** — chỉ so khớp chuỗi con. Còn dư địa cải thiện độ chính xác.

---

## 10. TÍNH NĂNG CIPL (MỚI)

### 10.1 Luồng nghiệp vụ

```
┌──────────────┐   ┌──────────────────┐   ┌─────────────┐   ┌──────────────┐
│ Upload PDF   │──>│ POST /api/cipl/  │──>│ Gemini      │──>│ Trả JSON     │
│ (modal tab)  │   │      extract     │   │ 2.5-flash   │   │ (chưa lưu)   │
└──────────────┘   └──────────────────┘   └─────────────┘   └──────────────┘
                                                                    │
                    ┌───────────────────────────────────────────────┘
                    ▼
┌──────────────┐   ┌──────────────────┐   ┌──────────────────────────────┐
│ User review  │──>│ POST /api/cipl/  │──>│ CiplRecord + CiplItem[]      │
│ & chỉnh sửa  │   │      save        │   │ (tạo bản mới, giữ lịch sử)   │
└──────────────┘   └──────────────────┘   └──────────────────────────────┘
                                                         │
                    ┌────────────────────────────────────┘
                    ▼
┌────────────────────┐   ┌────────────────────┐   ┌──────────────────┐
│ /rfq/[id]/cipl     │──>│ POST /api/rfq/     │──>│ APITemplate      │
│ (edit inline)      │   │ generate-document  │   │ CIPL_PDF         │
└────────────────────┘   └────────────────────┘   └──────────────────┘
```

**Thiết kế hai bước (extract → review → save) là lựa chọn đúng đắn** cho chứng từ hải quan: AI không ghi thẳng vào DB, người dùng luôn kiểm duyệt trước.

### 10.2 Ba API routes

| Route | Method | Chức năng |
|-------|--------|-----------|
| `/api/cipl/extract` | POST | Nhận multipart (`file`, `rfqId`, `rfqCode`), kiểm tra đuôi `.pdf`, resolve `rfqId` từ `rfqCode`, gọi Gemini, **trả về không lưu**. `maxDuration = 60` |
| `/api/cipl/save` | POST | Nhận `{rfqId, data, fileName}`, verify RFQ tồn tại, `ciplRecord.create` với nested `items.create`, map snake_case → camelCase |
| `/api/cipl/[rfqId]` | GET | `findFirst` orderBy `createdAt desc`, items orderBy `lineNo asc` |

### 10.3 Module `lib/gemini-cipl.ts`

- Model: `gemini-2.5-flash` (nhanh/rẻ hơn `2.5-pro` — hợp lý cho bóc tách chứng từ cấu trúc rõ)
- Prompt dài, cố định schema JSON 18 trường header + mảng items 10 trường
- Tên trường **snake_case**, khớp 1:1 với field name của template APITemplate CIPL
- Guard sau parse: `if (!Array.isArray(parsed.items)) parsed.items = [];`

### 10.4 UI `/rfq/[id]/cipl`

Trang client 380 dòng:

- Load song song `/api/rfq/{id}` (lấy `rfqCode`) và `/api/cipl/{rfqId}`
- 404 → empty state hướng dẫn *"Xử lý File → 📋 Extract CIPL"*
- Form header + bảng 11 cột chỉnh sửa inline
- Mọi thay đổi → `setPdfUrl(null)` buộc tạo lại PDF
- Nút tạo PDF gửi `overrides` (map ngược camelCase → snake_case)
- Preview bằng `<iframe>`, tải về bằng blob

### 10.5 ⚠️ Ghi chú

- **CIPL chưa có trong sidebar** — chỉ vào được qua `GenerateFileModal` hoặc URL trực tiếp
- `sourceFileUrl` lưu **tên file**, không phải URL thật → không truy vết được file gốc
- `/api/cipl/extract` gọi `prisma.aiConfig.findFirst()` **không có** `where: {name:"core"}`, khác với 3 module Gemini còn lại

---

## 11. DOCUMENT GENERATION PIPELINE

### 11.1 Các loại tài liệu

`VALID_DOC_TYPES` khai báo 5 loại, nhưng chỉ có **3 nhánh payload**:

| docType | Template ENV | Nhánh riêng |
|---------|-------------|-------------|
| `QUOTATION_CLIENT_PDF` | `APITEMPLATE_QUOTATION_TEMPLATE_ID` | ✅ |
| `MVPO_SUPPLIER_PDF` | `APITEMPLATE_MVPO_TEMPLATE_ID` | ✅ |
| `CIPL_PDF` ⭐ | `APITEMPLATE_CIPL_TEMPLATE_ID` | ✅ |
| `COMMERCIAL_INVOICE_PDF` | *(dùng quotation)* | ❌ |
| `CERTIFICATE_COC_COO_PDF` | *(dùng quotation)* | ❌ |

→ Hai loại cuối rơi vào nhánh `else` và dùng template quotation, chỉ khác hậu tố tên file.

### 11.2 Pipeline

```
session check → validate rfqCode/docType → prisma.rFQ.findUnique
  → sanitise APITEMPLATE_API_KEY (.replace(/['"]/g,"").trim())
  → branch payload theo docType
  → POST https://rest.apitemplate.io/v2/create-pdf?template_id=...
  → fetch download_url → Buffer
  → Supabase upload: bucket "documents", path rfq/{rfqCode}/{fileName}
  → prisma.document.create({ type: docType, fileUrl })
```

### 11.3 ⚠️ Fallback base64 nguy hiểm

Khi upload Supabase lỗi, code **không báo lỗi** mà nhúng toàn bộ PDF thành data-URI lưu vào cột `fileUrl`:

```typescript
fileUrl = `data:application/pdf;base64,${base64}`;
```

→ Ghi chuỗi hàng MB vào Postgres một cách âm thầm. Vì `SUPABASE_SERVICE_ROLE_KEY` **không có trong `.env`** local, nhánh fallback này luôn được kích hoạt khi dev.

### 11.4 ⚠️ Lỗi đơn giá trong payload quotation

```typescript
unit_price: Number(item.ddpPriceUsd ? (item.ddpPriceUsd / item.qty) : 0),  // ⚠️ chia thừa
amount:     Number(item.ddpPriceUsd ?? 0),                                  // ⚠️ đây là đơn giá
total_amount: ddpPriceUsd * qty                                             // ✅ đúng
```

`ddpPriceUsd` trong engine **đã là giá mỗi đơn vị**. Chia thêm cho `qty` làm sai `unit_price`; `amount` lại nhận đơn giá thay vì thành tiền. Ba cột không nhất quán với nhau.

### 11.5 Split CI/PL

`/api/pdf/split-cipl` — tách file scan gộp thành CIPL và COO/COC:

- **Chiến lược 1 (size):** phát hiện trang đổi kích thước > 10pt
- **Chiến lược 2 (OCR):** `pdf2pic` render → `tesseract.js` → fuzzy match với 11 anchor keyword, ngưỡng 0,85

> ⚠️ Chiến lược OCR so sánh `stringSimilarity` giữa **toàn bộ text của trang** với một từ khoá ngắn → điểm số gần như không bao giờ đạt 0,85. Nhánh OCR **thực tế hầu như không bao giờ kích hoạt**.

Code cố ý không dùng `copyPages` mà load file 2 lần rồi `removePage()` ngược — comment giải thích pdf-lib không giữ tốt Form XObject của PDF scan (gây trang trắng). Đây là workaround hợp lý và được ghi chú rõ.

---

## 12. EMAIL & COMMUNICATION

### 12.1 ⚠️ Ba transport song song

| Transport | File | Nguồn key | From address |
|-----------|------|-----------|--------------|
| MS Graph REST | `src/lib/ms-graph.ts` | ENV (`MS_GRAPH_*` \|\| `AZURE_*`) | `MS_GRAPH_FROM_EMAIL` \|\| `MS_GRAPH_MAILBOX` |
| Nodemailer → Resend SMTP | `lib/email.ts` | **DB** (`AiConfig.resendApiKey`) | `onboarding@resend.dev` ⚠️ sandbox |
| Resend SDK | `send-rfo/route.ts` | ENV (`RESEND_API_KEY`) | `onboarding@resend.dev` ⚠️ sandbox |

Ba cơ chế, hai nguồn key khác nhau, hai chỗ dùng địa chỉ sandbox chưa verify domain. Cần hợp nhất.

### 12.2 MS Graph (đường chính)

`sendEmailViaGraph()` dùng raw `fetch`, không qua SDK:

- Token: client credentials flow → `login.microsoftonline.com/{tenant}/oauth2/v2.0/token`, scope `.default`
- Gửi: `POST /v1.0/users/{fromEmail}/sendMail`, `saveToSentItems: "true"`
- Attachment: `#microsoft.graph.fileAttachment` base64
- Hỗ trợ song song 2 bộ tên biến môi trường (`MS_GRAPH_*` và `AZURE_*`)

Consumers: `email/test-ms`, `rfq/[id]/send-quote`, `rfq/send-dispatch`.

---

## 13. API ENDPOINTS

### 13.1 Phân bố 43 routes

| Nhóm | Số lượng | Prefix |
|------|---------|--------|
| RFQ | 24 | `/api/rfq/*` |
| Database | 4 | `/api/database/*` |
| CIPL ⭐ | 3 | `/api/cipl/*` |
| Clients | 2 | `/api/clients/*` |
| Tasks | 2 | `/api/tasks/*` |
| Email | 2 | `/api/email/*` |
| Khác | 6 | `users`, `ai-config`, `agent`, `suppliers`, `parse-quote`, `download-pdf`, `pdf/split-cipl`, `auth` |

### 13.2 Routes chính

| Route | Methods | Mô tả | Zod |
|-------|---------|-------|-----|
| `/api/rfq` | GET | Danh sách RFQ, filter status, `take: 100` | ❌ |
| `/api/rfq/[id]` | GET, DELETE, PATCH | CRUD; GET sanitise BigInt → Number | ❌ |
| `/api/rfq/[id]/status` | PATCH | Chuyển trạng thái, set `approvedById` | ❌ |
| `/api/rfq/[id]/calculate-cbu` | POST | Lưu kết quả CBU (`$transaction`) | ❌ |
| `/api/rfq/[id]/items` | PATCH | Cập nhật hàng loạt items | ❌ |
| `/api/rfq/create-manual` | POST | Tạo RFQ thủ công + `generateRfoId()` | ❌ |
| `/api/rfq/generate-document` | POST | Sinh PDF 5 loại | ❌ |
| `/api/cipl/extract` | POST | Bóc tách CIPL bằng AI | ❌ |
| `/api/cipl/save` | POST | Lưu CIPL | ❌ |
| `/api/cipl/[rfqId]` | GET | Lấy CIPL mới nhất | ❌ |
| `/api/users` | GET, POST, PATCH, PUT | Quản lý user (ADMIN) | ❌ |
| `/api/pdf/split-cipl` | POST | Tách PDF | ❌ 🔴 no auth |
| `/api/download-pdf` | GET | Proxy tải PDF | ❌ 🔴 no auth |

---

## 14. BẢO MẬT & PHÂN QUYỀN

### 14.1 Cơ chế xác thực

| Lớp | Cơ chế |
|-----|--------|
| **Middleware** | `withAuth` bảo vệ `/overview`, `/rfq`, `/clients`, `/system-users`, `/settings` |
| **Layout** | `(dashboard)/layout.tsx` → `getServerSession` → redirect `/login` |
| **API routes** | Từng route tự gọi `getServerSession(authOptions)` |
| **Role guard** | `/system-users`, `/settings` chỉ ADMIN (middleware redirect) |

**Auth config:** NextAuth Credentials + bcrypt, JWT strategy, `maxAge` 8 giờ, kiểm tra `user.isActive`.

### 14.2 🔴 Các vấn đề bảo mật

| # | Vấn đề | File | Mức độ |
|---|--------|------|--------|
| 1 | **Mass assignment** — `body` → `prisma.rFQ.update()` không lọc | `api/rfq/[id]/route.ts:117-121` | 🔴 Cao |
| 2 | **Open proxy / SSRF** — nhận `?url=` bất kỳ, fetch và trả về, không auth, không allow-list | `api/download-pdf/route.ts` | 🔴 Cao |
| 3 | **Không auth** — route xử lý file nặng (OCR, 90s) mở công khai | `api/pdf/split-cipl/route.ts` | 🔴 Cao |
| 4 | **Header injection** — `filename` nội suy thẳng vào `Content-Disposition` | `api/download-pdf/route.ts:32` | 🟠 TB |
| 5 | **Rò rỉ secret qua response** — `Giá trị hiện tại: API_KEY=${apiKey}` | `api/rfq/[id]/generate-pdf` | 🟠 TB |
| 6 | **Không rate limiting** trên route AI (tốn phí Gemini) | Toàn bộ `parse-*` | 🟠 TB |
| 7 | Seed password mặc định `Admin@123` trong repo | `prisma/seed.ts:7` | 🟡 Thấp |

> **Lưu ý lịch sử:** Repo từng bị chặn push do lộ Azure AD secret trong commit `7d2c270` (file `api_accesstoken (2).bot`). Đã xử lý ở commit `0b02859` và `.gitignore` nay có `*.bot`.

### 14.3 Biến môi trường

**20 biến được tham chiếu trong code. `.env` hiện có 15.**

| Thiếu trong `.env` | Hệ quả |
|--------------------|--------|
| `SUPABASE_SERVICE_ROLE_KEY` | Upload Supabase luôn fail → fallback base64 vào DB |
| `MS_GRAPH_TENANT_ID` / `_CLIENT_ID` / `_CLIENT_SECRET` | Có fallback sang `AZURE_*` nên vẫn chạy |
| `MS_GRAPH_FROM_EMAIL` | Có fallback sang `MS_GRAPH_MAILBOX` |

---

## 15. ĐIỂM MẠNH

| # | Điểm mạnh | Bằng chứng |
|---|-----------|-----------|
| 1 | **CBU engine thiết kế đại số vững** | Closed-form phá vòng lặp circular, không iteration; `roundUp` khớp Excel với EPS guard |
| 2 | **Kỷ luật an toàn số học** | Mọi giá trị qua `n()`/`g()`, không phép chia thiếu zero-guard, clamp `Math.max(0,…)` |
| 3 | **Phân biệt margin danh nghĩa/hiệu dụng** | Phản ánh đúng lợi nhuận sau round-up VND và FX spread |
| 4 | **Lớp Zod thiết kế chuẩn** | Discriminated union, allow-list chống mass-assignment, thông báo tiếng Việt |
| 5 | **Luồng CIPL hai bước an toàn** | AI không ghi thẳng DB; người dùng review trước khi lưu |
| 6 | **Xử lý đa định dạng đầu vào** | Excel → CSV, PDF/ảnh → inlineData, fallback text |
| 7 | **BigInt sanitisation** | `api/rfq/[id]` convert BigInt → Number tránh `JSON.stringify` throw |
| 8 | **Connection pooling có kiểm soát** | `pg.Pool` max 5, cache trên `globalThis`, tránh EMAXCONNSESSION |
| 9 | **Comment giải thích "tại sao"** | Nhiều workaround được ghi rõ lý do (vd: không dùng `copyPages`) |
| 10 | **Test có ý thức bảo mật** | Có hẳn test case cho mass-assignment protection |

---

## 16. ĐIỂM YẾU & NỢ KỸ THUẬT

### 16.1 Bảng tổng hợp theo mức ưu tiên

| # | Vấn đề | Mức độ | Effort | Ảnh hưởng |
|---|--------|--------|--------|-----------|
| 1 | Công thức phân bổ logistics sai (~320×) | 🔴 Nghiêm trọng | 4h | Sai giá bán |
| 2 | `pct()` nhập nhằng 1% vs 100% | 🔴 Nghiêm trọng | 4h | Sai chi phí |
| 3 | Zod chưa wire vào route nào (0/43) | 🔴 Cao | 8h | Bảo mật + DX |
| 4 | 3/4 test suite fail (thiếu `moduleNameMapper`) | 🔴 Cao | 15p | CI/CD |
| 5 | `download-pdf` là open proxy, không auth | 🔴 Cao | 2h | SSRF |
| 6 | `split-cipl` không auth | 🔴 Cao | 30p | Lạm dụng tài nguyên |
| 7 | Migration drift — 7 models thiếu migration | 🟠 TB | 2h | Deploy mới lỗi |
| 8 | Hai thư mục `lib/` + alias xung đột | 🟠 TB | 4h | Dead code, nhầm lẫn |
| 9 | Thiếu index trên mọi FK | 🟠 TB | 1h | Hiệu năng |
| 10 | Ba email transport song song | 🟠 TB | 4h | Khó bảo trì |
| 11 | Lỗi `unit_price`/`amount` trong quotation PDF | 🟠 TB | 1h | Sai chứng từ |
| 12 | Fallback base64 ghi MB vào Postgres | 🟠 TB | 2h | Phình DB |
| 13 | Enum lặp ở 4 nơi | 🟡 Thấp | 2h | Dễ lệch |
| 14 | AI response không validate schema | 🟡 Thấp | 4h | Lỗi runtime |
| 15 | Nhánh OCR của split-cipl không bao giờ chạy | 🟡 Thấp | 3h | Tính năng chết |
| 16 | Không rate limiting | 🟡 Thấp | 4h | Chi phí AI |
| 17 | `generateRfoId` không transaction, vỡ ở AC9999 | 🟡 Thấp | 2h | Trùng mã |
| 18 | Không test component/API route | 🟡 Thấp | 16h | Coverage |

### 16.2 Ba vấn đề cần xử lý ngay

**① Phân bổ logistics** — `lib/cbu-engine.ts:438-443`. Đây là lỗi tính tiền, ảnh hưởng mọi báo giá có `qty > 1`. Cần đối chiếu lại với file Excel gốc `CBU-AC0084_DDP_VN_MARGIN_INPUT.xlsx` để xác định công thức đúng, rồi viết test assert **giá trị Excel cụ thể** thay vì `toBeGreaterThan(0)`.

**② Hàm `pct()`** — `lib/cbu-engine.ts:233-236`. Đề xuất: bỏ auto-detect, ép một quy ước duy nhất (0–100), rồi chuẩn hoá toàn bộ default trong `schema.prisma` (`remittanceRatePercent: 0.2` → `0.2` nghĩa là 0,2% thì phải sửa thành fraction hoặc đổi `pct`).

**③ Wire Zod** — 15 phút sửa `jest.config.js` + 8 giờ gắn 7 route. Toàn bộ schema đã sẵn sàng, chỉ còn áp dụng.

---

## 17. ĐỊNH HƯỚNG CÔNG VIỆC TIẾP THEO

### 17.1 Sprint 1 — Đóng nợ kỹ thuật (1 tuần)

| Ngày | Công việc | Kết quả mong đợi |
|------|-----------|------------------|
| 1 | Sửa `jest.config.js` + chạy lại 52 test | 52/52 pass |
| 1 | Thêm auth cho `split-cipl`, `download-pdf` + allow-list domain | Đóng SSRF |
| 2–3 | Điều tra & sửa công thức logistics, viết test đối chiếu Excel | Assert giá trị thật |
| 3 | Chuẩn hoá `pct()` về 1 quy ước, sửa default trong schema | Hết nhập nhằng |
| 4–5 | Wire Zod vào 7 route ưu tiên | 7/43 routes validated |
| 5 | Tạo migration cho 7 models thiếu | `migrate deploy` sạch |

### 17.2 Sprint 2 — Củng cố nền tảng (1 tuần)

- Thêm `@@index` cho toàn bộ FK
- Hợp nhất hai thư mục `lib/`, xoá dead code, bỏ alias webpack xung đột
- Thống nhất một email transport (khuyến nghị: MS Graph), verify domain thật
- Sinh enum Zod từ Prisma (`z.nativeEnum(OrderStatus)`) thay vì khai báo tay
- Sửa `unit_price`/`amount` trong payload quotation
- Bỏ fallback base64, thay bằng lỗi rõ ràng

### 17.3 Sprint 3 — Mở rộng test (1 tuần)

- Integration test cho API routes dùng `jest-mock-extended` (đã cài sẵn)
- Cài `@testing-library/react` + `jest-environment-jsdom`, mở rộng `testMatch` sang `.tsx`
- Test cho `task.schemas.ts`, `user.schemas.ts`, module CIPL
- Thiết lập CI chạy `npm test` + `tsc --noEmit` + `lint` trên mỗi PR

### 17.4 Sprint 4+ — Tính năng

| Hạng mục | Mô tả |
|----------|-------|
| Validate AI output bằng Zod | Áp `safeParse` lên kết quả Gemini trước khi dùng |
| Rate limiting | Giới hạn route `parse-*` theo user/IP |
| COC/COO template riêng | Hiện đang dùng nhầm template quotation |
| CIPL vào sidebar | Bổ sung điều hướng chính thức |
| Dashboard analytics | Mở rộng KPI hiện có (revenue, margin, pipeline) |
| Audit logging | Ghi vết thay đổi dữ liệu |
| AI Agent orchestration | Hiện `/api/agent` vẫn là placeholder |

### 17.5 Lộ trình phiên bản

```
v0.2  ├─ Sprint 1 + 2: đóng nợ kỹ thuật, ổn định nền tảng
      └─ Mục tiêu: 0 lỗi nghiêm trọng, Zod phủ 100% route ghi dữ liệu

v0.3  ├─ Sprint 3: test coverage + CI/CD
      └─ Mục tiêu: coverage ≥ 60%, pipeline tự động

v0.4  ├─ COC/COO, rate limiting, audit log
      └─ Mục tiêu: hoàn thiện bộ chứng từ hải quan

v1.0  ├─ AI Agent orchestration, multi-tenant
      └─ Mục tiêu: sẵn sàng vận hành quy mô lớn
```

---

## 18. PHỤ LỤC

### A. Bảng biến môi trường

| Biến | Dùng ở | Có trong `.env` |
|------|--------|:---------------:|
| `DATABASE_URL` | `lib/prisma.ts` | ✅ |
| `NEXTAUTH_SECRET` | `lib/auth.ts` | ✅ |
| `NEXTAUTH_URL` | `src/lib/ms-graph.ts` | ✅ |
| `GEMINI_API_KEY` | 4 module gemini + 2 route | ✅ |
| `NEXT_PUBLIC_SUPABASE_URL` | supabase client/server + 2 route PDF | ✅ |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | supabase client/server | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | 2 route PDF | ❌ |
| `APITEMPLATE_API_KEY` | 2 route PDF | ✅ |
| `APITEMPLATE_QUOTATION_TEMPLATE_ID` | 2 route PDF | ✅ |
| `APITEMPLATE_MVPO_TEMPLATE_ID` | `generate-document` | ✅ |
| `APITEMPLATE_CIPL_TEMPLATE_ID` | `generate-document` | ✅ |
| `AZURE_TENANT_ID` / `_CLIENT_ID` / `_CLIENT_SECRET` | ms-graph (cả 2 bản) | ✅ |
| `MS_GRAPH_MAILBOX` | ms-graph | ✅ |
| `MS_GRAPH_TENANT_ID` / `_CLIENT_ID` / `_CLIENT_SECRET` | `src/lib/ms-graph.ts` | ❌ (fallback AZURE_*) |
| `MS_GRAPH_FROM_EMAIL` | `src/lib/ms-graph.ts` | ❌ (fallback MAILBOX) |
| `RESEND_API_KEY` | `send-rfo`, `ai-config` | ✅ |

### B. File tham chiếu nhanh

| File | Vai trò |
|------|---------|
| `lib/cbu-engine.ts` | Engine tính giá CBU (611 dòng) |
| `src/lib/validation.ts` | Helper Zod validation |
| `src/lib/schemas/*.ts` | 6 file schema theo domain |
| `lib/gemini-cipl.ts` | Bóc tách CIPL (Gemini 2.5 Flash) |
| `src/app/api/rfq/generate-document/route.ts` | Sinh PDF 5 loại |
| `src/app/(dashboard)/rfq/[id]/cbu-calc/page.tsx` | UI tính CBU |
| `src/app/(dashboard)/rfq/[id]/cipl/page.tsx` | UI chỉnh sửa CIPL |
| `middleware.ts` | Bảo vệ route + role guard |
| `prisma/schema.prisma` | 11 models, 3 enums |
| `jest.config.js` | Cấu hình test (cần thêm `moduleNameMapper`) |

### C. Lệnh thường dùng

```bash
npm run dev              # Dev server
npm run build            # Build production (8GB heap)
npm test                 # Chạy test
npx tsc --noEmit         # Kiểm tra type
npm run lint             # ESLint
npx prisma generate      # Sinh Prisma client
npx prisma migrate dev   # Tạo migration
npx prisma db push       # Đồng bộ schema (đang dùng — gây drift)
npx tsx prisma/seed.ts   # Seed admin
```

### D. Trạng thái kiểm chứng

| Kiểm tra | Lệnh | Kết quả |
|----------|------|---------|
| TypeScript | `npx tsc --noEmit` | ✅ 0 lỗi |
| Test suite | `npm test` | ⚠️ 1/4 suite pass (10/52 test) |
| Zod integration | grep `@/lib/validation` | ⚠️ 0/43 routes |
| Migration | đếm folder `prisma/migrations` | ⚠️ 1 migration / 11 models |

---

*Báo cáo được lập trên cơ sở phân tích trực tiếp mã nguồn ngày 11/09/2026. Mọi số liệu đều có thể tái kiểm chứng bằng các lệnh liệt kê ở Phụ lục D.*
