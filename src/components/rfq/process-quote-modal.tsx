"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ProcessQuoteModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rfqCode, setRfqCode] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Search logic
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSuggestions([]);
      return;
    }

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/rfq/search-codes?q=${searchQuery}`);
        const data = await res.json();
        if (Array.isArray(data)) {
          setSuggestions(data);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery]);

  // File drag & drop logic
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const onSubmit = async () => {
    if (!rfqCode) return setError("Vui lòng nhập hoặc chọn mã RFQ (ACxxxx).");
    if (!file) return setError("Vui lòng tải lên file báo giá (PDF).");

    setIsLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("rfqCode", rfqCode);
    formData.append("file", file);

    try {
      const res = await fetch("/api/rfq/quick-parse-quote", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Có lỗi xảy ra khi bóc tách.");
      }

      // Success
      setOpen(false);
      router.push(`/rfq/${data.rfqId}/cbu-calc`);
    } catch (err: any) {
      setError(err.message);
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => {
      setOpen(val);
      if (!val) {
        setRfqCode("");
        setSearchQuery("");
        setFile(null);
        setError(null);
        setIsLoading(false);
      }
    }}>
      <DialogTrigger asChild>
        <button className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-gray-50 text-gray-700 text-sm font-semibold rounded-xl border border-gray-200 shadow-sm transition-all">
          <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          ⚡ Xử lý Quote
        </button>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Xử lý Quote Hãng</DialogTitle>
          <DialogDescription>
            Bóc tách file PDF báo giá của hãng bằng AI và tự động tính CBU.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">
              {error}
            </div>
          )}

          {/* Search AC Code */}
          <div className="space-y-2 relative">
            <Label>Mã Đơn Hàng (RFQ Code)</Label>
            <Input 
              placeholder="Gõ mã ACxxxx để tìm..." 
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setRfqCode(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            />
            
            {showSuggestions && (searchQuery.length >= 2) && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
                {isSearching ? (
                  <div className="p-3 text-sm text-gray-500 text-center">Đang tìm...</div>
                ) : suggestions.length > 0 ? (
                  suggestions.map((s) => (
                    <div 
                      key={s.id}
                      className="px-3 py-2 hover:bg-gray-50 cursor-pointer border-b last:border-0"
                      onClick={() => {
                        setSearchQuery(s.rfqCode);
                        setRfqCode(s.rfqCode);
                        setShowSuggestions(false);
                      }}
                    >
                      <div className="font-semibold text-sm text-blue-600">{s.rfqCode}</div>
                      <div className="text-xs text-gray-500 truncate">{s.clientName} - {s.companyName}</div>
                    </div>
                  ))
                ) : (
                  <div className="p-3 text-sm text-gray-500 text-center">Không tìm thấy mã đơn.</div>
                )}
              </div>
            )}
          </div>

          {/* File Upload Zone */}
          <div className="space-y-2">
            <Label>File Báo Giá Hãng (PDF)</Label>
            <div 
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              className={`mt-2 flex justify-center rounded-xl border-2 border-dashed px-6 py-10 transition-colors ${
                isDragging ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-gray-400"
              }`}
            >
              <div className="text-center">
                <svg className="mx-auto h-12 w-12 text-gray-300" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M1.5 6a2.25 2.25 0 012.25-2.25h16.5A2.25 2.25 0 0122.5 6v12a2.25 2.25 0 01-2.25 2.25H3.75A2.25 2.25 0 011.5 18V6zM3 16.06V18c0 .414.336.75.75.75h16.5A.75.75 0 0021 18v-1.94l-2.69-2.689a1.5 1.5 0 00-2.12 0l-.88.879.97.97a.75.75 0 11-1.06 1.06l-5.16-5.159a1.5 1.5 0 00-2.12 0L3 16.061zm10.125-7.81a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0z" clipRule="evenodd" />
                </svg>
                <div className="mt-4 flex flex-col items-center text-sm leading-6 text-gray-600">
                  {file ? (
                    <div className="font-semibold text-blue-600 mb-2">{file.name}</div>
                  ) : (
                    <>
                      <label
                        htmlFor="file-upload"
                        className="relative cursor-pointer rounded-md bg-white font-semibold text-blue-600 focus-within:outline-none focus-within:ring-2 focus-within:ring-blue-600 focus-within:ring-offset-2 hover:text-blue-500"
                      >
                        <span>Tải file lên</span>
                        <input id="file-upload" name="file-upload" type="file" className="sr-only" accept=".pdf,image/*" onChange={(e) => {
                          if (e.target.files && e.target.files.length > 0) {
                            setFile(e.target.files[0]);
                          }
                        }} />
                      </label>
                      <p className="pl-1">hoặc kéo thả vào đây</p>
                    </>
                  )}
                </div>
                <p className="text-xs leading-5 text-gray-500">PDF, PNG, JPG up to 10MB</p>
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={onSubmit}
          disabled={isLoading || !rfqCode || !file}
          className="w-full flex justify-center items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Gemini đang đọc file {file?.name} cho đơn hàng {rfqCode}...
            </>
          ) : (
            <>
              <svg className="w-5 h-5 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              BÓC TÁCH BẰNG AI & TÍNH CBU
            </>
          )}
        </button>
      </DialogContent>
    </Dialog>
  );
}
