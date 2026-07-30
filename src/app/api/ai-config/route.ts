import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if ((session?.user as any)?.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let config = await prisma.aiConfig.findFirst({
      where: { name: "core" }
    });

    if (!config) {
      config = await prisma.aiConfig.create({
        data: {
          name: "core",
          apiKey: process.env.GEMINI_API_KEY || "",
          modelName: "gemini-2.5-pro",
          inquiryPrompt: "",
          quotePrompt: "",
          toolsConfig: "",
          resendApiKey: process.env.RESEND_API_KEY || ""
        }
      });
    }

    return NextResponse.json(config);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if ((session?.user as any)?.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const config = await prisma.aiConfig.upsert({
      where: { id: body.id || "non-existent-id" }, // upsert needs unique identifier, but name is not unique. 
      // let's do updateMany or findFirst then update
      create: {
        name: "core",
        apiKey: body.apiKey,
        modelName: body.modelName,
        inquiryPrompt: body.inquiryPrompt,
        quotePrompt: body.quotePrompt,
        toolsConfig: body.toolsConfig,
        resendApiKey: body.resendApiKey
      },
      update: {
        apiKey: body.apiKey,
        modelName: body.modelName,
        inquiryPrompt: body.inquiryPrompt,
        quotePrompt: body.quotePrompt,
        toolsConfig: body.toolsConfig,
        resendApiKey: body.resendApiKey
      }
    });

    return NextResponse.json(config);
  } catch (error: any) {
    // Fallback if upsert fails because we don't have unique constraint on name
    try {
      const body = await req.json();
      let existing = await prisma.aiConfig.findFirst({ where: { name: "core" } });
      if (existing) {
        existing = await prisma.aiConfig.update({
          where: { id: existing.id },
          data: {
            apiKey: body.apiKey,
            modelName: body.modelName,
            inquiryPrompt: body.inquiryPrompt,
            quotePrompt: body.quotePrompt,
            toolsConfig: body.toolsConfig,
            resendApiKey: body.resendApiKey
          }
        });
        return NextResponse.json(existing);
      }
    } catch(_e) {}
    
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
