import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic"; // Always fresh data

const STATUS_LABELS: Record<string, { label: string; color: string; count: number }> = {
  INQUIRY_RECEIVED:     { label: "Yêu cầu Mới (AI)",     color: "blue",     count: 0 },
  RFO_PENDING_ADMIN:    { label: "Chờ duyệt RFO",        color: "amber",    count: 0 },
  RFO_SENT_TO_SUPPLIER: { label: "Đã gửi Hãng",          color: "indigo",   count: 0 },
  SUPPLIER_QUOTED:      { label: "Hãng đã báo giá",      color: "violet",   count: 0 },
  CBU_PENDING_ADMIN:    { label: "Chờ tính phí CBU",     color: "orange",   count: 0 },
  QUOTATION_DRAFTED:    { label: "Báo giá Nháp",         color: "teal",     count: 0 },
  QUOTED_TO_CLIENT:     { label: "Đã gửi Khách hàng",    color: "emerald",  count: 0 },
};

const fmtUSD = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtPct = (v: number) => `${v.toFixed(1)}%`;

export default async function OverviewPage() {
  const session = await getServerSession(authOptions);
  
  // Fetch stats — wrap in try/catch to avoid build-time failure
  let allRfqs: { id: string; rfqCode: string; status: string; totalRevenueUsd: number | null; totalMarginUsd: number | null; client: { companyName: string } }[] = [];
  try {
    allRfqs = await prisma.rFQ.findMany({
      include: { client: { select: { companyName: true } } },
      orderBy: { createdAt: "desc" }
    });
  } catch {
    // DB unavailable at build time — return empty data
  }

  let totalRfqs = 0;
  let totalRevenue = 0;
  let totalMargin = 0;

  // Status breakdown array setup
  const statusCounts = { ...STATUS_LABELS };
  Object.keys(statusCounts).forEach(k => statusCounts[k].count = 0);

  allRfqs.forEach(rfq => {
    totalRfqs++;
    if (statusCounts[rfq.status]) {
      statusCounts[rfq.status].count++;
    }
    
    // Accumulate financials for anything past CBU
    if (rfq.totalRevenueUsd && rfq.totalRevenueUsd > 0) {
      totalRevenue += rfq.totalRevenueUsd;
      totalMargin += rfq.totalMarginUsd || 0;
    }
  });

  const avgMarginPct = totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0;
  const recentRfqs = allRfqs.slice(0, 10); // top 10

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
          Dashboard Overview
          <span className="text-xs px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200">
            Welcome back, {session?.user?.name || "Admin"}
          </span>
        </h1>
        <p className="text-gray-500 text-sm mt-1">Tổng quan hoạt động kinh doanh B2B</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Tổng Đơn hàng", value: totalRfqs.toString(), icon: "📄", color: "from-slate-600 to-slate-700" },
          { label: "Doanh thu Báo giá (Total)", value: fmtUSD(totalRevenue), icon: "💰", color: "from-blue-600 to-indigo-600" },
          { label: "Tổng Lợi Nhuận (USD)", value: fmtUSD(totalMargin), icon: "📈", color: "from-emerald-600 to-teal-600" },
          { label: "Margin Trung Bình (%)", value: fmtPct(avgMarginPct), icon: "⚖️", color: "from-violet-600 to-purple-600" },
        ].map((card, idx) => (
          <div key={idx} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-start gap-4">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center text-xl shadow-md text-white flex-shrink-0`}>
                {card.icon}
              </div>
              <div>
                <p className="text-gray-500 text-xs font-medium uppercase tracking-wider mb-1">{card.label}</p>
                <p className="text-2xl font-bold text-gray-900 leading-none">{card.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Status Breakdown */}
        <div className="lg:col-span-1 bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4 border-b border-gray-200 pb-3">
            Trạng thái Đơn hàng
          </h2>
          <div className="space-y-3">
            {Object.entries(statusCounts).map(([key, data]) => (
              <Link href={`/rfq?status=${key}`} key={key} className="block group">
                <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100 hover:border-gray-300 hover:bg-gray-100 transition-all">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full bg-${data.color}-500`} />
                    <span className="text-sm text-gray-700 group-hover:text-gray-900 transition-colors">{data.label}</span>
                  </div>
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-bold bg-${data.color}-50 text-${data.color}-700 border border-${data.color}-200`}>
                    {data.count}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent RFQs */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl overflow-hidden flex flex-col shadow-sm">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Đơn hàng mới nhất</h2>
            <Link href="/rfq" className="text-xs text-blue-600 hover:text-blue-700 font-medium">Xem tất cả →</Link>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/50">
                  <th className="text-left text-xs text-gray-500 font-semibold px-5 py-3">Mã RFO</th>
                  <th className="text-left text-xs text-gray-500 font-semibold px-5 py-3">Khách hàng</th>
                  <th className="text-left text-xs text-gray-500 font-semibold px-5 py-3">Trạng thái</th>
                  <th className="text-left text-xs text-gray-500 font-semibold px-5 py-3">Doanh thu ($)</th>
                  <th className="text-right text-xs text-gray-500 font-semibold px-5 py-3">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentRfqs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-10 text-gray-500">Chưa có đơn hàng nào.</td>
                  </tr>
                ) : (
                  recentRfqs.map((rfq) => (
                    <tr key={rfq.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 font-mono text-blue-600 font-semibold text-xs">{rfq.rfqCode}</td>
                      <td className="px-5 py-3 text-gray-700 truncate max-w-[150px]">{rfq.client.companyName || "-"}</td>
                      <td className="px-5 py-3">
                        <span className={`text-[11px] px-2 py-1 rounded-md font-semibold border ${
                          statusCounts[rfq.status]?.color ? `bg-${statusCounts[rfq.status].color}-50 text-${statusCounts[rfq.status].color}-700 border-${statusCounts[rfq.status].color}-200` : "bg-gray-100 text-gray-600"
                        }`}>
                          {statusCounts[rfq.status]?.label || rfq.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-emerald-600 font-mono text-xs font-semibold">
                        {(rfq.totalRevenueUsd || 0) > 0 ? fmtUSD(rfq.totalRevenueUsd || 0) : "-"}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link 
                          href={rfq.status === 'QUOTATION_DRAFTED' || rfq.status === 'QUOTED_TO_CLIENT' 
                            ? `/rfq/${rfq.id}/quote-preview` 
                            : rfq.status === 'CBU_PENDING_ADMIN'
                            ? `/rfq/${rfq.id}/cbu-calc`
                            : `/rfq/${rfq.id}/rfo-review`}
                          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-600 hover:text-gray-900 border border-gray-200 transition-all font-medium"
                        >
                          Xử lý ngay →
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
