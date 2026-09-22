/**
 * @jest-environment jsdom
 *
 * Smoke tests for the analytics chart components (src/components/analytics/*) — render without throwing,
 * with the right accessible label, for empty and non-empty data. Not pixel/visual tests; recharts' internal
 * SVG geometry is trusted, this only checks the React tree mounts and wires props correctly.
 */
import * as React from "react";
import { render, screen } from "@testing-library/react";
import { RevenueTrendChart } from "../../../src/components/analytics/revenue-trend-chart";
import { StatusFunnelChart } from "../../../src/components/analytics/status-funnel-chart";
import { TopClientsChart } from "../../../src/components/analytics/top-clients-chart";

describe("RevenueTrendChart", () => {
  it("renders with an accessible label for empty data", () => {
    render(<RevenueTrendChart data={[]} />);
    expect(screen.getByRole("img", { name: "Biểu đồ doanh thu và lợi nhuận theo tháng" })).toBeInTheDocument();
  });

  it("renders without throwing given monthly data", () => {
    render(
      <RevenueTrendChart
        data={[
          { month: "2026-08", label: "08/26", revenueUsd: 1000, marginUsd: 200 },
          { month: "2026-09", label: "09/26", revenueUsd: 1500, marginUsd: 300 },
        ]}
      />
    );
    expect(screen.getByRole("img", { name: "Biểu đồ doanh thu và lợi nhuận theo tháng" })).toBeInTheDocument();
  });
});

describe("StatusFunnelChart", () => {
  it("renders one row per status without throwing", () => {
    render(
      <StatusFunnelChart
        data={[
          { status: "INQUIRY_RECEIVED", label: "Yêu cầu Mới", count: 5 },
          { status: "QUOTED_TO_CLIENT", label: "Đã gửi báo giá Khách", count: 2 },
        ]}
      />
    );
    expect(screen.getByRole("img", { name: "Biểu đồ số lượng đơn hàng theo trạng thái" })).toBeInTheDocument();
  });

  it("handles an empty status list without throwing", () => {
    render(<StatusFunnelChart data={[]} />);
    expect(screen.getByRole("img")).toBeInTheDocument();
  });
});

describe("TopClientsChart", () => {
  it("shows an empty-state message instead of a chart when there is no priced RFQ", () => {
    render(<TopClientsChart data={[]} />);
    expect(screen.getByText("Chưa có đơn hàng đã tính giá")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders the chart when there is data", () => {
    render(<TopClientsChart data={[{ name: "Acme Co", revenueUsd: 5000 }]} />);
    expect(screen.getByRole("img", { name: "Biểu đồ top khách hàng theo doanh thu" })).toBeInTheDocument();
  });
});
