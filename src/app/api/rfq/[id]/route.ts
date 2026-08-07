import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rfq = await prisma.rFQ.findUnique({
      where: { id: params.id },
      include: {
        client: true,
        items: { orderBy: { lineNo: "asc" } },
        documents: true,
      },
    });

    if (!rfq) return NextResponse.json({ error: "Not found" }, { status: 404 });

    let supplierLogo = null;
    if (rfq.supplierName) {
      const supplier = await prisma.supplier.findFirst({
        where: {
          OR: [
            { name: { equals: rfq.supplierName, mode: "insensitive" } },
            { companyName: { equals: rfq.supplierName, mode: "insensitive" } },
          ],
        },
      });
      if (supplier) supplierLogo = supplier.logoUrl;
    }

    // ── Sanitise BigInt fields for JSON serialisation ──────────────────
    // Prisma stores ddpPriceVnd / totalRevenueVnd as BigInt.
    // JSON.stringify(BigInt) throws a TypeError, so we convert to Number here.
    const sanitisedItems = (rfq.items ?? [])
      .filter((item) => item !== null && item !== undefined)
      .map((item) => ({
        ...item,
        // BigInt → Number (safe: VND values fit in JS Number for realistic amounts)
        ddpPriceVnd:
          item.ddpPriceVnd !== null && item.ddpPriceVnd !== undefined
            ? Number(item.ddpPriceVnd)
            : null,
        supplierExtPrice:
          item.supplierExtPrice !== null && item.supplierExtPrice !== undefined
            ? Number(item.supplierExtPrice)
            : null,
        extWeightLbs:
          item.extWeightLbs !== null && item.extWeightLbs !== undefined
            ? Number(item.extWeightLbs)
            : null,
        // Guarantee every string/number field has a safe default
        uom: item.uom || "PCS",
        rawPartNumber: item.rawPartNumber || "",
        rawDescription: item.rawDescription || "",
        qty: item.qty ?? 1,
        supplierUnitPrice: item.supplierUnitPrice ?? 0,
        netWeightLbs: item.netWeightLbs ?? 0,
        dutyPercent: item.dutyPercent ?? 0,
        commissionPercent: item.commissionPercent ?? 0,
        citPercent: item.citPercent ?? 0,
        marginPercent: item.marginPercent ?? 0,
        unitCostUsd: item.unitCostUsd ?? 0,
        ddpPriceUsd: item.ddpPriceUsd ?? 0,
        marginPerUnitUsd: item.marginPerUnitUsd ?? 0,
      }));

    const sanitisedRfq = {
      ...rfq,
      // BigInt RFQ-level fields
      totalRevenueVnd:
        rfq.totalRevenueVnd !== null && rfq.totalRevenueVnd !== undefined
          ? Number(rfq.totalRevenueVnd)
          : null,
      items: sanitisedItems,
      supplierLogo,
    };

    return NextResponse.json(sanitisedRfq);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Lỗi máy chủ" }, { status: 500 });
  }
}


export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await prisma.rFQ.delete({
      where: { id: params.id },
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const updated = await prisma.rFQ.update({
      where: { id: params.id },
      data: body,
    });
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
