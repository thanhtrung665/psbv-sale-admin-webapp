stateDiagram-v2
    [*] --> INQUIRY_RECEIVED : Khách gửi Mail / Upload File

    INQUIRY_RECEIVED --> RFO_PENDING_ADMIN : AI bóc xong Inquiry (Gemini OCR)
    INQUIRY_RECEIVED --> INQUIRY_RECEIVED : Lỗi bóc tách (extractionError = true)
    
    RFO_PENDING_ADMIN --> RFO_SENT_TO_SUPPLIER : Admin duyệt & Bấm "Gửi Hãng"
    
    RFO_SENT_TO_SUPPLIER --> SUPPLIER_QUOTED : Hãng Reply Mail kèm PDF Quote
    
    SUPPLIER_QUOTED --> CBU_PENDING_ADMIN : AI bóc xong PDF Quote Hãng
    
    CBU_PENDING_ADMIN --> QUOTATION_DRAFTED : Admin nhập phí & Bấm "Tính CBU"
    
    QUOTATION_DRAFTED --> QUOTED_TO_CLIENT : Admin/Sếp duyệt & Bấm "Gửi Khách"
    
    QUOTED_TO_CLIENT --> [*]
