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
    ├── cbu-engine.ts    # CBU calculation (client-side)
    └── utils.ts         # Utilities (cn() helper)
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
- CBU engine nằm trong `src/lib/cbu-engine.ts` (client-side)
- Công thức tính toán trong `src/app/(dashboard)/rfq/[id]/cbu-calc/page.tsx`

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
