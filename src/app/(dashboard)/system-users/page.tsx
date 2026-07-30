"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";

type User = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "SALE_ADMIN";
  isActive: boolean;
  createdAt: string;
};

export default function SystemUsersPage() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({ name: "", email: "", password: "", role: "SALE_ADMIN" });
  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  const showToast = (msg: string, type: "ok" | "err") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/users");
    if (res.ok) setUsers(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });
    setSubmitting(false);
    if (res.ok) {
      showToast("Tạo tài khoản thành công!", "ok");
      setShowDialog(false);
      setFormData({ name: "", email: "", password: "", role: "SALE_ADMIN" });
      fetchUsers();
    } else {
      const data = await res.json();
      showToast(data.error || "Có lỗi xảy ra.", "err");
    }
  };

  const handleToggleActive = async (user: User) => {
    const res = await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: user.id, isActive: !user.isActive }),
    });
    if (res.ok) {
      showToast(`Tài khoản ${user.isActive ? "đã bị khóa" : "đã được mở"}.`, "ok");
      fetchUsers();
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setSubmitting(true);
    const res = await fetch("/api/users", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: selectedUser.id, newPassword }),
    });
    setSubmitting(false);
    if (res.ok) {
      showToast("Đặt lại mật khẩu thành công!", "ok");
      setShowResetDialog(false);
      setNewPassword("");
    } else {
      const data = await res.json();
      showToast(data.error || "Có lỗi xảy ra.", "err");
    }
  };

  if (status === "loading") return null;

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all duration-300 ${
          toast.type === "ok"
            ? "bg-emerald-900/90 border-emerald-700 text-emerald-300"
            : "bg-red-900/90 border-red-700 text-red-300"
        }`}>
          {toast.type === "ok" ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Quản lý Tài khoản</h1>
          <p className="text-slate-400 text-sm mt-0.5">Quản lý người dùng và phân quyền hệ thống</p>
        </div>
        <button
          id="add-user-btn"
          onClick={() => setShowDialog(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-blue-500/20 transition-all duration-200"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Thêm Tài khoản
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Tổng tài khoản", value: users.length, color: "blue" },
          { label: "Đang hoạt động", value: users.filter(u => u.isActive).length, color: "emerald" },
          { label: "Đã khóa", value: users.filter(u => !u.isActive).length, color: "red" },
        ].map(stat => (
          <div key={stat.label} className={`bg-slate-800/50 border border-slate-700/50 rounded-xl p-4`}>
            <p className="text-slate-400 text-xs">{stat.label}</p>
            <p className={`text-2xl font-bold mt-1 text-${stat.color}-400`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-700/50">
              <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-5 py-4">Họ tên</th>
              <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-5 py-4">Email</th>
              <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-5 py-4">Vai trò</th>
              <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-5 py-4">Trạng thái</th>
              <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-5 py-4">Ngày tạo</th>
              <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wider px-5 py-4">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/30">
            {loading ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-slate-500">
                  <svg className="animate-spin w-6 h-6 mx-auto mb-2 text-blue-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Đang tải...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-slate-500">Chưa có tài khoản nào.</td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="hover:bg-slate-700/20 transition-colors duration-100">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-white text-sm font-semibold">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-white text-sm font-medium">{user.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-slate-300 text-sm">{user.email}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg font-semibold ${
                      user.role === "ADMIN"
                        ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                        : "bg-slate-600/50 text-slate-300 border border-slate-600/50"
                    }`}>
                      {user.role === "ADMIN" ? "Master Admin" : "Sale Admin"}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg font-semibold ${
                      user.isActive
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : "bg-red-500/10 text-red-400 border border-red-500/20"
                    }`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      {user.isActive ? "Hoạt động" : "Đã khóa"}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-slate-400 text-sm">
                    {new Date(user.createdAt).toLocaleDateString("vi-VN")}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => { setSelectedUser(user); setShowResetDialog(true); }}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 transition-all duration-150"
                        title="Reset mật khẩu"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleToggleActive(user)}
                        className={`p-1.5 rounded-lg transition-all duration-150 ${
                          user.isActive
                            ? "text-slate-500 hover:text-red-400 hover:bg-red-500/10"
                            : "text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10"
                        }`}
                        title={user.isActive ? "Khóa tài khoản" : "Mở tài khoản"}
                      >
                        {user.isActive ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create User Dialog */}
      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">Thêm Tài khoản Mới</h2>
              <button onClick={() => setShowDialog(false)} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-all">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              {[
                { label: "Họ và tên", id: "new-name", key: "name", type: "text", placeholder: "Nguyễn Văn A" },
                { label: "Email", id: "new-email", key: "email", type: "email", placeholder: "email@psbv.com" },
                { label: "Mật khẩu", id: "new-password", key: "password", type: "password", placeholder: "Tối thiểu 6 ký tự" },
              ].map(f => (
                <div key={f.key}>
                  <label htmlFor={f.id} className="block text-xs font-medium text-slate-400 mb-1.5">{f.label}</label>
                  <input
                    id={f.id}
                    type={f.type}
                    required
                    placeholder={f.placeholder}
                    value={(formData as any)[f.key]}
                    onChange={e => setFormData(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full px-3.5 py-2.5 bg-slate-900/60 border border-slate-600/50 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                  />
                </div>
              ))}
              <div>
                <label htmlFor="new-role" className="block text-xs font-medium text-slate-400 mb-1.5">Vai trò</label>
                <select
                  id="new-role"
                  value={formData.role}
                  onChange={e => setFormData(prev => ({ ...prev, role: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-slate-900/60 border border-slate-600/50 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                >
                  <option value="SALE_ADMIN">Sale Admin</option>
                  <option value="ADMIN">Master Admin</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowDialog(false)} className="flex-1 py-2.5 px-4 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium transition-all">
                  Hủy
                </button>
                <button
                  id="create-user-submit"
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white text-sm font-semibold transition-all"
                >
                  {submitting ? "Đang tạo..." : "Tạo tài khoản"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Dialog */}
      {showResetDialog && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">Đặt lại Mật khẩu</h2>
              <button onClick={() => setShowResetDialog(false)} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-all">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-slate-400 text-sm mb-4">Đặt lại mật khẩu cho <span className="text-white font-medium">{selectedUser.email}</span></p>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label htmlFor="reset-password" className="block text-xs font-medium text-slate-400 mb-1.5">Mật khẩu mới</label>
                <input
                  id="reset-password"
                  type="password"
                  required
                  minLength={6}
                  placeholder="Tối thiểu 6 ký tự"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-900/60 border border-slate-600/50 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowResetDialog(false)} className="flex-1 py-2.5 px-4 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium transition-all">
                  Hủy
                </button>
                <button
                  id="reset-password-submit"
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:opacity-50 text-white text-sm font-semibold transition-all"
                >
                  {submitting ? "Đang lưu..." : "Đặt lại"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
