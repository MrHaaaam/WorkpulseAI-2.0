import { useState } from "react";
import { Users, UserCheck, Clock, Fingerprint, Calendar, TrendingUp, TrendingDown } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../components/ui/Card";
import { Tabs } from "../components/ui/Tabs";
import { Badge } from "../components/ui/Badge";
import { attendanceData } from "../lib/data";

type ViewMode = "daily" | "weekly" | "monthly";

const metrics = [
  { label: "Total Active Staff", value: "12", change: "+2", trend: "up", icon: Users, color: "blue" },
  { label: "Present Today", value: "10", change: "+1", trend: "up", icon: UserCheck, color: "emerald" },
  { label: "Late Clock-ins", value: "4", change: "+2", trend: "down", icon: Clock, color: "amber" },
  { label: "Registered Biometric Keys", value: "18", change: "+3", trend: "up", icon: Fingerprint, color: "violet" },
];

const colorMap: Record<string, { bg: string; text: string; icon: string }> = {
  blue: { bg: "bg-[#8642ED]/10", text: "text-[#8642ED]", icon: "bg-[#8642ED]" },
  emerald: { bg: "bg-emerald-50", text: "text-emerald-700", icon: "bg-emerald-600" },
  amber: { bg: "bg-amber-50", text: "text-amber-700", icon: "bg-amber-600" },
  violet: { bg: "bg-violet-50", text: "text-violet-700", icon: "bg-violet-600" },
};

const pieData = [
  { name: "Present", value: 10, color: "#10b981" },
  { name: "Late", value: 4, color: "#f59e0b" },
  { name: "Absent", value: 1, color: "#ef4444" },
  { name: "On Leave", value: 1, color: "#6366f1" },
];

export function OverviewView() {
  const [viewMode, setViewMode] = useState<ViewMode>("weekly");
  const data = attendanceData[viewMode];

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Overview Dashboard</h2>
          <p className="text-sm text-slate-500">Attendance analytics and workforce insights</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
            <Calendar className="h-4 w-4 text-slate-400" />
            <input
              type="text"
              defaultValue="Jul 01 – Jul 13, 2026"
              className="text-sm font-medium text-slate-700 outline-none"
              readOnly
            />
          </div>
          <Tabs
            value={viewMode}
            onValueChange={(v) => setViewMode(v as ViewMode)}
            items={[
              { value: "daily", label: "Daily" },
              { value: "weekly", label: "Weekly" },
              { value: "monthly", label: "Monthly" },
            ]}
          />
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((m) => {
          const c = colorMap[m.color];
          const Icon = m.icon;
          return (
            <Card key={m.label} className="animate-fade-in">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${c.icon} shadow-sm`}>
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <Badge variant={m.trend === "up" ? "success" : "danger"}>
                    {m.trend === "up" ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {m.change}
                  </Badge>
                </div>
                <p className="mt-4 text-3xl font-bold text-slate-900">{m.value}</p>
                <p className="text-sm text-slate-500">{m.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Attendance Trend Area Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Attendance Trends</CardTitle>
            <CardDescription>Present vs Late vs Absent — {viewMode} view</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPresent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorLate" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorAbsent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    borderRadius: "10px",
                    border: "1px solid #e2e8f0",
                    fontSize: "13px",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "13px" }} />
                <Area type="monotone" dataKey="present" name="Present" stroke="#10b981" strokeWidth={2} fill="url(#colorPresent)" />
                <Area type="monotone" dataKey="late" name="Late" stroke="#f59e0b" strokeWidth={2} fill="url(#colorLate)" />
                <Area type="monotone" dataKey="absent" name="Absent" stroke="#ef4444" strokeWidth={2} fill="url(#colorAbsent)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Today's Breakdown Pie */}
        <Card>
          <CardHeader>
            <CardTitle>Today's Breakdown</CardTitle>
            <CardDescription>Live attendance distribution</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="45%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: "10px",
                    border: "1px solid #e2e8f0",
                    fontSize: "13px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "13px" }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Bar Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Attendance Comparison</CardTitle>
          <CardDescription>Bar chart comparison — {viewMode} view</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  borderRadius: "10px",
                  border: "1px solid #e2e8f0",
                  fontSize: "13px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                }}
              />
              <Legend wrapperStyle={{ fontSize: "13px" }} />
              <Bar dataKey="present" name="Present" fill="#10b981" radius={[6, 6, 0, 0]} />
              <Bar dataKey="late" name="Late" fill="#f59e0b" radius={[6, 6, 0, 0]} />
              <Bar dataKey="absent" name="Absent" fill="#ef4444" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
