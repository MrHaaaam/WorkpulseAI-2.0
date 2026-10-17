import { Input } from "./ui/Input";
import { useRef } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";

export function DateNavigator({ label, value, onChange, navigation = "day" }: { label: string; value: string; onChange: (value: string) => void; navigation?: "day" | "semi-monthly" }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const isValidDate = (candidate: string) => /^\d{4}-\d{2}-\d{2}$/.test(candidate) && Number.isFinite(new Date(`${candidate}T12:00:00`).getTime());
  const selectedDate = isValidDate(value) ? value : today;
  const changeDate = (candidate: string) => {
    const nextDate = isValidDate(candidate) ? candidate : today;
    // Native date pickers emit an empty string when Clear is clicked.
    // Keep both the browser input and consumers on a usable date.
    if (inputRef.current) inputRef.current.value = nextDate;
    onChange(nextDate);
  };
  const moveDay = (amount: number) => {
    const date = new Date(`${selectedDate}T12:00:00`);
    if (navigation === "semi-monthly") {
      const secondHalf = date.getDate() >= 16;
      if (amount < 0) {
        if (secondHalf) date.setDate(1);
        else { date.setMonth(date.getMonth() - 1); date.setDate(16); }
      } else if (secondHalf) {
        date.setMonth(date.getMonth() + 1); date.setDate(1);
      } else date.setDate(16);
    } else date.setDate(date.getDate() + amount);
    changeDate(date.toISOString().slice(0, 10));
  };
  const formatted = new Date(`${selectedDate}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const openCalendar = () => {
    const input = inputRef.current;
    if (!input) return;
    if (typeof input.showPicker === "function") input.showPicker();
    else {
      input.focus();
      input.click();
    }
  };

  return (
    <div className="date-navigator relative flex w-full max-w-full items-stretch sm:w-auto overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <button type="button" onClick={() => moveDay(-1)} aria-label={navigation === "semi-monthly" ? "Previous payroll period" : "Previous day"} className="flex min-h-11 w-10 shrink-0 items-center justify-center border-r border-slate-200 text-slate-400 transition-colors hover:bg-violet-50 hover:text-[#8642ED]">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button type="button" onClick={openCalendar} aria-label={`Open ${label} calendar`} className="date-navigator-picker relative flex min-w-0 flex-1 sm:min-w-[210px] cursor-pointer items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-violet-50">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#8642ED]/10 text-[#8642ED]"><Calendar className="h-4 w-4" /></span>
        <span className="min-w-0">
          <span className="date-navigator-label block text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
          <span className="date-navigator-full block whitespace-nowrap text-xs font-semibold text-slate-700">{formatted}</span>
          <span className="date-navigator-short hidden whitespace-nowrap text-xs font-semibold text-slate-700">{new Date(`${selectedDate}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
        </span>
        <span className="date-navigator-choose ml-auto hidden text-[10px] font-semibold sm:inline text-[#8642ED]">Choose</span>
      </button>
      <Input ref={inputRef} aria-label={label} type="date" value={selectedDate} onChange={(event) => changeDate(event.target.value)} className="pointer-events-none absolute h-px w-px opacity-0" />
      <button type="button" onClick={() => moveDay(1)} aria-label={navigation === "semi-monthly" ? "Next payroll period" : "Next day"} className="flex min-h-11 w-10 shrink-0 items-center justify-center border-l border-slate-200 text-slate-400 transition-colors hover:bg-violet-50 hover:text-[#8642ED]">
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
