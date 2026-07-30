"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function AiConfigPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<any>({
    apiKey: "",
    modelName: "gemini-2.5-pro",
    inquiryPrompt: "",
    quotePrompt: "",
    toolsConfig: "",
    resendApiKey: ""
  });

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    const role = (session?.user as any)?.role;
    if (status === "authenticated" && role !== "ADMIN") {
      router.push("/overview");
    }
  }, [status, session, router]);

  useEffect(() => {
    const fetchConfig = async () => {
      const res = await fetch("/api/ai-config");
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      }
      setLoading(false);
    };
    if (status === "authenticated") fetchConfig();
  }, [status]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    
    // We send a POST request which will update existing core config
    // To avoid issues with POST in our handler, we pass id if we have it
    const res = await fetch("/api/ai-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });

    if (res.ok) {
      alert("Cấu hình AI đã được lưu thành công!");
    } else {
      alert("Lỗi khi lưu cấu hình AI.");
    }
    setSaving(false);
  };

  if (loading) return <div className="p-10 text-gray-500">Đang tải cấu hình...</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Cấu hình AI Lõi</h1>
        <p className="text-sm text-gray-500">Thiết lập Model, API Key và Prompt cho toàn hệ thống.</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 border-b border-gray-100 pb-2">Cấu hình AI (Google Gemini)</h2>
        <form onSubmit={handleSave} id="config-form" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Google Gemini API Key</label>
              <input
                type="password"
                value={config.apiKey}
                onChange={e => setConfig({ ...config, apiKey: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="AIzaSy..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Tên Model (Model Name)</label>
              <select
                value={config.modelName}
                onChange={e => setConfig({ ...config, modelName: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="gemini-1.5-flash">gemini-1.5-flash</option>
                <option value="gemini-1.5-pro">gemini-1.5-pro</option>
                <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                <option value="gemini-2.0-pro">gemini-2.0-pro</option>
                <option value="gemini-2.5-pro">gemini-2.5-pro</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">System Prompt - Inquiry (Bóc tách Yêu cầu của khách)</label>
            <textarea
              value={config.inquiryPrompt || ""}
              onChange={e => setConfig({ ...config, inquiryPrompt: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              rows={6}
              placeholder="System prompt dùng cho parseInquiryWithGemini..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">System Prompt - Supplier Quote (Bóc tách Báo giá Hãng)</label>
            <textarea
              value={config.quotePrompt || ""}
              onChange={e => setConfig({ ...config, quotePrompt: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              rows={6}
              placeholder="System prompt dùng cho parseSupplierQuoteWithGemini..."
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Cấu hình Tools (JSON Array)</label>
            <textarea
              value={config.toolsConfig || ""}
              onChange={e => setConfig({ ...config, toolsConfig: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              rows={4}
              placeholder='[ { "name": "toolName", "description": "..." } ]'
            />
          </div>

        </form>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 border-b border-gray-100 pb-2">Cấu hình Resend Mail</h2>
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Resend API Key</label>
            <input
              type="password"
              value={config.resendApiKey || ""}
              onChange={e => setConfig({ ...config, resendApiKey: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="re_..."
            />
          </div>
          <div className="pt-4 flex justify-end">
            <button
              onClick={handleSave}
              form="config-form"
              disabled={saving}
              className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Đang lưu..." : "Lưu Tất Cả Cấu Hình"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
