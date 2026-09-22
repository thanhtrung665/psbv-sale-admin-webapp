import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Only Supabase Storage (where generate-document/route.ts uploads PDFs) may be proxied — prevents SSRF (P0-1). */
function allowedHosts(): string[] {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  try {
    return [new URL(supabaseUrl).host];
  } catch {
    return [];
  }
}

/** Strip anything that could break the Content-Disposition header or the saved filename. */
function sanitiseFilename(raw: string): string {
  const base = raw.replace(/[\\/\r\n"]/g, "_").trim() || "document";
  return base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = req.nextUrl.searchParams.get("url");
    const filename = req.nextUrl.searchParams.get("filename") || "document.pdf";

    if (!url) {
      return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return NextResponse.json({ error: "Invalid url parameter" }, { status: 400 });
    }

    if (parsed.protocol !== "https:" || !allowedHosts().includes(parsed.host)) {
      return NextResponse.json({ error: "URL host is not allowed" }, { status: 400 });
    }

    const safeFilename = sanitiseFilename(filename);

    // Fetch the file from the allow-listed URL only
    const response = await fetch(parsed.toString());

    if (!response.ok) {
      throw new Error(`Failed to fetch file from ${parsed.host}: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Return the response with headers to force download and set filename
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeFilename}"`,
        // Also set Content-Length for proper download progress
        "Content-Length": buffer.byteLength.toString(),
      },
    });

  } catch (error: any) {
    console.error("[download-pdf]", error);
    return NextResponse.json(
      { error: error.message || "Failed to download PDF" },
      { status: 500 }
    );
  }
}
