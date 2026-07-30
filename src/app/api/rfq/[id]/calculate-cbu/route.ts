import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const {
      items, // Array of calculated item data
      exchangeRate,
      totalCostUsd,
      totalRevenueUsd,
      totalRevenueVnd,
      totalMarginUsd,
      actualMarginPct,
      finalize = false, // true = QUOTATION_DRAFTED, false = CBU_PENDING_ADMIN
    } = body;

    // Update all RFQItem records with CBU results
    await Promise.all(
      items.map((item: any) =>
        prisma.rFQItem.update({
          where: { id: item.id },
          data: {
            logisticsFee: item.logisticsFee ?? 0,
            bankFee: item.bankFee ?? 0,
            dutyPercent: item.dutyPercent ?? 0,
            dutyAmount: item.dutyAmount ?? 0,
            commissionPercent: item.commissionPercent ?? 0,
            commissionAmount: item.commissionAmount ?? 0,
            citPercent: item.citPercent ?? 0,
            citAmount: item.citAmount ?? 0,
            marginPercent: item.marginPercent ?? 0,
            unitCostUsd: item.unitCostUsd ?? 0,
            ddpPriceUsd: item.ddpPriceUsd ?? 0,
            ddpPriceVnd: item.ddpPriceVnd ? BigInt(Math.round(item.ddpPriceVnd)) : null,
            marginPerUnitUsd: item.marginPerUnitUsd ?? 0,
          },
        })
      )
    );

    // Update RFQ summary financials
    await prisma.rFQ.update({
      where: { id: params.id },
      data: {
        exchangeRate: exchangeRate ?? 25500,
        totalCostUsd: totalCostUsd ?? 0,
        totalRevenueUsd: totalRevenueUsd ?? 0,
        totalRevenueVnd: totalRevenueVnd ? BigInt(Math.round(totalRevenueVnd)) : null,
        totalMarginUsd: totalMarginUsd ?? 0,
        actualMarginPct: actualMarginPct ?? 0,
        status: finalize ? "QUOTATION_DRAFTED" : "CBU_PENDING_ADMIN",
      },
    });

    return NextResponse.json({
      message: finalize ? "Hoàn tất CBU — Tạo Quotation nháp thành công!" : "Đã lưu nháp CBU.",
      status: finalize ? "QUOTATION_DRAFTED" : "CBU_PENDING_ADMIN",
    });
  } catch (err: any) {
    console.error("[calculate-cbu]", err);
    return NextResponse.json({ error: err.message || "Có lỗi xảy ra." }, { status: 500 });
  }
}
