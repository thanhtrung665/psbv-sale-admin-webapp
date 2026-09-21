# CBU — DDP VN (Hoàng Sơn) — MARGIN INPUT MODE

> Sheet đích tính giá: **Margin Analysis** (kèm **Logistic**, **Bank Fee** làm nguồn dữ liệu phụ trợ). File này dùng chế độ **NHẬP % MARGIN MỤC TIÊU → HỆ THỐNG TỰ TÍNH DDP PRICE**, có thể ghi đè margin riêng cho từng dòng hàng.

**Chú giải nhóm biến (lấy đúng theo nhãn phân loại bạn đã gắn sau tên cột/tham số trong file):**

| Nhóm | Ý nghĩa |
|---|---|
| 🗄️ **DATABASE** | Dữ liệu lấy sẵn từ database web app (từ các bước xử lý trước đó) — KHÔNG gõ tay lại, chỉ hiển thị/đối chiếu (Part No., Description, Supplier, Qty, Total Weight, Material Cost, Customer, Country, Goods origin, Incoterm, Payment terms, Inquiry date...) |
| 🟦 **INPUT** | Người dùng gõ tay trực tiếp trên bảng tính / form CBU (Job No., %Duty, Margin override, Forwarder, cước phí, Base amount...) |
| 🟧 **DEFAULT** | Tham số/chính sách có sẵn giá trị chuẩn, ít đổi nhưng có thể ghi đè (tỷ giá, target margin, biểu phí ngân hàng...) |
| 🟧 **DEFAULT\*** | Giống DEFAULT nhưng bạn đã đánh dấu "(Bỏ)" trong file — ứng viên cân nhắc loại bỏ khỏi CBU, hiện VẪN CÒN trong công thức (xem mục 9) |
| ⚙️ **COMPUTED** | Công thức tính trong cùng sheet — không sửa tay |
| 🟩 **LINK** | Công thức lấy dữ liệu từ sheet khác — không sửa tay |

## 1. Thông tin đơn hàng

| Trường | Nhóm | Giá trị |
|---|---|---|
| Job No. | 🟦 INPUT | AC0084-PCS-OTHVN |
| Customer | 🗄️ DATABASE | Hoang Son |
| Country | 🗄️ DATABASE | VN |
| Goods origin | 🗄️ DATABASE | Oversea |
| Incoterm | 🗄️ DATABASE | DDP Vung Tau |
| Payment terms | 🗄️ DATABASE | 30% with order, 70% prior shipment |
| Inquiry date | 🗄️ DATABASE | 2026-08-09 |

> Ghi chú màu gốc (ô A11): "chữ XANH DƯƠNG = ô nhập tay · chữ ĐEN = công thức · chữ XANH LÁ = link sang sheet khác"

## 2. Pricing Parameters (E3:G12)

| Tham số | Nhóm | Giá trị | Ghi chú |
|---|---|---|---|
| Exchange rate (quote) USD→VND | 🟧 DEFAULT | 26,500 | Quy DDP USD sang VND |
| Target margin (m) | 🟧 DEFAULT* | 25.00% | Lãi gộp trên giá bán |
| Commission rate (q) | 🟦 INPUT | 3.00% | Tính trên giá bán DDP USD |
| CIT on commission (c) | 🟦 INPUT | 20.00% | Thuế nhà thầu trên hoa hồng |
| % Value financed | 🟧 DEFAULT* | 50.00% | Theo điều khoản 30/70 |
| Interest rate p.a. | 🟧 DEFAULT* | 15.00% | Chi phí vốn |
| Financing days | 🟧 DEFAULT* | 15 | Số ngày tài trợ vốn |
| Days per year | 🟧 DEFAULT | 360 | Cơ sở quy đổi lãi |
| VND rounding step | 🟧 DEFAULT | 10,000 | Giá VND làm tròn LÊN bội số này |
| Conversion factor lb → kg | 🟧 DEFAULT | 0.4536 | Đặt = 1 nếu cột KL đã nhập bằng kg |

**Named Ranges tương ứng:** `ExchangeRate_Quote`(F3) · `TargetMarginPct`(F4) · `CommissionRatePct`(F5) · `CITRatePct`(F6) · `PercentValueFinanced`(F7) · `InterestRatePct`(F8) · `FinancingDays`(F9) · `DaysPerYear`(F10) · `VNDRoundingStep`(F11) · `LbToKgFactor`(F12)

## 3. BLOCK 1 — AIR FREIGHT (dòng 15–31)

| ITEM | Part No. | Description | Supplier | Q'ty | Total Weight (lb) | Weight (kg) | Material Cost | %Duty | Bank fee | Logistics | Duty | Commission | CIT | Unit Cost | DDP Price (USD) | DDP Price (VND) | Total Revenue (VND) | Margin per unit | % Margin | Total Margin | Total Cost | Margin % override | Margin $/unit override |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | A23-170 | (2633) 7 5/8" - 9 5/8" BASIC INSERT | Keystone | 320 | 121.6 | 0.1724 | 4.37 | 0.0% | 0.025 | 0.6712 | 0 | 0.213 | 0.0426 | 5.3218 | 7.10 | 190,000 | 60,800,000 | 1.78 | 25.04% | 569 | 1,703 |  |  |
| 2 | A23-170-B | 7 5/8" - 9 5/8" BEVELED BASIC INSERT (2633-B) | Keystone | 160 | 67.2 | 0.1905 | 4.68 | 0.0% | 0.0268 | 0.7419 | 0 | 0.2292 | 0.0458 | 5.7237 | 7.64 | 210,000 | 33,600,000 | 1.92 | 25.08% | 307 | 916 |  |  |
| 3 | A23-186 | (2649) SD INSERT ''UNDERSIZED'' | Keystone | 320 | 102.4 | 0.1452 | 4.81 | 0.0% | 0.0275 | 0.5652 | 0 | 0.2271 | 0.0454 | 5.6753 | 7.57 | 210,000 | 67,200,000 | 1.89 | 25.03% | 606 | 1,816 |  |  |
| 4 | A23-186-B | (2649B) SD BEVELED INSERT BEVELED | Keystone | 160 | 148 | 0.4196 | 5.19 | 0.0% | 0.0297 | 1.6339 | 0 | 0.288 | 0.0576 | 7.1992 | 9.60 | 260,000 | 41,600,000 | 2.40 | 25.01% | 384 | 1,152 |  |  |
| 5 | A23-172 | (2637) 11 3/4" - 13 3/8" BASIC INSERT | Keystone | 400 | 148 | 0.1678 | 4.37 | 0.0% | 0.025 | 0.6536 | 0 | 0.2124 | 0.0425 | 5.3034 | 7.08 | 190,000 | 76,000,000 | 1.78 | 25.09% | 711 | 2,121 |  |  |
| 6 | A23-172-B | (2637B) 11-3/4" x 11-3/4" SD BEVELED INSERT | Keystone | 200 | 185 | 0.4196 | 4.68 | 0.0% | 0.0268 | 1.6339 | 0 | 0.2667 | 0.0533 | 6.6607 | 8.89 | 240,000 | 48,000,000 | 2.23 | 25.08% | 446 | 1,332 |  |  |
| 7 | A23-171 | (2640) 9 5/8" X 8 5/8" SD INSERT | Keystone | 400 | 304 | 0.3447 | 4.37 | 0.0% | 0.025 | 1.3425 | 0 | 0.2412 | 0.0482 | 6.0269 | 8.04 | 220,000 | 88,000,000 | 2.01 | 25.04% | 805 | 2,411 |  |  |
| 8 | A23-171-B | (2640) 9 5/8" X 8 5/8" SD BEVELED REDUCING INSERT | Keystone | 200 | 150 | 0.3402 | 4.68 | 0.0% | 0.0268 | 1.3248 | 0 | 0.2535 | 0.0507 | 6.3358 | 8.45 | 230,000 | 46,000,000 | 2.11 | 25.02% | 423 | 1,267 |  |  |
| 9 | A23-173 | (2636) 14" X 13 3/8" SD INSERT | Keystone | 400 | 248 | 0.2812 | 4.55 | 0.0% | 0.026 | 1.0952 | 0 | 0.2385 | 0.0477 | 5.9574 | 7.95 | 220,000 | 88,000,000 | 1.99 | 25.06% | 797 | 2,383 |  |  |
| 10 | A23-173-B | (2636) 14" X 13 3/8" SD BEVELED INSERT | Keystone | 200 | 128 | 0.2903 | 4.73 | 0.0% | 0.0271 | 1.1305 | 0 | 0.2475 | 0.0495 | 6.1845 | 8.25 | 220,000 | 44,000,000 | 2.07 | 25.04% | 413 | 1,237 |  |  |
| 11 | A23-180 | (2653) 14" X 13 5/8" SD INSERT | Keystone | 400 | 212 | 0.2404 | 4.87 | 0.0% | 0.0279 | 0.9362 | 0 | 0.2454 | 0.0491 | 6.1285 | 8.18 | 220,000 | 88,000,000 | 2.05 | 25.08% | 821 | 2,451 |  |  |
| 12 | A23-180-B | (2653) 14" X 13 5/8" BEVELED SD INSERT | Keystone | 200 | 102 | 0.2313 | 6.46 | 0.0% | 0.0369 | 0.9009 | 0 | 0.3111 | 0.0622 | 7.7711 | 10.37 | 280,000 | 56,000,000 | 2.60 | 25.06% | 520 | 1,554 |  |  |
| 13 | A23-169 | (2623) 7 5/8" X 7" SD INSERT | Keystone | 240 | 153.6 | 0.2903 | 4.87 | 0.0% | 0.0279 | 1.1305 | 0 | 0.2535 | 0.0507 | 6.3325 | 8.45 | 230,000 | 55,200,000 | 2.12 | 25.06% | 508 | 1,520 |  |  |
| 14 | A23-169-B | (2623-B) 7 5/8" X 7" SD INSERT | Keystone | 120 | 76.8 | 0.2903 | 5.01 | 0.0% | 0.0287 | 1.1305 | 0 | 0.2595 | 0.0519 | 6.4805 | 8.65 | 230,000 | 27,600,000 | 2.17 | 25.08% | 260 | 778 |  |  |
| 15 | A23-170 | (2633) 7 5/8" - 9 5/8" BASIC INSERT | Keystone | 240 | 76 | 0.1436 | 4.37 | 0.0% | 0.025 | 0.5594 | 0 | 0.2082 | 0.0416 | 5.2042 | 6.94 | 190,000 | 45,600,000 | 1.74 | 25.01% | 417 | 1,249 |  |  |
| 16 | A23-170-B | 7 5/8" - 9 5/8" BEVELED BASIC INSERT (2633-B) | Keystone | 120 | 50.4 | 0.1905 | 4.68 | 0.0% | 0.0268 | 0.7419 | 0 | 0.2292 | 0.0458 | 5.7237 | 7.64 | 210,000 | 25,200,000 | 1.92 | 25.08% | 230 | 687 |  |  |
| **TOTAL** |  |  |  | **4080** | **2273** | **1031.0328** | **19,271.20** |  | **110.2225** | **4015** | **0** | **983.796** | **196.7592** | **24576.9777** | **32,793.20** |  | **890,800,000** |  | **25.05%** | **8,216** | **24,577** |  |  |

**Nhóm biến theo cột:**

| Cột | Tên cột | Nhóm |
|---|---|---|
| A | ITEM | 🟦 INPUT |
| B | Part No. | 🗄️ DATABASE |
| C | Description | 🗄️ DATABASE |
| D | Supplier | 🗄️ DATABASE |
| E | Q'ty | 🗄️ DATABASE |
| F | Total Weight (lb) | 🗄️ DATABASE |
| G | Weight (kg) | 🗄️ DATABASE |
| H | Material Cost | 🗄️ DATABASE |
| I | %Duty | 🟦 INPUT |
| J | Bank fee | ⚙️ COMPUTED |
| K | Logistics | ⚙️ COMPUTED |
| L | Duty | ⚙️ COMPUTED |
| M | Commission | ⚙️ COMPUTED |
| N | CIT | ⚙️ COMPUTED |
| O | Unit Cost | ⚙️ COMPUTED |
| P | DDP Price (USD) | ⚙️ COMPUTED |
| Q | DDP Price (VND) | ⚙️ COMPUTED |
| R | Total Revenue (VND) | ⚙️ COMPUTED |
| S | Margin per unit | ⚙️ COMPUTED |
| T | % Margin | ⚙️ COMPUTED |
| U | Total Margin | ⚙️ COMPUTED |
| V | Total Cost | ⚙️ COMPUTED |
| W | Margin % override | 🟦 INPUT (tuỳ chọn) |
| X | Margin $/unit override | 🟦 INPUT (tuỳ chọn) |

> Lưu ý: cột **G (Weight kg)** tuy nhãn ghi "(Database)" nhưng thực chất là **⚙️ CÔNG THỨC** `=TotalWeightLb ÷ Qty × LbToKgFactor` tính tự động từ 2 cột DATABASE thật (E, F) — không phải giá trị lấy thẳng từ database.

> Ghi chú override (ô A32): "Cách chọn margin cho mỗi dòng: để trống cả 2 cột → dùng Target margin (F5) chung cho cả đơn. Điền 'Margin % override' → dùng % margin riêng cho dòng đó. Điền 'Margin $/unit override' (>0) → ưu tiên cao nhất, DDP Price tính ra đúng bằng Unit Cost + số tiền lãi USD đã nhập."

## 4. BLOCK 2 — SEA FREIGHT (dòng 36–52)

| ITEM | Part No. | Description | Supplier | Q'ty | Total Weight (lb) | Weight (kg) | Material Cost | %Duty | Bank fee | Logistics | Duty | Commission | CIT | Unit Cost | DDP Price (USD) | DDP Price (VND) | Total Revenue (VND) | Margin per unit | % Margin | Total Margin | Total Cost | Margin % override | Margin $/unit override |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | A23-170 | (2633) 7 5/8" - 9 5/8" BASIC INSERT | Keystone | 320 | 121.6 | 0.1724 | 4.37 | 0.0% | 0.025 | 0.178 | 0 | 0.1923 | 0.0385 | 4.8038 | 6.41 | 170,000 | 54,400,000 | 1.61 | 25.06% | 514 | 1,537 |  |  |
| 2 | A23-170-B | 7 5/8" - 9 5/8" BEVELED BASIC INSERT (2633-B) | Keystone | 160 | 67.2 | 0.1905 | 4.68 | 0.0% | 0.0268 | 0.1968 | 0 | 0.2061 | 0.0412 | 5.1509 | 6.87 | 190,000 | 30,400,000 | 1.72 | 25.02% | 275 | 824 |  |  |
| 3 | A23-186 | (2649) SD INSERT ''UNDERSIZED'' | Keystone | 320 | 102.4 | 0.1452 | 4.81 | 0.0% | 0.0275 | 0.1499 | 0 | 0.2097 | 0.0419 | 5.2391 | 6.99 | 190,000 | 60,800,000 | 1.75 | 25.05% | 560 | 1,677 |  |  |
| 4 | A23-186-B | (2649B) SD BEVELED INSERT BEVELED | Keystone | 160 | 148 | 0.4196 | 5.19 | 0.0% | 0.0297 | 0.4334 | 0 | 0.2376 | 0.0475 | 5.9382 | 7.92 | 210,000 | 33,600,000 | 1.98 | 25.02% | 317 | 950 |  |  |
| 5 | A23-172 | (2637) 11 3/4" - 13 3/8" BASIC INSERT | Keystone | 400 | 148 | 0.1678 | 4.37 | 0.0% | 0.025 | 0.1734 | 0 | 0.192 | 0.0384 | 4.7988 | 6.40 | 170,000 | 68,000,000 | 1.60 | 25.02% | 640 | 1,920 |  |  |
| 6 | A23-172-B | (2637B) 11-3/4" x 11-3/4" SD BEVELED INSERT | Keystone | 200 | 185 | 0.4196 | 4.68 | 0.0% | 0.0268 | 0.4334 | 0 | 0.216 | 0.0432 | 5.3994 | 7.20 | 200,000 | 40,000,000 | 1.80 | 25.01% | 360 | 1,080 |  |  |
| 7 | A23-171 | (2640) 9 5/8" X 8 5/8" SD INSERT | Keystone | 400 | 304 | 0.3447 | 4.37 | 0.0% | 0.025 | 0.3561 | 0 | 0.1998 | 0.04 | 4.9908 | 6.66 | 180,000 | 72,000,000 | 1.67 | 25.06% | 668 | 1,996 |  |  |
| 8 | A23-171-B | (2640) 9 5/8" X 8 5/8" SD BEVELED REDUCING INSERT | Keystone | 200 | 150 | 0.3402 | 4.68 | 0.0% | 0.0268 | 0.3514 | 0 | 0.2127 | 0.0425 | 5.3134 | 7.09 | 190,000 | 38,000,000 | 1.78 | 25.06% | 355 | 1,063 |  |  |
| 9 | A23-173 | (2636) 14" X 13 3/8" SD INSERT | Keystone | 400 | 248 | 0.2812 | 4.55 | 0.0% | 0.026 | 0.2905 | 0 | 0.2046 | 0.0409 | 5.112 | 6.82 | 190,000 | 76,000,000 | 1.71 | 25.04% | 683 | 2,045 |  |  |
| 10 | A23-173-B | (2636) 14" X 13 3/8" SD BEVELED INSERT | Keystone | 200 | 128 | 0.2903 | 4.73 | 0.0% | 0.0271 | 0.2999 | 0 | 0.2127 | 0.0425 | 5.3122 | 7.09 | 190,000 | 38,000,000 | 1.78 | 25.08% | 356 | 1,062 |  |  |
| 11 | A23-180 | (2653) 14" X 13 5/8" SD INSERT | Keystone | 400 | 212 | 0.2404 | 4.87 | 0.0% | 0.0279 | 0.2483 | 0 | 0.2163 | 0.0433 | 5.4057 | 7.21 | 200,000 | 80,000,000 | 1.80 | 25.02% | 722 | 2,162 |  |  |
| 12 | A23-180-B | (2653) 14" X 13 5/8" BEVELED SD INSERT | Keystone | 200 | 102 | 0.2313 | 6.46 | 0.0% | 0.0369 | 0.239 | 0 | 0.2832 | 0.0566 | 7.0757 | 9.44 | 260,000 | 52,000,000 | 2.36 | 25.05% | 473 | 1,415 |  |  |
| 13 | A23-169 | (2623) 7 5/8" X 7" SD INSERT | Keystone | 240 | 153.6 | 0.2903 | 4.87 | 0.0% | 0.0279 | 0.2999 | 0 | 0.2184 | 0.0437 | 5.4598 | 7.28 | 200,000 | 48,000,000 | 1.82 | 25.00% | 437 | 1,310 |  |  |
| 14 | A23-169-B | (2623-B) 7 5/8" X 7" SD INSERT | Keystone | 120 | 76.8 | 0.2903 | 5.01 | 0.0% | 0.0287 | 0.2999 | 0 | 0.2244 | 0.0449 | 5.6078 | 7.48 | 200,000 | 24,000,000 | 1.87 | 25.03% | 225 | 673 |  |  |
| 15 | A23-170 | (2633) 7 5/8" - 9 5/8" BASIC INSERT | Keystone | 240 | 76 | 0.1436 | 4.37 | 0.0% | 0.025 | 0.1484 | 0 | 0.1911 | 0.0382 | 4.7727 | 6.37 | 170,000 | 40,800,000 | 1.60 | 25.08% | 383 | 1,145 |  |  |
| 16 | A23-170-B | 7 5/8" - 9 5/8" BEVELED BASIC INSERT (2633-B) | Keystone | 120 | 50.4 | 0.1905 | 4.68 | 0.0% | 0.0268 | 0.1968 | 0 | 0.2061 | 0.0412 | 5.1509 | 6.87 | 190,000 | 22,800,000 | 1.72 | 25.02% | 206 | 618 |  |  |
| **TOTAL** |  |  |  | **4080** | **2273** | **1031.0328** | **19,271.20** |  | **110.2225** | **1065** | **0** | **859.572** | **171.9144** | **21477.9089** | **28,652.40** |  | **778,800,000** |  | **25.04%** | **7,174** | **21,478** |  |  |

**Nhóm biến theo cột:**

| Cột | Tên cột | Nhóm |
|---|---|---|
| A | ITEM | 🟦 INPUT |
| B | Part No. | 🗄️ DATABASE |
| C | Description | 🗄️ DATABASE |
| D | Supplier | 🗄️ DATABASE |
| E | Q'ty | 🗄️ DATABASE |
| F | Total Weight (lb) | 🗄️ DATABASE |
| G | Weight (kg) | 🗄️ DATABASE |
| H | Material Cost | 🗄️ DATABASE |
| I | %Duty | 🟦 INPUT |
| J | Bank fee | ⚙️ COMPUTED |
| K | Logistics | ⚙️ COMPUTED |
| L | Duty | ⚙️ COMPUTED |
| M | Commission | ⚙️ COMPUTED |
| N | CIT | ⚙️ COMPUTED |
| O | Unit Cost | ⚙️ COMPUTED |
| P | DDP Price (USD) | ⚙️ COMPUTED |
| Q | DDP Price (VND) | ⚙️ COMPUTED |
| R | Total Revenue (VND) | ⚙️ COMPUTED |
| S | Margin per unit | ⚙️ COMPUTED |
| T | % Margin | ⚙️ COMPUTED |
| U | Total Margin | ⚙️ COMPUTED |
| V | Total Cost | ⚙️ COMPUTED |
| W | Margin % override | 🟦 INPUT (tuỳ chọn) |
| X | Margin $/unit override | 🟦 INPUT (tuỳ chọn) |

### Công thức dùng chung cho mỗi dòng hàng (AIR & SEA, thay `Air`→`Sea` cho khối SEA)

```
WeightKg        = TotalWeightLb ÷ Qty × LbToKgFactor
BankFee         = MaterialCost × PercentValueFinanced × (InterestRatePct × FinancingDays ÷ DaysPerYear)
                  + TotalBankFee × (MaterialCost ÷ AirTotalMaterial)
Logistics       = AirLogisticsPool × (WeightKg ÷ AirTotalWeight)
Duty            = (MaterialCost + Logistics) × DutyPct
Commission      = CommissionRatePct × DDPPriceUsd
CIT             = CITRatePct × Commission
UnitCost        = MaterialCost + BankFee + Logistics + Duty + Commission + CIT

# DDP Price (ưu tiên theo thứ tự):
IF MarginUsdOverride > 0:
    DDPPriceUsd = ROUNDUP( (MaterialCost+BankFee+Logistics+Duty+MarginUsdOverride)
                            ÷ (1 − CommissionRatePct×(1+CITRatePct)) , 2 )
ELSE:
    MarginPct   = MarginPctOverride  (nếu có nhập)  HOẶC  TargetMarginPct  (mặc định)
    DDPPriceUsd = ROUNDUP( (MaterialCost+BankFee+Logistics+Duty)
                            ÷ (1 − MarginPct − CommissionRatePct×(1+CITRatePct)) , 2 )

DDPPriceVnd     = ROUNDUP( DDPPriceUsd × ExchangeRate_Quote ÷ VNDRoundingStep , 0 ) × VNDRoundingStep
TotalRevenueVnd = Qty × DDPPriceVnd
MarginPerUnit   = DDPPriceUsd − UnitCost
MarginPctActual = MarginPerUnit ÷ DDPPriceUsd
TotalMargin     = Qty × MarginPerUnit
TotalCost       = Qty × UnitCost
```

**TOTAL row (dòng 31 / 52):**
```
AirTotalWeight (G31)   = SUMPRODUCT(Qty, WeightKg)      trên toàn khối AIR
AirTotalMaterial (H31) = SUMPRODUCT(Qty, MaterialCost)  trên toàn khối AIR
... (tương tự cho các cột J,K,L,M,N,O,P — đều là SUMPRODUCT(Qty, cột))
TotalRevenueVnd (R31)  = SUM(R15:R30)
Nominal Margin% (T31)  = TotalMargin(U31) ÷ TotalRevenueUsd(P31)
```

## 5. SUMMARY & CHECKS (dòng 55–65)

| Indicator | AIR | SEA |
|---|---|---|
| Total Revenue (VND) | 890,800,000 | 778,800,000 |
| Revenue in USD @ quote rate | 33,615 | 29,389 |
| Total Cost (USD) | 24,577 | 21,478 |
| Nominal Margin % (on DDP USD) | 25.05% | 25.04% |
| Total Logistics allocated (USD) | 4,015 | 1,065 |
| Total Bank fee & Financial cost (USD) | 110.22 | 110.22 |
| CHECK: Unit Cost = H+J+K+L+M+N (phải = 0) | 0.00 | 0.00 |
| CHECK: Bank fee allocated = Bank Fee!H8 (phải = 0) | 0.00 | 0.00 |
| Revenue difference AIR - SEA (VND) | 112,000,000 |  |

> Hai dòng CHECK phải luôn = 0 (sai số làm tròn cho phép 10⁻⁶). Nếu khác 0 nghĩa là công thức bị lệch.

## 6. Sheet LOGISTIC — pool cước vận chuyển & bảo hiểm

| Shipment | Weight (kg) | From | To | MOT | Forwarder | Fixed charge (USD) | Rate (USD/kg) | Chargeable weight (kg) | FREIGHT (USD) | Clearance (USD) | Inland (USD) | Total Logistic (USD) | USD/kg | Goods value (USD) | % Insured value | Insurance rate | Min insurance (USD) | Insurance (USD) | Total Logistic + Insurance |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Shipment 1 | 1,031.03 | US | VN | AIR FREIGHT | OTHERS | 500.00 | 2.50 | 1,300.00 | 3,750.00 | 150.00 | 100.00 | 4,000.00 | 3.88 | 19,271.20 | 110% | 0.0100% | 15.00 | 15.00 | 4,015.00 |
| Shipment 2 | 1,031.03 | US | VN | SEA FREIGHT | OTHERS | 800.00 | 0.00 | 0.00 | 800.00 | 150.00 | 100.00 | 1,050.00 | 1.02 | 19,271.20 | 110% | 0.0100% | 15.00 | 15.00 | 1,065.00 |

**Nhóm biến theo cột (Logistic):**

| Cột | Tên cột | Nhóm |
|---|---|---|
| A | Shipment | ⚙️ COMPUTED |
| B | Weight (kg) | 🗄️ DATABASE |
| C | From | 🟦 INPUT |
| D | To | 🟦 INPUT |
| E | MOT | ⚙️ COMPUTED |
| F | Forwarder | 🟦 INPUT |
| G | Fixed charge (USD) | 🟦 INPUT |
| H | Rate (USD/kg) | 🟦 INPUT |
| I | Chargeable weight (kg) | 🟦 INPUT |
| J | FREIGHT (USD) | ⚙️ COMPUTED |
| K | Clearance (USD) | 🟦 INPUT |
| L | Inland (USD) | 🟦 INPUT |
| M | Total Logistic (USD) | ⚙️ COMPUTED |
| N | USD/kg | ⚙️ COMPUTED |
| O | Goods value (USD) | 🟦 INPUT |
| P | % Insured value | 🟦 INPUT |
| Q | Insurance rate | 🟦 INPUT |
| R | Min insurance (USD) | 🟦 INPUT |
| S | Insurance (USD) | 🟦 INPUT |
| T | Total Logistic + Insurance | ⚙️ COMPUTED |

> Lưu ý: cột B (Weight, kg) và O (Goods value) tuy được gắn nhãn nhưng thực chất là **LINK công thức** sang Margin Analysis (`='Margin Analysis'!$G$31`, `='Margin Analysis'!$H$31`...) — không phải ô nhập tay hay ô database trực tiếp, giá trị gốc của chúng bắt nguồn từ dữ liệu DATABASE (Qty, Weight, Material Cost) đã nhập ở sheet Margin Analysis.

**Named Ranges:** `AirLogisticsPool = Logistic!M5+Logistic!R5` · `SeaLogisticsPool = Logistic!M6+Logistic!R6`

```
FREIGHT (J)  = Fixed charge (G) + Rate (H) × Chargeable weight (I)
Total Logistic (M) = FREIGHT + Clearance + Inland
Insurance (S) = MAX( (Goods value + FREIGHT) × %Insured value × Insurance rate , Min insurance )
Pool (T)      = Total Logistic (M) + Insurance (S)
```

Ghi chú gốc trong sheet:
- Ghi chú:
- • Cột B (Weight) và cột O (Goods value) tự lấy từ sheet Margin Analysis — không sửa tay.
- • Cột I "Chargeable weight" là trọng lượng quy đổi thể tích do forwarder báo (air: 1.300 kg). Nhập tay.
- • Cước SEA nhập trọn gói ở cột G (Fixed charge), để Rate H = 0 và Chargeable weight I = 0.
- • Insurance = MAX((Goods value + FREIGHT) × 110% × 0,01% ; Min 15 USD).
- • Cột T (Total Logistic + Insurance) là pool mà sheet Margin Analysis phân bổ cho từng dòng theo trọng lượng.

## 7. Sheet BANK FEE

| No. | Description | Rate | VAT factor | Min fee (USD) | Base amount (USD) | Condition(Điều kiẹn) | Fee (USD) |
|---|---|---|---|---|---|---|---|
| 1.00 | International remittance (pay supplier) | 0.200% | 1.10 | 50.00 | 19,271.20 | Applies only when Goods origin ≠ "Local" | 50.00 |
| 2.00 | International receive (from customer) | 0.050% | 1.00 | 5.00 | 0.00 | Applies only when Country ≠ "VN" | 0.00 |
| 3.00 | Other bank charges |  |  |  |  |  | 0.00 |
|  | **TOTAL BANK FEE** |  |  |  |  |  | **50.00** |

**Nhóm biến theo cột (Bank Fee):**

| Cột | Tên cột | Nhóm |
|---|---|---|
| A | No. | ⚙️ COMPUTED |
| B | Description | 🟦 INPUT |
| C | Rate | 🟦 INPUT |
| D | VAT factor | 🟦 INPUT |
| E | Min fee (USD) | 🟦 INPUT |
| F | Base amount (USD) | ⚙️ COMPUTED |
| G | Condition(Điều kiẹn) | ⚙️ COMPUTED |
| H | Fee (USD) | ⚙️ COMPUTED |

> Lưu ý: cột F (Base amount) tuy nhãn ghi "(Tính)" nhưng có 2 trường hợp khác nhau: F5 (International remittance) = **LINK** `=AirTotalMaterial` (lấy tự động từ Margin Analysis); F6 (International receive) = **INPUT** nhập tay giá trị hợp đồng USD (để tránh vòng lặp công thức).

```
Fee(International remittance) = IF(OrderGoodsOrigin="Local", 0, MAX(Rate×VATfactor×BaseAmount, MinFee))
Fee(International receive)    = IF(OrderCountry="VN", 0, MAX(Rate×VATfactor×BaseAmount, MinFee))
TotalBankFee = SUM(3 dòng phí)
```

Ghi chú gốc trong sheet:
- Ghi chú:
- • Tỷ lệ 0,200% × hệ số VAT 1,1 = 0,220% — đúng công thức MBBank (0,2% phí + 10% VAT).
- • Base amount của International remittance = Total Material Cost (số tiền thực trả nhà cung cấp), lấy tự động từ Margin Analysis.
- • Base amount của International receive (F6) phải NHẬP TAY giá trị hợp đồng USD, không link tự động để tránh vòng lặp công thức (revenue → bank fee → unit cost → revenue).
- • File gốc ghi nhãn 0,05% nhưng công thức là 0,005%. Bản này dùng 0,05% — vui lòng xác nhận lại biểu phí với ngân hàng.
- • Ô H8 (TOTAL BANK FEE) được sheet Margin Analysis phân bổ cho từng dòng theo tỷ trọng Material Cost.

## 8. Từ điển biến số đầy đủ (Guide sheet)

| Sheet | Tên biến | Nhãn trên bảng | Nhóm | Diễn giải / công thức |
|---|---|---|---|---|
| Margin Analysis | (văn bản, không có tên biến) | Job No., Customer, Incoterm, Payment terms, Inquiry date | INPUT | Thông tin mô tả đơn hàng, không dùng trong bất kỳ công thức tính giá nào. |
| Margin Analysis | OrderCountry | Country | INPUT | Quốc gia nhận hàng. Nếu OrderCountry = "VN" thì Phí nhận ngoại tệ (Bank Fee) tự động bằng 0. |
| Margin Analysis | OrderGoodsOrigin | Goods origin | INPUT | Nguồn gốc hàng: "Local" hoặc "Oversea". Nếu OrderGoodsOrigin = "Local" thì Phí chuyển tiền quốc tế (Bank Fee) tự động bằng 0. |
| Margin Analysis | ExchangeRate_Quote | Exchange rate (quote) | DEFAULT | Tỷ giá USD → VND dùng để quy DDP Price (USD) sang DDP Price (VND) trên báo giá. |
| Margin Analysis | TargetMarginPct | Target margin (m) | DEFAULT | Margin mục tiêu MẶC ĐỊNH áp dụng cho cả đơn hàng, dùng khi một dòng hàng không có Margin % Override và không có Margin $/unit Override. |
| Margin Analysis | CommissionRatePct | Commission rate (q) | DEFAULT | Tỷ lệ hoa hồng, tính trên DDP Price (giá bán), không phải trên giá vốn. |
| Margin Analysis | CITRatePct | CIT on commission (c) | DEFAULT | Thuế nhà thầu, tính trên SỐ TIỀN HOA HỒNG (không phải trên giá vốn hay doanh thu). |
| Margin Analysis | PercentValueFinanced | % Value financed | DEFAULT | Tỷ lệ giá trị lô hàng bị đọng vốn, suy từ điều khoản thanh toán. |
| Margin Analysis | InterestRatePct | Interest rate p.a. | DEFAULT | Lãi suất vay vốn theo năm, dùng để tính chi phí tài chính (Financing Cost). |
| Margin Analysis | FinancingDays | Financing days | DEFAULT | Số ngày vốn bị đọng, tính từ lúc trả tiền nhà cung cấp đến lúc thu tiền khách. |
| Margin Analysis | DaysPerYear | Days per year | DEFAULT | Cơ sở quy đổi lãi suất năm sang ngày. Ngân hàng thường dùng 360. |
| Margin Analysis | VNDRoundingStep | VND rounding step | DEFAULT | DDP Price (VND) được làm tròn LÊN bội số của giá trị này. |
| Margin Analysis | LbToKgFactor | Conversion factor lb → kg | DEFAULT | Hệ số quy đổi pound sang kilogram. Đặt = 1 nếu Total Weight đã nhập sẵn bằng kg. |
| Margin Analysis | Qty (cột E) | Q'ty | INPUT | Số lượng đặt hàng của dòng này. |
| Margin Analysis | TotalWeightLb (cột F) | Total Weight (lb) | INPUT | Tổng trọng lượng CẢ DÒNG (đã nhân số lượng), đơn vị pound. |
| Margin Analysis | MaterialCost (cột H) | Material Cost | INPUT | Giá mua từ nhà cung cấp, USD cho MỖI ĐƠN VỊ. |
| Margin Analysis | DutyPct (cột I) | %Duty | INPUT | Thuế suất nhập khẩu theo mã HS của mặt hàng. |
| Margin Analysis | MarginPctOverride (cột W) | Margin % override | INPUT (tuỳ chọn) | Để trống = dùng TargetMarginPct chung. Điền số = dòng này dùng % margin riêng. |
| Margin Analysis | MarginUsdOverride (cột X) | Margin $/unit override | INPUT (tuỳ chọn) | Để trống hoặc 0 = không dùng. Điền số > 0 = ưu tiên cao nhất, DDP Price tính ra đúng Unit Cost + số tiền này. |
| Margin Analysis | WeightKg (cột G) | Weight (kg) | COMPUTED | WeightKg = TotalWeightLb ÷ Qty × LbToKgFactor<br><br>Trọng lượng MỖI ĐƠN VỊ, quy sang kg. Là mẫu số để chia chi phí Logistics và Insurance. |
| Margin Analysis | BankFee (cột J) | Bank fee | COMPUTED | BankFee = MaterialCost × PercentValueFinanced × (InterestRatePct × FinancingDays ÷ DaysPerYear) + TotalBankFee × (MaterialCost dòng này ÷ AirTotalMaterial hoặc SeaTotalMaterial)<br><br>Gồm 2 phần: (a) chi phí vốn do vốn bị đọng; (b) phí ngân hàng phân bổ theo tỷ trọng Material Cost. |
| Margin Analysis | Logistics (cột K) | Logistics | COMPUTED | Logistics = AirLogisticsPool (hoặc SeaLogisticsPool) × (WeightKg dòng này ÷ AirTotalWeight hoặc SeaTotalWeight)<br><br>Chi phí vận chuyển + bảo hiểm của cả shipment, phân bổ theo tỷ trọng trọng lượng. |
| Margin Analysis | Duty (cột L) | Duty | COMPUTED | Duty = (MaterialCost + Logistics) × DutyPct<br><br>Cơ sở tính thuế nhập khẩu là trị giá CIF (gồm cả cước), không chỉ giá hàng. |
| Margin Analysis | Commission (cột M) | Commission | COMPUTED | Commission = CommissionRatePct × DDPPriceUsd<br><br>Tính SAU khi có DDP Price, không phải tính trên giá vốn. |
| Margin Analysis | CIT (cột N) | CIT | COMPUTED | CIT = CITRatePct × Commission<br><br>Là % của SỐ TIỀN HOA HỒNG, không phải % của giá vốn. |
| Margin Analysis | UnitCost (cột O) | Unit Cost | COMPUTED | UnitCost = MaterialCost + BankFee + Logistics + Duty + Commission + CIT<br><br>Giá vốn đầy đủ mỗi đơn vị. |
| Margin Analysis | DDPPriceUsd (cột P) | DDP Price (USD) | COMPUTED | Nếu MarginUsdOverride > 0:<br>  DDPPriceUsd = ROUNDUP( (MaterialCost+BankFee+Logistics+Duty+MarginUsdOverride) ÷ (1 − CommissionRatePct×(1+CITRatePct)) , 2 )<br>Ngược lại (dùng % margin — riêng dòng hoặc TargetMarginPct chung):<br>  DDPPriceUsd = ROUNDUP( (MaterialCost+BankFee+Logistics+Duty) ÷ (1 − MarginPct − CommissionRatePct×(1+CITRatePct)) , 2 )<br>Đây là ô quan trọng nhất — giá bán cuối cùng cho khách, USD mỗi đơn vị. |
| Margin Analysis | DDPPriceVnd (cột Q) | DDP Price (VND) | COMPUTED | DDPPriceVnd = ROUNDUP( DDPPriceUsd × ExchangeRate_Quote ÷ VNDRoundingStep , 0 ) × VNDRoundingStep<br><br>Làm tròn LÊN bội số VNDRoundingStep. |
| Margin Analysis | TotalRevenueVnd (cột R) | Total Revenue (VND) | COMPUTED | TotalRevenueVnd = Qty × DDPPriceVnd |
| Margin Analysis | MarginPerUnit (cột S) | Margin per unit | COMPUTED | MarginPerUnit = DDPPriceUsd − UnitCost<br><br>LUÔN LÀ KẾT QUẢ, không phải nơi nhập. |
| Margin Analysis | MarginPctActual (cột T) | % Margin | COMPUTED | MarginPctActual = MarginPerUnit ÷ DDPPriceUsd<br><br>Luôn ≥ margin mục tiêu một chút, do DDPPriceUsd làm tròn lên. |
| Margin Analysis | TotalMargin (cột U) | Total Margin | COMPUTED | TotalMargin = Qty × MarginPerUnit |
| Margin Analysis | TotalCost (cột V) | Total Cost | COMPUTED | TotalCost = Qty × UnitCost |
| Margin Analysis | AirTotalWeight | TOTAL (cột G, khối AIR) | COMPUTED | AirTotalWeight = Σ (Qty × WeightKg) của toàn bộ khối AIR. |
| Margin Analysis | AirTotalMaterial | TOTAL (cột H, khối AIR) | COMPUTED | AirTotalMaterial = Σ (Qty × MaterialCost) của toàn bộ khối AIR. |
| Margin Analysis | SeaTotalWeight | TOTAL (cột G, khối SEA) | COMPUTED | SeaTotalWeight = Σ (Qty × WeightKg) của toàn bộ khối SEA. |
| Margin Analysis | SeaTotalMaterial | TOTAL (cột H, khối SEA) | COMPUTED | SeaTotalMaterial = Σ (Qty × MaterialCost) của toàn bộ khối SEA. |
| Logistic | (không đặt tên riêng) | Weight (kg) | LINK | Lấy từ AirTotalWeight hoặc SeaTotalWeight bên Margin Analysis. |
| Logistic | (không đặt tên riêng) | Fixed charge, Rate, Chargeable weight | INPUT | Thông số cước do forwarder báo. |
| Logistic | (không đặt tên riêng) | Clearance, Inland | INPUT | Chi phí thông quan và vận chuyển nội địa. |
| Logistic | (không đặt tên riêng) | FREIGHT | COMPUTED | FREIGHT = Fixed charge + Rate × Chargeable weight. |
| Logistic | (không đặt tên riêng) | Total Logistic | COMPUTED | Total Logistic = FREIGHT + Clearance + Inland. |
| Logistic | (không đặt tên riêng) | Goods value | LINK | Lấy từ AirTotalMaterial hoặc SeaTotalMaterial bên Margin Analysis. |
| Logistic | (không đặt tên riêng) | % Insured value, Insurance rate, Min insurance | DEFAULT | Điều khoản bảo hiểm theo hợp đồng, ít khi đổi. |
| Logistic | (không đặt tên riêng) | Insurance | COMPUTED | Insurance = MAX( (Goods value + FREIGHT) × %Insured value × Insurance rate , Min insurance ). |
| Logistic | AirLogisticsPool / SeaLogisticsPool | Total Logistic + Insurance | COMPUTED | Pool = Total Logistic + Insurance. Đây là pool được Margin Analysis phân bổ theo trọng lượng. |
| Bank Fee | (không đặt tên riêng) | Rate, VAT factor, Min fee | DEFAULT | Biểu phí ngân hàng, ít khi đổi. |
| Bank Fee | (không đặt tên riêng) | Base amount (International remittance) | LINK | Lấy từ AirTotalMaterial bên Margin Analysis. |
| Bank Fee | (không đặt tên riêng) | Base amount (International receive) | INPUT | PHẢI NHẬP TAY giá trị hợp đồng USD. Không link tự động để tránh vòng lặp: doanh thu → phí NH → giá vốn → giá bán → doanh thu. |
| Bank Fee | (không đặt tên riêng) | Other bank charges | INPUT | Phí khác, nhập tay. Mặc định 0. |
| Bank Fee | (không đặt tên riêng) | Fee — International remittance | COMPUTED | IF(OrderGoodsOrigin="Local", 0, MAX(rate×VAT factor×Base amount, Min fee)))) |
| Bank Fee | (không đặt tên riêng) | Fee — International receive | COMPUTED | IF(OrderCountry="VN", 0, MAX(rate×VAT factor×Base amount, Min fee)))) |
| Bank Fee | TotalBankFee | TOTAL BANK FEE | COMPUTED | TotalBankFee = tổng 3 dòng phí phía trên. Đây là pool được Margin Analysis phân bổ vào Bank fee (cột J). |

## 9. Các tham số bạn đã đánh dấu "(Bỏ)" trong file này

File hiện tại có 4 tham số ở bảng Pricing Parameters được bạn gắn nhãn **(Bỏ)** sau tên: *Target margin (m)*, *% Value financed*, *Interest rate p.a.*, *Financing days*. Hiện các tham số này **vẫn đang được dùng trong công thức** (TargetMarginPct là margin mặc định cho DDP Price; 3 tham số còn lại cấu thành công thức BankFee/Financing Cost). Markdown này giữ nguyên trạng thái hiện tại của file — chưa xóa gì. Nếu bạn muốn tôi thực sự loại các biến này khỏi công thức CBU (như đã làm với ExchangeRate_Booking ở lần audit trước), báo tôi để xử lý.
