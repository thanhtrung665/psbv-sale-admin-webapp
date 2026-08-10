import { NextRequest, NextResponse } from "next/server";

// This is a placeholder for the actual AI Agent endpoint.
// It defines the tools and the schema for `prepare_email_dispatch`.

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();

    // Mock agent logic for demonstration:
    // When the agent receives a prompt to send an email, it will return a tool call
    const mockToolCall = {
      tool: "prepare_email_dispatch",
      parameters: {
        to: "client@example.com",
        subject: "Your Requested Quotation",
        bodyHtml: "<p>Dear Client,</p><p>Please find the quotation attached.</p><br/><p>Best regards,</p><p><strong>PSBV Sales Team</strong></p>",
        attachmentUrl: "https://example.com/mock-pdf-url.pdf",
      }
    };

    return NextResponse.json({
      success: true,
      message: "Agent processed the request",
      toolCalls: [mockToolCall],
      // Below is the schema definition you asked to ensure is defined clearly
      toolDefinitions: [
        {
          name: "prepare_email_dispatch",
          description: "Prepares an email with a PDF attachment for human review before dispatching.",
          parameters: {
            type: "object",
            properties: {
              to: { type: "string", description: "Recipient email address" },
              subject: { type: "string", description: "Email subject line" },
              bodyHtml: { type: "string", description: "Email body content in HTML or plain text" },
              attachmentUrl: { type: "string", description: "Valid URL to the generated PDF document from APITemplate" },
              suggestedFileName: { type: "string", description: "Suggested filename for the PDF attachment, e.g. Quotation_AC0485_Company.pdf" }
            },
            required: ["to", "subject", "bodyHtml", "attachmentUrl", "suggestedFileName"]
          }
        },
        {
          name: "generate_pdf_document",
          description: "Generates a PDF document and returns its URL.",
          parameters: {
            type: "object",
            properties: {
              rfqCode: { type: "string" },
              docType: { type: "string" }
            },
            required: ["rfqCode", "docType"]
          }
        }
      ]
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
