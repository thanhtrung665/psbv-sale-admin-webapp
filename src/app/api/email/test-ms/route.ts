import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { sendEmailViaGraph, testMsGraphConnection } from "@/lib/ms-graph";

/**
 * GET /api/email/test-ms
 * Test Microsoft Graph API connection and send a test email
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    console.log("[email/test-ms] Testing MS Graph connection...");

    // Test the connection
    const testResult = await testMsGraphConnection();

    return NextResponse.json({
      success: true,
      message: "Microsoft Graph API connection test completed",
      result: testResult,
    });
  } catch (error: any) {
    console.error("[email/test-ms] Test failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Test failed",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/email/test-ms
 * Send a test email via MS Graph
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { to, subject, body } = await req.json();

    if (!to || !subject || !body) {
      return NextResponse.json(
        { error: "Missing required fields: to, subject, body" },
        { status: 400 }
      );
    }

    console.log(`[email/test-ms] Sending test email to: ${to}`);

    await sendEmailViaGraph({
      to,
      subject,
      bodyHtml: body,
    });

    return NextResponse.json({
      success: true,
      message: `Test email sent to ${to}`,
    });
  } catch (error: any) {
    console.error("[email/test-ms] Send failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to send email",
      },
      { status: 500 }
    );
  }
}
