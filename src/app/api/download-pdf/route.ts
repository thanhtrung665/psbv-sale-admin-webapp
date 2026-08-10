import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl.searchParams.get("url");
    const filename = req.nextUrl.searchParams.get("filename") || "document.pdf";

    if (!url) {
      return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
    }

    // Ensure the filename ends with .pdf
    const safeFilename = filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`;

    // Fetch the file from the provided URL
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch file from ${url}: ${response.statusText}`);
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
