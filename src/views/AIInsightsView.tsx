import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, BrainCircuit, CalendarDays, ChevronRight,
  Clock3, RefreshCw, ShieldCheck, Sparkles, TrendingUp, Users,
} from "lucide-react";

import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent } from "../components/ui/Card";
import { apiFetch } from "../lib/api";
import { cn } from "../lib/util";

type Readiness = "ready" | "limited";
type InsightKey = "forecast" | "risk" | "anomaly" | "verification";
type ForecastDay = { date: string; expectedPresent: number; attendanceRate: number };
type RiskEmployee = { employeeId: string; name: string; score: number; tier: "normal" | "mild" | "high" | "severe"; spells: number; weightedDays: number; absenceDays: number; lateDays: number };
type Anomaly = { employeeId: string; name: string; date: string; time: string; score: number; deviationMinutes: number };
type Scanner = { deviceUid: string; scans: number; averageScore: number; health: number; status: "healthy" | "attention" | "critical" };
type RecentMatch = { employeeId: string | null; name: string; action: "time-in" | "time-out" | "recognized" | "no-match"; eventTime: string | null; scannedAt: string | null; deviceUid: string; score: number | null; matchStrength: number | null; accepted: boolean; responseTimeMs: number | null };
type Insights = {
  generatedAt: string;
  forecast: { version: string; status: Readiness; sampleDays: number; activeEmployees: number; summary: string; forecast: ForecastDay[] };
  risk: { version: string; status: Readiness; employeesAnalyzed: number; flagged: number; summary: string; employees: RiskEmployee[] };
  anomaly: { version: string; status: Readiness; sampleScans: number; medianTime: string; madMinutes: number; scaleMinutes: number; summary: string; anomalies: Anomaly[] };
  verification: { version: string; status: Readiness; matchesAnalyzed: number; threshold: number; averageHealth: number; summary: string; scanners: Scanner[]; recentMatches: RecentMatch[] };
  disclaimer: string;
};

const modelMeta = {
  forecast: { title: "Attendance Forecast", label: "Forecast AI", icon: TrendingUp, accent: "violet", formula: "Level + trend + weekly seasonality", description: "Projects expected attendance for the next seven days from historical daily patterns." },
  risk: { title: "Attendance Risk", label: "Risk AI", icon: Users, accent: "amber", formula: "Spells² × time-weighted absent days", description: "Highlights repeated absence patterns while excluding approved leave and reducing the weight of older events." },
  anomaly: { title: "Unusual Arrival Times", label: "Arrival Check", icon: Clock3, accent: "sky", formula: "Compares each arrival with the usual arrival time", description: "Finds clock-ins that are much earlier or later than the workforce's usual arrival time." },
  verification: { title: "Scanner Health", label: "Verification AI", icon: ShieldCheck, accent: "emerald", formula: "95 at acceptance limit · 99 maximum", description: "Shows an easy-to-read fingerprint match-quality indicator. Lower FingerJet scores are better." },
} as const;

const accents = {
  violet: { border: "border-violet-300", wash: "from-violet-600 to-fuchsia-500", pale: "bg-violet-50", text: "text-violet-700", ring: "ring-violet-200", bar: "bg-violet-500" },
  amber: { border: "border-amber-300", wash: "from-amber-500 to-orange-500", pale: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-200", bar: "bg-amber-500" },
  sky: { border: "border-sky-300", wash: "from-sky-500 to-cyan-500", pale: "bg-sky-50", text: "text-sky-700", ring: "ring-sky-200", bar: "bg-sky-500" },
  emerald: { border: "border-emerald-300", wash: "from-emerald-500 to-teal-500", pale: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-200", bar: "bg-emerald-500" },
} as const;

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(new Date(`${value}T00:00:00Z`));
}

function ReadinessBadge({ status }: { status: Readiness }) {
  return <Badge variant={status === "ready" ? "success" : "warning"}>{status === "ready" ? "Ready" : "Limited data"}</Badge>;
}

function MetricCard({ modelKey, selected, insights, onSelect }: { modelKey: InsightKey; selected: boolean; insights: Insights; onSelect: () => void }) {
  const meta = modelMeta[modelKey];
  const style = accents[meta.accent];
  const Icon = meta.icon;
  const value = modelKey === "forecast" ? `${insights.forecast.forecast[0]?.attendanceRate ?? 0}%`
    : modelKey === "risk" ? insights.risk.flagged
    : modelKey === "anomaly" ? insights.anomaly.anomalies.length
    : `${Math.min(99, insights.verification.averageHealth)}%`;
  const caption = modelKey === "forecast" ? "tomorrow's expected rate"
    : modelKey === "risk" ? "patterns for review"
    : modelKey === "anomaly" ? "unusual arrivals"
    : "scanner match quality";
  return (
    <button type="button" data-guide={`ai-${modelKey}`} onClick={onSelect}
      className={cn("group relative overflow-hidden rounded-2xl border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md", selected ? `${style.border} ring-4 ${style.ring}` : "border-slate-200")}>
      <div className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", style.wash)} />
      <div className="flex items-start justify-between gap-3">
        <span className={cn("grid h-11 w-11 place-items-center rounded-xl", style.pale, style.text)}><Icon size={21} /></span>
        <ReadinessBadge status={insights[modelKey].status} />
      </div>
      <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{meta.label}</p>
      <div className="mt-1 flex items-end justify-between gap-3">
        <div><p className="text-3xl font-bold tracking-tight text-slate-950">{value}</p><p className="mt-1 text-xs text-slate-500">{caption}</p></div>
        <ChevronRight className={cn("mb-2 transition group-hover:translate-x-1", style.text)} size={18} />
      </div>
    </button>
  );
}

function ForecastPanel({ data }: { data: Insights["forecast"] }) {
  return <div className="space-y-5">
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat label="History analyzed" value={`${data.sampleDays} days`} />
      <Stat label="Active workforce" value={String(data.activeEmployees)} />
      <Stat label="Tomorrow" value={`${data.forecast[0]?.expectedPresent ?? 0} expected`} />
      <Stat label="7-day average" value={`${Math.round(data.forecast.reduce((sum, item) => sum + item.attendanceRate, 0) / Math.max(1, data.forecast.length))}%`} />
    </div>
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700"><CalendarDays size={16} className="text-violet-600" /> Seven-day projection</div>
      <div className="grid grid-cols-7 gap-2">
        {data.forecast.map((day) => <div key={day.date} className="flex min-w-0 flex-col items-center">
          <div className="flex h-28 w-full items-end overflow-hidden rounded-lg bg-white ring-1 ring-slate-200"><div className="w-full rounded-t-md bg-gradient-to-t from-violet-600 to-fuchsia-400 transition-all" style={{ height: `${Math.max(5, day.attendanceRate)}%` }} /></div>
          <span className="mt-2 text-[10px] font-semibold text-slate-600 sm:text-xs">{shortDate(day.date).split(",")[0]}</span>
          <span className="text-[10px] text-slate-400">{day.expectedPresent}</span>
        </div>)}
      </div>
    </div>
  </div>;
}

function tierVariant(tier: RiskEmployee["tier"]) { return tier === "normal" ? "success" : tier === "mild" ? "warning" : "danger"; }
function flagLabel(tier: RiskEmployee["tier"]) { return tier === "normal" ? "Green flag" : tier === "mild" ? "Yellow flag" : "Red flag"; }
function RiskPanel({ data }: { data: Insights["risk"] }) {
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-3">
      <FlagLegend color="green" title="Green flag" range="Score 0–50" note="Normal attendance pattern" />
      <FlagLegend color="yellow" title="Yellow flag" range="Score 51–124" note="Review the attendance record" />
      <FlagLegend color="red" title="Red flag" range="Score 125 or higher" note="Needs prompt human review" />
    </div>
    <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900"><AlertTriangle className="mt-0.5 shrink-0 text-amber-600" size={16} /><p><strong>How the score is calculated:</strong> separate absence periods × separate absence periods × recent absent days. Recent absences count more than old ones, and approved leave is not counted.</p></div>
    <div className="overflow-hidden rounded-2xl border border-slate-200">
      <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 sm:grid-cols-[1fr_120px_180px]">
        <span>Employee and calculation</span><span>Flag</span><span className="hidden sm:block">Attendance record</span>
      </div>
      {data.employees.length ? data.employees.map((employee) => <div key={employee.employeeId} className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0 sm:grid-cols-[1fr_120px_180px]">
        <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{employee.name}</p><p className="mt-0.5 text-xs text-slate-400">{employee.spells}² × {employee.weightedDays} recent absent days = <strong className="text-slate-600">{employee.score}</strong></p></div>
        <div><Badge variant={tierVariant(employee.tier)}>{flagLabel(employee.tier)}</Badge></div>
        <span className="hidden text-xs text-slate-500 sm:block">{employee.absenceDays} absent days · {employee.lateDays} late days</span>
      </div>) : <Empty text="No employee data is available yet." />}
    </div>
  </div>;
}

function FlagLegend({ color, title, range, note }: { color: "green" | "yellow" | "red"; title: string; range: string; note: string }) {
  const styles = color === "green" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : color === "yellow" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-red-200 bg-red-50 text-red-700";
  const dot = color === "green" ? "bg-emerald-500" : color === "yellow" ? "bg-amber-500" : "bg-red-500";
  return <div className={cn("rounded-xl border p-4", styles)}><div className="flex items-center gap-2"><span className={cn("h-2.5 w-2.5 rounded-full", dot)} /><p className="text-sm font-bold">{title}</p></div><p className="mt-2 text-xs font-semibold">{range}</p><p className="mt-1 text-xs opacity-75">{note}</p></div>;
}

function AnomalyPanel({ data }: { data: Insights["anomaly"] }) {
  return <div className="space-y-4">
    <div className="flex gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3"><Clock3 className="mt-0.5 shrink-0 text-sky-600" size={17} /><div><p className="text-sm font-semibold text-sky-950">What does this do?</p><p className="mt-1 text-xs leading-5 text-sky-900/75">It finds clock-ins that are much earlier or later than the usual arrival time. This can reveal a mistaken clock entry, an unusual shift, or a record that needs checking. It does not automatically penalize an employee.</p></div></div>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3"><Stat label="Usual arrival time" value={data.medianTime} /><Stat label="Clock-ins checked" value={String(data.sampleScans)} /><div className="hidden sm:block"><Stat label="Unusual arrivals found" value={String(data.anomalies.length)} /></div></div>
    <div className="overflow-hidden rounded-2xl border border-slate-200">
      {data.anomalies.length ? data.anomalies.map((item) => <div key={`${item.employeeId}-${item.date}`} className="flex items-center justify-between gap-4 border-b border-slate-100 px-4 py-3 last:border-0">
        <div className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-sky-50 text-sky-600"><Clock3 size={17} /></span><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{item.name}</p><p className="text-xs text-slate-400">{shortDate(item.date)} · {item.time}</p></div></div>
        <Badge variant="info">{arrivalDifference(item.deviationMinutes)}</Badge>
      </div>) : <Empty text="No unusual arrival times were detected." />}
    </div>
  </div>;
}

function arrivalDifference(minutes: number) {
  const absolute = Math.abs(Math.round(minutes));
  const direction = minutes < 0 ? "earlier" : "later";
  if (absolute < 60) return `${absolute} ${absolute === 1 ? "minute" : "minutes"} ${direction}`;
  const hours = Math.floor(absolute / 60);
  const remainingMinutes = absolute % 60;
  const hourText = `${hours} ${hours === 1 ? "hour" : "hours"}`;
  const minuteText = remainingMinutes ? ` ${remainingMinutes} ${remainingMinutes === 1 ? "minute" : "minutes"}` : "";
  return `${hourText}${minuteText} ${direction}`;
}

function VerificationPanel({ data }: { data: Insights["verification"] }) {
  return <div className="space-y-5">
    <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-600 p-5 text-white shadow-lg shadow-emerald-100">
      <div className="flex items-end justify-between"><div><p className="text-sm text-emerald-100">Scanner match quality</p><p className="mt-1 text-4xl font-bold">{Math.min(99, data.averageHealth)}%</p></div><ShieldCheck size={38} className="text-emerald-100" /></div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/25"><div className="h-full rounded-full bg-white" style={{ width: `${data.averageHealth}%` }} /></div>
      <p className="mt-3 text-xs text-emerald-100">Based on {data.matchesAnalyzed} verified matches · lower FingerJet dissimilarity is better</p>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">{data.scanners.length ? data.scanners.map((scanner) => <div key={scanner.deviceUid} className="rounded-xl border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{scanner.deviceUid}</p><p className="mt-1 text-xs text-slate-400">{scanner.scans} scans · avg. score {scanner.averageScore}</p></div><Badge variant={scanner.status === "healthy" ? "success" : scanner.status === "attention" ? "warning" : "danger"}>{scanner.status}</Badge></div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={cn("h-full rounded-full", scanner.status === "healthy" ? "bg-emerald-500" : scanner.status === "attention" ? "bg-amber-500" : "bg-red-500")} style={{ width: `${scanner.health}%` }} /></div>
    </div>) : <div className="sm:col-span-2"><Empty text="No fingerprint match results are available yet." /></div>}</div>
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-5 py-4">
        <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Live verification</p><h3 className="mt-1 text-base font-bold text-slate-900">Recent fingerprint scans</h3></div>
        <Badge variant="success"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Updates automatically</Badge>
      </div>
      <div className="divide-y divide-slate-100">
        {data.recentMatches?.length ? data.recentMatches.map((match, index) => <div key={`${match.employeeId}-${match.scannedAt}-${index}`} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3"><span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", match.accepted ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500")}>{match.accepted ? <ShieldCheck size={18} /> : <AlertTriangle size={18} />}</span><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{match.name}</p><p className="mt-0.5 text-xs text-slate-400">{match.action === "time-in" ? "Time in" : match.action === "time-out" ? "Time out" : match.accepted ? "Fingerprint recognized" : "No match"} · {match.eventTime || formatScanTime(match.scannedAt)} · {match.deviceUid}{match.responseTimeMs ? ` · ${(match.responseTimeMs / 1000).toFixed(2)}s` : ""}</p></div></div>
          <div className="flex items-center gap-3 pl-[52px] sm:pl-0"><div className="text-right"><p className={cn("text-lg font-bold", match.matchStrength != null && match.matchStrength >= 95 ? "text-emerald-700" : "text-red-600")}>{match.matchStrength != null ? `${Math.min(99, match.matchStrength)}%` : "No match"}</p><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{match.matchStrength != null && match.matchStrength >= 95 ? "Accepted" : "Needs attention"}</p></div>{match.matchStrength != null && <div className="h-9 w-1.5 overflow-hidden rounded-full bg-slate-100"><div className={cn("w-full rounded-full", match.matchStrength >= 95 ? "bg-emerald-500" : "bg-red-500")} style={{ height: `${match.matchStrength}%`, marginTop: `${100 - match.matchStrength}%` }} /></div>}</div>
        </div>) : <Empty text="Successful kiosk scans will appear here automatically." />}
      </div>
      <div className="border-t border-slate-100 bg-slate-50 px-5 py-3 text-xs leading-5 text-slate-500"><strong>95–99% means accepted.</strong> A result of 94% or below needs attention: clean the reader, place the finger flat and try again, or confirm that the finger is enrolled. This is a match-quality indicator, not certified accuracy.</div>
    </div>
  </div>;
}

function formatScanTime(value: string | null) {
  if (!value) return "Time unavailable";
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function Stat({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 text-lg font-bold text-slate-900">{value}</p></div>; }
function Empty({ text }: { text: string }) { return <div className="px-5 py-10 text-center text-sm text-slate-500">{text}</div>; }

export function AIInsightsView() {
  const [insights, setInsights] = useState<Insights | null>(null);
  const [selected, setSelected] = useState<InsightKey>("forecast");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadInsights = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const response = await apiFetch("/api/ai-insights");
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Unable to load AI insights.");
      setInsights(body as Insights); setError(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load AI insights."); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => {
    const initial = window.setTimeout(() => void loadInsights(), 0);
    const interval = window.setInterval(() => void loadInsights(), 10_000);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); };
  }, [loadInsights]);
  const meta = modelMeta[selected];
  const generated = useMemo(() => insights ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" }).format(new Date(insights.generatedAt)) : null, [insights]);

  if (loading) return <div className="grid min-h-[420px] place-items-center"><div className="text-center"><BrainCircuit className="mx-auto animate-pulse text-violet-600" size={38} /><p className="mt-3 text-sm font-medium text-slate-600">Analyzing workforce data…</p></div></div>;
  if (!insights) return <Card className="mx-auto mt-12 max-w-lg p-8 text-center"><AlertTriangle className="mx-auto text-red-500" /><h2 className="mt-3 font-semibold text-slate-900">AI Insights could not load</h2><p className="mt-2 text-sm text-slate-500">{error}</p><Button className="mt-5" onClick={() => void loadInsights(true)}>Try again</Button></Card>;

  return <div className="mx-auto max-w-[1500px] space-y-6 pb-8">
    <header data-guide="ai-heading" className="relative overflow-hidden rounded-3xl bg-slate-950 px-6 py-7 text-white shadow-xl sm:px-8">
      <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-violet-500/25 blur-3xl" /><div className="absolute bottom-0 right-1/3 h-24 w-40 bg-cyan-400/10 blur-3xl" />
      <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
        <div className="flex items-start gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-violet-950"><Sparkles size={23} /></span><div><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold tracking-tight">AI Workforce Analytics</h1><Badge className="border-emerald-400/30 bg-emerald-400/10 text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Live data</Badge></div><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-300">Quick summaries of attendance patterns and fingerprint scanner performance.</p></div></div>
        <div className="flex items-center gap-3"><span className="text-xs text-slate-400">Updated {generated}</span><Button variant="outline" className="border-white/15 bg-white/10 text-white hover:bg-white/15" onClick={() => void loadInsights(true)} disabled={refreshing}><RefreshCw size={15} className={refreshing ? "animate-spin" : ""} /> Refresh</Button></div>
      </div>
    </header>

    {error && <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"><AlertTriangle size={16} /> Latest refresh failed: {error}. Showing the last successful result.</div>}
    <section data-guide="ai-models" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{(Object.keys(modelMeta) as InsightKey[]).map((key) => <MetricCard key={key} modelKey={key} selected={selected === key} insights={insights} onSelect={() => setSelected(key)} />)}</section>

    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-5 py-4 sm:px-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Summary</p><h2 className="mt-1 text-xl font-bold text-slate-900">{meta.title}</h2></div><ReadinessBadge status={insights[selected].status} /></div><p className="mt-2 text-sm text-slate-500">{insights[selected].summary}</p></div>
        <CardContent className="p-5 pt-5 sm:p-6 sm:pt-6">{selected === "forecast" ? <ForecastPanel data={insights.forecast} /> : selected === "risk" ? <RiskPanel data={insights.risk} /> : selected === "anomaly" ? <AnomalyPanel data={insights.anomaly} /> : <VerificationPanel data={insights.verification} />}</CardContent>
      </Card>
      <div data-guide="responsible-ai" className="flex gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3"><Activity className="mt-0.5 shrink-0 text-violet-600" size={17} /><p className="text-xs leading-5 text-violet-900"><strong>Reminder:</strong> Use these summaries as a guide and review the employee records before making a decision. A “Limited data” result may change as more records are collected.</p></div>
    </div>
  </div>;
}
