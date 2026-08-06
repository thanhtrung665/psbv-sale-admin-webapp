import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Lấy danh sách khách hàng
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";

    const clients = await prisma.client.findMany({
      where: {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { companyName: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ],
      },
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: { rfqs: true },
        },
      },
    });

    return NextResponse.json({ data: clients });
  } catch (error: any) {
    console.error("[GET /api/clients]", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}

// Thêm khách hàng mới
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { name, companyName, email, phone, address } = body;

    if (!name || !companyName || !email) {
      return NextResponse.json({ success: false, message: "Vui lòng nhập đầy đủ Tên, Công ty và Email." }, { status: 400 });
    }

    // Check email exists
    const existingClient = await prisma.client.findUnique({ where: { email } });
    if (existingClient) {
      return NextResponse.json({ success: false, message: "Email khách hàng này đã tồn tại." }, { status: 400 });
    }

    const newClient = await prisma.client.create({
      data: {
        name,
        companyName,
        email,
        phone: phone || null,
        address: address || null,
      },
    });

    return NextResponse.json({ success: true, data: newClient });
  } catch (error: any) {
    console.error("[POST /api/clients]", error);
    return NextResponse.json({ success: false, message: error.message || "Internal Server Error" }, { status: 500 });
  }
}
