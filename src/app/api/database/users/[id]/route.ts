import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any)?.role !== "ADMIN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const { id } = params;
    const body = await req.json();

    const dataToUpdate: any = {};
    if (body.role !== undefined) dataToUpdate.role = body.role;
    if (body.isActive !== undefined) dataToUpdate.isActive = body.isActive;
    if (body.password) {
      dataToUpdate.password = await bcrypt.hash(body.password, 10);
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: dataToUpdate,
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });

    return NextResponse.json({ message: "Cập nhật thành công", data: updatedUser });
  } catch (error: any) {
    console.error("[PATCH /api/database/users/[id]]", error);
    return NextResponse.json({ error: error.message || "Lỗi khi cập nhật dữ liệu" }, { status: 500 });
  }
}
