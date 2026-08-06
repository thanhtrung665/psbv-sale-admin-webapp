"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Search, Filter, Settings2, Trash2, Edit, ChevronDown, UserCog, UserX, UserCheck } from "lucide-react";

type Role = "ADMIN" | "SALE_ADMIN";

// ── TYPES ─────────────────────────────────────────────────────────────────
interface OrderRow {
  orderId: string;
  rfqCode: string;
  opportunityName: string | null;
  clientName: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  incoTerm: string | null;
  paymentTerm: string | null;
  supplierName: string | null;
  supplierQuoteRef: string | null;
  status: string;
  createdAt: string;

  totalLogistics: number;
  bankFeePercent: number;
  insurancePercent: number;

  totalCostUsd: number | null;
  totalRevenueUsd: number | null;
  totalRevenueVnd: number | null;
  totalMarginUsd: number | null;
  actualMarginPct: number | null;

  itemId: string | null;
  lineNo: number | null;
  partNumber: string | null;
  description: string | null;
  qty: number | null;
  uom: string | null;
  supplierUnitPrice: number | null;
  netWeightLbs: number | null;

  dutyPercent: number | null;
  commissionPercent: number | null;
  marginPercent: number | null;
  unitCostUsd: number | null;
  ddpPriceUsd: number | null;
  ddpPriceVnd: number | null;
  marginPerUnitUsd: number | null;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
}

// ── COLUMN CONFIG ─────────────────────────────────────────────────────────
const ORDER_COLUMNS = [
  { key: "rfqCode", label: "Mã RFQ", default: true },
  { key: "status", label: "Status", default: true },
  { key: "clientName", label: "Khách Hàng", default: true },
  { key: "companyName", label: "Công Ty", default: false },
  { key: "opportunityName", label: "Cơ Hội", default: true },
  { key: "supplierName", label: "Hãng", default: true },
  { key: "partNumber", label: "Part No", default: true },
  { key: "qty", label: "Qty", default: true },
  { key: "supplierUnitPrice", label: "Unit Price ($)", default: true },
  { key: "netWeightLbs", label: "Weight (lbs)", default: false },
  { key: "unitCostUsd", label: "Base Cost ($)", default: true },
  { key: "ddpPriceUsd", label: "DDP ($)", default: true },
  { key: "marginPerUnitUsd", label: "Margin/U ($)", default: true },
  { key: "totalMarginUsd", label: "Total Margin ($)", default: false },
];

export default function DatabasePage() {
  const { data: session } = useSession();
  const router = useRouter();
  const role = (session?.user as any)?.role as Role | undefined;
  
  const [activeTab, setActiveTab] = useState<"ORDERS" | "USERS">("ORDERS");
  
  // Orders State
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>(
    ORDER_COLUMNS.reduce((acc, col) => ({ ...acc, [col.key]: col.default }), {})
  );
  const [showColMenu, setShowColMenu] = useState(false);

  // Users State
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  // ── DATA FETCHING ────────────────────────────────────────────────────────
  const fetchOrders = async () => {
    setOrdersLoading(true);
    try {
      const q = new URLSearchParams();
      if (searchTerm) q.append("search", searchTerm);
      if (filterStatus) q.append("status", filterStatus);
      
      const res = await fetch(`/api/database/orders?${q.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch orders");
      const { data } = await res.json();
      setOrders(data);
    } catch (err) {
      console.error(err);
    } finally {
      setOrdersLoading(false);
    }
  };

  const fetchUsers = async () => {
    if (role !== "ADMIN") return;
    setUsersLoading(true);
    try {
      const res = await fetch(`/api/database/users`);
      if (!res.ok) throw new Error("Failed to fetch users");
      const { data } = await res.json();
      setUsers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    if (role) {
      fetchOrders();
      if (role === "ADMIN" && activeTab === "USERS") {
        fetchUsers();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, activeTab]);

  // Debounced Search for Orders
  useEffect(() => {
    const timer = setTimeout(() => fetchOrders(), 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, filterStatus]);

  // ── HANDLERS ─────────────────────────────────────────────────────────────
  const handleDeleteOrder = async (id: string) => {
    if (!confirm("Xóa vĩnh viễn Đơn hàng và toàn bộ dữ liệu CBU/Sản phẩm liên quan?")) return;
    try {
      const res = await fetch(`/api/database/orders/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Xóa thất bại");
      }
      fetchOrders();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleUpdateUser = async (id: string, updates: any) => {
    try {
      const res = await fetch(`/api/database/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Cập nhật thất bại");
      fetchUsers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const fmt = (n: number | null | undefined) =>
    n != null ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-";

  // ── RENDER ───────────────────────────────────────────────────────────────
  if (!role) return <div className="p-10 text-center text-gray-500">Đang tải phân quyền...</div>;

  return (
    <div className="space-y-6 max-w-full mx-auto">
      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🗄️ Database Management</h1>
          <p className="text-sm text-gray-500 mt-1">Truy vấn, lọc và quản lý dữ liệu hệ thống.</p>
        </div>

        {role === "ADMIN" && (
          <div className="flex p-1 bg-gray-100 rounded-xl border border-gray-200">
            <button
              onClick={() => setActiveTab("ORDERS")}
              className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-all ${
                activeTab === "ORDERS" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Master Orders
            </button>
            <button
              onClick={() => setActiveTab("USERS")}
              className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-all ${
                activeTab === "USERS" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Users Directory
            </button>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 1: ORDERS MASTER TABLE
          ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "ORDERS" && (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-[600px]">
          
          {/* Toolbar */}
          <div className="p-4 border-b border-gray-200 bg-gray-50/80 flex flex-wrap gap-3 items-center justify-between">
            <div className="flex items-center gap-3 flex-1 min-w-[300px]">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Tìm ACxxxx, Khách hàng, Part No..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
                />
              </div>
              
              <div className="relative">
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="appearance-none pl-10 pr-8 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none shadow-sm cursor-pointer"
                >
                  <option value="">Tất cả Status</option>
                  <option value="INQUIRY_RECEIVED">Inquiry Received</option>
                  <option value="RFO_PENDING_ADMIN">RFO Pending</option>
                  <option value="RFO_SENT_TO_SUPPLIER">Sent to Supplier</option>
                  <option value="SUPPLIER_QUOTED">Supplier Quoted</option>
                  <option value="CBU_PENDING_ADMIN">CBU Pending</option>
                  <option value="QUOTATION_DRAFTED">Drafted</option>
                  <option value="QUOTED_TO_CLIENT">Quoted</option>
                </select>
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>

            {/* Column Visibility Menu */}
            <div className="relative">
              <button
                onClick={() => setShowColMenu(!showColMenu)}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50 shadow-sm"
              >
                <Settings2 className="w-4 h-4" />
                Hiển thị cột
              </button>
              
              {showColMenu && (
                <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-50 p-2">
                  <div className="text-xs font-semibold text-gray-500 uppercase px-3 py-2 border-b border-gray-100 mb-2">
                    Tùy chỉnh cột
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {ORDER_COLUMNS.map((col) => (
                      <label key={col.key} className="flex items-center gap-3 px-3 py-1.5 hover:bg-gray-50 rounded-lg cursor-pointer">
                        <input
                          type="checkbox"
                          checked={visibleCols[col.key]}
                          onChange={(e) => setVisibleCols((prev) => ({ ...prev, [col.key]: e.target.checked }))}
                          className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                        />
                        <span className="text-sm text-gray-700">{col.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Table Container */}
          <div className="flex-1 overflow-auto">
            {ordersLoading ? (
              <div className="flex items-center justify-center h-64 text-gray-400">Đang tải dữ liệu...</div>
            ) : orders.length === 0 ? (
              <div className="flex items-center justify-center h-64 text-gray-400">Không tìm thấy dữ liệu phù hợp.</div>
            ) : (
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0 z-10 shadow-sm">
                  <tr>
                    {ORDER_COLUMNS.map((col) => visibleCols[col.key] && (
                      <th key={col.key} className="px-4 py-3 font-semibold tracking-wider">
                        {col.label}
                      </th>
                    ))}
                    {role === "ADMIN" && <th className="px-4 py-3 font-semibold tracking-wider text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {orders.map((row, idx) => (
                    <tr key={`${row.orderId}-${row.itemId || idx}`} className="hover:bg-blue-50/30 transition-colors">
                      {ORDER_COLUMNS.map((col) => {
                        if (!visibleCols[col.key]) return null;
                        
                        let displayValue: any = (row as any)[col.key];
                        let cellClass = "px-4 py-3 text-gray-700";

                        // Special Formatting
                        if (["supplierUnitPrice", "unitCostUsd", "ddpPriceUsd", "marginPerUnitUsd", "totalMarginUsd"].includes(col.key)) {
                          displayValue = `$${fmt(displayValue)}`;
                          cellClass += " font-mono text-right";
                        }
                        if (col.key === "rfqCode") {
                          cellClass += " font-semibold text-blue-600";
                        }
                        if (col.key === "status") {
                          displayValue = <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-md">{displayValue}</span>;
                        }

                        return (
                          <td key={col.key} className={cellClass}>
                            {displayValue}
                          </td>
                        );
                      })}

                      {/* Actions for ADMIN */}
                      {role === "ADMIN" && (
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => router.push(`/rfq/${row.orderId}/cbu-calc`)}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Edit (Go to CBU)"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteOrder(row.orderId)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete Order"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 2: USERS DIRECTORY (ADMIN ONLY)
          ══════════════════════════════════════════════════════════════════════ */}
      {role === "ADMIN" && activeTab === "USERS" && (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-200 bg-gray-50/80">
            <h2 className="text-base font-bold text-gray-900">Quản trị Tài khoản Hệ thống</h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-500 uppercase bg-gray-50">
                <tr>
                  <th className="px-6 py-4 font-semibold">Tên & Email</th>
                  <th className="px-6 py-4 font-semibold">Vai trò (Role)</th>
                  <th className="px-6 py-4 font-semibold">Trạng thái</th>
                  <th className="px-6 py-4 font-semibold text-right">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {usersLoading ? (
                  <tr><td colSpan={4} className="p-8 text-center text-gray-400">Đang tải...</td></tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50/50">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-gray-900">{user.name}</div>
                        <div className="text-gray-500 text-xs">{user.email}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 text-xs font-semibold rounded-lg ${
                          user.role === "ADMIN" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                        }`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 text-xs font-semibold rounded-lg flex w-fit items-center gap-1.5 ${
                          user.isActive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${user.isActive ? "bg-emerald-500" : "bg-red-500"}`}></span>
                          {user.isActive ? "Active" : "Disabled"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleUpdateUser(user.id, { role: user.role === "ADMIN" ? "SALE_ADMIN" : "ADMIN" })}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-blue-600 transition-colors"
                          >
                            <UserCog className="w-3.5 h-3.5" />
                            Đổi Quyền
                          </button>
                          <button
                            onClick={() => handleUpdateUser(user.id, { isActive: !user.isActive })}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors ${
                              user.isActive 
                                ? "text-red-600 bg-red-50 border-red-200 hover:bg-red-100" 
                                : "text-emerald-600 bg-emerald-50 border-emerald-200 hover:bg-emerald-100"
                            }`}
                          >
                            {user.isActive ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                            {user.isActive ? "Khóa" : "Mở Khóa"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      
      {/* Click-away listener area (simplified) for dropdowns could be added here if needed */}
    </div>
  );
}
