erDiagram
    User ||--o{ RFQ : "created_by / approved_by"
    Client ||--o{ RFQ : "owns"
    RFQ ||--|{ RFQItem : "contains"
    RFQ ||--o{ Document : "has_attachments"

    User {
        string id PK
        string email UK
        string password
        enum role "ADMIN | SALE_ADMIN"
    }

    Client {
        string id PK
        string companyName
        string email UK
    }

    RFQ {
        string id PK
        string rfqCode UK
        enum status "7 Order Statuses"
        boolean isProcessing
        float totalRevenueUsd
        float totalMarginUsd
        float actualMarginPct
    }

    RFQItem {
        string id PK
        string rawPartNumber
        string standardPartNo
        float qty
        float supplierUnitPrice
        float ddpPriceUsd
        bigint ddpPriceVnd
        float marginPerUnitUsd
    }

    Document {
        string id PK
        string type "INQUIRY_FILE | SUPPLIER_QUOTE_PDF | MVPO_QUOTATION_PDF"
        string fileUrl
    }
