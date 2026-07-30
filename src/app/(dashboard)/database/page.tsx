"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

const MODELS = ["user", "client", "rfq", "rfqItem", "task", "aiConfig"];

export default function DatabaseViewerPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [selectedModel, setSelectedModel] = useState("user");
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  const userRole = (session?.user as any)?.role;

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    fetchData();
  }, [selectedModel]);

  const fetchData = async () => {
    setLoading(true);
    const res = await fetch(`/api/database?model=${selectedModel}`);
    if (res.ok) {
      const json = await res.json();
      setData(json);
    }
    setLoading(false);
  };

  const handleEditClick = (item: any) => {
    setEditingId(item.id);
    setEditForm({ ...item });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleSave = async () => {
    setSaving(true);
    // basic omit createdat/updatedat from edit payload just in case
    const payload = { ...editForm };
    delete payload.createdAt;
    delete payload.updatedAt;

    const res = await fetch(`/api/database`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: selectedModel,
        id: editingId,
        data: payload,
      }),
    });

    if (res.ok) {
      setEditingId(null);
      fetchData();
    } else {
      alert("Lỗi khi lưu dữ liệu");
    }
    setSaving(false);
  };

  if (status === "loading" || loading && data.length === 0) {
    return <div className="p-10 text-gray-500">Đang tải...</div>;
  }

  const columns = data.length > 0 ? Object.keys(data[0]) : [];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Database Viewer</h1>
          <p className="text-sm text-gray-500">Xem và chỉnh sửa trực tiếp cơ sở dữ liệu (Admin Only).</p>
        </div>
        <select 
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {MODELS.map(m => (
            <option key={m} value={m}>{m.toUpperCase()}</option>
          ))}
        </select>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar max-h-[70vh]">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-4 py-3">Hành động</th>
                {columns.map(col => (
                  <th key={col} className="px-4 py-3">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data.map(item => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 sticky left-0 bg-white border-r border-gray-100 z-10">
                    {userRole === "ADMIN" ? (
                      editingId === item.id ? (
                        <div className="flex gap-2">
                          <button onClick={handleSave} disabled={saving} className="text-emerald-600 hover:text-emerald-800 font-medium">{saving ? "Lưu..." : "Lưu"}</button>
                          <button onClick={handleCancelEdit} className="text-gray-500 hover:text-gray-700 font-medium">Hủy</button>
                        </div>
                      ) : (
                        <button onClick={() => handleEditClick(item)} className="text-blue-600 hover:text-blue-800 font-medium">Sửa</button>
                      )
                    ) : (
                      <span className="text-gray-400 italic text-xs">Chỉ xem</span>
                    )}
                  </td>
                  {columns.map(col => (
                    <td key={col} className="px-4 py-3 text-gray-600">
                      {editingId === item.id && !['id', 'createdAt', 'updatedAt'].includes(col) ? (
                        <input
                          type={typeof item[col] === 'number' ? 'number' : 'text'}
                          value={editForm[col] === null ? '' : editForm[col]}
                          onChange={(e) => {
                            let val: any = e.target.value;
                            if (typeof item[col] === 'number') val = Number(val);
                            setEditForm({ ...editForm, [col]: val });
                          }}
                          className="w-full min-w-[100px] border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-blue-500"
                        />
                      ) : (
                        <span className="truncate max-w-[200px] inline-block">
                          {item[col] === null ? <em className="text-gray-400">null</em> : String(item[col])}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 1} className="text-center py-10 text-gray-500">
                    Không có dữ liệu trong bảng này.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
