flowchart TD
    Start([Bắt đầu CBU Calculation]) --> AdminInput[Sale Admin nhập Logistics, Duty %, Margin %]
    AdminInput --> LiveMath Engine[Chạy lib/cbu-engine.ts]

    LiveMathEngine --> InverseAlgebra[Đại số đảo ngược DDP USD = BaseCost / 1 - TotalRates]
    InverseAlgebra --> RoundupVND[Làm tròn VND: Math.ceil DDP_USD * Rate / 10000 * 10000]
    RoundupVND --> RenderPreview[Hiển thị Live Preview Bảng CBU & PDF MVPO]
    
    RenderPreview --> Decision{Admin / Sếp chọn?}
    Decision -- Bấm Lưu Nháp --> SaveDraft[Lưu DB -> Status: CBU_PENDING_ADMIN]
    Decision -- Bấm Duyệt & Gửi Khách --> Approve[Status: QUOTED_TO_CLIENT -> AI Bắn Mail đính kèm PDF]
    
    SaveDraft --> End([Kết thúc])
    Approve --> End
