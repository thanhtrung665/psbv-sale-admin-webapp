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
      bookingExchangeRate,
      vndRoundingStep,
      lbToKg,
      goodsOrigin,
      destinationCountry,
      freightCost,
      freightFixed,
      freightRatePerKg,
      chargeableWeightKg,
      clearanceCost,
      inlandCost,
      docFee,
      insuredValuePercent,
      insuranceRatePercent,
      minInsuranceUsd,
      remittanceRatePercent,
      bankVatFactor,
      minRemittanceFeeUsd,
      receiveRatePercent,
      minReceiveFeeUsd,
      receiveBaseUsd,
      otherBankFeeUsd,
      percentValueFinanced,
      interestRatePercent,
      financingDays,
      daysPerYear,
      customColumns, // Dynamic custom columns config
      totalCostUsd,
      totalRevenueUsd,
      totalRevenueVnd,
      totalMarginUsd,
      actualMarginPct,
      finalize = false, // true = QUOTATION_DRAFTED, false = CBU_PENDING_ADMIN
    } = body;

    // Update all RFQItem records with CBU results and custom values
    await prisma.$transaction(
      items.map((item: any) =>
        prisma.rFQItem.update({
          where: { id: item.id },
          data: {
            apportionedLogistics: item.apportionedLogistics ?? 0,
            apportionedBank: item.apportionedBank ?? 0,
            apportionedInsurance: item.apportionedInsurance ?? 0,
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
            customValues: item.customValues ?? {},
          },
        })
      )
    );

    // Update RFQ summary financials and global configs
    await prisma.rFQ.update({
      where: { id: params.id },
      data: {
        exchangeRate: exchangeRate ?? 26500,
        bookingExchangeRate: bookingExchangeRate ?? 26500,
        vndRoundingStep: vndRoundingStep ?? 10000,
        lbToKg: lbToKg ?? 0.4536,
        goodsOrigin: goodsOrigin ?? "Oversea",
        destinationCountry: destinationCountry ?? "VN",
        freightCost: freightCost ?? 0,
        freightFixed: freightFixed ?? 0,
        freightRatePerKg: freightRatePerKg ?? 0,
        chargeableWeightKg: chargeableWeightKg ?? 0,
        clearanceCost: clearanceCost ?? 150,
        inlandCost: inlandCost ?? 100,
        docFee: docFee ?? 15,
        insuredValuePercent: insuredValuePercent ?? 110,
        insuranceRatePercent: insuranceRatePercent ?? 0.01,
        minInsuranceUsd: minInsuranceUsd ?? 15,
        remittanceRatePercent: remittanceRatePercent ?? 0.2,
        bankVatFactor: bankVatFactor ?? 1.1,
        minRemittanceFeeUsd: minRemittanceFeeUsd ?? 50,
        receiveRatePercent: receiveRatePercent ?? 0.05,
        minReceiveFeeUsd: minReceiveFeeUsd ?? 5,
        receiveBaseUsd: receiveBaseUsd ?? 0,
        otherBankFeeUsd: otherBankFeeUsd ?? 0,
        percentValueFinanced: percentValueFinanced ?? 50,
        interestRatePercent: interestRatePercent ?? 15,
        financingDays: financingDays ?? 15,
        daysPerYear: daysPerYear ?? 360,
        customColumns: customColumns ?? [],
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
