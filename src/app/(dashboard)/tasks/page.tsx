"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";

export default function TasksPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role;
  const currentUserId = (session?.user as any)?.id;

  const [tasks, setTasks] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");

  const fetchTasks = async () => {
    const res = await fetch("/api/tasks");
    if (res.ok) {
      const data = await res.json();
      setTasks(data);
    }
  };

  const fetchUsers = async () => {
    if (userRole === "ADMIN") {
      const res = await fetch("/api/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
        if (data.length > 0) setAssigneeId(data[0].id);
      }
    } else {
      setAssigneeId(currentUserId);
    }
  };

  useEffect(() => {
    if (session) {
      fetchTasks();
      fetchUsers();
      setLoading(false);
    }
  }, [session, userRole]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;

    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description,
        assigneeId: userRole === "ADMIN" ? assigneeId : currentUserId,
        dueDate,
      }),
    });

    if (res.ok) {
      setTitle("");
      setDescription("");
      setDueDate("");
      fetchTasks();
    }
  };

  const handleUpdateStatus = async (taskId: string, status: string) => {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    if (res.ok) {
      fetchTasks();
    }
  };

  if (loading) return <div className="p-8 text-gray-500">Đang tải...</div>;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Quản lý Công việc</h1>
        <p className="text-sm text-gray-500">Theo dõi và phân công công việc hàng ngày.</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Tạo Task Mới</h2>
        <form onSubmit={handleCreateTask} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tiêu đề</label>
              <input 
                type="text" 
                value={title}
                onChange={e => setTitle(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ngày đến hạn</label>
              <input 
                type="date" 
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả (Không bắt buộc)</label>
            <textarea 
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={2}
            />
          </div>

          {userRole === "ADMIN" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Giao cho (Assignee)</label>
              <select 
                value={assigneeId}
                onChange={e => setAssigneeId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                ))}
              </select>
            </div>
          )}
          
          <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
            Tạo Task
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {["PENDING", "IN_PROGRESS", "DONE"].map(status => (
          <div key={status} className="bg-gray-50 border border-gray-200 rounded-2xl p-4 min-h-[400px]">
            <h3 className="text-sm font-bold text-gray-700 uppercase mb-4 tracking-wider">
              {status === "PENDING" ? "Chờ xử lý" : status === "IN_PROGRESS" ? "Đang làm" : "Hoàn thành"}
            </h3>
            <div className="space-y-3">
              {tasks.filter(t => t.status === status).map(task => (
                <div key={task.id} className="bg-white border border-gray-200 p-4 rounded-xl shadow-sm">
                  <h4 className="font-semibold text-gray-900 mb-1">{task.title}</h4>
                  {task.description && <p className="text-sm text-gray-500 mb-3">{task.description}</p>}
                  <div className="flex items-center justify-between mt-4 text-xs text-gray-400">
                    <div>
                      Giao cho: <span className="font-medium text-gray-600">{task.assignee?.name}</span>
                    </div>
                    {task.dueDate && <div>Hạn: {new Date(task.dueDate).toLocaleDateString()}</div>}
                  </div>
                  <div className="mt-3 pt-3 border-t border-gray-100 flex gap-2">
                    {status !== "PENDING" && (
                      <button onClick={() => handleUpdateStatus(task.id, "PENDING")} className="text-xs text-blue-600 hover:underline">Về Chờ</button>
                    )}
                    {status !== "IN_PROGRESS" && (
                      <button onClick={() => handleUpdateStatus(task.id, "IN_PROGRESS")} className="text-xs text-amber-600 hover:underline">Đang Làm</button>
                    )}
                    {status !== "DONE" && (
                      <button onClick={() => handleUpdateStatus(task.id, "DONE")} className="text-xs text-emerald-600 hover:underline">Hoàn Thành</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
