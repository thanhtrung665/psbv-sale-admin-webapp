import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ClipboardList, TrendingUp, Banknote, PieChart, Eye, Inbox } from "lucide-react";

export const dynamic = "force-dynamic"; // Always fresh data

const STATUS_LABELS: Record<string, { label: string; bg: string; text: string; border: string; count: number }> = {
  INQUIRY_RECEIVED:     { label: "Yêu cầu Mới",          bg: "bg-slate-100",   text: "text-slate-700",   border: "border-slate-200",   count: 0 },
  RFO_PENDING_ADMIN:    { label: "Chờ duyệt RFO",        bg: "bg-slate-100",   text: "text-slate-700",   border: "border-slate-200",   count: 0 },
  RFO_SENT_TO_SUPPLIER: { label: "Gửi hỏi giá Hãng",     bg: "bg-sky-50",      text: "text-sky-700",     border: "border-sky-200",     count: 0 },
  SUPPLIER_QUOTED:      { label: "Đã có phí Hãng",       bg: "bg-indigo-50",   text: "text-indigo-700",  border: "border-indigo-200",  count: 0 },
  CBU_PENDING_ADMIN:    { label: "Chờ tính phí CBU",     bg: "bg-violet-50",   text: "text-violet-700",  border: "border-violet-200",  count: 0 },
  QUOTATION_DRAFTED:    { label: "Báo giá Nháp",         bg: "bg-teal-50",     text: "text-teal-700",    border: "border-teal-200",    count: 0 },
  QUOTED_TO_CLIENT:     { label: "Đã gửi báo giá Khách", bg: "bg-emerald-50",  text: "text-emerald-700", border: "border-emerald-200", count: 0 },
};

const fmtUSD = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (v: number) => `${v.toFixed(1)}%`;
const fmtDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });

export default async function OverviewPage() {
  const session = await getServerSession(authOptions);
  
  // Fetch stats — wrap in try/catch to avoid build-time failure
  let allRfqs: any[] = [];
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

  const kpiCards = [
    { 
      label: "TỔNG ĐƠN HÀNG", 
      value: totalRfqs.toString(), 
      subtext: "Tổng số inquiry tiếp nhận",
      icon: ClipboardList, 
      colorClass: "bg-blue-50 text-blue-600" 
    },
    { 
      label: "TỔNG GIÁ TRỊ", 
      value: fmtUSD(totalRevenue), 
      subtext: "Tổng giá trị DDP Quote",
      icon: TrendingUp, 
      colorClass: "bg-emerald-50 text-emerald-600" 
    },
    { 
      label: "TỔNG LỢI NHUẬN", 
      value: fmtUSD(totalMargin), 
      subtext: "Tổng Gross Profit ($)",
      icon: Banknote, 
      colorClass: "bg-violet-50 text-violet-600" 
    },
    { 
      label: "MARGIN TRUNG BÌNH", 
      value: fmtPct(avgMarginPct), 
      subtext: "Tỷ lệ lợi nhuận trung bình",
      icon: PieChart, 
      colorClass: "bg-amber-50 text-amber-600" 
    },
  ];

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
          Dashboard Overview
          <span className="text-xs px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200">
            Welcome back, {session?.user?.name || "Admin"}
          </span>
        </h1>
        <p className="text-slate-500 text-sm mt-1">Tổng quan hoạt động kinh doanh B2B</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div key={idx} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow transition-all">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-slate-500 text-xs font-semibold tracking-wider mb-1">{card.label}</p>
                  <p className="text-2xl font-bold text-slate-900 leading-none">{card.value}</p>
                  <p className="text-slate-400 text-xs mt-2">{card.subtext}</p>
                </div>
                <div className={`w-10 h-10 rounded-xl bg-opacity-80 flex items-center justify-center flex-shrink-0 ${card.colorClass}`}>
                  <Icon className="w-5 h-5" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Status Breakdown */}
        <div className="lg:col-span-1 bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-4 border-b border-slate-200 pb-3">
            Trạng thái Đơn hàng
          </h2>
          <div className="space-y-3">
            {Object.entries(statusCounts).map(([key, data]) => {
              const pct = totalRfqs > 0 ? (data.count / totalRfqs) * 100 : 0;
              return (
                <Link href={`/rfq?status=${key}`} key={key} className="block group">
                  <div className="flex flex-col gap-2 p-3 rounded-lg border border-slate-200/80 bg-white hover:shadow transition-all">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${data.text.replace("text-", "bg-")}`} />
                        <span className="text-sm text-slate-700 font-medium group-hover:text-slate-900 transition-colors">{data.label}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${data.bg} ${data.text} border ${data.border}`}>
                        {data.count}
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full ${data.text.replace("text-", "bg-")}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Recent RFQs */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col shadow-sm">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-white">
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">Đơn hàng mới nhất</h2>
            <Link href="/rfq" className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
              Xem tất cả <Eye className="w-3 h-3" />
            </Link>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50">
                  <th className="text-left text-xs text-slate-500 font-semibold px-5 py-3 uppercase tracking-wider">Mã RFO</th>
                  <th className="text-left text-xs text-slate-500 font-semibold px-5 py-3 uppercase tracking-wider">Khách hàng</th>
                  <th className="text-left text-xs text-slate-500 font-semibold px-5 py-3 uppercase tracking-wider">Ngày tạo</th>
                  <th className="text-left text-xs text-slate-500 font-semibold px-5 py-3 uppercase tracking-wider">Doanh thu ($)</th>
                  <th className="text-left text-xs text-slate-500 font-semibold px-5 py-3 uppercase tracking-wider">Trạng thái</th>
                  <th className="text-right text-xs text-slate-500 font-semibold px-5 py-3 uppercase tracking-wider">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentRfqs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-16">
                      <div className="flex flex-col items-center justify-center text-slate-400">
                        <Inbox className="w-8 h-8 mb-2 opacity-50" />
                        <p className="text-sm font-medium">Chưa có đơn hàng nào</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  recentRfqs.map((rfq) => {
                    const st = statusCounts[rfq.status] || { bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-200", label: rfq.status };
                    return (
                      <tr key={rfq.id} className="hover:bg-slate-50/80 transition-colors group">
                        <td className="px-5 py-3">
                          <span className="font-mono text-slate-900 font-semibold text-xs bg-slate-100 px-2 py-1 rounded">{rfq.rfqCode}</span>
                        </td>
                        <td className="px-5 py-3 text-slate-700 font-medium truncate max-w-[150px]">{rfq.client.companyName || "-"}</td>
                        <td className="px-5 py-3 text-slate-500 text-xs">{fmtDate(rfq.createdAt)}</td>
                        <td className="px-5 py-3 text-slate-900 font-mono text-xs font-semibold">
                          {(rfq.totalRevenueUsd || 0) > 0 ? fmtUSD(rfq.totalRevenueUsd || 0) : "-"}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`text-[11px] px-2 py-1 rounded-md font-medium border ${st.bg} ${st.text} ${st.border}`}>
                            {st.label}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <Link 
                            href={rfq.status === 'QUOTATION_DRAFTED' || rfq.status === 'QUOTED_TO_CLIENT' 
                              ? `/rfq/${rfq.id}/quote-preview` 
                              : rfq.status === 'CBU_PENDING_ADMIN'
                              ? `/rfq/${rfq.id}/cbu-calc`
                              : `/rfq/${rfq.id}/rfo-review`}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-500 hover:text-slate-900 shadow-sm transition-all"
                            title="Xem chi tiết"
                          >
                            <Eye className="w-4 h-4" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
