import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";
    const supplier = searchParams.get("supplier") || "";

    const whereClause: any = {};

    if (search) {
      whereClause.OR = [
        { rfqCode: { contains: search, mode: "insensitive" } },
        { client: { name: { contains: search, mode: "insensitive" } } },
        { client: { companyName: { contains: search, mode: "insensitive" } } },
        { supplierQuoteCode: { contains: search, mode: "insensitive" } },
        { items: { some: { rawPartNumber: { contains: search, mode: "insensitive" } } } },
      ];
    }

    if (status) {
      whereClause.status = status;
    }

    if (supplier) {
      whereClause.supplierName = { contains: supplier, mode: "insensitive" };
    }

    const orders = await prisma.rFQ.findMany({
      where: whereClause,
      include: {
        client: true,
        items: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Flatten data: one row per item
    const flattenedData = orders.flatMap((order) => {
      if (!order.items || order.items.length === 0) {
        // If an order has no items, still return it as a single row
        return [{
          // RFQ / Order Fields
          orderId: order.id,
          rfqCode: order.rfqCode,
          opportunityName: order.opportunityName,
          clientName: order.client?.name,
          companyName: order.client?.companyName,
          email: order.client?.email,
          phone: order.client?.phone,
          incoTerm: order.incoTerm,
          paymentTerm: order.paymentTerm,
          supplierName: order.supplierName,
          supplierQuoteRef: order.supplierQuoteCode,
          status: order.status,
          createdAt: order.createdAt,
          
          // Global Costs
          freightCost: order.freightCost,
          clearanceCost: order.clearanceCost,
          inlandCost: order.inlandCost,
          totalLogistics: (order.freightCost || 0) + (order.clearanceCost || 0) + (order.inlandCost || 0),
          bankFeePercent: order.bankFeePercent,
          insurancePercent: order.insurancePercent,
          
          // Final Totals
          totalCostUsd: order.totalCostUsd,
          totalRevenueUsd: order.totalRevenueUsd,
          totalRevenueVnd: order.totalRevenueVnd ? Number(order.totalRevenueVnd) : null,
          totalMarginUsd: order.totalMarginUsd,
          actualMarginPct: order.actualMarginPct,
          
          // Item Fields (Null since no items)
          itemId: null as string | null,
          lineNo: null as number | null,
          partNumber: null as string | null,
          description: null as string | null,
          qty: null as number | null,
          uom: null as string | null,
          supplierUnitPrice: null as number | null,
          netWeightLbs: null as number | null,
          
          // Apportioned Fees
          dutyPercent: null as number | null,
          commissionPercent: null as number | null,
          marginPercent: null as number | null,
          unitCostUsd: null as number | null,
          ddpPriceUsd: null as number | null,
          ddpPriceVnd: null as number | null,
          marginPerUnitUsd: null as number | null,
        }];
      }

      // Map each item
      return order.items.map((item) => ({
        // RFQ / Order Fields
        orderId: order.id,
        rfqCode: order.rfqCode,
        opportunityName: order.opportunityName,
        clientName: order.client?.name,
        companyName: order.client?.companyName,
        email: order.client?.email,
        phone: order.client?.phone,
        incoTerm: order.incoTerm,
        paymentTerm: order.paymentTerm,
        supplierName: order.supplierName,
        supplierQuoteRef: order.supplierQuoteCode,
        status: order.status,
        createdAt: order.createdAt,
        
        // Global Costs
        freightCost: order.freightCost,
        clearanceCost: order.clearanceCost,
        inlandCost: order.inlandCost,
        totalLogistics: (order.freightCost || 0) + (order.clearanceCost || 0) + (order.inlandCost || 0),
        bankFeePercent: order.bankFeePercent,
        insurancePercent: order.insurancePercent,
        
        // Final Totals
        totalCostUsd: order.totalCostUsd,
        totalRevenueUsd: order.totalRevenueUsd,
        totalRevenueVnd: order.totalRevenueVnd ? Number(order.totalRevenueVnd) : null,
        totalMarginUsd: order.totalMarginUsd,
        actualMarginPct: order.actualMarginPct,
        
        // Item Fields
        itemId: item.id,
        lineNo: item.lineNo,
        partNumber: item.rawPartNumber,
        description: item.rawDescription,
        qty: item.qty,
        uom: item.uom,
        supplierUnitPrice: item.supplierUnitPrice,
        netWeightLbs: item.netWeightLbs,
        
        // Apportioned Fees
        dutyPercent: item.dutyPercent,
        commissionPercent: item.commissionPercent,
        marginPercent: item.marginPercent,
        unitCostUsd: item.unitCostUsd,
        ddpPriceUsd: item.ddpPriceUsd,
        ddpPriceVnd: item.ddpPriceVnd ? Number(item.ddpPriceVnd) : null,
        marginPerUnitUsd: item.marginPerUnitUsd,
      }));
    });

    return NextResponse.json({ data: flattenedData });
  } catch (error: any) {
    console.error("[GET /api/database/orders]", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
