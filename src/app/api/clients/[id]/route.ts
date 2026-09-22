import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateClientSchema } from "@/lib/schemas";
import { validateBody, validatePathParam } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const idCheck = validatePathParam(params.id, "id");
    if (!idCheck.success) return idCheck.response;
    const clientId = idCheck.data;

    const bodyCheck = await validateBody(req, updateClientSchema);
    if (!bodyCheck.success) return bodyCheck.response;
    const { name, companyName, email, phone, address } = bodyCheck.data;

    // Check if email belongs to someone else
    const existing = await prisma.client.findFirst({
      where: {
        email,
        id: { not: clientId },
      },
    });

    if (existing) {
      return NextResponse.json({ success: false, message: "Email khách hàng này đã tồn tại ở một bản ghi khác." }, { status: 400 });
    }

    const updatedClient = await prisma.client.update({
      where: { id: clientId },
      data: {
        name,
        companyName,
        email,
        phone: phone || null,
        address: address || null,
      },
    });

    return NextResponse.json({ success: true, data: updatedClient });
  } catch (error: any) {
    console.error("[PUT /api/clients/[id]]", error);
    return NextResponse.json({ success: false, message: error.message || "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const clientId = params.id;

    // Check if client has any associated RFQs
    const rfqsCount = await prisma.rFQ.count({
      where: { clientId },
    });

    if (rfqsCount > 0) {
      return NextResponse.json({ 
        success: false, 
        message: "Khách hàng này đang có Đơn hàng (RFQ), không thể xóa để bảo toàn dữ liệu." 
      }, { status: 400 });
    }

    await prisma.client.delete({
      where: { id: clientId },
    });

    return NextResponse.json({ success: true, message: "Đã xóa khách hàng thành công." });
  } catch (error: any) {
    console.error("[DELETE /api/clients/[id]]", error);
    return NextResponse.json({ success: false, message: error.message || "Internal Server Error" }, { status: 500 });
  }
}
