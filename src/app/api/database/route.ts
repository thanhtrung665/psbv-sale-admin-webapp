import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ALLOWED_MODELS = ["user", "client", "rfq", "rfqItem", "task", "aiConfig"];

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const model = searchParams.get("model") || "user";

    if (!ALLOWED_MODELS.includes(model)) {
      return NextResponse.json({ error: "Invalid model" }, { status: 400 });
    }

    const data = await (prisma as any)[model].findMany({
      take: 100, // Limit to 100 for safety in this viewer
      orderBy: { createdAt: 'desc' },
    });

    // Handle BigInt serialization
    const serialized = JSON.parse(JSON.stringify(data, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    ));

    return NextResponse.json(serialized);
  } catch (error: any) {
    console.error("Database GET Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userRole = (session?.user as any)?.role;

    if (userRole !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { model, id, data } = body;

    if (!ALLOWED_MODELS.includes(model) || !id || !data) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    
    const updatedRecord = await (prisma as any)[model].update({
      where: { id },
      data,
    });

    // Handle BigInt serialization
    const serialized = JSON.parse(JSON.stringify(updatedRecord, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    ));

    return NextResponse.json(serialized);
  } catch (error: any) {
    console.error("Database PATCH Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
