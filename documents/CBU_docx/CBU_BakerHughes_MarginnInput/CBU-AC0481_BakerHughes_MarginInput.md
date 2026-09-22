# CBU — AC0481 Baker Hughes (Malaysia) — MARGIN INPUT MODE

> 2 sheet tính giá song song, cùng cấu trúc: **MA - Payment w Order** (30% đặt cọc) và **MA - Net 60 Days** (thanh toán chậm 60 ngày, có Credit days = 45). Mỗi sheet có 2 khối theo Incoterm: **FCA** (dòng 6–10, ex Louisiana, chưa gồm cước tàu quốc tế) và **DAP** (dòng 13–18, Kemaman/Labuan – Malaysia, đã cộng cước qua Logistic sheet).

**Chú giải nhóm biến (đúng theo nhãn bạn đã gắn sau tên cột trong file):**

| Nhóm | Ý nghĩa |
|---|---|
| 🗄️ **DATABASE** | Dữ liệu lấy sẵn từ database web app (Job No., Customer, Country, Goods origin, Part No., Description, Supplier, Qty, Weight, Material Cost, Inquiry date) |
| 🟦 **INPUT** | Người dùng gõ tay trực tiếp (Credit days, % Margin, Forwarder, Freight, Min fee, Freight thực dùng để báo giá...) |
| 🟧 **DEFAULT** | Tham số/tỷ giá có sẵn giá trị chuẩn, ít đổi nhưng có thể ghi đè (USD→EUR, USD→VND) |
| ⚙️ **COMPUTED** | Công thức tính trong cùng sheet — không sửa tay |

> ⚠️ **File này KHÔNG có Named Ranges** (khác với bản VN Hoàng Sơn) — mọi công thức dùng tham chiếu ô trực tiếp (`N6`, `$N$7`...), và **sheet Guide đang trống** (chưa có từ điển biến số). Markdown dưới đây tự đặt TÊN BIẾN gợi ý trong phần công thức để dễ đọc, nhưng bản thân file Excel vẫn dùng địa chỉ ô thô.

## 1. Sheet "MA - Payment w Order"

### Thông tin đơn hàng — MA - Payment w Order

| Trường | Nhóm | Giá trị |
|---|---|---|
| Job No. | 🟦 INPUT | AC0481-DRT-OTHMY |
| Customer: | 🗄️ DATABASE | Baker Huges |
| COUNTRY: | 🗄️ DATABASE | MY |
| Goods origin | 🗄️ DATABASE | Oversea |
| INQ DATE | 🗄️ DATABASE | 2026-07-15 00:00:00 |
| Credit (days) | 🟦 INPUT |  |
| Incoterm | 🗄️ DATABASE | FCA |
| Mode | | PAYMENT WITH ORDER |
| Incoterm 1 (FCA) | | FCA — LOUSIANA, US |
| Incoterm 2 (DAP) | | DDP — Labuan |
| USD->EUR: | 🟧 DEFAULT | 1.1 |
| USD-->VND | 🟧 DEFAULT | 25500 |

### Khối FCA (ex Louisiana) — MA - Payment w Order, dòng 5–7

| ITEM | Part No. | Description | Supplier | Q'ty | Weight (kg) | Sales Price | Total Revenue | Margin per unit | % Margin | Total Margin | Total Cost | Unit Cost | Material Cost | Financial Cost |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 480131200 | 1R MODEL F STD. SERVICE DRILL PIPE FLOAT VALVE | KEYSTONE | 30 | 0.6624 | 131 | 3,930 | 22.67 | 17.0% | 680 | 3,250 | 108.33 | 105.50 | 2.83 |
|  |  |  |  | **30.00** | **19.87** | **3,930.00** | **3,930.00** | **680.00** | **17.0%** | **680.00** | **3,250.00** | **3,250.00** | **3,165.00** | **85.00** |

**Nhóm biến theo cột:**

| Cột | Tên cột | Nhóm |
|---|---|---|
| A | ITEM | ⚙️ COMPUTED |
| B | Part No. | 🗄️ DATABASE |
| C | Description. | 🗄️ DATABASE |
| D | Supplier | 🗄️ DATABASE |
| E | Q'ty | 🗄️ DATABASE |
| F | Weight (kg) | 🗄️ DATABASE |
| G | Sales Price | ⚙️ COMPUTED |
| H | Total Revenue | ⚙️ COMPUTED |
| I | Margin per unit | ⚙️ COMPUTED |
| J | % Margin | 🟦 INPUT |
| K | Total Margin | ⚙️ COMPUTED |
| L | Total Cost | ⚙️ COMPUTED |
| M | Unit Cost | ⚙️ COMPUTED |
| N | Material Cost | 🗄️ DATABASE |
| O | Financial Cost | ⚙️ COMPUTED |

```
WeightKg      = (43.2 / Qty) × 0.46         # ⚠️ hardcoded 43.2 (lb gốc) và 0.46 (hệ số lb→kg) ngay trong công thức, không phải named range
SalesPrice    = ROUNDUP( UnitCost ÷ (1 − MarginPct) , 0 )
TotalRevenue  = Qty × SalesPrice
MarginPerUnit = SalesPrice − UnitCost
TotalMargin   = Qty × MarginPerUnit
TotalCost     = UnitCost × Qty
UnitCost      = MaterialCost + FinancialCost
FinancialCost = 85 × (MaterialCost ÷ TotalMaterial_FCA)   # ⚠️ 85 = TOTAL BANK FEE hardcode cứng, không link sang sheet Bank Fee!M9
```

### Khối DAP (Kemaman/Labuan, Malaysia) — MA - Payment w Order, dòng 13–18

| ITEM | Part No. | Description | Supplier | Q'ty | Weight (kg) | Sales Price | Total Revenue | Margin per unit | % Margin | Total Margin | Total Cost | Unit Cost | Material Cost | Financial Cost | Freight per Logistic (reference) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 480131200 | 1R MODEL F STD. SERVICE DRILL PIPE FLOAT VALVE | KEYSTONE | 30 | 0.6624 | 131 | 3,930 | 22.67 | 17.0% | 680 | 3,250 | 108.33 | 105.50 | 2.83 | 60.00 |
|  |  |  |  | **30.00** | **19.87** | **3,930.00** | **3,930.00** | **680.00** | **17.0%** | **680.00** | **3,250.00** | **3,250.00** | **3,165.00** | **85.00** | **1,800.00** |

| **G16 — DAP Total Revenue (đã cộng freight)** | **5,730** |
|---|---|

**Nhóm biến theo cột:**

| Cột | Tên cột | Nhóm |
|---|---|---|
| A | ITEM | ⚙️ COMPUTED |
| B | Part No. | 🗄️ DATABASE |
| C | Description. | 🗄️ DATABASE |
| D | Supplier | 🗄️ DATABASE |
| E | Q'ty | 🗄️ DATABASE |
| F | Weight (kg) | 🗄️ DATABASE |
| G | Sales Price | ⚙️ COMPUTED |
| H | Total Revenue | ⚙️ COMPUTED |
| I | Margin per unit | ⚙️ COMPUTED |
| J | % Margin | 🟦 INPUT |
| K | Total Margin | ⚙️ COMPUTED |
| L | Total Cost | ⚙️ COMPUTED |
| M | Unit Cost | ⚙️ COMPUTED |
| N | Material Cost | 🗄️ DATABASE |
| O | Financial Cost | ⚙️ COMPUTED |
| P | Freight per Logistic (reference) | 🟩 LINK |

> `CẢNH BÁO: Freight (Logistic!G2, tính tự động) − Freight thực dùng (P16 nhập tay)` → CHECK G17 = **0.00** (= 0, khớp)

```
SalesPrice(G16) = SalesPriceExFreight(G15) + FreightManual(P16)
FreightPerLogistic(P15, tham khảo) = Logistic!G2 × (WeightKg ÷ TotalWeight_DAP)
```

#### SUMMARY & CHECKS — MA - Payment w Order (dòng 20–32)

| Indicator | Giá trị |
|---|---|
| Incoterm 1 — FCA (ex Louisiana) | 3,930 |
| trong đó Total Cost (USD) | 3,250 |
| Nominal Margin % (bình quân) | 17.30% |
| Incoterm 2 — DAP (Kemaman/Labuan, Malaysia) | 5,730 |
| trong đó giá theo unit price × qty (G15, CHƯA gồm freight) | 3,930 |
| Freight per Logistic sheet (tham khảo, tự động) | 1,800 |
| Freight thực dùng để báo giá (nhập tay, P16) | 1,800 |
| CẢNH BÁO chênh lệch 2 số freight ở trên (nên = 0) | 0.00 |
| Chênh lệch DAP so với FCA | 1,800 |
| CHECK: Unit Cost = Material + Financial Cost (Block FCA, phải = 0) | 0.00 |
| CHECK: Unit Cost = Material + Financial Cost (Block DAP, phải = 0) | 0.00 |
| CHECK: Tổng phí NH phân bổ (Block FCA) = Bank Fee!M9 | 0.00 |

## 2. Sheet "MA - Net 60 Days"

### Thông tin đơn hàng — MA - Net 60 Days

| Trường | Nhóm | Giá trị |
|---|---|---|
| Job No. | 🟦 INPUT | AC0481-DRT-OTHMY |
| Customer: | 🗄️ DATABASE | Baker Huges |
| COUNTRY: | 🗄️ DATABASE | MY |
| Goods origin | 🗄️ DATABASE | Oversea |
| INQ DATE | 🗄️ DATABASE | 2026-07-15 00:00:00 |
| Credit (days) | 🟦 INPUT | 45 |
| Incoterm | 🗄️ DATABASE | FCA |
| Mode | | NET 60 DAYS |
| Incoterm 1 (FCA) | | FCA — LOUSIANA, US |
| Incoterm 2 (DAP) | | DDP — Labuan |
| USD->EUR: | 🟧 DEFAULT | 1.1 |
| USD-->VND | 🟧 DEFAULT | 25500 |

### Khối FCA (ex Louisiana) — MA - Net 60 Days, dòng 5–7

| ITEM | Part No. | Description | Supplier | Q'ty | Weight (kg) | Sales Price | Total Revenue | Margin per unit | % Margin | Total Margin | Total Cost | Unit Cost | Material Cost | Financial Cost |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 480131200 | 1R MODEL F STD. SERVICE DRILL PIPE FLOAT VALVE | KEYSTONE | 30 | 0.6624 | 131 | 3,930 | 22.67 | 17.0% | 680 | 3,250 | 108.33 | 105.50 | 2.83 |
|  |  |  |  | **30.00** | **19.87** | **3,930.00** | **3,930.00** | **680.00** | **17.0%** | **680.00** | **3,250.00** | **3,250.00** | **3,165.00** | **85.00** |

**Nhóm biến theo cột:**

| Cột | Tên cột | Nhóm |
|---|---|---|
| A | ITEM | ⚙️ COMPUTED |
| B | Part No. | 🗄️ DATABASE |
| C | Description. | 🗄️ DATABASE |
| D | Supplier | 🗄️ DATABASE |
| E | Q'ty | 🗄️ DATABASE |
| F | Weight (kg) | 🗄️ DATABASE |
| G | Sales Price | ⚙️ COMPUTED |
| H | Total Revenue | ⚙️ COMPUTED |
| I | Margin per unit | ⚙️ COMPUTED |
| J | % Margin | 🟦 INPUT |
| K | Total Margin | ⚙️ COMPUTED |
| L | Total Cost | ⚙️ COMPUTED |
| M | Unit Cost | ⚙️ COMPUTED |
| N | Material Cost | 🗄️ DATABASE |
| O | Financial Cost | ⚙️ COMPUTED |

```
WeightKg      = (43.2 / Qty) × 0.46         # ⚠️ hardcoded 43.2 (lb gốc) và 0.46 (hệ số lb→kg) ngay trong công thức, không phải named range
SalesPrice    = ROUNDUP( UnitCost ÷ (1 − MarginPct) , 0 )
TotalRevenue  = Qty × SalesPrice
MarginPerUnit = SalesPrice − UnitCost
TotalMargin   = Qty × MarginPerUnit
TotalCost     = UnitCost × Qty
UnitCost      = MaterialCost + FinancialCost
FinancialCost = 85 × (MaterialCost ÷ TotalMaterial_FCA)   # ⚠️ 85 = TOTAL BANK FEE hardcode cứng, không link sang sheet Bank Fee!M9
```

### Khối DAP (Kemaman/Labuan, Malaysia) — MA - Net 60 Days, dòng 13–18

| ITEM | Part No. | Description | Supplier | Q'ty | Weight (kg) | Sales Price | Total Revenue | Margin per unit | % Margin | Total Margin | Total Cost | Unit Cost | Material Cost | Financial Cost | Freight per Logistic (reference) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 480131200 | 1R MODEL F STD. SERVICE DRILL PIPE FLOAT VALVE | KEYSTONE | 30 | 0.6624 | 133 | 3,990 | 22.69 | 17.0% | 680.6562 | 3,309.3438 | 110.31 | 105.50 | 4.81 | 60.00 |
|  |  |  |  | **30.00** | **19.87** | **3,990.00** | **3,990.00** | **680.66** | **17.0%** | **680.66** | **3,309.34** | **3,309.34** | **3,165.00** | **144.34** | **1,800.00** |

| **G16 — DAP Total Revenue (đã cộng freight)** | **5,090** |
|---|---|

**Nhóm biến theo cột:**

| Cột | Tên cột | Nhóm |
|---|---|---|
| A | ITEM | ⚙️ COMPUTED |
| B | Part No. | 🗄️ DATABASE |
| C | Description. | 🗄️ DATABASE |
| D | Supplier | 🗄️ DATABASE |
| E | Q'ty | 🗄️ DATABASE |
| F | Weight (kg) | 🗄️ DATABASE |
| G | Sales Price | ⚙️ COMPUTED |
| H | Total Revenue | ⚙️ COMPUTED |
| I | Margin per unit | ⚙️ COMPUTED |
| J | % Margin | 🟦 INPUT |
| K | Total Margin | ⚙️ COMPUTED |
| L | Total Cost | ⚙️ COMPUTED |
| M | Unit Cost | ⚙️ COMPUTED |
| N | Material Cost | 🗄️ DATABASE |
| O | Financial Cost | ⚙️ COMPUTED |
| P | Freight per Logistic (reference) | 🟩 LINK |

> `CẢNH BÁO: Freight (Logistic!G2, tính tự động) − Freight thực dùng (P16 nhập tay)` → CHECK G17 = **700.00** ⚠️ ≠ 0 (freight tự động Logistic khác freight nhập tay P16)

```
SalesPrice(G16) = SalesPriceExFreight(G15) + FreightManual(P16)
FreightPerLogistic(P15, tham khảo) = Logistic!G2 × (WeightKg ÷ TotalWeight_DAP)

⚠️ LỖI CÔNG THỨC: N15 = SUMPRODUCT($E$6:$E$6, N14:N14)  — đang tham chiếu NHẦM sang khối FCA (E6) thay vì khối DAP (E14). Với 1 dòng hàng duy nhất, kết quả tình cờ vẫn đúng vì E6=E14=30, nhưng khi thêm nhiều dòng hàng khác nhau, TotalMaterial_DAP (N15) sẽ SAI.
```

#### SUMMARY & CHECKS — MA - Net 60 Days (dòng 20–32)

| Indicator | Giá trị |
|---|---|
| Incoterm 1 — FCA (ex Louisiana) | 3,930 |
| trong đó Total Cost (USD) | 3,250 |
| Nominal Margin % (bình quân) | 17.30% |
| Incoterm 2 — DAP (Kemaman/Labuan, Malaysia) | 5,090 |
| trong đó giá theo unit price × qty (G15, CHƯA gồm freight) | 3,990 |
| Freight per Logistic sheet (tham khảo, tự động) | 1,800 |
| Freight thực dùng để báo giá (nhập tay, P16) | 1,100 |
| CẢNH BÁO chênh lệch 2 số freight ở trên (nên = 0) | 700.00 |
| Chênh lệch DAP so với FCA | 1,160 |
| CHECK: Unit Cost = Material + Financial Cost (Block FCA, phải = 0) | 0.00 |
| CHECK: Unit Cost = Material + Financial Cost (Block DAP, phải = 0) | 0.00 |
| CHECK: Tổng phí NH phân bổ (Block FCA) = Bank Fee!M9 | 0.00 |

## 3. Sheet LOGISTIC

| Shipment | Weight (Kg) | From | To | MOT | Forwarder | FREIGHT | Freight/kg | Transit time |
|---|---|---|---|---|---|---|---|---|
| Shipment 1  | 40.00 |  |  |  |  | 1,800.00 | 45.00 |  |
| Shipment 2 |  |  |  |  |  |  |  |  |
| Shipment 3 |  |  |  |  |  |  |  |  |
| Shipment 4 |  |  |  |  |  |  |  |  |
| Total  | 40.00 |  |  |  |  | 1,800.00 | 45.00 |  |

**Nhóm biến theo cột (Logistic):**

| Cột | Tên cột | Nhóm |
|---|---|---|
| A | Shipment | ⚙️ COMPUTED |
| B | Weight (Kg) | 🗄️ DATABASE |
| C | From | 🟦 INPUT |
| D | To | 🟦 INPUT |
| E | MOT | ⚙️ COMPUTED |
| F | Forwarder | 🟦 INPUT |
| G | FREIGHT | 🟦 INPUT |
| H | Freight/kg | ⚙️ COMPUTED |
| I | Transit time | 🟦 INPUT |

```
Freight/kg (H) = FREIGHT (G) ÷ Weight (B)
```

> Chỉ Shipment 1 có dữ liệu (G2 = 1800 USD, B2 = 40 kg); Shipment 2–4 để trống làm mẫu cho các lô sau.

## 4. Sheet BANK FEE (MBBANK)

| No. | Mô tả | Công thức gốc (text) | Min (I) | Rate (K) | Amount (L) | Fee (M) |
|---|---|---|---|---|---|---|
| 1 | International remittance | =( 0.2%* amount transfer)*1.1           | 50.00 | 0.220% | 3,165.00 | 50.00 |
| 2 | International Receive | (0.05%* amount transfer) | 35.00 | 0.005% | 3,930.00 | 35.00 |
|  | **TOTAL FEE** |  |  |  |  | **85.00** |

**Nhóm biến theo cột (Bank Fee):** cột I (Min) = 🟦 INPUT · cột K (Rate) = ⚙️ COMPUTED (hardcode % trong công thức) · cột L (Amount) = 🟩 LINK sang sheet MA · cột M (Fee) = ⚙️ COMPUTED

```
Fee_InternationalRemittance(M6) = IF(Customer.Country="Local", 0, MAX(Rate(K6)×Amount(L6), Min(I6)))
Fee_InternationalReceive(M7)    = IF(Customer.Country="VN", 0, MAX(Rate(K7)×Amount(L7), Min(I7)))
TOTAL FEE (M9) = SUM(M6:M8)
```

> ⚠️ **RỦI RO VÒNG LẶP CÔNG THỨC:** L7 (Amount, International Receive) = `='MA - Payment w Order'!$G$15` — LINK TRỰC TIẾP sang DAP Total Revenue (G15). Nhưng G15 lại phụ thuộc Financial Cost (O14) → phụ thuộc M9 (TOTAL FEE) → phụ thuộc L7 → quay lại G15: đây chính là **vòng lặp doanh thu → phí NH → giá vốn → giá bán → doanh thu** đã phát hiện ở lần audit trước. File gốc hiện KHÔNG bị lỗi vì L7 đang trỏ đến ô mà thực tế đóng vai trò tương tự "nhập tay" — nhưng công thức vẫn là LINK sống, không phải INPUT thật, nên nếu bạn thay đổi cấu trúc dòng hàng có thể sinh lỗi #REF!/circular reference.

Ví dụ minh họa phí chuyển khoản (dòng 15–21, không liên kết vào công thức chính):

- Transfer mẫu (K15): 662 USD
- Bank transfer fee (I18): 1.4564 → làm tròn Min 11 USD (K18): 11
- TOTAL bank fee ví dụ (K21): 11

## 5. Sheet GUIDE

> Sheet này hiện **TRỐNG** (chỉ có kích thước A1:A1, không có nội dung). Khác với bản VN Hoàng Sơn (đã có từ điển biến số đầy đủ), file Baker Hughes này CHƯA có tài liệu hướng dẫn/từ điển biến trong Excel — toàn bộ phần chú giải nhóm biến trong markdown này do tôi tổng hợp trực tiếp từ nhãn bạn gắn sau tên cột.

## 6. Tổng hợp các điểm cần lưu ý (khác biệt / rủi ro so với bản đã audit trước đây)

| # | Vị trí | Vấn đề |
|---|---|---|
| 1 | Toàn bộ workbook | Không có Named Ranges — mọi công thức dùng địa chỉ ô thô (`N6`, `$N$7`...), khác với bản VN Hoàng Sơn đã đặt tên biến. |
| 2 | Cả 2 sheet MA, cột F (Weight kg) | Công thức `=(43.2/Qty)*0.46` — 43.2 (tổng lb gốc) và 0.46 (hệ số lb→kg) đều hardcode cứng trong từng ô, không phải tham số có thể sửa 1 chỗ. |
| 3 | Cả 2 sheet MA, cột O (Financial Cost, khối FCA & DAP) | Số 85 (= TOTAL BANK FEE) hardcode cứng trong công thức thay vì link `='Bank Fee'!$M$9` — nếu Bank Fee đổi, phải tự sửa tay từng ô. |
| 4 | "MA - Net 60 Days"!N15 | `=SUMPRODUCT($E$6:$E$6,N14:N14)` — tham chiếu NHẦM sang khối FCA (E6) thay vì khối DAP (E14). Đang đúng do trùng giá trị (30=30) với 1 dòng hàng; sẽ SAI khi có nhiều dòng khác nhau. |
| 5 | Bank Fee!L7 | LINK trực tiếp `='MA - Payment w Order'!$G$15` (DAP Total Revenue) — tiềm ẩn vòng lặp công thức revenue → bank fee → cost → revenue (xem mục 4). |
| 6 | "MA - Net 60 Days"!O14 | Công thức có thêm chi phí tài chính `N14*(15%*45/360)` hardcode lãi suất 15%/năm và 45 ngày ngay trong công thức (không phải tham số CreditDays/InterestRatePct tách riêng). |
| 7 | Guide sheet | Trống hoàn toàn — chưa có từ điển biến số. |

> Markdown này phản ánh ĐÚNG hiện trạng công thức của file bạn upload — chưa sửa gì. Nếu bạn muốn tôi restructure lại file này (đặt Named Ranges, sửa các lỗi trên, bổ sung Guide) giống bản VN Hoàng Sơn, báo tôi để xử lý.
