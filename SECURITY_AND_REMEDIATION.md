# BÁO CÁO BẢO MẬT & KẾ HOẠCH XỬ LÝ

## PSBV Sales Agent Platform — Security Audit & Remediation Roadmap

---

**Ngày lập:** 11/09/2026
**Phạm vi:** Toàn bộ codebase (43 API routes, 18 pages, 11 Prisma models, ~21.000 dòng TS/TSX)
**Cơ sở:** branch `main`, commit `0b02859` + working tree
**Người lập:** Technical Team

> **Nguyên tắc lập báo cáo:** Mọi phát hiện dưới đây đều được kiểm chứng bằng cách đọc trực tiếp mã nguồn hoặc chạy lệnh thực tế. Mỗi mục đều ghi rõ **file:dòng** để kiểm chứng lại. Không có mục nào là suy đoán.

---

## MỤC LỤC

1. [Tóm tắt điều hành](#1-tóm-tắt-điều-hành)
2. [Bảng xếp hạng rủi ro](#2-bảng-xếp-hạng-rủi-ro)
3. [P0 — Nguy hiểm, xử lý ngay](#3-p0--nguy-hiểm-xử-lý-ngay)
4. [P1 — Cao, xử lý trong sprint này](#4-p1--cao-xử-lý-trong-sprint-này)
5. [P2 — Trung bình](#5-p2--trung-bình)
6. [P3 — Thấp / cải tiến](#6-p3--thấp--cải-tiến)
7. [Roadmap xử lý step-by-step](#7-roadmap-xử-lý-step-by-step)
8. [Checklist thực thi](#8-checklist-thực-thi)
9. [Tiêu chí nghiệm thu](#9-tiêu-chí-nghiệm-thu)

---

## 1. TÓM TẮT ĐIỀU HÀNH

### 1.1 Tổng quan rủi ro

| Mức | Số lượng | Ý nghĩa |
|-----|:--------:|---------|
| 🔴 **P0 — Nguy hiểm** | **6** | Có thể bị khai thác từ bên ngoài hoặc gây sai tiền. Xử lý trong 48h. |
| 🟠 **P1 — Cao** | **6** | Ảnh hưởng bảo mật/vận hành. Xử lý trong sprint hiện tại. |
| 🟡 **P2 — Trung bình** | **7** | Nợ kỹ thuật tích tụ. Xử lý trong 2–4 tuần. |
| 🔵 **P3 — Thấp** | **6** | Cải tiến chất lượng. Xử lý khi có dư địa. |
| | **Tổng: 25** | |

### 1.2 Ba nhóm vấn đề lớn nhất

**① Lỗ hổng bảo mật có thể khai thác từ Internet (4 mục P0)**
Hệ thống hiện có **2 endpoint hoàn toàn không xác thực**, trong đó 1 endpoint là *open proxy* cho phép bất kỳ ai trên Internet dùng server của công ty để fetch URL tùy ý — bao gồm cả địa chỉ nội bộ (SSRF). Thêm 1 endpoint cho phép ghi đè trường bất kỳ trong bảng RFQ (mass assignment).

**② Sai số học trong engine tính giá (2 mục P0)**
Hai lỗi trong `cbu-engine.ts` ảnh hưởng **trực tiếp tới giá bán gửi khách hàng**: công thức phân bổ logistics lệch ~320 lần, và hàm `pct()` hiểu sai đơn vị phần trăm (0,2% bị đọc thành 20%).

**③ Hai lớp phòng thủ đã xây xong nhưng chưa bật (2 mục P1)**
Lớp Zod validation và bộ test 52 case đều đã viết hoàn chỉnh, chất lượng tốt — nhưng **0/43 route đang dùng Zod**, và **42/52 test không chạy được** do thiếu cấu hình. Đây là tin tốt: phần khó đã xong, chỉ cần bật lên.

### 1.3 Ước tính công sức

| Giai đoạn | Nội dung | Effort |
|-----------|----------|:------:|
| **Sprint 0** | Vá khẩn cấp 6 lỗi P0 | **2 ngày** |
| **Sprint 1** | Xử lý 6 lỗi P1 | **5 ngày** |
| **Sprint 2** | Xử lý 7 lỗi P2 | **5 ngày** |
| **Sprint 3** | Test coverage + CI/CD | **5 ngày** |
| | **Tổng** | **~17 ngày công** |

---

## 2. BẢNG XẾP HẠNG RỦI RO

| ID | Vấn đề | Mức | Loại | File | Effort |
|----|--------|:---:|------|------|:------:|
| **P0-1** | Open proxy / SSRF — không auth, không allow-list | 🔴 | Bảo mật | `api/download-pdf/route.ts` | 2h |
| **P0-2** | Endpoint OCR nặng không xác thực | 🔴 | Bảo mật | `api/pdf/split-cipl/route.ts` | 30p |
| **P0-3** | Mass assignment — body → Prisma | 🔴 | Bảo mật | `api/rfq/[id]/route.ts:117` | 1h |
| **P0-4** | Rò rỉ API key qua response body | 🔴 | Bảo mật | `api/rfq/[id]/generate-pdf/route.ts:78` | 15p |
| **P0-5** | Phân bổ logistics sai ~320 lần | 🔴 | Tính tiền | `lib/cbu-engine.ts:438-443` | 4h |
| **P0-6** | `pct()` hiểu sai đơn vị % (0,2% → 20%) | 🔴 | Tính tiền | `lib/cbu-engine.ts:233-236` | 4h |
| **P1-1** | 42/52 test không chạy (thiếu `moduleNameMapper`) | 🟠 | Chất lượng | `jest.config.js` | 15p |
| **P1-2** | Zod chưa wire vào route nào (0/43) | 🟠 | Bảo mật | 7 routes ưu tiên | 8h |
| **P1-3** | Migration drift — 7/11 models thiếu migration | 🟠 | Vận hành | `prisma/migrations/` | 2h |
| **P1-4** | Header injection qua `filename` | 🟠 | Bảo mật | `api/download-pdf/route.ts:32` | 30p |
| **P1-5** | Không rate limiting trên route AI | 🟠 | Chi phí | Toàn bộ `parse-*` | 4h |
| **P1-6** | Fallback base64 ghi MB vào Postgres | 🟠 | Vận hành | 2 route PDF | 2h |
| **P2-1** | Hai thư mục `lib/` + alias xung đột | 🟡 | Kiến trúc | `tsconfig` + `next.config` | 4h |
| **P2-2** | Thiếu index trên mọi foreign key | 🟡 | Hiệu năng | `prisma/schema.prisma` | 1h |
| **P2-3** | Ba email transport song song | 🟡 | Bảo trì | 3 files | 4h |
| **P2-4** | Địa chỉ gửi sandbox chưa verify domain | 🟡 | Vận hành | `send-rfo:50`, `lib/email.ts:29` | 2h |
| **P2-5** | Lỗi `unit_price`/`amount` trong quotation PDF | 🟡 | Chứng từ | `generate-document/route.ts` | 1h |
| **P2-6** | AI output không validate schema | 🟡 | Ổn định | 4 module gemini | 4h |
| **P2-7** | Enum lặp thủ công ở 4 nơi | 🟡 | Bảo trì | schemas + 3 files | 2h |
| **P3-1** | Nhánh OCR split-cipl không bao giờ chạy | 🔵 | Tính năng chết | `split-cipl/route.ts` | 3h |
| **P3-2** | `generateRfoId` race condition, vỡ ở AC9999 | 🔵 | Dữ liệu | `lib/rfq-code.ts` | 2h |
| **P3-3** | Seed password mặc định trong repo | 🔵 | Bảo mật | `prisma/seed.ts:7` | 30p |
| **P3-4** | Catalog matcher không dùng fuzzy | 🔵 | Chất lượng | `lib/catalog-matcher.ts` | 3h |
| **P3-5** | COC/COO dùng nhầm template quotation | 🔵 | Chứng từ | `generate-document/route.ts` | 3h |
| **P3-6** | Không test component/API route | 🔵 | Coverage | `__tests__/` | 16h |

---

## 3. P0 — NGUY HIỂM, XỬ LÝ NGAY

> **Định nghĩa P0:** Có thể bị khai thác từ bên ngoài không cần đăng nhập, HOẶC gây sai lệch số tiền trên chứng từ gửi khách hàng. **Deadline: 48 giờ.**

---

### 🔴 P0-1 — Open Proxy / SSRF

**File:** `src/app/api/download-pdf/route.ts`
**Loại:** Server-Side Request Forgery (CWE-918)

#### Mô tả

Endpoint nhận tham số `?url=` bất kỳ, `fetch` URL đó rồi trả nội dung về cho người gọi. **Không có kiểm tra session, không có allow-list domain.**

```typescript
// src/app/api/download-pdf/route.ts — mã hiện tại
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");      // ⚠️ URL tùy ý
  const filename = req.nextUrl.searchParams.get("filename") || "document.pdf";

  if (!url) return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });

  const response = await fetch(url);                     // ⚠️ fetch không giới hạn
  const buffer = Buffer.from(await response.arrayBuffer());

  return new NextResponse(buffer, { /* ... */ });
}
```

#### Kịch bản khai thác

| Bước | Hành động của kẻ tấn công |
|------|---------------------------|
| 1 | Gọi `GET /api/download-pdf?url=http://169.254.169.254/latest/meta-data/iam/security-credentials/` |
| 2 | Server Vercel fetch endpoint metadata nội bộ và **trả credentials về cho kẻ tấn công** |
| 3 | Tương tự với `http://localhost:*`, IP nội bộ `10.x/172.16.x/192.168.x`, `file://` |
| 4 | Dùng server công ty làm bàn đạp quét mạng nội bộ / ẩn danh tấn công bên thứ ba |

**Mức nghiêm trọng:** Không cần đăng nhập. Bất kỳ ai biết URL đều khai thác được.

#### Cách xử lý

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Chỉ cho phép tải file từ các host tin cậy của hệ thống.
const ALLOWED_HOSTS = new Set([
  new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://invalid.local").host,
  "rest.apitemplate.io",
]);

/** Chuẩn hoá tên file cho Content-Disposition: bỏ ký tự điều khiển,
 *  dấu ngoặc kép và ký tự đường dẫn để chặn header injection. */
function sanitiseFilename(raw: string): string {
  const cleaned = raw
    .replace(/[\r\n"\\/ -]/g, "")
    .trim()
    .slice(0, 120);
  const safe = cleaned.length > 0 ? cleaned : "document";
  return safe.toLowerCase().endsWith(".pdf") ? safe : `${safe}.pdf`;
}

export async function GET(req: NextRequest) {
  // 1. Bắt buộc đăng nhập
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawUrl = req.nextUrl.searchParams.get("url");
  if (!rawUrl) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  // 2. Chỉ chấp nhận http(s) và host nằm trong allow-list
  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: "URL không hợp lệ." }, { status: 400 });
  }

  if (target.protocol !== "https:" && target.protocol !== "http:") {
    return NextResponse.json({ error: "Giao thức không được hỗ trợ." }, { status: 400 });
  }

  if (!ALLOWED_HOSTS.has(target.host)) {
    return NextResponse.json(
      { error: "Nguồn tệp không được phép." },
      { status: 403 }
    );
  }

  try {
    const response = await fetch(target, { redirect: "error" }); // chặn redirect ra ngoài allow-list
    if (!response.ok) {
      return NextResponse.json(
        { error: `Không tải được tệp: ${response.status}` },
        { status: 502 }
      );
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const safeFilename = sanitiseFilename(
      req.nextUrl.searchParams.get("filename") ?? "document.pdf"
    );

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeFilename}"`,
        "Content-Length": buffer.byteLength.toString(),
      },
    });
  } catch (error: any) {
    console.error("[download-pdf]", error);
    return NextResponse.json({ error: "Không tải được tệp." }, { status: 500 });
  }
}
```

> Bản vá này xử lý đồng thời **P0-1** (SSRF) và **P1-4** (header injection qua `filename`).

#### Kiểm chứng

```bash
# Phải trả 401
curl -i "http://localhost:3000/api/download-pdf?url=http://169.254.169.254/"
# Phải trả 403 (đã đăng nhập nhưng host ngoài allow-list)
curl -i -b cookies.txt "http://localhost:3000/api/download-pdf?url=http://127.0.0.1:3000/"
```

---

### 🔴 P0-2 — Endpoint OCR nặng không xác thực

**File:** `src/app/api/pdf/split-cipl/route.ts`
**Loại:** Missing Authentication (CWE-306) + Resource Exhaustion

#### Mô tả

Route này chạy pipeline rất tốn tài nguyên — `pdf2pic` render từng trang thành ảnh, rồi `tesseract.js` OCR — với `maxDuration = 90` giây. Kiểm chứng bằng grep: file **không import `getServerSession`**, không có bất kỳ kiểm tra phiên nào.

```
$ grep -n "getServerSession|maxDuration|export async function" split-cipl/route.ts
23:  export const maxDuration = 90;
166: export async function POST(req: NextRequest) {
```

→ Không có dòng `getServerSession` nào.

#### Kịch bản khai thác

Kẻ tấn công gửi liên tục PDF nhiều trang tới endpoint này. Mỗi request chiếm tới 90 giây CPU của một serverless function. Hệ quả:

- **Hoá đơn Vercel tăng vọt** (tính theo GB-hours)
- Function concurrency bị chiếm dụng → người dùng thật không gọi được API
- Không cần tài khoản, không để lại dấu vết danh tính

#### Cách xử lý

```typescript
// Thêm vào đầu file
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function POST(req: NextRequest) {
  // ✅ Chốt chặn đầu tiên
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ... phần còn lại giữ nguyên
}
```

**Bổ sung khuyến nghị:** giới hạn kích thước file đầu vào ngay sau khi đọc `formData`:

```typescript
const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20 MB
if (file.size > MAX_PDF_BYTES) {
  return NextResponse.json(
    { success: false, error: "Tệp vượt quá 20MB." },
    { status: 413 }
  );
}
```

---

### 🔴 P0-3 — Mass Assignment

**File:** `src/app/api/rfq/[id]/route.ts:117-121`
**Loại:** Mass Assignment (CWE-915)

#### Mô tả

```typescript
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const updated = await prisma.rFQ.update({
      where: { id: params.id },
      data: body,        // ⚠️ TOÀN BỘ body đi thẳng vào Prisma
    });
```

Bất kỳ người dùng đã đăng nhập nào (kể cả `SALE_ADMIN`) đều có thể ghi đè **mọi trường** của bảng RFQ.

#### Kịch bản khai thác

| Payload | Hậu quả |
|---------|---------|
| `{"totalRevenueUsd": 999999, "totalMarginUsd": 999999}` | Bịa số liệu tài chính, làm sai dashboard và báo cáo lợi nhuận |
| `{"approvedById": "<id người khác>"}` | Giả mạo người duyệt — phá vỡ dấu vết phê duyệt |
| `{"clientId": "<id khách khác>"}` | Chuyển đơn hàng sang khách hàng khác |
| `{"status": "QUOTED_TO_CLIENT"}` | Nhảy cóc quy trình, bỏ qua bước duyệt CBU |
| `{"exchangeRate": 1}` | Phá toàn bộ số liệu giá VND |

#### Cách xử lý

Schema `updateRfqSchema` **đã được viết sẵn và test đầy đủ** tại `src/lib/schemas/rfq.schemas.ts` — chỉ cần gắn vào:

```typescript
import { updateRfqSchema } from "@/lib/schemas";
import { validateBody, validatePathParam } from "@/lib/validation";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ✅ Kiểm tra path param
  const idCheck = validatePathParam(params.id, "id");
  if (!idCheck.success) return idCheck.response;

  // ✅ Validate + strip trường nguy hiểm
  const bodyCheck = await validateBody(req, updateRfqSchema);
  if (!bodyCheck.success) return bodyCheck.response;

  try {
    const updated = await prisma.rFQ.update({
      where: { id: idCheck.data },
      data: bodyCheck.data,   // ✅ Chỉ còn 17 trường trong allow-list
    });
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

Test đã có sẵn chứng minh cơ chế hoạt động (`__tests__/schemas/rfq.schemas.test.ts`):

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

---

### 🔴 P0-4 — Rò rỉ API key qua response

**File:** `src/app/api/rfq/[id]/generate-pdf/route.ts:78`
**Loại:** Information Exposure (CWE-209)

#### Mô tả

```typescript
if (!apiKey || apiKey === "undefined" || !templateId) {
  return NextResponse.json({
    success: false,
    message: `[VERCEL ENV ERROR] Không tìm thấy API Key hoặc Template ID. Giá trị hiện tại: API_KEY=${apiKey}`
  }, { status: 500 });   // ⚠️ In giá trị API key ra response
}
```

Khi biến môi trường được cấu hình **sai một phần** (ví dụ key bị thừa dấu nháy, hoặc template ID rỗng còn key hợp lệ), điều kiện `!templateId` vẫn đúng → server trả về **giá trị thật của `APITEMPLATE_API_KEY`** trong body HTTP.

Response này có thể bị ghi lại ở: log trình duyệt, proxy công ty, hệ thống giám sát, DevTools của người dùng.

#### Cách xử lý

```typescript
if (!apiKey || apiKey === "undefined" || !templateId) {
  // Chi tiết chỉ ghi vào log server, không trả về client
  console.error("[generate-pdf] Thiếu cấu hình APITemplate:", {
    hasApiKey: Boolean(apiKey && apiKey !== "undefined"),
    hasTemplateId: Boolean(templateId),
  });

  return NextResponse.json({
    success: false,
    message: "Hệ thống chưa được cấu hình đầy đủ để tạo PDF. Vui lòng liên hệ quản trị viên.",
  }, { status: 500 });
}
```

**Nguyên tắc:** thông báo lỗi trả về client chỉ nói *có vấn đề gì*, không bao giờ nói *giá trị hiện tại là gì*.

#### Hành động bắt buộc kèm theo

Vì key có thể đã bị lộ trong log: **xoay (rotate) `APITEMPLATE_API_KEY`** trên dashboard APITemplate.io và cập nhật lại biến môi trường Vercel.

---

### 🔴 P0-5 — Phân bổ logistics sai ~320 lần

**File:** `lib/cbu-engine.ts:438-443`
**Loại:** Lỗi tính toán ảnh hưởng giá bán

#### Mô tả

```typescript
const weightPerUnit    = qty > 0 ? item.netWeightLbs / qty : 0;
const logisticsPerUnit = totalLogisticsUsd * (totalWeightLbs > 0 ? weightPerUnit / totalWeightLbs : 0);
```

Comment ngay trên đoạn code khẳng định:

> *"This gives exact allocation where SUM(logisticsPerUnit × qty) = totalLogisticsUsd"*

**Đẳng thức này sai.** Chứng minh:

```
totalWeightLbs = Σ(netWeightLbs × qty)        ← mẫu số là tổng trọng lượng ĐÃ nhân qty
weightPerUnit  = netWeightLbs / qty            ← tử số lại CHIA cho qty

Σ(logisticsPerUnit × qty)
  = totalLogistics × Σ[(netWeightLbs / qty) × qty] / Σ(netWeightLbs × qty)
  = totalLogistics × Σ(netWeightLbs) / Σ(netWeightLbs × qty)
```

Chỉ bằng `totalLogistics` khi **mọi `qty` = 1**.

#### Minh hoạ độ lệch

Lấy đúng dữ liệu trong test hiện có (1 item, pool 4.000 USD, 320 đơn vị, 0,38 lbs/đơn vị):

| Cách tính | Kết quả |
|-----------|---------|
| Đúng: `4000 / 320` | **12,50 USD/đơn vị** |
| Engine hiện tại | **≈ 0,039 USD/đơn vị** |
| **Độ lệch** | **~320 lần** |

→ Chi phí logistics gần như **biến mất khỏi giá vốn**, khiến giá bán thấp hơn thực tế và **báo giá bị lỗ**.

#### Bằng chứng đã được ghi nhận từ trước

Chính file test đang chứa ghi chú chưa xử lý:

```typescript
// __tests__/cbu-engine.test.ts
// THIS IS THE BUG: The allocation formula is wrong!
// Fix: logisticsPerUnit = totalLogistics / total_items, not × weightShare
```

Và assertion đã bị làm yếu thành `expect(item.ddpPriceUsd).toBeGreaterThan(0)` thay vì so với giá trị Excel thật.

#### Cách xử lý — quy trình 3 bước

**Bước 1 — Xác định công thức đúng từ nguồn gốc.**
Mở `documents/CBU_docx/CBU_Margin_Input/CBU-AC0084_DDP_VN_MARGIN_INPUT.xlsx`, xem cột **K (Logistics)** của sheet *Margin Analysis*, đọc công thức Excel thật.

Công thức mong đợi (phân bổ theo tỷ trọng trọng lượng dòng):

```
logisticsPerUnit = Pool × (extWeight_dòng / totalWeight) / qty_dòng
```

trong đó `extWeight_dòng = netWeightLbs × qty`.

**Bước 2 — Sửa code:**

```typescript
// Tỷ trọng trọng lượng của DÒNG này trên tổng trọng lượng lô hàng
const lineWeightShare = totalWeightLbs > 0 ? item.extWeightLbs / totalWeightLbs : 0;

// Phần pool thuộc về dòng này, rồi chia đều cho số đơn vị trong dòng
const logisticsPerUnit = qty > 0 ? (totalLogisticsUsd * lineWeightShare) / qty : 0;
const insurancePerUnit = qty > 0 ? (totalInsuranceUsd  * lineWeightShare) / qty : 0;
```

Với cách này, đẳng thức bảo toàn pool **thực sự đúng**:
`Σ(logisticsPerUnit × qty) = totalLogistics × Σ(lineWeightShare) = totalLogistics` ✅

**Bước 3 — Viết test assert giá trị Excel thật**, thay cho assertion yếu hiện tại:

```typescript
it("phân bổ đúng: tổng logistics theo dòng bằng pool", () => {
  const result = calculateCBU(airItems, EXCEL_GLOBALS);
  const tongPhanBo = result.items.reduce(
    (s, it) => s + (it.logisticsPerUnit ?? 0) * it.qty, 0
  );
  expect(tongPhanBo).toBeCloseTo(result.totalLogisticsUsd, 6);
});

it("khớp giá trị Excel cho item 1 (AC0084)", () => {
  const result = calculateCBU(airItems, EXCEL_GLOBALS);
  expect(result.items[0].logisticsPerUnit).toBeCloseTo(0.671227452705675, 6);
  expect(result.items[0].unitCostUsd).toBeCloseTo(5.32182186535253, 6);
  expect(result.items[0].ddpPriceUsd).toBeCloseTo(7.10, 2);
});
```

> ⚠️ **Lưu ý quan trọng:** Sau khi sửa, **mọi báo giá đã phát hành trước đây cần được rà soát lại**. Đề nghị chạy một script đối chiếu để xác định các RFQ đã gửi khách có sai lệch giá đáng kể.

---

### 🔴 P0-6 — Hàm `pct()` hiểu sai đơn vị phần trăm

**File:** `lib/cbu-engine.ts:233-236`
**Loại:** Lỗi tính toán ảnh hưởng chi phí

#### Mô tả

Header file khai báo quy ước rõ ràng:

> *"Every `*Percent` field is 0-100 (25 means 25%), never 0.25."*

Nhưng hàm thực tế lại tự đoán:

```typescript
/** Percent (0-100 or 0-1) -> fraction.
 * Auto-detects: values ≤ 1 are treated as fractions (0.03 = 3%), values > 1 as percentages.
 */
function pct(v: unknown): number {
  const val = n(v);
  return val <= 1 ? val : val / 100;
}
```

#### Vùng mù không thể phân biệt

| Input | `pct()` trả về | Người dùng muốn | Đúng? |
|-------|:--------------:|:---------------:|:-----:|
| `25` | 0,25 | 25% | ✅ |
| `0.03` | 0,03 | 3% | ✅ |
| `1` | **1,0 (=100%)** | 1% | ❌ **sai 100×** |
| `0.5` | **0,5 (=50%)** | 0,5% | ❌ **sai 100×** |
| `0.2` | **0,2 (=20%)** | 0,2% | ❌ **sai 100×** |

#### Xung đột thực tế đang tồn tại trong dự án

| Nguồn | Giá trị | `pct()` hiểu là | Ý định thật |
|-------|---------|:---------------:|:-----------:|
| `schema.prisma` default | `remittanceRatePercent = 0.2` | **20%** | 0,2% |
| `schema.prisma` default | `insuranceRatePercent = 0.01` | **1%** | 0,01% |
| `schema.prisma` default | `receiveRatePercent = 0.05` | **5%** | 0,05% |
| Test fixture | `remittanceRatePercent: 0.002` | 0,2% ✅ | 0,2% |

→ **DB và test đang dùng hai quy ước khác nhau.** Phí chuyển tiền theo default DB bị tính **gấp 100 lần**.

May mắn là phí ngân hàng có sàn tối thiểu (`minRemittanceFeeUsd = 50`) nên với đơn nhỏ sai số bị che khuất — nhưng với đơn lớn (material > 25.000 USD) sai lệch sẽ bộc lộ trực tiếp vào giá vốn.

#### Cách xử lý

**Bước 1 — Bỏ auto-detect, ép một quy ước duy nhất (0–100):**

```typescript
/** Chuyển giá trị phần trăm (quy ước 0-100) sang phân số.
 *  25 -> 0.25 ; 0.2 -> 0.002 ; 110 -> 1.1
 *  KHÔNG auto-detect: mọi *Percent trong hệ thống đều theo thang 0-100. */
function pct(v: unknown): number {
  return n(v) / 100;
}
```

**Bước 2 — Kiểm tra lại toàn bộ default trong `schema.prisma`.** Với quy ước mới (0–100), các default hiện tại **đã đúng sẵn**:

| Trường | Default hiện tại | `pct()` mới | Ý nghĩa |
|--------|:----------------:|:-----------:|---------|
| `remittanceRatePercent` | `0.2` | 0,002 | 0,2% ✅ |
| `insuranceRatePercent` | `0.01` | 0,0001 | 0,01% ✅ |
| `receiveRatePercent` | `0.05` | 0,0005 | 0,05% ✅ |
| `insuredValuePercent` | `110` | 1,1 | 110% ✅ |
| `commissionPercent` | `3` | 0,03 | 3% ✅ |
| `citPercent` | `20` | 0,2 | 20% ✅ |
| `marginPercent` | `25` | 0,25 | 25% ✅ |
| `interestRatePercent` | `15` | 0,15 | 15% ✅ |

**→ Chỉ cần sửa hàm `pct()`, không cần đụng tới schema.** Đây là tin tốt: quy ước 0–100 chính là ý định ban đầu, chỉ có hàm `pct()` diễn giải sai.

**Bước 3 — Sửa test fixture** đang dùng dạng phân số:

```typescript
// __tests__/cbu-engine.test.ts — SỬA
remittanceRatePercent: 0.2,   // 0,2% theo quy ước 0-100 (cũ: 0.002)
receiveRatePercent: 0.05,     // 0,05%                    (cũ: 0.05 — giữ nguyên)
insuranceRatePercent: 0.01,   // 0,01%                    (giữ nguyên)
```

**Bước 4 — Thêm test khoá quy ước:**

```typescript
describe("pct() — quy ước phần trăm 0-100", () => {
  it("không còn nhập nhằng giữa 1% và 100%", () => {
    const globals = { ...EXCEL_GLOBALS, remittanceRatePercent: 0.2 };
    const result = calculateCBU([AIR_ITEM_1], globals);
    // 0,2% × 1,1 × material — KHÔNG phải 20%
    const expected = Math.max(result.totalMaterialUsd * 0.002 * 1.1, 50);
    expect(result.remittanceFeeUsd).toBeCloseTo(expected, 6);
  });
});
```

---

## 4. P1 — CAO, XỬ LÝ TRONG SPRINT NÀY

---

### 🟠 P1-1 — 42/52 test không chạy được

**File:** `jest.config.js`

#### Kết quả chạy thực tế

```
$ npm test

FAIL __tests__/schemas/client.schemas.test.ts
  ● Cannot find module '@/lib/schemas'
FAIL __tests__/schemas/rfq.schemas.test.ts
  ● Cannot find module '@/lib/schemas'
FAIL __tests__/utils/validation.test.ts
  ● Cannot find module '@/lib/validation'

Test Suites: 3 failed, 1 passed, 4 total
Tests:       10 passed, 10 total        ← chỉ 10/52
```

**Nguyên nhân:** `jest.config.js` không khai báo `moduleNameMapper`, trong khi 3 test file mới import qua alias `@/`. Chỉ `cbu-engine.test.ts` chạy được vì dùng đường dẫn tương đối.

`tsconfig.json` đã map `"@/*": ["./src/*", "./*"]` và `npx tsc --noEmit` cho **0 lỗi** → code hoàn toàn đúng, chỉ thiếu cấu hình Jest.

#### Cách xử lý — sửa 4 dòng

```javascript
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/__tests__/**/*.test.ts'],

  // ✅ THÊM: khớp với "paths" trong tsconfig.json
  moduleNameMapper: {
    '^@/lib/(.*)$': ['<rootDir>/src/lib/$1', '<rootDir>/lib/$1'],
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: false,
      tsconfig: {
        strict: false,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        module: 'commonjs',
        moduleResolution: 'node',
      },
    }],
  },
  transformIgnorePatterns: ['/node_modules/'],
};
```

> Thứ tự trong mảng quan trọng: `src/lib` trước, `lib` sau — khớp đúng thứ tự ưu tiên của `tsconfig`.

**Nghiệm thu:** `npm test` → `Tests: 52 passed, 52 total`.

---

### 🟠 P1-2 — Zod chưa được gắn vào route nào (0/43)

#### Hiện trạng

```
$ grep -rn 'from "@/lib/validation"|from "@/lib/schemas"' src/
src/lib/validation.ts:6:  *   import { updateRfqSchema } from "@/lib/schemas";
src/lib/validation.ts:7:  *   import { validateBody, validatePathParam } from "@/lib/validation";
```

→ Chỉ 2 kết quả, **cả hai đều nằm trong comment hướng dẫn của chính `validation.ts`**. Không route nào dùng.

#### Bảy route ưu tiên

| # | Route | Schema có sẵn | Validation hiện tại |
|---|-------|---------------|---------------------|
| 1 | `PATCH /api/rfq/[id]` | `updateRfqSchema` | **Không có** (xem P0-3) |
| 2 | `POST /api/rfq/create-manual` | `createRfqManualSchema` | `if (!clientName \|\| !clientEmail \|\| !items)` |
| 3 | `POST /api/rfq/save-supplier-quote` | `saveSupplierQuoteSchema` | `if ((!rfqCode && !rfqId) \|\| !rows)` |
| 4 | `POST /api/rfq/save-customer-po` | `saveCustomerPoSchema` | Kiểm tra thủ công |
| 5 | `POST /api/clients` | `createClientSchema` | `if (!name \|\| !companyName \|\| !email)` |
| 6 | `PUT /api/clients/[id]` | `updateClientSchema` | `if (!name \|\| !companyName \|\| !email)` |
| 7 | `POST /api/tasks` | `createTaskSchema` | **Không có** — `body.title` dùng trực tiếp |

#### Mẫu áp dụng chuẩn

```typescript
// TRƯỚC
const body = await req.json();
const { name, companyName, email, phone, address } = body;
if (!name || !companyName || !email) {
  return NextResponse.json({ success: false, message: "Vui lòng nhập đầy đủ..." }, { status: 400 });
}

// SAU
import { createClientSchema } from "@/lib/schemas";
import { validateBody } from "@/lib/validation";

const check = await validateBody(req, createClientSchema);
if (!check.success) return check.response;
const { name, companyName, email, phone, address } = check.data;
```

**Lợi ích thu được:**

- Lỗi trả về có **field-level detail** (`{"field": "clientEmail", "message": "Email không hợp lệ."}`) thay vì một câu chung chung
- `optionalStringSchema` tự trim và chuyển `""` → `undefined`, khớp semantics Prisma
- JSON hỏng trả 400 thay vì throw 500
- Type-safe: `check.data` đã được TypeScript narrow đúng kiểu

#### Thứ tự triển khai đề xuất

Ngày 1: route #1 (bảo mật cao nhất) → #5, #6, #7 (đơn giản, ít rủi ro)
Ngày 2: route #2, #3, #4 (payload phức tạp, cần test kỹ với dữ liệu thật)

---

### 🟠 P1-3 — Migration drift: 7/11 models thiếu migration

#### Hiện trạng

```
prisma/migrations/
├── 20260729114302_init/migration.sql   ← chỉ tạo 5 bảng
└── migration_lock.toml
```

Migration `init` chỉ chứa: `Role`, `OrderStatus`, `User`, `Client`, `RFQ`, `RFQItem`, `Document`.

| Model / Enum | Trong `schema.prisma` | Trong migration |
|--------------|:---------------------:|:---------------:|
| `TaskStatus` | ✅ | ❌ |
| `Task` | ✅ | ❌ |
| `AiConfig` | ✅ | ❌ |
| `MasterPart` | ✅ | ❌ |
| `Supplier` | ✅ | ❌ |
| `CiplRecord` | ✅ | ❌ |
| `CiplItem` | ✅ | ❌ |

#### Rủi ro

Các bảng này tồn tại trên DB hiện tại vì được áp bằng `prisma db push`. Nhưng khi:

- Deploy lên môi trường staging/production **mới**
- Khôi phục DB từ đầu sau sự cố
- Onboard lập trình viên mới

…chạy `prisma migrate deploy` sẽ **chỉ tạo 5 bảng**, và ứng dụng lỗi runtime ngay khi chạm tới Task/CIPL/AiConfig.

#### Cách xử lý

```bash
# 1. Backup DB trước
pg_dump "$DATABASE_URL" > backup_$(date +%Y%m%d).sql

# 2. Sinh migration cho phần schema chưa có migration
npx prisma migrate dev --name add_task_aiconfig_masterpart_supplier_cipl

# 3. Nếu Prisma báo drift vì bảng đã tồn tại trên DB,
#    đánh dấu migration là đã áp dụng thay vì chạy lại:
npx prisma migrate resolve --applied <tên_migration_vừa_tạo>

# 4. Xác minh trạng thái sạch
npx prisma migrate status
```

**Từ nay trở đi:** dùng `prisma migrate dev` cho mọi thay đổi schema, **ngừng dùng `prisma db push`** trên môi trường chung.

---

### 🟠 P1-4 — Header injection qua `filename`

**File:** `src/app/api/download-pdf/route.ts:32`

```typescript
"Content-Disposition": `attachment; filename="${safeFilename}"`,
```

`safeFilename` chỉ được kiểm tra đuôi `.pdf`, **không lọc ký tự điều khiển hay dấu nháy kép**. Payload chứa `"` hoặc `\r\n` có thể phá cấu trúc header.

**Xử lý:** đã bao gồm trong bản vá P0-1 (hàm `sanitiseFilename`).

---

### 🟠 P1-5 — Không có rate limiting trên route AI

#### Vấn đề

Toàn bộ route `parse-*` và `cipl/extract` gọi Gemini API — **tính phí theo token**. Không có giới hạn số lần gọi. Một người dùng (hoặc script lỗi) có thể tạo hoá đơn lớn.

Các route bị ảnh hưởng: `parse-inquiry`, `parse-supplier-quote`, `parse-customer-po`, `quick-parse-quote`, `extract-quote-data`, `cipl/extract`, `parse-quote`.

#### Cách xử lý — rate limiter đơn giản theo user

```typescript
// src/lib/rate-limit.ts (tạo mới)
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Giới hạn số request theo khoá (thường là userId) trong một cửa sổ thời gian.
 *  Lưu ý: bộ nhớ cục bộ theo instance — đủ cho quy mô hiện tại.
 *  Khi scale nhiều instance, thay bằng Upstash Redis. */
export function checkRateLimit(
  key: string,
  limit = 20,
  windowMs = 60_000
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }

  if (bucket.count >= limit) {
    return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { ok: true };
}
```

Áp dụng vào route AI:

```typescript
import { checkRateLimit } from "@/lib/rate-limit";

const userId = (session.user as any).id as string;
const limit = checkRateLimit(`ai:${userId}`, 20, 60_000);  // 20 lần/phút
if (!limit.ok) {
  return NextResponse.json(
    { success: false, error: `Bạn thao tác quá nhanh. Thử lại sau ${limit.retryAfterSec}s.` },
    { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
  );
}
```

---

### 🟠 P1-6 — Fallback base64 ghi hàng MB vào Postgres

**File:** `src/app/api/rfq/generate-document/route.ts`, `src/app/api/rfq/[id]/generate-pdf/route.ts`

#### Vấn đề

Khi upload Supabase thất bại, code **không báo lỗi** mà âm thầm nhúng toàn bộ PDF thành data-URI lưu vào cột `fileUrl`:

```typescript
fileUrl = `data:application/pdf;base64,${base64}`;
```

Vì `SUPABASE_SERVICE_ROLE_KEY` **không có trong `.env`** (xem mục 4.7), nhánh này **luôn kích hoạt khi chạy local**. Mỗi PDF ~500KB–2MB → base64 phình thêm 33% → ghi thẳng vào Postgres.

Hệ quả: bảng `Document` phình nhanh, query chậm, backup nặng, và người dùng **không biết** là upload đã hỏng.

#### Cách xử lý

```typescript
const { error: uploadError } = await supabase.storage
  .from("documents")
  .upload(objectPath, pdfBuffer, { contentType: "application/pdf", upsert: true });

if (uploadError) {
  // ❌ KHÔNG fallback âm thầm — báo lỗi rõ ràng
  console.error("[generate-document] Upload Supabase thất bại:", uploadError);
  return NextResponse.json({
    success: false,
    message: "Không lưu được tệp PDF lên kho lưu trữ. Vui lòng kiểm tra cấu hình Storage.",
  }, { status: 502 });
}
```

**Kèm theo:** bổ sung `SUPABASE_SERVICE_ROLE_KEY` vào `.env` local và Vercel.

---

## 5. P2 — TRUNG BÌNH

---

### 🟡 P2-1 — Hai thư mục `lib/` và alias xung đột

#### Vấn đề

Dự án có **hai thư mục lib song song**, và **hai hệ thống phân giải alias khác nhau**:

```jsonc
// tsconfig.json — TypeScript/IDE dùng cái này
"paths": { "@/*": ["./src/*", "./*"] }        // src/ ưu tiên trước
```

```javascript
// next.config.mjs — Webpack/runtime dùng cái này
config.resolve.alias['@/lib'] = path.resolve(__dirname, 'lib');   // ⚠️ ép về lib/ root
```

→ **IDE và runtime có thể đọc hai file khác nhau cho cùng một import.**

| Module | `lib/` | `src/lib/` | TS đọc | Webpack đọc |
|--------|:------:|:----------:|:------:|:-----------:|
| `ms-graph.ts` | ✅ Azure SDK | ✅ raw fetch | `src/lib` | `lib` ⚠️ |
| `email-builder.ts` | ✅ | ✅ | `src/lib` | `lib` ⚠️ |

#### Rủi ro nghiệp vụ cụ thể

Hai bản `email-builder.ts` **khác nhau về hành vi**. Bản trong `lib/` có ràng buộc:

> *"IMPORTANT: Must NOT contain any client/customer information."*

Ràng buộc này áp cho email gửi **nhà cung cấp** — tránh lộ thông tin khách hàng cho bên thứ ba. Bản `src/lib/` **không có ràng buộc này**. Tùy môi trường build, email gửi supplier có thể **vô tình chứa thông tin khách hàng**.

#### Cách xử lý

```bash
# 1. Xác định bản nào đang thực sự được dùng ở production
#    (kiểm tra build output hoặc thêm log tạm)

# 2. Hợp nhất: giữ 1 bản duy nhất cho mỗi module, đặt tại src/lib/
#    - Đưa ràng buộc "no client info" từ lib/email-builder.ts sang bản giữ lại
#    - Xoá bản trùng

# 3. Gỡ alias webpack trong next.config.mjs
```

```javascript
// next.config.mjs — SAU khi hợp nhất
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['html-pdf-node', 'inline-css', 'batch', 'emitter', 'pdf2pic', 'tesseract.js'],
  },
  // ✅ Bỏ webpack alias — để tsconfig paths là nguồn sự thật duy nhất
};
```

```bash
# 4. Xác minh không còn import gãy
npx tsc --noEmit && npm run build
```

---

### 🟡 P2-2 — Thiếu index trên mọi foreign key

Schema **không có bất kỳ `@@index` nào**. Các FK thường xuyên được query:

```prisma
model CiplRecord {
  // ...
  @@index([rfqId])                      // GET /api/cipl/[rfqId]
  @@index([rfqId, createdAt])           // + orderBy createdAt desc
}

model CiplItem {
  @@index([ciplRecordId])
}

model RFQItem {
  @@index([rfqId])
}

model Document {
  @@index([rfqId])
}

model Task {
  @@index([assigneeId])
  @@index([creatorId])
}

model RFQ {
  @@index([clientId])
  @@index([status])                     // filter theo status ở /api/rfq
  @@index([createdAt])                  // orderBy createdAt desc
}
```

Sau khi thêm: `npx prisma migrate dev --name add_indexes`.

---

### 🟡 P2-3 — Ba email transport song song

| Transport | File | Nguồn key | From |
|-----------|------|-----------|------|
| MS Graph REST | `src/lib/ms-graph.ts` | ENV | `MS_GRAPH_FROM_EMAIL` |
| Nodemailer → Resend SMTP | `lib/email.ts` | **DB** (`AiConfig.resendApiKey`) | `onboarding@resend.dev` |
| Resend SDK | `api/rfq/[id]/send-rfo/route.ts:7` | ENV | `onboarding@resend.dev` |

Ba cơ chế, hai nguồn key khác nhau. Khó debug khi email không tới, khó kiểm soát deliverability.

**Khuyến nghị:** thống nhất về **MS Graph** (đã có domain công ty `drilling@psbvn.com`, đã hoạt động ổn định). Chuyển `send-rfo` sang `sendEmailViaGraph()`, giữ Resend làm dự phòng có ghi chú rõ.

---

### 🟡 P2-4 — Địa chỉ gửi sandbox chưa verify domain

```typescript
// src/app/api/rfq/[id]/send-rfo/route.ts:50
from: "PSBV Sales Agent <onboarding@resend.dev>",

// lib/email.ts:29
from: "PSBV Sales Agent <onboarding@resend.dev>", // Should be replaced with verified domain in production
```

`onboarding@resend.dev` là địa chỉ sandbox của Resend. Email gửi từ đây:

- Thường bị đưa vào **spam** ở phía người nhận
- **Không mang thương hiệu PSBV** — thiếu chuyên nghiệp khi gửi khách hàng/nhà cung cấp
- Resend giới hạn số lượng gửi với địa chỉ sandbox

**Xử lý:** verify domain `psbvn.com` trên Resend, đổi sang `sales@psbvn.com`. Hoặc chuyển hẳn sang MS Graph theo P2-3.

---

### 🟡 P2-5 — Lỗi đơn giá trong payload quotation PDF

**File:** `src/app/api/rfq/generate-document/route.ts`

```typescript
unit_price:   Number(item.ddpPriceUsd ? (item.ddpPriceUsd / item.qty) : 0),  // ⚠️ chia thừa
amount:       Number(item.ddpPriceUsd ?? 0),                                 // ⚠️ đây là đơn giá
total_amount: ddpPriceUsd * qty                                              // ✅ đúng
```

Trong engine, `ddpPriceUsd` **đã là giá mỗi đơn vị**. Vì vậy:

- `unit_price` bị chia thêm cho `qty` → sai
- `amount` (thành tiền dòng) lại nhận đúng đơn giá → sai
- `total_amount` tính đúng

→ **Ba cột trên PDF gửi khách không khớp nhau.** Khách hàng sẽ phát hiện `unit_price × qty ≠ amount`.

**Sửa:**

```typescript
unit_price:   Number(item.ddpPriceUsd ?? 0),                  // đơn giá = ddpPriceUsd
amount:       Number((item.ddpPriceUsd ?? 0) * item.qty),     // thành tiền = đơn giá × SL
```

---

### 🟡 P2-6 — Kết quả AI không được validate schema

Bốn module Gemini đều `JSON.parse` kết quả rồi dùng trực tiếp, **không kiểm tra cấu trúc**:

```typescript
parsed = JSON.parse(cleaned);
if (!Array.isArray(parsed.items)) parsed.items = [];   // guard duy nhất
return parsed;
```

Nếu Gemini trả thiếu trường hoặc sai kiểu (số thành chuỗi), lỗi sẽ bộc lộ ở tầng sâu hơn — thường là lúc ghi Prisma, với thông báo khó hiểu.

**Đây chính là nơi Zod phát huy giá trị cao nhất.** Ví dụ cho CIPL:

```typescript
// src/lib/schemas/cipl.schemas.ts (tạo mới)
import { z } from "zod";

export const ciplItemAiSchema = z.object({
  part_no: z.string().default(""),
  description: z.string().default(""),
  hs_code: z.string().default(""),
  quantity: z.string().default(""),
  country_origin: z.string().default(""),
  uom: z.string().default(""),
  unit_price: z.string().default(""),
  ext_price: z.string().default(""),
  batch_no: z.string().default(""),
  net_weight: z.string().default(""),
});

export const parsedCiplSchema = z.object({
  invoice_no: z.string().default(""),
  invoice_date: z.string().default(""),
  po_no: z.string().default(""),
  // ... các trường header khác
  items: z.array(ciplItemAiSchema).default([]),
});
```

```typescript
// lib/gemini-cipl.ts
const result = parsedCiplSchema.safeParse(JSON.parse(cleaned));
if (!result.success) {
  throw new Error(
    "Gemini trả về dữ liệu không đúng cấu trúc: " +
    result.error.errors.map(e => e.path.join(".")).join(", ")
  );
}
return result.data;
```

---

### 🟡 P2-7 — Enum lặp thủ công ở 4 nơi

Danh sách `OrderStatus` hiện xuất hiện ở:

1. `prisma/schema.prisma` — nguồn gốc
2. `src/lib/schemas/common.schemas.ts` — `orderStatusSchema` khai báo tay
3. `src/app/api/rfq/route.ts` — `VALID_STATUSES` hardcode
4. `src/app/api/rfq/[id]/status/route.ts` — `VALID_STATUSES` hardcode
5. `src/app/(dashboard)/rfq/page.tsx` — `VALID_STATUSES` hardcode phía client

→ Thêm một status mới phải sửa 5 chỗ, không có cơ chế nào bắt lỗi nếu quên.

**Xử lý:** dùng `z.nativeEnum` để lấy trực tiếp từ Prisma:

```typescript
// src/lib/schemas/common.schemas.ts
import { OrderStatus, TaskStatus, Role } from "@prisma/client";
import { z } from "zod";

export const orderStatusSchema = z.nativeEnum(OrderStatus);
export const taskStatusSchema  = z.nativeEnum(TaskStatus);
export const roleSchema        = z.nativeEnum(Role);

// Danh sách dùng chung cho UI và route
export const ORDER_STATUSES = Object.values(OrderStatus);
```

Sau đó thay toàn bộ `VALID_STATUSES` hardcode bằng `ORDER_STATUSES`.

---

## 6. P3 — THẤP / CẢI TIẾN

---

### 🔵 P3-1 — Nhánh OCR của split-cipl không bao giờ chạy

Chiến lược OCR so sánh `stringSimilarity.compareTwoStrings()` giữa **toàn bộ text của một trang** với một từ khoá ngắn như `"CERTIFICATE"`, rồi yêu cầu điểm ≥ **0,85**.

Toán học cho thấy điểm số này **gần như không thể đạt** — một trang A4 có hàng trăm từ, so với một từ khoá 11 ký tự thì độ tương đồng luôn rất thấp.

**Xử lý:** đổi từ so-khớp-toàn-trang sang **tìm kiếm chuỗi con**:

```typescript
function pageContainsAnchor(pageText: string, anchor: AnchorConfig): boolean {
  const normalized = normalizeForOcr(pageText);
  // 1. Khớp trực tiếp chuỗi con
  if (normalized.includes(anchor.normalized)) return true;

  // 2. Fuzzy trên từng dòng (OCR có thể sai vài ký tự)
  return normalized.split(/\s{2,}|\n/).some(
    line => line.length >= anchor.normalized.length * 0.6 &&
            stringSimilarity.compareTwoStrings(line, anchor.normalized) >= 0.8
  );
}
```

---

### 🔵 P3-2 — `generateRfoId` có race condition

**File:** `lib/rfq-code.ts`

```typescript
const lastRfq = await prisma.rFQ.findFirst({
  where: { rfqCode: { startsWith: "AC" } },
  orderBy: { rfqCode: "desc" },       // ⚠️ sắp xếp theo chuỗi
});
let nextSeq = parseInt(lastRfq.rfqCode.substring(2), 10) + 1;
return `AC${String(nextSeq).padStart(4, "0")}`;
```

**Hai vấn đề:**

1. **Race condition:** hai người tạo RFQ cùng lúc → cùng đọc `AC0042` → cùng sinh `AC0043` → một request lỗi unique constraint.
2. **Vỡ ở AC9999:** sắp xếp theo chuỗi nên `AC10000` < `AC9999` về mặt lexicographic → sinh trùng mã.

**Xử lý:** dùng Postgres sequence hoặc transaction có retry:

```typescript
export async function generateRfoId(): Promise<string> {
  // Dùng sequence của Postgres — an toàn với concurrency
  const [row] = await prisma.$queryRaw<{ nextval: bigint }[]>`
    SELECT nextval('rfq_code_seq') AS nextval
  `;
  return `AC${String(Number(row.nextval)).padStart(4, "0")}`;
}
```

```sql
-- Migration kèm theo
CREATE SEQUENCE IF NOT EXISTS rfq_code_seq START WITH 1;
-- Đồng bộ với dữ liệu hiện có
SELECT setval('rfq_code_seq',
  COALESCE((SELECT MAX(CAST(SUBSTRING("rfqCode" FROM 3) AS INTEGER))
            FROM "RFQ" WHERE "rfqCode" ~ '^AC[0-9]+$'), 0) + 1);
```

---

### 🔵 P3-3 — Seed password mặc định trong repo

**File:** `prisma/seed.ts:7`

```typescript
const hashedPassword = await bcrypt.hash('Admin@123', 10)
```

Mật khẩu admin mặc định nằm công khai trong git. Nếu môi trường production từng chạy seed và **chưa đổi mật khẩu**, tài khoản `admin@psbv.com` đang dùng mật khẩu ai cũng biết.

**Xử lý:**

```typescript
const seedPassword = process.env.SEED_ADMIN_PASSWORD;
if (!seedPassword) {
  throw new Error(
    "Cần đặt SEED_ADMIN_PASSWORD trước khi seed. " +
    "Ví dụ: SEED_ADMIN_PASSWORD='...' npx tsx prisma/seed.ts"
  );
}
const hashedPassword = await bcrypt.hash(seedPassword, 12);
```

**Hành động ngay:** kiểm tra tài khoản `admin@psbv.com` trên production, đổi mật khẩu nếu vẫn là `Admin@123`.

---

### 🔵 P3-4 — Catalog matcher không dùng fuzzy matching

**File:** `lib/catalog-matcher.ts`

Dự án đã cài `string-similarity` nhưng module này chỉ dùng `contains` và `equals`. Part number thực tế thường có biến thể (`A23-170` vs `A23170` vs `A23 170`) → tỷ lệ khớp thấp, người dùng phải nhập tay nhiều.

**Cải tiến:** thêm bước fuzzy sau khi 2 bước hiện tại thất bại, so sánh với danh sách `MasterPart` đã normalize (bỏ dấu gạch, khoảng trắng), lấy kết quả có điểm ≥ 0,85.

---

### 🔵 P3-5 — COC/COO dùng nhầm template quotation

`VALID_DOC_TYPES` khai báo 5 loại nhưng chỉ có 3 nhánh payload. `COMMERCIAL_INVOICE_PDF` và `CERTIFICATE_COC_COO_PDF` rơi vào nhánh `else` → **dùng template báo giá**, chỉ khác hậu tố tên file.

→ Sinh ra PDF sai nội dung hoàn toàn. Cần tạo template APITemplate riêng và nhánh payload tương ứng, hoặc tạm gỡ 2 loại này khỏi UI để tránh người dùng chọn nhầm.

---

### 🔵 P3-6 — Không có test cho component và API route

Hiện chỉ có test cho engine và schema. Thiếu:

- Integration test cho API routes (`jest-mock-extended` đã cài sẵn, chưa dùng)
- Component test (thiếu `@testing-library/react`, `jest-environment-jsdom`; `testMatch` chưa nhận `.tsx`)
- Test cho `task.schemas.ts`, `user.schemas.ts`, module CIPL

Xem Sprint 3 trong roadmap.

---

## 7. ROADMAP XỬ LÝ STEP-BY-STEP

### Tổng quan 4 sprint

```
Sprint 0 (2 ngày)  ████████░░░░░░░░░░░░  Vá khẩn cấp 6 lỗi P0
Sprint 1 (5 ngày)  ░░░░░░░░████████░░░░  Xử lý 6 lỗi P1
Sprint 2 (5 ngày)  ░░░░░░░░░░░░████████  Xử lý 7 lỗi P2
Sprint 3 (5 ngày)  ░░░░░░░░░░░░░░░░████  Test coverage + CI/CD
```

---

### SPRINT 0 — VÁ KHẨN CẤP (2 ngày)

> **Mục tiêu:** Đóng mọi lỗ hổng có thể khai thác từ Internet và mọi lỗi gây sai tiền.

#### Ngày 1 — Bảo mật (4 mục, ~4 giờ)

| Bước | Việc | File | Thời gian |
|:----:|------|------|:---------:|
| 1.1 | Thêm auth check vào `split-cipl` | `api/pdf/split-cipl/route.ts` | 30p |
| 1.2 | Viết lại `download-pdf`: auth + allow-list + sanitise filename | `api/download-pdf/route.ts` | 2h |
| 1.3 | Gỡ API key khỏi thông báo lỗi | `api/rfq/[id]/generate-pdf/route.ts:78` | 15p |
| 1.4 | **Rotate `APITEMPLATE_API_KEY`** trên dashboard + Vercel | — | 15p |
| 1.5 | Wire `updateRfqSchema` vào `PATCH /api/rfq/[id]` | `api/rfq/[id]/route.ts` | 1h |

**Nghiệm thu ngày 1:**

```bash
# Không đăng nhập → 401
curl -i "http://localhost:3000/api/download-pdf?url=http://169.254.169.254/"
curl -i -X POST "http://localhost:3000/api/pdf/split-cipl"

# Mass assignment bị chặn → trường lạ bị strip
curl -X PATCH "http://localhost:3000/api/rfq/<id>" \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"status":"SUPPLIER_QUOTED","totalRevenueUsd":999999}'
# → totalRevenueUsd KHÔNG được ghi vào DB
```

#### Ngày 2 — Engine tính giá (2 mục, ~8 giờ)

| Bước | Việc | Thời gian |
|:----:|------|:---------:|
| 2.1 | Sửa `jest.config.js` (làm trước để có test chạy) | 15p |
| 2.2 | Mở file Excel gốc, xác định công thức cột K chuẩn | 1h |
| 2.3 | Sửa công thức phân bổ logistics + insurance | 1h |
| 2.4 | Sửa hàm `pct()`, bỏ auto-detect | 30p |
| 2.5 | Cập nhật test fixture về quy ước 0–100 | 1h |
| 2.6 | Viết test assert **giá trị Excel thật** (thay assertion yếu) | 2h |
| 2.7 | Chạy đối chiếu toàn bộ RFQ đã có, lập danh sách sai lệch | 2h |

**Nghiệm thu ngày 2:**

```bash
npm test          # 52/52 pass, gồm test bảo toàn pool logistics
npx tsc --noEmit  # 0 lỗi
```

```typescript
// Test bắt buộc phải pass
expect(Σ(logisticsPerUnit × qty)).toBeCloseTo(totalLogisticsUsd, 6);
expect(items[0].ddpPriceUsd).toBeCloseTo(7.10, 2);   // giá trị Excel AC0084
```

> ⚠️ **Việc cần quyết định ở cấp quản lý:** sau bước 2.7, nếu phát hiện báo giá đã gửi khách bị sai lệch đáng kể, cần có phương án xử lý thương mại (thông báo điều chỉnh, hoặc chấp nhận giữ giá cũ).

---

### SPRINT 1 — CỦNG CỐ (5 ngày)

#### Ngày 3–4 — Wire Zod cho 6 route còn lại

| Ngày | Route | Schema |
|:----:|-------|--------|
| 3 | `POST /api/clients` | `createClientSchema` |
| 3 | `PUT /api/clients/[id]` | `updateClientSchema` |
| 3 | `POST /api/tasks` | `createTaskSchema` |
| 4 | `POST /api/rfq/create-manual` | `createRfqManualSchema` |
| 4 | `POST /api/rfq/save-supplier-quote` | `saveSupplierQuoteSchema` |
| 4 | `POST /api/rfq/save-customer-po` | `saveCustomerPoSchema` |

Mỗi route: áp `validateBody` → chạy thử với dữ liệu thật từ UI → xác nhận không phá luồng hiện có.

#### Ngày 5 — Migration & môi trường

| Bước | Việc |
|:----:|------|
| 5.1 | Backup DB production |
| 5.2 | Sinh migration cho 7 models thiếu |
| 5.3 | `prisma migrate resolve --applied` nếu cần |
| 5.4 | Bổ sung `SUPABASE_SERVICE_ROLE_KEY` vào `.env` + Vercel |
| 5.5 | Bỏ fallback base64, thay bằng lỗi 502 rõ ràng |
| 5.6 | Xác minh `prisma migrate status` sạch |

#### Ngày 6–7 — Rate limiting & hoàn thiện

| Bước | Việc |
|:----:|------|
| 6.1 | Tạo `src/lib/rate-limit.ts` |
| 6.2 | Áp rate limit cho 7 route AI |
| 6.3 | Giới hạn kích thước file upload (20MB) |
| 7.1 | Sửa `unit_price`/`amount` trong payload quotation |
| 7.2 | Kiểm thử PDF báo giá với dữ liệu thật, đối chiếu 3 cột |

---

### SPRINT 2 — KIẾN TRÚC & CHẤT LƯỢNG (5 ngày)

| Ngày | Việc | Kết quả |
|:----:|------|---------|
| 8 | Thêm `@@index` cho toàn bộ FK + migration | Query nhanh hơn |
| 9–10 | Hợp nhất hai thư mục `lib/`, gỡ alias webpack | Một nguồn sự thật |
| 10 | Chuyển ràng buộc "no client info" sang bản giữ lại | Bảo toàn nghiệp vụ |
| 11 | Thống nhất email transport về MS Graph, verify domain | Deliverability tốt |
| 12 | `z.nativeEnum` thay enum thủ công, gỡ 3 chỗ hardcode | Hết lệch enum |
| 12 | Zod validate output của 4 module Gemini | Lỗi AI rõ ràng |

---

### SPRINT 3 — TEST & CI/CD (5 ngày)

| Ngày | Việc |
|:----:|------|
| 13 | Cài `@testing-library/react`, `jest-environment-jsdom`; mở rộng `testMatch` sang `.tsx` |
| 14 | Viết integration test cho 7 route đã wire Zod (dùng `jest-mock-extended`) |
| 15 | Test cho `task.schemas`, `user.schemas`, module CIPL |
| 16 | Component test cho `cbu-form`, `cipl/page` |
| 17 | Thiết lập CI: `tsc --noEmit` + `lint` + `test` trên mỗi PR |

**Ví dụ cấu hình CI:**

```yaml
# .github/workflows/ci.yml
name: CI
on: [pull_request, push]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx prisma generate
      - run: npx tsc --noEmit
      - run: npm run lint
      - run: npm test
```

---

## 8. CHECKLIST THỰC THI

### Sprint 0 — Khẩn cấp

- [ ] **P0-2** Thêm `getServerSession` vào `api/pdf/split-cipl/route.ts`
- [ ] **P0-2** Giới hạn kích thước file upload 20MB
- [ ] **P0-1** Viết lại `api/download-pdf/route.ts`: auth + allow-list host + `redirect: "error"`
- [ ] **P1-4** Hàm `sanitiseFilename()` chặn header injection
- [ ] **P0-4** Gỡ `API_KEY=${apiKey}` khỏi response `generate-pdf`
- [ ] **P0-4** 🔑 **Rotate `APITEMPLATE_API_KEY`** trên APITemplate.io + Vercel
- [ ] **P0-3** Wire `updateRfqSchema` vào `PATCH /api/rfq/[id]`
- [ ] **P1-1** Thêm `moduleNameMapper` vào `jest.config.js`
- [ ] **P0-5** Đọc công thức cột K trong file Excel gốc
- [ ] **P0-5** Sửa công thức phân bổ logistics + insurance
- [ ] **P0-5** Test bảo toàn pool: `Σ(logisticsPerUnit × qty) === totalLogisticsUsd`
- [ ] **P0-6** Sửa `pct()` bỏ auto-detect
- [ ] **P0-6** Cập nhật test fixture về quy ước 0–100
- [ ] **P0-5/6** Test assert giá trị Excel thật (7.10, 5.32182186535253)
- [ ] **P0-5** Chạy đối chiếu RFQ cũ, lập danh sách sai lệch
- [ ] ✅ `npm test` → 52/52 pass
- [ ] ✅ `npx tsc --noEmit` → 0 lỗi

### Sprint 1 — Cao

- [ ] **P1-2** Wire Zod: `POST /api/clients`
- [ ] **P1-2** Wire Zod: `PUT /api/clients/[id]`
- [ ] **P1-2** Wire Zod: `POST /api/tasks`
- [ ] **P1-2** Wire Zod: `POST /api/rfq/create-manual`
- [ ] **P1-2** Wire Zod: `POST /api/rfq/save-supplier-quote`
- [ ] **P1-2** Wire Zod: `POST /api/rfq/save-customer-po`
- [ ] **P1-3** Backup DB production
- [ ] **P1-3** Sinh migration cho 7 models thiếu
- [ ] **P1-3** `prisma migrate status` sạch
- [ ] **P1-6** Bổ sung `SUPABASE_SERVICE_ROLE_KEY` vào `.env` + Vercel
- [ ] **P1-6** Bỏ fallback base64, trả lỗi 502
- [ ] **P1-5** Tạo `src/lib/rate-limit.ts`
- [ ] **P1-5** Áp rate limit cho 7 route AI
- [ ] **P2-5** Sửa `unit_price`/`amount` trong quotation payload

### Sprint 2 — Trung bình

- [ ] **P2-2** Thêm `@@index` cho toàn bộ FK + migration
- [ ] **P2-1** Hợp nhất `lib/` và `src/lib/`
- [ ] **P2-1** Chuyển ràng buộc "no client info" sang bản giữ lại
- [ ] **P2-1** Gỡ webpack alias trong `next.config.mjs`
- [ ] **P2-3** Thống nhất email transport về MS Graph
- [ ] **P2-4** Verify domain `psbvn.com`, đổi from address
- [ ] **P2-7** `z.nativeEnum` + gỡ 3 chỗ hardcode `VALID_STATUSES`
- [ ] **P2-6** Zod validate output 4 module Gemini

### Sprint 3 — Test & CI

- [ ] **P3-6** Cài `@testing-library/react` + `jest-environment-jsdom`
- [ ] **P3-6** Mở rộng `testMatch` sang `.tsx`
- [ ] **P3-6** Integration test 7 route đã wire Zod
- [ ] **P3-6** Test `task.schemas`, `user.schemas`, CIPL
- [ ] **P3-6** Component test `cbu-form`, `cipl/page`
- [ ] Thiết lập GitHub Actions CI

### Tồn đọng (khi có dư địa)

- [ ] **P3-3** Đổi mật khẩu `admin@psbv.com` trên production
- [ ] **P3-3** Seed đọc `SEED_ADMIN_PASSWORD` từ env
- [ ] **P3-2** Chuyển `generateRfoId` sang Postgres sequence
- [ ] **P3-1** Sửa thuật toán so khớp OCR trong `split-cipl`
- [ ] **P3-4** Thêm fuzzy matching vào `catalog-matcher`
- [ ] **P3-5** Template riêng cho COC/COO, hoặc gỡ khỏi UI

---

## 9. TIÊU CHÍ NGHIỆM THU

### Sau Sprint 0

| Tiêu chí | Cách kiểm chứng | Kết quả mong đợi |
|----------|-----------------|------------------|
| Không endpoint nào thiếu auth | `grep -L "getServerSession" src/app/api/**/route.ts` | Chỉ còn `auth/[...nextauth]` |
| SSRF đã đóng | `curl "?url=http://169.254.169.254/"` | 401 hoặc 403 |
| Mass assignment đã đóng | PATCH kèm `totalRevenueUsd` | Trường bị strip, không vào DB |
| Không rò rỉ secret | Grep `API_KEY=` trong response | Không kết quả |
| Test chạy đầy đủ | `npm test` | 52/52 pass |
| Pool logistics bảo toàn | Test chuyên biệt | `Σ = totalLogisticsUsd` |
| Giá khớp Excel | Test AC0084 | DDP = 7.10 |

### Sau Sprint 1

| Tiêu chí | Kết quả mong đợi |
|----------|------------------|
| Zod phủ route ghi dữ liệu | 7/7 route ưu tiên |
| Migration sạch | `prisma migrate status` → no drift |
| Upload Supabase hoạt động | Không còn `data:application/pdf;base64` trong DB |
| Rate limit hoạt động | Gọi 21 lần/phút → 429 |

### Sau Sprint 2

| Tiêu chí | Kết quả mong đợi |
|----------|------------------|
| Một nguồn sự thật cho module | Không còn file trùng tên ở 2 thư mục lib |
| Enum không lặp | Chỉ `schema.prisma` định nghĩa, còn lại import |
| Email từ domain công ty | From = `sales@psbvn.com` hoặc `drilling@psbvn.com` |
| Index đầy đủ | Mọi FK có `@@index` |

### Sau Sprint 3

| Tiêu chí | Kết quả mong đợi |
|----------|------------------|
| Test coverage | ≥ 60% |
| CI tự động | PR không pass test → không merge được |
| Component test | Có test cho các form chính |

---

## PHỤ LỤC — LỆNH KIỂM CHỨNG NHANH

```bash
# Route nào thiếu auth?
grep -rL "getServerSession" src/app/api --include=route.ts

# Route nào đã dùng Zod?
grep -rn 'from "@/lib/validation"' src/app/api

# Trạng thái test
npm test 2>&1 | tail -20

# Type check
npx tsc --noEmit

# Drift migration
npx prisma migrate status

# Đếm route
find src/app/api -name "route.ts" | wc -l

# Tìm chỗ in biến môi trường ra response
grep -rn 'API_KEY=\${' src/app/api
```

---

*Báo cáo lập ngày 11/09/2026 trên cơ sở phân tích trực tiếp mã nguồn. Mọi phát hiện đều ghi rõ file:dòng để kiểm chứng lại.*
