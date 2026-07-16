import { 
  Fingerprint, 
  LayoutDashboard, 
  Users, 
  ScanLine, 
  ReceiptText, 
  Settings, 
  LogOut, 
  ChevronRight, 
  BarChart2, 
  Calendar 
} from "lucide-react";
import { cn } from "../lib/utils";
import { Badge } from "./ui/Badge";

// 1. Added "attendance" to the allowed ViewKey types
export type ViewKey = 
  | "overview" 
  | "attendance" 
  | "employees" 
  | "payroll" 
  | "biometric" 
  | "analytics" 
  | "settings" 
  | "leave" 
  | "admin";

interface SidebarProps {
  active: ViewKey;
  onNavigate: (view: ViewKey) => void;
  role?: 'manager' | 'admin';
}

export function Sidebar({ active, onNavigate, role = 'manager' }: SidebarProps) {
  // 2. Included 'attendance' and aligned both menu lists with your previous sidebars
  const navItems: { key: ViewKey; label: string; icon: React.ElementType }[] =
    role === 'admin'
      ? [
          { key: 'overview', label: 'Overview', icon: LayoutDashboard },
          { key: 'attendance', label: 'Attendance', icon: Calendar },
          { key: 'employees', label: 'Employee Directory', icon: Users },
          { key: 'payroll', label: 'Payroll Approvals', icon: ReceiptText },
          { key: 'analytics', label: 'Analytics', icon: BarChart2 },
          { key: 'admin', label: 'Admin Settings', icon: Settings },
        ]
      : [
          { key: 'overview', label: 'Overview', icon: LayoutDashboard },
          { key: 'attendance', label: 'Attendance', icon: Calendar },
          { key: 'employees', label: 'Employee Directory', icon: Users },
          { key: 'leave', label: 'Leave Requests', icon: Calendar },
          { key: 'biometric', label: 'Biometric Setup', icon: ScanLine },
          { key: 'payroll', label: 'Payslip & Payroll', icon: ReceiptText },
          { key: 'analytics', label: 'Analytics', icon: BarChart2 },
          { key: 'settings', label: 'Settings', icon: Settings },
        ];

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-slate-200 bg-white">
      {/* Brand Header */}
      <div className="flex items-center gap-2.5 border-b border-slate-200 px-4 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#8642ED] shadow-lg shadow-[#8642ED]/30">
          <Fingerprint className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-bold leading-tight tracking-tight text-slate-900">
            <span className="font-extrabold">Work</span>
            <span className="font-extrabold text-[#8642ED]">PULSE</span>
            <span className="font-extrabold"> AI</span>
          </h2>
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-400">
            {role === 'admin' ? 'Admin' : 'Manager'}
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-4 scrollbar-thin">
        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Menu
        </p>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              className={cn(
                "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                isActive
                  ? "bg-[#8642ED]/10 text-[#8642ED]"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <Icon
                className={cn(
                  "h-5 w-5 shrink-0 transition-colors",
                  isActive ? "text-[#8642ED]" : "text-slate-400 group-hover:text-slate-600"
                )}
              />
              {item.label}
              {isActive && (
                <ChevronRight className="ml-auto h-4 w-4 text-[#8642ED]" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Dynamic Profile Footer */}
      <div className="border-t border-slate-200 p-4">
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#8642ED] to-[#8642ED] text-sm font-bold text-white select-none">
            {role === 'admin' ? 'A' : 'M'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">
              {role === 'admin' ? 'Admin User' : 'Manager User'}
            </p>
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