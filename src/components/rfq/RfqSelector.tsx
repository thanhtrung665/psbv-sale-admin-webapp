import { useEffect, useState, useRef, KeyboardEvent } from "react";
import { Search } from "lucide-react";
import useSWR from "swr";

type RfqOption = {
  id: string;
  rfqCode: string;
  clientName: string;
  project?: string;
};

type RfqSelectorProps = {
  value: string;
  onChange: (code: string) => void;
  placeholder?: string;
  className?: string;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function RfqSelector({
  value,
  onChange,
  placeholder = "Nhập mã RFQ hoặc tên dự án...",
  className,
}: RfqSelectorProps) {
  const { data: raw } = useSWR<RfqOption[] | unknown>(
    "/api/rfq/search-codes",
    fetcher,
    { revalidateOnFocus: false }
  );
  const suggestions: RfqOption[] = Array.isArray(raw) ? raw : [];

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState(value);
  const [filtered, setFiltered] = useState<RfqOption[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter on each keystroke
  useEffect(() => {
    const safe = Array.isArray(suggestions) ? suggestions : [];
    const term = input.trim().toLowerCase();
    if (!term) {
      setFiltered(safe);
      return;
    }
    setFiltered(
      safe.filter(
        (s) =>
          s.rfqCode.toLowerCase().includes(term) ||
          s.clientName?.toLowerCase().includes(term) ||
          s.project?.toLowerCase().includes(term)
      )
    );
  }, [input, suggestions]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Sync when parent changes value
  useEffect(() => setInput(value), [value]);

  const select = (code: string) => {
    onChange(code);
    setInput(code);
    setOpen(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const exists = suggestions.some((s) => s.rfqCode === input.trim());
      if (!exists && input.trim()) {
        select(input.trim());
      } else if (filtered[0]) {
        select(filtered[0].rfqCode);
      }
    }
    if (e.key === "Escape") setOpen(false);
  };

  // Whether to show "create new" option
  const showCreate =
    input.trim().length > 0 &&
    !suggestions.some(
      (s) => s.rfqCode.toLowerCase() === input.trim().toLowerCase()
    );

  // Show empty state only if no filtered results AND no create option
  const showEmpty = filtered.length === 0 && !showCreate;

  return (
    <div className={`relative w-full${className ? ` ${className}` : ""}`} ref={containerRef}>
      {/* ── Input box ── */}
      <div className="flex items-center gap-2 px-3 py-1.5 border border-slate-300 rounded-xl bg-white shadow-sm h-11 focus-within:ring-2 focus-within:ring-slate-300/50 focus-within:border-slate-400 transition-all">
        <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
        <input
          className="flex-1 h-full bg-transparent text-sm font-mono outline-none placeholder:text-slate-400 placeholder:font-sans"
          placeholder={placeholder}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          spellCheck={false}
        />
        {input && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => { setInput(""); onChange(""); setOpen(false); }}
            className="w-4 h-4 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors flex-shrink-0"
          >
            ×
          </button>
        )}
      </div>

      {/* ── Dropdown ── */}
      {open && (
        <div className="absolute top-full left-0 right-0 z-[100] mt-1.5 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
          {/* Scrollable list */}
          <div className="max-h-52 overflow-y-auto p-1 space-y-0.5">
            {/* Creatable "use new code" row */}
            {showCreate && (
              <button
                type="button"
                onClick={() => select(input.trim())}
                className="flex w-full items-center gap-2 px-3 py-2 rounded-lg text-left hover:bg-blue-50 transition-colors"
              >
                <span className="text-xs text-blue-500 flex-shrink-0">➕</span>
                <span className="text-sm font-medium text-blue-600 truncate">
                  Sử dụng mã mới: &quot;{input.trim()}&quot;
                </span>
              </button>
            )}

            {/* Empty state */}
            {showEmpty && (
              <div className="px-3 py-3 text-sm text-slate-400 text-center">
                Không tìm thấy đề xuất
              </div>
            )}

            {/* Suggestion rows */}
            {filtered.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => select(opt.rfqCode)}
                className="flex w-full flex-col gap-0.5 px-3 py-2 rounded-lg text-left hover:bg-slate-100/80 active:bg-slate-200 transition-colors cursor-pointer"
              >
                <span className="text-sm font-semibold font-mono text-slate-900 truncate w-full">
                  {opt.rfqCode}
                </span>
                {opt.clientName && (
                  <span className="text-xs text-slate-500 truncate w-full">
                    {opt.clientName}
                    {opt.project ? ` — ${opt.project}` : ""}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
