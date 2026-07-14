import { cn } from "../../lib/util";

interface TabsProps {
  value: string;
  onValueChange: (value: string) => void;
  items: { value: string; label: string }[];
  className?: string;
}

export function Tabs({ value, onValueChange, items, className }: TabsProps) {
  return (
    <div className={cn("inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1", className)}>
      {items.map((item) => (
        <button
          key={item.value}
          onClick={() => onValueChange(item.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-all",
            value === item.value
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
