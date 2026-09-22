/**
 * @jest-environment jsdom
 *
 * RTL tests for the CIPL page (src/app/(dashboard)/rfq/[id]/cipl/page.tsx) — loads a CIPL record,
 * lets Sale Admin edit header fields and line items, and generates the PDF. `fetch` and
 * `next/navigation` are mocked; nothing here touches a real API or database.
 */
import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("next/navigation", () => ({
  useParams: () => ({ id: "rfq-1" }),
}));

import CiplPage from "../../../src/app/(dashboard)/rfq/[id]/cipl/page";

function mockFetchSequence(responses: Array<{ ok: boolean; status?: number; json: unknown }>) {
  let call = 0;
  global.fetch = jest.fn(() => {
    const r = responses[Math.min(call, responses.length - 1)];
    call += 1;
    return Promise.resolve({
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 500),
      json: () => Promise.resolve(r.json),
    }) as unknown as Promise<Response>;
  }) as jest.Mock as unknown as typeof fetch;
}

const rfqResponse = { rfqCode: "AC0084" };
const ciplRecord = {
  id: "cipl-1",
  rfqId: "rfq-1",
  invoiceNo: "INV-001",
  invoiceDate: "30-Jul-2026",
  poNo: "PO-9",
  poDate: null,
  incoterm: "FCA LOUSIANA, USA",
  mot: "Air Freight",
  pol: null,
  pod: null,
  consigneeName: "PSBV",
  consigneeAddress: null,
  consigneeAttn: null,
  consigneeEmail: null,
  consigneeTel: null,
  totalAmount: "1,116.00",
  totalWeightLbs: "92.16",
  numberOfBox: "1 BOX",
  boxDimension: null,
  shippingMark: null,
  items: [
    { id: "i1", lineNo: 1, partNo: "A23-170", description: "Insert", hsCode: null, quantity: "10", countryOrigin: "US", uom: "PCS", unitPrice: "4.37", extPrice: "43.70", batchNo: null, netWeight: "1.2" },
  ],
  createdAt: "2026-07-30T00:00:00.000Z",
};

describe("CIPL page", () => {
  afterEach(() => jest.restoreAllMocks());

  it("loads and renders the record's header fields and item rows", async () => {
    mockFetchSequence([{ ok: true, json: rfqResponse }, { ok: true, json: { success: true, data: ciplRecord } }]);
    render(<CiplPage />);

    expect(await screen.findByText("AC0084")).toBeInTheDocument();
    expect(screen.getByLabelText("Invoice No")).toHaveValue("INV-001");
    expect(screen.getByLabelText("Total Weight (lbs)")).toHaveValue("92.16");
    expect(screen.getByText("📦 Danh Sách Hàng Hóa (1 dòng)")).toBeInTheDocument();
    expect(screen.getByDisplayValue("A23-170")).toBeInTheDocument();
  });

  it("shows the empty state and a link back to /rfq when no CIPL record exists (404)", async () => {
    mockFetchSequence([{ ok: true, json: rfqResponse }, { ok: false, status: 404, json: { success: false } }]);
    render(<CiplPage />);

    expect(await screen.findByText("Chưa có dữ liệu CIPL")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Quay lại danh sách RFQ/ })).toHaveAttribute("href", "/rfq");
  });

  it("editing a header field updates the input's value", async () => {
    const user = userEvent.setup();
    mockFetchSequence([{ ok: true, json: rfqResponse }, { ok: true, json: { success: true, data: ciplRecord } }]);
    render(<CiplPage />);

    const input = await screen.findByLabelText("Invoice No");
    await user.clear(input);
    await user.type(input, "INV-999");
    expect(input).toHaveValue("INV-999");
  });

  it("editing an item field updates that row only", async () => {
    const user = userEvent.setup();
    const twoItems = { ...ciplRecord, items: [ciplRecord.items[0], { ...ciplRecord.items[0], id: "i2", lineNo: 2, partNo: "B99-000" }] };
    mockFetchSequence([{ ok: true, json: rfqResponse }, { ok: true, json: { success: true, data: twoItems } }]);
    render(<CiplPage />);

    const first = await screen.findByDisplayValue("A23-170");
    await user.clear(first);
    await user.type(first, "A23-171");
    expect(first).toHaveValue("A23-171");
    expect(screen.getByDisplayValue("B99-000")).toBeInTheDocument(); // untouched
  });

  it("Generate PDF posts the form + items as overrides and shows the preview on success", async () => {
    const user = userEvent.setup();
    let generatePayload: any = null;
    let call = 0;
    global.fetch = jest.fn((url: string, init?: RequestInit) => {
      call += 1;
      if (call === 1) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(rfqResponse) }) as any;
      if (call === 2) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true, data: ciplRecord }) }) as any;
      generatePayload = JSON.parse(init!.body as string);
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, url: "https://files.example/cipl.pdf", fileName: "CIPL_AC0084.pdf" }),
      }) as any;
    }) as unknown as typeof fetch;

    render(<CiplPage />);
    await screen.findByLabelText("Invoice No");

    await user.click(screen.getByRole("button", { name: /Tạo PDF CIPL/ }));

    await waitFor(() => expect(screen.getByText("✅ Tạo PDF thành công!")).toBeInTheDocument());
    expect(screen.getByTitle("CIPL PDF Preview")).toHaveAttribute("src", "https://files.example/cipl.pdf");
    expect(generatePayload).toMatchObject({
      rfqCode: "AC0084",
      docType: "CIPL_PDF",
      overrides: { invoice_no: "INV-001", items: [expect.objectContaining({ part_no: "A23-170", unit_price: "4.37" })] },
    });
  });

  it("Generate PDF button is disabled until the RFQ code has loaded", async () => {
    mockFetchSequence([{ ok: true, json: {} }, { ok: true, json: { success: true, data: ciplRecord } }]);
    render(<CiplPage />);
    await screen.findByLabelText("Invoice No");
    expect(screen.getByRole("button", { name: /Tạo PDF CIPL/ })).toBeDisabled();
  });
});
