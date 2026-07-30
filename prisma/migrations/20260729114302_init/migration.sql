-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'SALE_ADMIN');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('INQUIRY_RECEIVED', 'RFO_PENDING_ADMIN', 'RFO_SENT_TO_SUPPLIER', 'SUPPLIER_QUOTED', 'CBU_PENDING_ADMIN', 'QUOTATION_DRAFTED', 'QUOTED_TO_CLIENT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'SALE_ADMIN',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RFQ" (
    "id" TEXT NOT NULL,
    "rfqCode" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'INQUIRY_RECEIVED',
    "isProcessing" BOOLEAN NOT NULL DEFAULT false,
    "extractionError" TEXT,
    "supplierQuoteCode" TEXT,
    "supplierName" TEXT,
    "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 25500,
    "totalCostUsd" DOUBLE PRECISION,
    "totalRevenueUsd" DOUBLE PRECISION,
    "totalRevenueVnd" BIGINT,
    "totalMarginUsd" DOUBLE PRECISION,
    "actualMarginPct" DOUBLE PRECISION,
    "createdById" TEXT,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RFQ_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RFQItem" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "rawPartNumber" TEXT NOT NULL,
    "rawDescription" TEXT,
    "standardPartNo" TEXT,
    "qty" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "netWeightLbs" DOUBLE PRECISION,
    "supplierUnitPrice" DOUBLE PRECISION,
    "supplierExtPrice" DOUBLE PRECISION,
    "leadTime" TEXT,
    "logisticsFee" DOUBLE PRECISION DEFAULT 0,
    "bankFee" DOUBLE PRECISION DEFAULT 0,
    "dutyPercent" DOUBLE PRECISION DEFAULT 0,
    "dutyAmount" DOUBLE PRECISION DEFAULT 0,
    "commissionPercent" DOUBLE PRECISION DEFAULT 0,
    "commissionAmount" DOUBLE PRECISION DEFAULT 0,
    "citPercent" DOUBLE PRECISION DEFAULT 0,
    "citAmount" DOUBLE PRECISION DEFAULT 0,
    "marginPercent" DOUBLE PRECISION DEFAULT 0,
    "unitCostUsd" DOUBLE PRECISION,
    "ddpPriceUsd" DOUBLE PRECISION,
    "ddpPriceVnd" BIGINT,
    "marginPerUnitUsd" DOUBLE PRECISION,

    CONSTRAINT "RFQItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Client_email_key" ON "Client"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RFQ_rfqCode_key" ON "RFQ"("rfqCode");

-- AddForeignKey
ALTER TABLE "RFQ" ADD CONSTRAINT "RFQ_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RFQItem" ADD CONSTRAINT "RFQItem_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "RFQ"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "RFQ"("id") ON DELETE CASCADE ON UPDATE CASCADE;
