"use client";

import { useState, useEffect } from "react";
import { Search, Plus, Edit2, Trash2, Mail, Phone, Building2, MapPin } from "lucide-react";

interface Client {
  id: string;
  name: string;
  companyName: string;
  email: string;
  phone: string | null;
  address: string | null;
  _count?: {
    rfqs: number;
  };
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    companyName: "",
    email: "",
    phone: "",
    address: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const fetchClients = async (search = "") => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clients?search=${encodeURIComponent(search)}`);
      const data = await res.json();
      if (data.data) {
        setClients(data.data);
      }
    } catch (error) {
      console.error("Failed to fetch clients:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchClients(searchTerm);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const handleOpenModal = (client?: Client) => {
    if (client) {
      setEditingClient(client);
      setFormData({
        name: client.name,
        companyName: client.companyName,
        email: client.email,
        phone: client.phone || "",
        address: client.address || "",
      });
    } else {
      setEditingClient(null);
      setFormData({ name: "", companyName: "", email: "", phone: "", address: "" });
    }
    setError("");
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingClient(null);
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const url = editingClient ? `/api/clients/${editingClient.id}` : "/api/clients";
      const method = editingClient ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Có lỗi xảy ra. Vui lòng thử lại.");
      }

      await fetchClients(searchTerm);
      handleCloseModal();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string, rfqCount: number = 0) => {
    if (rfqCount > 0) {
      alert(`Không thể xóa khách hàng ${name} vì họ đang có ${rfqCount} đơn hàng (RFQ) trên hệ thống.`);
      return;
    }

    if (confirm(`Bạn có chắc chắn muốn xóa khách hàng ${name}? Thao tác này không thể hoàn tác.`)) {
      try {
        const res = await fetch(`/api/clients/${id}`, { method: "DELETE" });
        const data = await res.json();
        
        if (!res.ok || !data.success) {
          throw new Error(data.message || "Có lỗi xảy ra khi xóa.");
        }
        
        await fetchClients(searchTerm);
      } catch (err: any) {
        alert(err.message);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quản lý Khách Hàng</h1>
          <p className="text-gray-500 text-sm mt-1">Quản lý thông tin liên hệ và đối tác kinh doanh.</p>
        </div>
        
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          Thêm Khách Hàng
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
        {/* Toolbar */}
        <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-4 bg-gray-50/50">
          <div className="relative w-full max-w-md">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Tìm theo tên, email, công ty..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
            />
          </div>
          <div className="text-sm font-medium text-gray-500">
            Tổng cộng: <span className="text-gray-900 font-bold">{clients.length}</span>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto w-full max-w-[100vw]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-5 py-4 w-64">Khách hàng</th>
                <th className="px-5 py-4 w-72">Liên hệ</th>
                <th className="px-5 py-4">Địa chỉ</th>
                <th className="px-5 py-4 text-center w-32">Đơn hàng</th>
                <th className="px-5 py-4 text-right w-28">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-10 text-center text-gray-500">Đang tải dữ liệu...</td>
                </tr>
              ) : clients.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-10 text-center">
                    <div className="flex flex-col items-center justify-center text-gray-400 gap-3">
                      <Building2 className="w-12 h-12 text-gray-200" />
                      <p>Không tìm thấy khách hàng nào.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                clients.map((client) => (
                  <tr key={client.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-4 align-top">
                      <div className="font-semibold text-gray-900 text-base">{client.name}</div>
                      <div className="text-gray-500 text-xs mt-1 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5" />
                        {client.companyName}
                      </div>
                    </td>
                    <td className="px-5 py-4 align-top space-y-2">
                      <div className="flex items-center gap-2 text-gray-600">
                        <Mail className="w-4 h-4 text-gray-400 shrink-0" />
                        <span className="truncate">{client.email}</span>
                      </div>
                      {client.phone && (
                        <div className="flex items-center gap-2 text-gray-600">
                          <Phone className="w-4 h-4 text-gray-400 shrink-0" />
                          <span>{client.phone}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4 align-top">
                      {client.address ? (
                        <div className="flex items-start gap-2 text-gray-600 max-w-xs">
                          <MapPin className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                          <span className="line-clamp-2 leading-relaxed">{client.address}</span>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs italic">Chưa cập nhật</span>
                      )}
                    </td>
                    <td className="px-5 py-4 align-top text-center">
                      <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold border border-blue-100">
                        {client._count?.rfqs || 0} RFQ
                      </span>
                    </td>
                    <td className="px-5 py-4 align-top text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenModal(client)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Chỉnh sửa"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(client.id, client.name, client._count?.rfqs)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Xóa khách hàng"
                        >
                          <Trash2 className="w-4 h-4" />
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

      {/* Modal Thêm/Sửa */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">
                {editingClient ? "Sửa Thông Tin Khách Hàng" : "Thêm Khách Hàng Mới"}
              </h3>
              <button onClick={handleCloseModal} className="text-gray-400 hover:text-gray-600 p-1">
                ✕
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6">
              {error && (
                <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100">
                  {error}
                </div>
              )}
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700">Tên Khách Hàng *</label>
                    <input
                      required
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700">Số Điện Thoại</label>
                    <input
                      type="text"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">Tên Công Ty *</label>
                  <input
                    required
                    type="text"
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">Email Liên Hệ *</label>
                  <input
                    required
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">Địa Chỉ</label>
                  <textarea
                    rows={3}
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
                  />
                </div>
              </div>

              <div className="mt-8 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 text-sm font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl flex items-center gap-2"
                >
                  {submitting ? "Đang lưu..." : "Lưu Thay Đổi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
