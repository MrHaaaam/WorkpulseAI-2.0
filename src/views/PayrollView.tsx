import { useEffect, useState } from "react";
import { Check, CircleAlert, Clock3, Eye, Mail, Printer, ReceiptText, Search, Users, WalletCards, X } from "lucide-react";

import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent } from "../components/ui/Card";
import { Dialog, DialogClose, DialogHeader } from "../components/ui/Dialog";
import { Input } from "../components/ui/Input";
import { useToast } from "../components/ui/Toast";
import { DateNavigator } from "../components/DateNavigator";
import { apiFetch } from "../lib/api";
import { formatCurrency, type Employee } from "../lib/data";

export interface PayrollRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  amount: number;
  status: "processing" | "paid" | "approved" | "rejected" | "carried_over";
  currentAmount?: number;
  carryOverAmount?: number;
  periodStart?: string;
}

interface PayrollViewProps {
  employees: Employee[];
  requests: PayrollRequest[];
  onProcessPayslip?: (employee: Employee) => void;
}

type PayrollFilter = "all" | "not-started" | "processing" | "paid" | "attention";
type RoleFilter = "all" | "regular" | "extra";

function additionsFor(employee: Employee) {
  return (employee.identifiers ?? [])
    .filter((identifier) => identifier.value && Number(identifier.amount) > 0)
    .map((identifier) => ({ label: identifier.type, value: Number(identifier.amount) }));
}

function periodFromStart(periodStart?: string) {
  const source = periodStart ? new Date(`${periodStart}T00:00:00`) : new Date();
  const startDay = source.getDate() <= 15 ? 1 : 16;
  const endDay = source.getDate() <= 15 ? 15 : new Date(source.getFullYear(), source.getMonth() + 1, 0).getDate();
  const start = new Date(source.getFullYear(), source.getMonth(), startDay);
  const end = new Date(source.getFullYear(), source.getMonth(), endDay);
  return `${start.toLocaleDateString("en-PH", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}`;
}

function currentPeriodKey(value: string) {
  const date = new Date(`${value}T00:00:00`);
  const day = date.getDate() <= 15 ? 1 : 16;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function workforceDateToday() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date()).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function formatWorkDuration(value?: number) {
  const totalMinutes = Math.max(0, Math.round(Number(value || 0) * 60));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (days) parts.push(`${days} ${days === 1 ? "day" : "days"}`);
  if (hours) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
  if (minutes) parts.push(`${minutes} ${minutes === 1 ? "minute" : "minutes"}`);
  return parts.join(" ") || "0 minutes";
}

function requestForEmployee(requests: PayrollRequest[], employeeId: string, periodStart: string) {
  return requests.find((request) => request.employeeId === employeeId && request.periodStart === periodStart && request.status !== "carried_over");
}

export function PayrollView({ employees = [], requests = [], onProcessPayslip }: PayrollViewProps) {
  const { toast } = useToast();
  const [employeeRecords, setEmployeeRecords] = useState(employees);
  const [payrollRequests, setPayrollRequests] = useState(requests);
  const [search, setSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState(workforceDateToday);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [payrollFilter, setPayrollFilter] = useState<PayrollFilter>("all");
  const [selected, setSelected] = useState<{ employee: Employee; request?: PayrollRequest } | null>(null);

  useEffect(() => {
    Promise.all([apiFetch("/api/employees"), apiFetch("/api/payroll-requests")])
      .then(async ([employeeResponse, payrollResponse]) => {
        if (employeeResponse.ok) setEmployeeRecords(await employeeResponse.json());
        if (payrollResponse.ok) setPayrollRequests(await payrollResponse.json());
      }).catch(() => undefined);
  }, []);

  const today = workforceDateToday();
  const periodKey = currentPeriodKey(selectedDate);
  const isCurrentPeriod = periodKey === currentPeriodKey(today);
  const latestRequest = (employeeId: string) => requestForEmployee(payrollRequests, employeeId, periodKey);
  const filtered = employeeRecords.filter((employee) => {
    const query = search.trim().toLowerCase();
    const role = employee.role === "extra" ? "extra" : "regular";
    const request = latestRequest(employee.id);
    const matchesSearch = !query || employee.name.toLowerCase().includes(query) || employee.id.toLowerCase().includes(query);
    const matchesRole = roleFilter === "all" || roleFilter === role;
    const matchesPayroll = payrollFilter === "all"
      || (payrollFilter === "not-started" && !request)
      || (payrollFilter === "processing" && request?.status === "processing")
      || (payrollFilter === "paid" && ["paid", "approved"].includes(request?.status ?? ""))
      || (payrollFilter === "attention" && request?.status === "rejected");
    return matchesSearch && matchesRole && matchesPayroll;
  });

  const currentRequests = payrollRequests.filter((request) => request.periodStart === periodKey);
  const processing = currentRequests.filter((request) => request.status === "processing");
  const paid = currentRequests.filter((request) => ["paid", "approved"].includes(request.status));
  const processingTotal = processing.reduce((sum, request) => sum + Number(request.amount || 0), 0);
  const paidTotal = paid.reduce((sum, request) => sum + Number(request.amount || 0), 0);
  const notStarted = employeeRecords.filter((employee) => !latestRequest(employee.id)).length;
  const attention = currentRequests.filter((request) => request.status === "rejected").length;

  const openPayslip = (employee: Employee, request?: PayrollRequest) => {
    setSelected({ employee: { ...employee, carryOverAmount: Number(request?.carryOverAmount || 0) }, request });
  };

  const processPayslip = async (employee: Employee) => {
    if (onProcessPayslip) onProcessPayslip(employee);
    const additions = additionsFor(employee).reduce((sum, item) => sum + item.value, 0);
    const response = await apiFetch("/api/payroll-requests", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId: employee.id, currentAmount: employee.grossSalary + additions }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast({ title: "Unable to prepare payslip", description: body.error || "Please check the server connection.", variant: "error" });
      return;
    }
    const created = body as PayrollRequest;
    setPayrollRequests((current) => [created, ...current.filter((item) => item.id !== created.id)]);
    openPayslip(employee, created);
    toast({ title: "Payslip ready", description: `${employee.name}'s payroll is ready for review.`, variant: "success" });
  };

  const updatePayment = async (employee: Employee, request: PayrollRequest, action: "confirm" | "reject") => {
    const endpoint = action === "confirm" ? "confirm-payment" : "reject-payment";
    const response = await apiFetch(`/api/payroll-requests/${request.id}/${endpoint}`, { method: "PATCH" });
    if (!response.ok) {
      toast({ title: "Payroll was not updated", variant: "error" });
      return;
    }
    const status = action === "confirm" ? "paid" : "rejected";
    setPayrollRequests((current) => current.map((item) => item.id === request.id ? { ...item, status } : item));
    toast({
      title: action === "confirm" ? "Payment confirmed" : "Payroll needs attention",
      description: `${employee.name}'s payroll was marked ${action === "confirm" ? "as paid" : "as not paid"}.`,
      variant: action === "confirm" ? "success" : "info",
    });
  };

  return <div className="mx-auto max-w-[1500px] space-y-5 pb-8">
    <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 px-6 py-7 text-white shadow-xl sm:px-8">
      <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-violet-400/20 blur-3xl" />
      <div className="relative flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15"><WalletCards size={22} /></span><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-indigo-200">{isCurrentPeriod ? "Current pay cycle" : "Selected pay cycle"}</p><h1 className="text-2xl font-bold tracking-tight">Payroll Center</h1></div></div><p className="mt-4 max-w-xl text-sm leading-6 text-indigo-100/70">Review attendance-based pay, prepare payslips, and confirm completed payments in one place.</p><p className="mt-1 text-xs font-medium text-indigo-200">Pay period: {periodFromStart(periodKey)}</p></div>
        <DateNavigator label="Payroll period" value={selectedDate} onChange={setSelectedDate} navigation="semi-monthly" />
      </div>
    </header>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <PayrollStat icon={Users} label="Employees" value={String(employeeRecords.length)} note={`${notStarted} without a payroll record`} color="violet" />
      <PayrollStat icon={Clock3} label="Awaiting confirmation" value={formatCurrency(processingTotal)} note={`${processing.length} processing`} color="amber" />
      <PayrollStat icon={Check} label="Confirmed paid" value={formatCurrency(paidTotal)} note={`${paid.length} completed records`} color="emerald" />
      <PayrollStat icon={CircleAlert} label="Needs attention" value={String(attention)} note="Unpaid or rejected" color="red" />
    </section>

    <Card data-guide="payroll-filters"><CardContent className="flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-md"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input placeholder="Search by employee name or ID" value={search} onChange={(event) => setSearch(event.target.value)} className="pl-10" /></div>
        <div className="flex gap-2 overflow-x-auto">{([['all','All employees'],['regular','Regular'],['extra','Extra']] as const).map(([value,label]) => <FilterButton key={value} active={roleFilter === value} onClick={() => setRoleFilter(value)}>{label}</FilterButton>)}</div>
      </div>
      <div className="flex gap-2 overflow-x-auto border-t border-slate-100 pt-4">{([['all','All payroll'],['not-started','Not started'],['processing','Processing'],['paid','Paid'],['attention','Needs attention']] as const).map(([value,label]) => <FilterButton key={value} active={payrollFilter === value} onClick={() => setPayrollFilter(value)}>{label}</FilterButton>)}</div>
    </CardContent></Card>

    <section data-guide="payroll-hub" className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
      {filtered.map((employee) => {
        const request = latestRequest(employee.id);
        const total = request?.amount ?? (isCurrentPeriod ? employee.grossSalary : null);
        return <Card key={employee.id} className="group overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md"><CardContent className="p-0">
          <div className="p-5"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-100 to-indigo-100 text-sm font-bold text-violet-700">{initials(employee.name)}</span><div className="min-w-0"><p className="truncate font-semibold text-slate-900">{employee.name}</p><p className="text-xs capitalize text-slate-400">{employee.id} · {employee.role === "employee" ? "Regular" : employee.role}</p></div></div><PayrollStatus request={request} /></div>
          <div className="mt-5 flex items-end justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{request ? "Payroll total" : isCurrentPeriod ? "Calculated gross pay" : "Payroll record"}</p><p className="mt-1 text-2xl font-bold tracking-tight text-slate-950">{total == null ? "No record" : formatCurrency(total)}</p></div><div className="text-right"><p className="text-xs font-medium text-slate-600">{formatWorkDuration(employee.hoursWorked)}</p><p className="text-[11px] text-slate-400">{formatCurrency(employee.hourlyRate ?? (employee.role === "extra" ? 40 : 50))} per hour</p></div></div>
          {Number(request?.carryOverAmount || 0) > 0 && <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">Includes {formatCurrency(Number(request?.carryOverAmount))} carried forward</div>}</div>
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3">
            {!request ? isCurrentPeriod ? <Button size="sm" onClick={() => void processPayslip(employee)}><ReceiptText size={15} /> Prepare payslip</Button> : <span className="py-1 text-xs font-medium text-slate-400">No payroll saved for this period</span>
              : request.status === "processing" ? <><Button size="sm" variant="ghost" onClick={() => openPayslip(employee, request)}><Eye size={15} /> Review</Button><Button size="sm" variant="success" onClick={() => void updatePayment(employee, request, "confirm")}><Check size={15} /> Confirm paid</Button><Button size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:bg-red-50" title="Mark as not paid" onClick={() => void updatePayment(employee, request, "reject")}><X size={15} /></Button></>
              : <Button size="sm" variant="outline" onClick={() => openPayslip(employee, request)}><Eye size={15} /> View payslip</Button>}
          </div>
        </CardContent></Card>;
      })}
    </section>

    {!filtered.length && <Card><CardContent className="py-14 text-center"><Search className="mx-auto text-slate-300" /><p className="mt-3 text-sm font-medium text-slate-600">No payroll records match these filters.</p><button className="mt-2 text-xs font-semibold text-violet-600" onClick={() => { setSearch(""); setRoleFilter("all"); setPayrollFilter("all"); }}>Clear filters</button></CardContent></Card>}
    <PayslipModal employee={selected?.employee ?? null} request={selected?.request} onClose={() => setSelected(null)} />
  </div>;
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${active ? "bg-violet-600 text-white shadow-sm" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{children}</button>;
}

function PayrollStatus({ request }: { request?: PayrollRequest }) {
  if (!request) return <Badge variant="neutral">Not started</Badge>;
  if (request.status === "processing") return <Badge variant="warning">Processing</Badge>;
  if (["paid", "approved"].includes(request.status)) return <Badge variant="success">Paid</Badge>;
  return <Badge variant="danger">Needs attention</Badge>;
}

function PayrollStat({ icon: Icon, label, value, note, color }: { icon: typeof Users; label: string; value: string; note: string; color: "violet" | "amber" | "emerald" | "red" }) {
  const tone = { violet: "bg-violet-50 text-violet-600", amber: "bg-amber-50 text-amber-600", emerald: "bg-emerald-50 text-emerald-600", red: "bg-red-50 text-red-600" }[color];
  return <Card><CardContent className="flex items-center gap-4 p-4 sm:p-5"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tone}`}><Icon size={20} /></span><div className="min-w-0"><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-0.5 truncate text-xl font-bold text-slate-950">{value}</p><p className="text-[11px] text-slate-400">{note}</p></div></CardContent></Card>;
}

function PayslipModal({ employee, request, onClose }: { employee: Employee | null; request?: PayrollRequest; onClose: () => void }) {
  const { toast } = useToast();
  const [sending, setSending] = useState(false);
  if (!employee) return null;
  const additions = additionsFor(employee);
  const totalAdditions = additions.reduce((sum, item) => sum + item.value, 0);
  const carryOverAmount = Number(request?.carryOverAmount ?? employee.carryOverAmount ?? 0);
  const currentAmount = Number(request?.currentAmount ?? employee.grossSalary + totalAdditions);
  const netSalary = Number(request?.amount ?? currentAmount + carryOverAmount);

  return <Dialog open={Boolean(employee)} onClose={onClose} className="max-w-2xl print:max-h-none print:max-w-none print:overflow-visible print:border-0 print:shadow-none"><div className="print-payslip">
    <DialogHeader><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-600 text-white"><ReceiptText size={20} /></span><div><h2 className="text-lg font-bold text-slate-900">Payroll summary</h2><p className="text-sm text-slate-500">{periodFromStart(request?.periodStart)}</p></div></div><DialogClose onClose={onClose} /></DialogHeader>
    <div className="space-y-5 px-6 pb-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-slate-950 p-5 text-white"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-xl bg-white/10 text-sm font-bold">{initials(employee.name)}</span><div><p className="font-semibold">{employee.name}</p><p className="mt-0.5 text-xs capitalize text-slate-400">{employee.id} · {employee.role === "employee" ? "Regular" : employee.role}</p></div></div><PayrollStatus request={request} /></div>
      <div className="grid gap-3 sm:grid-cols-3"><SummaryValue label="Time worked" value={formatWorkDuration(employee.hoursWorked)} /><SummaryValue label="Pay per hour" value={formatCurrency(employee.hourlyRate ?? (employee.role === "extra" ? 40 : 50))} /><SummaryValue label="Pay before additions" value={formatCurrency(employee.grossSalary)} /></div>
      <div className="overflow-hidden rounded-xl border border-slate-200"><div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Payroll breakdown</div><MoneyRow label="Attendance-based gross pay" value={employee.grossSalary} />{additions.map((item) => <MoneyRow key={item.label} label={item.label} value={item.value} positive />)}{carryOverAmount > 0 && <MoneyRow label="Unpaid balance carried forward" value={carryOverAmount} warning />}<div className="flex items-center justify-between bg-emerald-50 px-4 py-4"><div><p className="font-semibold text-emerald-900">Total payroll</p><p className="text-xs text-emerald-700">Amount for this payroll record</p></div><p className="text-2xl font-bold text-emerald-700">{formatCurrency(netSalary)}</p></div></div>
      <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs leading-5 text-sky-800">Payroll is calculated from recorded attendance hours. Review the attendance page before confirming payment if the hours look incorrect.</p>
      <div className="no-print grid gap-2 sm:grid-cols-2"><Button variant="outline" size="lg" onClick={() => window.print()}><Printer size={16} /> Print summary</Button><Button size="lg" disabled={sending || !employee.email} onClick={async () => { setSending(true); try { const response = await apiFetch(`/api/payroll/${employee.id}/email-summary`, { method: "POST" }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to send payroll summary"); toast({ title: "Payroll summary sent", description: `Delivered to ${employee.email}.`, variant: "success" }); } catch (reason) { toast({ title: "Summary not sent", description: reason instanceof Error ? reason.message : "Unable to send payroll summary", variant: "error" }); } finally { setSending(false); } }}><Mail size={16} />{sending ? "Sending…" : employee.email ? "Email summary" : "Add employee email first"}</Button></div>
    </div>
  </div></Dialog>;
}

function SummaryValue({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-slate-200 p-3"><p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 font-bold text-slate-900">{value}</p></div>; }
function MoneyRow({ label, value, positive, warning }: { label: string; value: number; positive?: boolean; warning?: boolean }) { return <div className={`flex items-center justify-between border-b border-slate-100 px-4 py-3 text-sm ${warning ? "bg-amber-50" : "bg-white"}`}><span className={warning ? "font-medium text-amber-800" : "text-slate-600"}>{label}</span><span className={`font-semibold ${warning ? "text-amber-700" : positive ? "text-emerald-600" : "text-slate-900"}`}>{positive || warning ? "+" : ""}{formatCurrency(value)}</span></div>; }
