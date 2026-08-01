import { 
  Fingerprint,
  LayoutDashboard, 
  Users, 
  ReceiptText, 
  Settings, 
  LogOut, 
  ChevronRight, 
  Sparkles,
  Calendar
} from "lucide-react";
import { cn } from "../lib/utils";
import { Badge } from "./ui/Badge";

export type ViewKey =
  | "overview"
  | "attendance"
  | "employees"
  | "leave"
  | "payroll"
  | "insights"
  | "settings"
  | "admin";

interface SidebarProps {
  active: ViewKey;
  onNavigate: (view: ViewKey) => void;
}

export function AdminSidebar({ active, onNavigate }: SidebarProps) {
  async function logout() {
    const token = sessionStorage.getItem('workpulse_token');
    try {
      if (token) await fetch('http://localhost:5000/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    } finally {
      sessionStorage.removeItem('workpulse_token');
      window.location.href = '/';
    }
  }
  const navItems: { key: ViewKey; label: string; icon: React.ElementType }[] = [
    { key: 'overview', label: 'Overview', icon: LayoutDashboard },
    { key: 'attendance', label: 'Attendance', icon: Calendar },
    { key: 'employees', label: 'Employee Directory', icon: Users },
    { key: 'leave', label: 'Leave Requests', icon: Calendar },
    { key: 'payroll', label: 'Payroll', icon: ReceiptText },
    { key: 'insights', label: 'AI Insights', icon: Sparkles },
    { key: 'settings', label: 'System Settings', icon: Settings },
    { key: 'admin', label: 'Admin Controls', icon: Settings },
  ];

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center gap-2.5 border-b border-slate-200 px-3 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#8642ED] shadow-md shadow-[#8642ED]/25">
          <Fingerprint className="h-[18px] w-[18px] text-white" />
        </div>
        <div className="min-w-0">
          <h2 className="text-[13px] font-bold leading-tight tracking-tight text-slate-900">
            <span className="font-extrabold">Work</span>
            <span className="font-extrabold text-[#8642ED]">PULSE</span>
            <span className="font-extrabold"> AI</span>
          </h2>
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">Admin</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3 scrollbar-thin">
        <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Admin Menu</p>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              className={cn(
                "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all",
                isActive ? "bg-[#8642ED]/10 text-[#8642ED]" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <Icon className={cn("h-[18px] w-[18px] shrink-0 transition-colors", isActive ? "text-[#8642ED]" : "text-slate-400 group-hover:text-slate-600")} />
              {item.label}
              {isActive && <ChevronRight className="ml-auto h-3.5 w-3.5 text-[#8642ED]" />}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 p-3">
        <div className="flex items-center gap-2.5 rounded-lg bg-slate-50 p-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#8642ED] text-[13px] font-bold text-white">A</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-slate-900">Admin User</p>
            <div className="flex items-center gap-1.5">
              <Badge variant="success" className="px-1.5 py-0">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Online
              </Badge>
            </div>
          </div>
          <button onClick={logout} aria-label="Log out" className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
