"use client";

import React, { useState, useEffect, useRef } from "react";
import { Search, Loader2, ChevronDown } from "lucide-react";

interface RfqItem {
  id: string;
  rfqCode: string;
  client?: { name: string; companyName: string } | null;
  // Other fields we don't care about
}

interface SmartRfqSelectorProps {
  value: string;
  onChange: (rfqCode: string) => void;
  placeholder?: string;
  className?: string;
}

export function SmartRfqSelector({ value, onChange, placeholder = "Nhập mã RFQ hoặc Tên dự án...", className = "" }: SmartRfqSelectorProps) {
  const [rfqs, setRfqs] = useState<RfqItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(value);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external value
  useEffect(() => {
    setSearchTerm(value);
  }, [value]);

  // Fetch RFQs on mount
  useEffect(() => {
    let mounted = true;
    const fetchRfqs = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/rfq");
        const data = await res.json();
        if (mounted && Array.isArray(data)) {
          setRfqs(data);
        }
      } catch (err) {
        console.error("Failed to fetch RFQs for selector", err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchRfqs();
    return () => { mounted = false; };
  }, []);

  // Handle outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        // Reset search term to selected value if closed without selection
        if (value) {
          setSearchTerm(value);
        }
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [value]);

  // Filter logic: match RFQ Code or Client Name/Company
  const filteredRfqs = rfqs.filter((rfq) => {
    const term = searchTerm.toLowerCase();
    const matchCode = rfq.rfqCode?.toLowerCase().includes(term);
    const matchClient = rfq.client?.name?.toLowerCase().includes(term) || rfq.client?.companyName?.toLowerCase().includes(term);
    return matchCode || matchClient;
  });

  return (
    <div className="relative w-full" ref={containerRef}>
      <div 
        className={`flex items-center w-full px-3 transition-all bg-white border border-slate-300 rounded-xl shadow-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 ${className}`}
        onClick={() => {
          setIsOpen(true);
          inputRef.current?.focus();
        }}
      >
        <Search className="w-4 h-4 text-slate-400 shrink-0 mr-2" />
        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="flex-1 bg-transparent border-none outline-none h-full text-sm text-slate-800 font-mono min-h-[44px]"
        />
        {loading ? (
          <Loader2 className="w-4 h-4 text-slate-400 animate-spin shrink-0 ml-2" />
        ) : (
          <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 ml-2 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        )}
      </div>

      {isOpen && (
        <div className="absolute z-[100] w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-72 flex flex-col">
          <div className="overflow-y-auto flex-1 p-1.5 scrollbar-thin">
            {filteredRfqs.length > 0 ? (
              filteredRfqs.map((rfq) => (
                <div
                  key={rfq.id}
                  onClick={() => {
                    onChange(rfq.rfqCode);
                    setSearchTerm(rfq.rfqCode);
                    setIsOpen(false);
                  }}
                  className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-blue-50 cursor-pointer transition-colors"
                >
                  <span className="font-bold font-mono text-sm text-slate-900 mr-4 shrink-0">
                    {rfq.rfqCode}
                  </span>
                  <span className="text-xs text-slate-500 truncate text-right">
                    {rfq.client?.name || rfq.client?.companyName || "N/A"}
                  </span>
                </div>
              ))
            ) : (
              <div className="px-4 py-8 text-center text-sm text-slate-500">
                {loading ? "Đang tải dữ liệu..." : "Không tìm thấy RFQ nào phù hợp."}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
