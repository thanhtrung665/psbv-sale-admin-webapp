import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any)?.role !== "ADMIN") {
      return NextResponse.json({ message: "Bạn không có quyền chỉnh sửa dữ liệu Database!" }, { status: 403 });
    }

    const { id } = params;
    
    // Prisma Cascade delete is configured on RFQItem (onDelete: Cascade)
    await prisma.rFQ.delete({
      where: { id },
    });

    return NextResponse.json({ message: "Đã xóa đơn hàng thành công" });
  } catch (error: any) {
    console.error("[DELETE /api/database/orders/[id]]", error);
    return NextResponse.json({ error: error.message || "Lỗi khi xóa dữ liệu" }, { status: 500 });
  }
}
