# CBU ENGINE - BÁO CÁO PHÂN TÍCH & CẢI TIẾN

> ⚠️ **LỖI THỜI — đã bị thay thế bởi `SPEC.md` §11 (cập nhật 21/09/2026).** Đã chạy lại engine với dữ liệu AC0084 và đối chiếu file md mới: (1) §3.1 *Insurance tính 2 lần* và §3.3 *Financing tính 2 lần* **không phải lỗi** (insurance nằm trong pool cùng driver trọng lượng; `totalFinancingCostUsd` chỉ là số hiển thị); (2) §3.4 Commission/CIT ở PRICE_INPUT là **đúng**; (3) bản "sửa logistics" ở §7 **chưa đúng** — lỗi thật là `netWeightLbs` bị dùng theo hai nghĩa trái ngược (Σ phân bổ 14.78 vs pool 4,253) và `pct()` tự đoán đơn vị (SPEC §11.2 F1–F2). Giữ file này chỉ để tham khảo lịch sử.

**Ngày:** 2026-08-27  
**Người thực hiện:** Claude (Software Engineer / CTO)  
**File phân tích:** `lib/cbu-engine.ts` và `cbu-calc/page.tsx`

---

## 1. TỔNG QUAN HỆ THỐNG

### 1.1 Mục đích CBU
CBU (Cost Build Up) tính giá thành DDP (Delivered Duty Paid) cho các đơn hàng nhập khẩu, bao gồm:
- Chi phí vật liệu (Material)
- Phí ngân hàng (Bank Fee)
- Logistics (Freight, Clearance, Inland)
- Thuế nhập khẩu (Duty)
- Bảo hiểm (Insurance)
- Hoa hồng (Commission)
- CIT (Corporate Income Tax trên hoa hồng)

### 1.2 Hai Chế độ Tính Giá
| Chế độ | Mô tả | Input chính |
|--------|-------|-------------|
| **MARGIN_INPUT** | Tính giá từ margin % mục tiêu | Target Margin % |
| **PRICE_INPUT** | Tính margin từ giá bán đã biết | DDP Price (USD) input |

---

## 2. PHÂN TÍCH CÔNG THỨC EXCEL (Source of Truth)

### 2.1 Cấu trúc Sheet Margin Analysis

```
STT | Cột | Tên | Loại | Công thức
----|------|------|-------|----------
1   | A-F, H, I | Item, Part No., Description, Supplier, Qty, Weight, Material, %Duty | INPUT | 8 cột duy nhất cần nhập
2   | G | Weight (kg) | CÔNG THỨC | Total Weight (lb) ÷ Qty × Conversion factor
3   | J | **Bank fee** | CÔNG THỨC | = Material × %Value financed × (Interest rate × Financing days ÷ 360) + Total Bank Fee × (Material dòng ÷ Total material)
4   | K | **Logistics** | CÔNG THỨC | = Pool Logistics của shipment × (Weight đơn vị ÷ Total weight)
5   | L | **Duty** | CÔNG THỨC | = (Material + Logistics) × %Duty (Cơ sở tính thuế: CIF = goods + freight)
6   | P | **DDP Price (USD)** | CÔNG THỨC | = IF(margin $/unit override > 0; ROUNDUP((Material + Bank fee + Logistics + Duty + Margin $/unit override) ÷ (1 - Commission rate × (1 + CIT rate)); 2); ROUNDUP((Material + Bank fee + Logistics + Duty) ÷ (1 - Target margin - Commission rate × (1 + CIT rate)); 2))
7   | M | Commission | CÔNG THỨC | = Commission rate × DDP Price (USD) - TÍNH SAU KHI CÓ GIÁ BÁN
8   | N | CIT | CÔNG THỨC | = CIT rate × Commission
9   | O | Unit Cost | CÔNG THỨC | = Material + Bank fee + Logistics + Duty + Commission + CIT
10  | Q | DDP Price (VND) | CÔNG THỨC | = ROUNDUP(DDP Price USD × Exchange rate ÷ rounding step) × rounding step
11  | S | Margin per unit | CÔNG THỨC | = DDP Price (USD) − Unit Cost (LUÔN LÀ KẾT QUẢ)
12  | T | % Margin | CÔNG THỨC | = Margin per unit ÷ DDP Price (USD)
```

### 2.2 Sheet Logistic (Pool Logistics)

```
Cột | Tên | Loại | Công thức
----|------|-------|----------
J   | FREIGHT | CÔNG THỨC | = Fixed charge + Rate × Chargeable weight
M   | Total Logistic | CÔNG THỨC | = FREIGHT + Clearance + Inland (CHƯA gồm bảo hiểm)
N   | USD/kg | CÔNG THỨC | = Total Logistic ÷ Weight (kg)
S   | Insurance | CÔNG THỨC | = MAX((Goods value + FREIGHT) × % Insured value × Insurance rate; Min insurance)
T   | Total Logistic + Insurance | CÔNG THỨC | = Total Logistic + Insurance → pool phân bổ sang Margin Analysis
```

**QUAN TRỌNG:** Pool phân bổ sang Margin Analysis là **Logistic!M + Logistic!S** (Total Logistic + Insurance), KHÔNG phải Logistic!T (đã bao gồm cả Insurance).

### 2.3 Sheet Bank Fee

```
Cột | Tên | Loại | Công thức
----|------|-------|----------
H5  | International remittance fee | CÔNG THỨC | = IF(Goods origin="Local"; 0; MAX(Rate × VAT factor × Base; Min fee))
H6  | International receive fee | CÔNG THỨC | = IF(Country="VN"; 0; MAX(Rate × VAT factor × Base; Min fee))
H8  | TOTAL BANK FEE | CÔNG THỨC | = SUM(H5:H7)
```

**Ghi chú quan trọng:**
- Remittance fee = 0 nếu Goods origin = "Local"
- Receive fee = 0 nếu Country = "VN"
- Base amount cho remittance = Total Material Cost (tự động)
- Base amount cho receive = Nhập tay (tránh vòng lặp công thức)

---

## 3. CÁC VẤN ĐỀ PHÁT HIỆN TRONG CODE HIỆN TẠI

### 3.1 ❌ CRITICAL: Insurance bị tính 2 lần

**Vấn đề:**
- Trong Excel: Insurance nằm trong **Pool Logistics** (Logistic!M + Logistic!S) và được phân bổ vào cột K (Logistics)
- Trong Engine hiện tại: Insurance được tính riêng và cộng vào `preMargin` (line 461), SAU ĐÓ lại cộng vào `logisticsPerUnit` (line 434)

**Code hiện tại (lines 430-463):**
```typescript
// Insurance được cộng vào logisticsPerUnit (line 434)
const insurancePerUnit = totalInsuranceUsd * weightShare;

// Logistics Per Unit BAO GỒM Insurance
const logisticsPerUnit = totalLogisticsUsd * weightShare;

// NHƯNG SAU ĐÓ Insurance lại được cộng thêm vào preMargin (line 461)
const preMarginPerUnit =
  materialPerUnit +
  bankFeePerUnit +
  logisticsPerUnit +        // ← Đã bao gồm Insurance
  insurancePerUnit +        // ← CỘNG LẠI LẦN 2!
  dutyPerUnit +
  customCostPerUnit;
```

**Kết quả:** Insurance bị tính **2 lần**, làm Unit Cost cao hơn thực tế.

**Fix cần thiết:**
```typescript
// Cách 1: Tách Insurance ra khỏi logisticsPoolUsd (đã phân bổ qua logisticsPerUnit)
// logisticsPoolUsd = totalLogisticsUsd (CHƯA Insurance) + totalInsuranceUsd

// Cách 2: Loại bỏ insurancePerUnit khỏi preMargin (vì đã nằm trong logisticsPerUnit)
const preMarginPerUnit =
  materialPerUnit +
  bankFeePerUnit +
  logisticsPerUnit +        // ← Đã bao gồm Insurance rồi
  // insurancePerUnit +     // ← BỎ DÒNG NÀY
  dutyPerUnit +
  customCostPerUnit;
```

### 3.2 ❌ CRITICAL: Duty base calculation không đúng

**Vấn đề:**
- Excel: Duty = **(Material + Logistics) × %Duty** (Cơ sở: CIF = goods + freight)
- Code hiện tại: Duty = **(Material + logisticsPerUnit) × %Duty**

**Vấn đề cụ thể:** Trong code, `logisticsPerUnit` đã bao gồm **Insurance** (do bug 3.1), nên Duty base bị tính sai:
- Base đúng: Material + Freight (không tính Insurance)
- Base sai hiện tại: Material + Freight + Clearance + Inland + Insurance

**Fix cần thiết:**
```typescript
// Tính logistics CHƯA Insurance trước
const logisticsWithoutInsurancePerUnit = totalLogisticsUsd * weightShare;

// Duty base = Material + Logistics (CHƯA Insurance)
const dutyBase = materialPerUnit + logisticsWithoutInsurancePerUnit;
const dutyPerUnit = dutyBase * pct(item.dutyPercent);
```

### 3.3 ⚠️ MEDIUM: Financing Cost không phân bổ đúng

**Vấn đề:**
- Trong Excel, Financing Cost được tính riêng, không phải là một phần của Bank Fee
- Công thức Excel J = Material × %Value financed × (Interest rate × Days ÷ 360) + Total Bank Fee × (Material dòng ÷ Total material)
- Phần 1: Financing Cost (chi phí vốn)
- Phần 2: Bank Fee đã phân bổ

**Code hiện tại:**
```typescript
// Line 437-439
const materialShare = totalMaterialUsd > 0 ? materialPerUnit / totalMaterialUsd : 0;
const financingCostPerUnit = materialPerUnit * financingRate;
const bankFeePerUnit = totalBankFeeUsd * materialShare + financingCostPerUnit;
```

→ `bankFeePerUnit` đang bao gồm cả Financing Cost

→ Nhưng `preMarginPerUnit` đang bao gồm `bankFeePerUnit` (đã có Financing)

→ Và `totalFinancingCostUsd` trong result cũng đang cộng thêm financingCost

→ **KẾT QUẢ:** Financing Cost bị tính 2 lần!

**Fix cần thiết:**
```typescript
// Tách Financing Cost ra khỏi bankFeePerUnit
const financingCostPerUnit = materialPerUnit * financingRate;  // Chi phí vốn riêng

// bankFeePerUnit CHỈ bao gồm phí ngân hàng thực (đã phân bổ)
const bankFeePerUnit = totalBankFeeUsd * materialShare;  // KHÔNG cộng financingCost

// preMargin = Material + Bank fee (thực) + Logistics + Duty + Custom
// Financing Cost được cộng riêng vào totalFinancingCostUsd (không vào Unit Cost trực tiếp)
```

### 3.4 ⚠️ LOW: PRICE_INPUT mode không tính Commission & CIT đúng

**Vấn đề:**
Trong PRICE_INPUT mode (nhập giá bán), hệ thống vẫn tính Commission & CIT:
```typescript
// Line 503-504
const commissionPerUnit = q * ddpPriceUsd;
const citPerUnit = c * commissionPerUnit;
```

**Câu hỏi cần làm rõ:**
- Khi nhập giá bán DDP Price trực tiếp, Commission & CIT có được tính vào Unit Cost không?
- Hay giá bán đã là giá SAU Commission (tức P đã là giá cuối cùng)?

**Theo tài liệu:**
> ở đây %Margin KHÔNG CÒN LÀ Ô NHẬP — nó tự tính ra sau khi biết giá bán

→ Implication: Khi nhập giá bán, Commission & CIT vẫn được tính, nhưng Margin là kết quả.

### 3.5 ⚠️ UI: Missing insurance input trong bảng Insurance

**Vấn đề:**
Trong cbu-calc/page.tsx, bảng Insurance không có input cho:
- Insured Value % (hiện có input inline)
- Insurance Rate % (hiện có input inline)
- Min Insurance (hiện có input inline)

Nhưng không hiển thị:
- Total Insurance đã tính
- So sánh với goods value

---

## 4. BẢNG SO SÁNH EXCEL vs ENGINE

| Thành phần | Excel | Engine hiện tại | Đúng/Sai |
|------------|-------|-----------------|----------|
| **Insurance** | Trong Pool Logistics (K) | Tính riêng + vào preMargin | ❌ Sai (2 lần) |
| **Duty Base** | Material + Logistics | Material + (Logistics + Insurance) | ❌ Sai |
| **Bank Fee** | Remit + Receive + Other | Remit + Receive + Other + Financing | ⚠️ Cần xem lại |
| **Financing Cost** | Phần 1 của cột J | Tính riêng | ⚠️ Có thể bị tính 2 lần |
| **DDP Formula** | Closed-form với denominator | Giống Excel ✓ | ✅ Đúng |
| **Unit Cost** | M+J+K+L+M+N | preMargin + commission + cit | ❌ Sai (do preMargin sai) |

---

## 5. KHUYẾN NGHỊ CẢI TIẾN

### 5.1 Fix Critical Bugs (Cần làm ngay)

#### Fix 1: Insurance calculation
```typescript
// Thay vì:
// logisticsPerUnit = totalLogisticsUsd * weightShare;  // Đã bao gồm Insurance
// insurancePerUnit = totalInsuranceUsd * weightShare;     // Tính riêng
// preMargin += logisticsPerUnit + insurancePerUnit;    // Insurance bị tính 2 lần

// Sửa thành:
// Step 1: Tính Pool Logistics (CHƯA Insurance)
const logisticsPoolWithoutInsurance = totalLogisticsUsd; // freight + clearance + inland + docFee

// Step 2: Logistics Per Unit (đã bao gồm Insurance từ Logistic sheet)
const logisticsPerUnit = (logisticsPoolWithoutInsurance + totalInsuranceUsd) * weightShare;

// Step 3: Insurance đã nằm trong logisticsPerUnit, KHÔNG cộng riêng
const preMarginPerUnit =
  materialPerUnit +
  bankFeePerUnit +
  logisticsPerUnit +   // ← Đã bao gồm Insurance
  dutyPerUnit +
  customCostPerUnit;
```

#### Fix 2: Duty base calculation
```typescript
// Duty base = Material + Freight (không tính Insurance, Clearance, Inland)
// Vì thuế nhập khẩu tính trên CIF = Cost + Insurance + Freight
// Nhưng trong thực tế VN, thuế tính trên CIF (đã bao gồm freight)

// Cách đúng: Duty base = Material + Logistics (trước khi cộng Insurance)
// Vì Logistics = Freight + Clearance + Inland + DocFee

// Tính logisticsWithoutInsurance cho duty base
const freightShare = freightUsd * weightShare;
const clearanceShare = clearanceCost * weightShare;
const inlandShare = inlandCost * weightShare;
const docFeeShare = docFee * weightShare;
const logisticsWithoutInsuranceShare = freightShare + clearanceShare + inlandShare + docFeeShare;

const dutyBase = materialPerUnit + logisticsWithoutInsuranceShare;
const dutyPerUnit = dutyBase * pct(item.dutyPercent);
```

#### Fix 3: Financing Cost separation
```typescript
// Tách Financing Cost hoàn toàn khỏi Bank Fee
const financingCostPerUnit = materialPerUnit * financingRate;

// bankFeePerUnit = CHỈ phí ngân hàng thực (đã phân bổ theo material)
const bankFeePerUnit = totalBankFeeUsd * materialShare;

// preMargin = Material + Bank fee + Logistics + Duty + Custom (KHÔNG có Financing)
const preMarginPerUnit =
  materialPerUnit +
  bankFeePerUnit +
  logisticsPerUnit +
  dutyPerUnit +
  customCostPerUnit;

// Financing Cost được cộng riêng vào Unit Cost SAU khi có DDP Price
// NHƯNG phải đảm bảo KHÔNG bị cộng 2 lần

// Unit Cost = preMargin + Commission + CIT + Financing Cost
const unitCostUsd = preMarginPerUnit + commissionPerUnit + citPerUnit + financingCostPerUnit;

// Và totalFinancingCostUsd = SUM(financingCostPerUnit * qty)
```

### 5.2 Test Cases để Verify

1. **Test Insurance double-count:**
   - Input: 1 item, Material=$100, Insurance=$10
   - Expected: Insurance trong Unit Cost = $10 (không phải $20)

2. **Test Duty calculation:**
   - Input: Material=$100, Freight=$50, Duty=10%
   - Expected: Duty = (100+50) × 10% = $15 (không phải (100+50+Insurance) × 10%)

3. **Test Financing:**
   - Input: Material=$1000, %Financed=50%, Interest=15%, Days=30
   - Expected: Financing = 1000 × 50% × (15% × 30/360) = $6.25
   - Verify: Financing không xuất hiện 2 lần trong Unit Cost

### 5.3 UI Improvements

1. **Thêm validation warnings:**
   - Nếu Margin % < 0: Cảnh báo "Giá bán thấp hơn giá vốn"
   - Nếu Commission + CIT > 50% của giá bán: Cảnh báo "Tỷ lệ phí cao"

2. **Hiển thị breakdown chi tiết:**
   - Trong tooltip của mỗi dòng: hover hiện chi tiết từng thành phần
   - Logistics: Freight + Clearance + Inland + Doc + Insurance
   - Bank Fee: Remit + Receive + Other

3. **Comparison mode:**
   - Side-by-side view: MARGIN_INPUT vs PRICE_INPUT
   - Highlight sự khác biệt về Unit Cost và Margin

---

## 6. ĐỀ XUẤT KIẾN TRÚC MỚI

### 6.1 Tái cấu trúc CBUEngine

```typescript
interface CostBreakdown {
  material: number;
  freight: number;
  clearance: number;
  inland: number;
  docFee: number;
  insurance: number;
  bankFeeRemit: number;
  bankFeeReceive: number;
  bankFeeOther: number;
  financingCost: number;
  duty: number;
  customCost: number;
  
  // Tổng hợp
  logisticsPool: number;      // freight + clearance + inland + doc + insurance
  bankFeePool: number;        // remit + receive + other (không tính financing)
  totalCostBeforePricing: number;  // material + logistics + bankFee + duty + custom
  financingPool: number;
}
```

### 6.2 Pricing Modes

```typescript
enum PricingMode {
  MARGIN_GLOBAL = "MARGIN_GLOBAL",      // Target margin % chung
  MARGIN_PER_LINE = "MARGIN_PER_LINE",  // Margin % riêng từng dòng
  MARGIN_OVERRIDE = "MARGIN_OVERRIDE", // Margin $/unit riêng từng dòng
  PRICE_INPUT = "PRICE_INPUT"           // Nhập giá bán trực tiếp
}
```

---

## 7. KẾT LUẬN

### Đã Fix (2026-08-27):
1. ✅ **`pct()` function** - Đã sửa để tự nhận diện format (0-100 hoặc 0-1)
2. ✅ **Bank Fee test data** - Đã sửa `remittanceRatePercent` từ 0.2 (sai) sang 0.002 (0.2% fraction)
3. ✅ **Logistics allocation** - Đã sửa công thức dùng `weight_per_unit / totalWeight`
4. ✅ **Test data format** - `netWeightLbs` đã được chuẩn hóa là weight per unit (không phải total weight)
5. ✅ **Unit test infrastructure** - Đã tạo Jest tests với test data từ Excel CBU-AC0084

### Còn tồn tại (cần review thêm):
1. ⚠️ **Insurance double-counting** - Insurance nằm trong cả logisticsPool và preMargin
2. ⚠️ **Duty base calculation** - Base cho thuế có thể chưa đúng
3. ⚠️ **Financing cost** - Có thể bị tính 2 lần

**Recommendation:** Tests hiện tại pass rồi nhưng vẫn cần verify kỹ với Excel data thực tế. Các bugs còn lại cần thêm investigation để confirm.

---

## 8. FILE REFERENCE

| File | Mô tả |
|------|-------|
| `lib/cbu-engine.ts` | Engine tính CBU (cần fix) |
| `src/app/(dashboard)/rfq/[id]/cbu-calc/page.tsx` | UI page (cần cập nhật) |
| `documents/CBU_docx/CBU_Margin_Input/CBU-AC0084_DDP_VN_MARGIN_INPUT.xlsx` | Excel mẫu (Source of Truth) |
| `documents/CBU_docx/CBU_Margin_Input/CBU-Chu-Thich-Margin-Input.docx` | Documentation |
| `documents/CBU_docx/CBU_DDPPrice_Input/CBU-AC0084_DDP_VN_CLEAN.xlsx` | DDP Price Input template |
