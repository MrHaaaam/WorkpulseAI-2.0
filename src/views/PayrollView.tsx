import { useEffect, useState } from "react";
import { Check, CircleAlert, Clock3, Eye, KeyRound, Mail, Printer, ReceiptText, Search, Users, WalletCards, X } from "lucide-react";

import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent } from "../components/ui/Card";
import { Dialog, DialogClose, DialogHeader } from "../components/ui/Dialog";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
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
  grossAmount?: number;
  additions?: { label: string; value: number }[];
  hoursWorked?: number;
  hourlyRate?: number;
  createdAt?: string;
  paidAt?: string;
  rejectedAt?: string;
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
  const [paymentTarget, setPaymentTarget] = useState<{ employee: Employee; request: PayrollRequest; action: "approve" | "reject" } | null>(null);
  const [sendingId, setSendingId] = useState("");

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
      body: JSON.stringify({
        employeeId: employee.id,
        grossAmount: employee.grossSalary,
        additions: additionsFor(employee),
        currentAmount: employee.grossSalary + additions,
        hoursWorked: employee.hoursWorked,
        hourlyRate: employee.hourlyRate ?? (employee.role === "extra" ? 40 : 50),
      }),
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

  const updatePayment = async (employee: Employee, request: PayrollRequest, action: "approve" | "reject", password: string) => {
    const endpoint = action === "approve" ? "confirm-payment" : "reject-payment";
    const response = await apiFetch(`/api/payroll-requests/${request.id}/${endpoint}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Payroll was not updated");
    }
    const status = action === "approve" ? "paid" : "rejected";
    setPayrollRequests((current) => current.map((item) => item.id === request.id ? { ...item, status } : item));
    setSelected((current) => current?.request?.id === request.id ? { ...current, request: { ...current.request, status } } : current);
    toast({
      title: action === "approve" ? "Payment approved" : "Payment not released",
      description: action === "approve" ? `${employee.name}'s balance is now paid. The next pay cycle starts fresh.` : `${employee.name}'s unpaid balance will carry into the next pay cycle.`,
      variant: action === "approve" ? "success" : "info",
    });
  };

  const emailPayslip = async (employee: Employee, request: PayrollRequest) => {
    setSendingId(request.id);
    try {
      const response = await apiFetch(`/api/payroll-requests/${request.id}/email`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to send payslip");
      toast({ title: "Payslip sent", description: `Delivered to ${employee.email}.`, variant: "success" });
    } catch (reason) {
      toast({ title: "Payslip not sent", description: reason instanceof Error ? reason.message : "Unable to send payslip", variant: "error" });
    } finally { setSendingId(""); }
  };

  const printPayslip = (employee: Employee, request: PayrollRequest) => {
    openPayslip(employee, request);
    window.setTimeout(() => window.print(), 100);
  };

  return <div className="mx-auto max-w-[1500px] space-y-5 pb-8">
    <header className="relative overflow-hidden rounded-3xl border border-violet-200 bg-gradient-to-br from-white via-violet-50 to-purple-100 px-6 py-7 text-slate-900 shadow-sm sm:px-8">
      <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-[#8642ED]/10 blur-3xl" />
      <div className="relative flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#8642ED] text-white shadow-md shadow-violet-200"><WalletCards size={22} /></span><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-[#8642ED]">{isCurrentPeriod ? "Current pay cycle" : "Selected pay cycle"}</p><h1 className="text-2xl font-bold tracking-tight text-slate-950">Payroll Center</h1></div></div><p className="mt-4 max-w-xl text-sm leading-6 text-slate-600">Review attendance-based pay, prepare payslips, and confirm completed payments in one place.</p><p className="mt-1 text-xs font-medium text-violet-700">Pay period: {periodFromStart(periodKey)}</p></div>
        <DateNavigator label="Payroll period" value={selectedDate} onChange={setSelectedDate} navigation="semi-monthly" />
      </div>
    </header>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <PayrollStat icon={Users} label="Employees" value={String(employeeRecords.length)} note={`${notStarted} without a payroll record`} color="violet" />
      <PayrollStat icon={Clock3} label="Awaiting decision" value={formatCurrency(processingTotal)} note={`${processing.length} prepared payslips`} color="amber" />
      <PayrollStat icon={Check} label="Paid" value={formatCurrency(paidTotal)} note={`${paid.length} completed payments`} color="emerald" />
      <PayrollStat icon={CircleAlert} label="Rejected" value={String(attention)} note="Balances carrying forward" color="red" />
    </section>

    <Card data-guide="payroll-filters"><CardContent className="p-3 sm:p-4"><div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_170px_190px_auto] sm:items-center"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input aria-label="Search payroll" placeholder="Search employee or ID" value={search} onChange={(event) => setSearch(event.target.value)} className="h-10 pl-10" /></div><Select aria-label="Employee type" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as RoleFilter)}><option value="all">All employee types</option><option value="regular">Regular employees</option><option value="extra">Extra employees</option></Select><Select aria-label="Payroll status" value={payrollFilter} onChange={(event) => setPayrollFilter(event.target.value as PayrollFilter)}><option value="all">All payroll statuses</option><option value="not-started">Payslip not prepared</option><option value="processing">Awaiting decision</option><option value="paid">Paid</option><option value="attention">Rejected / carry forward</option></Select><div className="flex h-10 items-center justify-between gap-2 whitespace-nowrap px-1 sm:justify-end"><span className="text-xs font-medium text-slate-500">{filtered.length} shown</span>{(search || roleFilter !== 'all' || payrollFilter !== 'all') && <button type="button" onClick={() => { setSearch(''); setRoleFilter('all'); setPayrollFilter('all'); }} className="text-xs font-bold text-[#8642ED] hover:text-violet-800">Reset</button>}</div></div></CardContent></Card>

    <section data-guide="payroll-hub" className="grid gap-5 xl:grid-cols-2">
      {filtered.map((employee) => {
        const request = latestRequest(employee.id);
        const total = request?.amount ?? (isCurrentPeriod ? employee.grossSalary : null);
        const paidRecord = request?.status === "paid" || request?.status === "approved";
        return <Card key={employee.id} className="overflow-hidden border-slate-200 shadow-sm"><CardContent className="p-0">
          <div className="p-5 sm:p-6"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-violet-100 text-sm font-bold text-[#8642ED]">{initials(employee.name)}</span><div className="min-w-0"><p className="truncate text-base font-bold text-slate-950">{employee.name}</p><p className="text-xs capitalize text-slate-500">{employee.id} · {employee.role === "employee" ? "Regular" : employee.role}</p></div></div><PayrollStatus request={request} /></div>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3"><PayrollAmount label={paidRecord ? "Paid earnings" : request ? "Current earnings" : "Calculated earnings"} value={request?.currentAmount ?? employee.grossSalary} /><PayrollAmount label="Carried balance" value={request?.carryOverAmount ?? 0} warning={Number(request?.carryOverAmount || 0) > 0} /><div className="col-span-2 sm:col-span-1"><PayrollAmount label={paidRecord ? "Total paid" : "Total payout"} value={total} emphasized /></div></div>
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4"><div><p className="text-xs font-semibold text-slate-700">{formatWorkDuration(employee.hoursWorked)}</p><p className="text-[11px] text-slate-400">{formatCurrency(employee.hourlyRate ?? (employee.role === "extra" ? 40 : 50))} per hour</p></div>{request && <button type="button" onClick={() => openPayslip(employee, request)} className="inline-flex items-center gap-1.5 text-xs font-bold text-[#8642ED] hover:text-violet-800"><Eye size={14} /> Review breakdown</button>}</div></div>
          <div className={`border-t px-5 py-4 sm:px-6 ${!request ? 'border-violet-100 bg-violet-50/60' : paidRecord ? 'border-emerald-100 bg-emerald-50/60' : request.status === 'rejected' ? 'border-rose-100 bg-rose-50/50' : 'border-amber-100 bg-amber-50/50'}`}>
            {!request ? isCurrentPeriod ? <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-bold text-slate-900">Payslip not prepared</p><p className="text-xs text-slate-500">Save this period’s calculated earnings before payout.</p></div><Button onClick={() => void processPayslip(employee)}><ReceiptText size={16} /> Prepare payslip</Button></div> : <p className="py-1 text-sm font-medium text-slate-400">No payroll was prepared for this period.</p>
              : paidRecord ? <div><div className="mb-3 flex items-center gap-2 text-sm font-bold text-emerald-800"><Check className="h-4 w-4" />Payment completed</div><div className="grid grid-cols-3 gap-2"><Button variant="outline" onClick={() => printPayslip(employee, request)}><Printer size={15} /> Print</Button><Button variant="outline" disabled={sendingId === request.id || !employee.email} onClick={() => void emailPayslip(employee, request)}><Mail size={15} /> {sendingId === request.id ? "Sending..." : "Email"}</Button><Button variant="outline" onClick={() => openPayslip(employee, request)}><Eye size={15} /> View</Button></div></div>
              : <div><div className="mb-3"><p className={`text-sm font-bold ${request.status === 'rejected' ? 'text-rose-800' : 'text-amber-800'}`}>{request.status === 'rejected' ? 'Payment rejected — balance will carry forward' : 'Payment decision required'}</p><p className="mt-0.5 text-xs text-slate-500">Print or email the payslip, then approve or reject the payment.</p></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Button variant="outline" onClick={() => printPayslip(employee, request)}><Printer size={15} /> Print</Button><Button variant="outline" disabled={sendingId === request.id || !employee.email} onClick={() => void emailPayslip(employee, request)}><Mail size={15} /> {sendingId === request.id ? "Sending..." : "Email"}</Button><Button variant="success" onClick={() => setPaymentTarget({ employee, request, action: "approve" })}><Check size={15} /> Approve</Button><Button variant="destructive" disabled={request.status === "rejected"} onClick={() => setPaymentTarget({ employee, request, action: "reject" })}><X size={15} /> {request.status === "rejected" ? "Rejected" : "Reject"}</Button></div></div>}
          </div>
        </CardContent></Card>;
      })}
    </section>

    {!filtered.length && <Card><CardContent className="py-14 text-center"><Search className="mx-auto text-slate-300" /><p className="mt-3 text-sm font-medium text-slate-600">No payroll records match these filters.</p><button className="mt-2 text-xs font-semibold text-violet-600" onClick={() => { setSearch(""); setRoleFilter("all"); setPayrollFilter("all"); }}>Clear filters</button></CardContent></Card>}
    <PayslipModal employee={selected?.employee ?? null} request={selected?.request} onClose={() => setSelected(null)} onDecision={(action) => { if (!selected?.request) return; setPaymentTarget({ employee: selected.employee, request: selected.request, action }); setSelected(null); }} />
    <PaymentDecisionDialog key={paymentTarget ? `${paymentTarget.request.id}-${paymentTarget.action}` : "payment-closed"} target={paymentTarget} onClose={() => setPaymentTarget(null)} onSubmit={updatePayment} />
  </div>;
}

function PaymentDecisionDialog({ target, onClose, onSubmit }: {
  target: { employee: Employee; request: PayrollRequest; action: "approve" | "reject" } | null;
  onClose: () => void;
  onSubmit: (employee: Employee, request: PayrollRequest, action: "approve" | "reject", password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  if (!target) return null;
  const approving = target.action === "approve";

  return <Dialog open={Boolean(target)} onClose={() => !saving && onClose()} className="max-w-md">
    <DialogHeader><div><h3 className={`flex items-center gap-2 text-base font-bold ${approving ? "text-emerald-700" : "text-rose-700"}`}><KeyRound className="h-4 w-4" />{approving ? "Approve payment" : "Reject payment"}</h3><p className="mt-1 text-xs leading-5 text-slate-500">Confirm this decision with your administrator password.</p></div><DialogClose onClose={() => !saving && onClose()} /></DialogHeader>
    <form className="space-y-4 px-6 pb-6 pt-3" onSubmit={async (event) => { event.preventDefault(); if (!password || saving) return; setSaving(true); setError(""); try { await onSubmit(target.employee, target.request, target.action, password); onClose(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update payroll"); } finally { setSaving(false); } }}>
      <div className={`rounded-xl border p-4 ${approving ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}><p className="font-semibold text-slate-900">{target.employee.name}</p><p className="mt-1 text-sm text-slate-600">{formatCurrency(target.request.amount)} · {periodFromStart(target.request.periodStart)}</p><p className={`mt-2 text-xs leading-5 ${approving ? "text-emerald-800" : "text-amber-800"}`}>{approving ? "This confirms that the employee received the money. Their next pay cycle will start with no unpaid balance from this payslip." : "No money will be marked as paid. This full amount will be added to the employee’s next prepared payout."}</p></div>
      <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-700">Administrator password</span><Input type="password" autoComplete="current-password" autoFocus value={password} disabled={saving} onChange={(event) => { setPassword(event.target.value); setError(""); }} placeholder="Enter your password" /></label>
      {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancel</Button><Button type="submit" variant={approving ? "success" : "destructive"} disabled={saving || !password}>{saving ? "Confirming..." : approving ? "Approve as paid" : "Reject and carry forward"}</Button></div>
    </form>
  </Dialog>;
}

function PayrollAmount({ label, value, warning, emphasized }: { label: string; value?: number | null; warning?: boolean; emphasized?: boolean }) {
  return <div className={`h-full rounded-2xl border p-3.5 ${emphasized ? "border-violet-200 bg-violet-50" : warning ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50/70"}`}><p className={`text-[10px] font-bold uppercase tracking-wider ${emphasized ? "text-violet-600" : warning ? "text-amber-600" : "text-slate-400"}`}>{label}</p><p className={`mt-1 truncate text-lg font-bold ${emphasized ? "text-[#8642ED]" : warning ? "text-amber-800" : "text-slate-900"}`}>{value == null ? "No record" : formatCurrency(value)}</p></div>;
}

function PayrollStatus({ request }: { request?: PayrollRequest }) {
  if (!request) return <Badge variant="neutral">Payslip not prepared</Badge>;
  if (request.status === "processing") return <Badge variant="warning">Awaiting decision</Badge>;
  if (["paid", "approved"].includes(request.status)) return <Badge variant="success">Paid</Badge>;
  return <Badge variant="danger">Needs attention</Badge>;
}

function PayrollStat({ icon: Icon, label, value, note, color }: { icon: typeof Users; label: string; value: string; note: string; color: "violet" | "amber" | "emerald" | "red" }) {
  const tone = { violet: "bg-violet-50 text-violet-600", amber: "bg-amber-50 text-amber-600", emerald: "bg-emerald-50 text-emerald-600", red: "bg-red-50 text-red-600" }[color];
  return <Card><CardContent className="flex items-center gap-4 p-4 sm:p-5"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tone}`}><Icon size={20} /></span><div className="min-w-0"><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-0.5 truncate text-xl font-bold text-slate-950">{value}</p><p className="text-[11px] text-slate-400">{note}</p></div></CardContent></Card>;
}

function PayslipModal({ employee, request, onClose, onDecision }: { employee: Employee | null; request?: PayrollRequest; onClose: () => void; onDecision: (action: "approve" | "reject") => void }) {
  const { toast } = useToast();
  const [sending, setSending] = useState(false);
  if (!employee) return null;
  const additions = request?.additions?.length ? request.additions : additionsFor(employee);
  const totalAdditions = additions.reduce((sum, item) => sum + item.value, 0);
  const carryOverAmount = Number(request?.carryOverAmount ?? employee.carryOverAmount ?? 0);
  const grossAmount = Number(request?.grossAmount ?? employee.grossSalary);
  const currentAmount = Number(request?.currentAmount ?? grossAmount + totalAdditions);
  const netSalary = Number(request?.amount ?? currentAmount + carryOverAmount);
  const hoursWorked = Number(request?.hoursWorked ?? employee.hoursWorked ?? 0);
  const hourlyRate = Number(request?.hourlyRate ?? employee.hourlyRate ?? (employee.role === "extra" ? 40 : 50));
  const preparedDate = request?.createdAt ? new Date(request.createdAt) : new Date();
  const validPreparedDate = !Number.isNaN(preparedDate.getTime());

  return <Dialog open={Boolean(employee)} onClose={onClose} className="max-w-2xl print:max-h-none print:max-w-none print:overflow-visible print:border-0 print:shadow-none"><div className="print-payslip">
    <DialogHeader><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-600 text-white"><ReceiptText size={20} /></span><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-violet-600">WorkPulseAI</p><h2 className="text-lg font-bold text-slate-900">Employee payslip</h2><p className="text-sm text-slate-500">{periodFromStart(request?.periodStart)}</p></div></div><DialogClose onClose={onClose} /></DialogHeader>
    <div className="space-y-5 px-6 pb-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-violet-200 bg-violet-50 p-5 text-slate-900"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-xl bg-[#8642ED] text-sm font-bold text-white">{initials(employee.name)}</span><div><p className="font-semibold text-slate-950">{employee.name}</p><p className="mt-0.5 text-xs capitalize text-slate-500">{employee.id} · {employee.role === "employee" ? "Regular" : employee.role}</p></div></div><PayrollStatus request={request} /></div>
      <div className="grid gap-3 sm:grid-cols-3"><SummaryValue label="Time worked" value={formatWorkDuration(hoursWorked)} /><SummaryValue label="Pay per hour" value={formatCurrency(hourlyRate)} /><SummaryValue label="Prepared on" value={validPreparedDate ? preparedDate.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—"} /></div>
      <div className="overflow-hidden rounded-xl border border-slate-200"><div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Earnings and balance</div><MoneyRow label="Attendance-based gross pay" value={grossAmount} />{additions.map((item) => <MoneyRow key={item.label} label={item.label} value={item.value} positive />)}{carryOverAmount > 0 && <MoneyRow label="Unpaid balance carried forward" value={carryOverAmount} warning />}<div className="flex items-center justify-between bg-emerald-50 px-4 py-4"><div><p className="font-semibold text-emerald-900">Total amount due</p><p className="text-xs text-emerald-700">For this payslip</p></div><p className="text-2xl font-bold text-emerald-700">{formatCurrency(netSalary)}</p></div></div>
      <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs leading-5 text-sky-800">Payroll is calculated from recorded attendance hours. Review the attendance page before confirming payment if the hours look incorrect.</p>
      <div className="hidden grid-cols-2 gap-10 pt-10 print:grid"><div className="border-t border-slate-400 pt-2 text-center text-xs text-slate-600">Employee signature</div><div className="border-t border-slate-400 pt-2 text-center text-xs text-slate-600">Authorized by</div></div>
      <div className="no-print grid gap-2 sm:grid-cols-2"><Button variant="outline" size="lg" onClick={() => window.print()}><Printer size={16} /> Print payslip</Button><Button size="lg" variant="outline" disabled={sending || !employee.email || !request} onClick={async () => { if (!request) return; setSending(true); try { const response = await apiFetch(`/api/payroll-requests/${request.id}/email`, { method: "POST" }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to send payslip"); toast({ title: "Payslip sent", description: `Delivered to ${employee.email}.`, variant: "success" }); } catch (reason) { toast({ title: "Payslip not sent", description: reason instanceof Error ? reason.message : "Unable to send payslip", variant: "error" }); } finally { setSending(false); } }}><Mail size={16} />{sending ? "Sending..." : employee.email ? "Email payslip" : "Add employee email first"}</Button>{request && !['paid', 'approved'].includes(request.status) && <><Button size="lg" variant="success" onClick={() => onDecision('approve')}><Check size={16} /> Approve as paid</Button><Button size="lg" variant="destructive" disabled={request.status === 'rejected'} onClick={() => onDecision('reject')}><X size={16} /> {request.status === 'rejected' ? 'Already rejected' : 'Reject payment'}</Button></>}</div>
    </div>
  </div></Dialog>;
}

function SummaryValue({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-slate-200 p-3"><p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 font-bold text-slate-900">{value}</p></div>; }
function MoneyRow({ label, value, positive, warning }: { label: string; value: number; positive?: boolean; warning?: boolean }) { return <div className={`flex items-center justify-between border-b border-slate-100 px-4 py-3 text-sm ${warning ? "bg-amber-50" : "bg-white"}`}><span className={warning ? "font-medium text-amber-800" : "text-slate-600"}>{label}</span><span className={`font-semibold ${warning ? "text-amber-700" : positive ? "text-emerald-600" : "text-slate-900"}`}>{positive || warning ? "+" : ""}{formatCurrency(value)}</span></div>; }
