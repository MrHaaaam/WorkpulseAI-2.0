import { LayoutDashboard, Users, ReceiptText, Settings, LogOut, ChevronRight, BarChart2 } from "lucide-react";
import { cn } from "../lib/utils";
import { Badge } from "./ui/Badge";
import { ViewKey } from "./Sidebar";

interface SidebarProps {
  active: ViewKey;
  onNavigate: (view: ViewKey) => void;
}

export function AdminSidebar({ active, onNavigate }: SidebarProps) {
  const navItems: { key: ViewKey; label: string; icon: React.ElementType }[] = [
    { key: 'overview', label: 'Overview', icon: LayoutDashboard },
    { key: 'employees', label: 'Employee Directory', icon: Users },
    { key: 'payroll', label: 'Payroll Approvals', icon: ReceiptText },
    { key: 'analytics', label: 'Analytics', icon: BarChart2 },
    { key: 'admin', label: 'Admin Settings', icon: Settings },
  ];

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center gap-2.5 border-b border-slate-200 px-4 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#8642ED] shadow-lg shadow-[#8642ED]/30">
          <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L6 13h6l-2 9 10-11h-6l2-10z" fill="white"/></svg>
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-bold leading-tight tracking-tight text-slate-900">
            <span className="font-extrabold">Work</span>
            <span className="font-extrabold text-[#8642ED]">PULSE</span>
            <span className="font-extrabold"> AI</span>
          </h2>
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-400">Admin</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-4 scrollbar-thin">
        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Admin</p>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              className={cn(
                "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                isActive ? "bg-[#8642ED]/10 text-[#8642ED]" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <Icon className={cn("h-5 w-5 shrink-0 transition-colors", isActive ? "text-[#8642ED]" : "text-slate-400 group-hover:text-slate-600")} />
              {item.label}
              {isActive && <ChevronRight className="ml-auto h-4 w-4 text-[#8642ED]" />}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 p-4">
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#8642ED] to-[#8642ED] text-sm font-bold text-white">A</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">Admin User</p>
            <div className="flex items-center gap-1.5">
              <Badge variant="success" className="px-1.5 py-0">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Online
              </Badge>
            </div>
          </div>
          <button className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
