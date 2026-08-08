import { useEffect, useState } from "react";
import { Search, ReceiptText, Calendar, Check, Mail, Printer, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/Card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../components/ui/Table";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Dialog, DialogHeader, DialogClose } from "../components/ui/Dialog";
import { useToast } from "../components/ui/Toast";
import { apiFetch } from "../lib/api";
import { formatCurrency, type Employee } from "../lib/data";

// 1. ADDED: Typed interfaces for the incoming database records
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

interface PayslipData {
  grossSalary: number;
  additions: { label: string; value: number }[];
}

function computePayslip(emp: Employee): PayslipData {
  const additions = (emp.identifiers ?? [])
    .filter((identifier) => identifier.value && Number(identifier.amount) > 0)
    .map((identifier) => ({ label: identifier.type, value: Number(identifier.amount) }));
  return { grossSalary: emp.grossSalary, additions };
}

// 2. UPDATED: Component now accepts isolated data hooks via props instead of static global stores
export function PayrollView({ employees = [], requests = [], onProcessPayslip }: PayrollViewProps) {
  const { toast } = useToast();
  const [employeeRecords, setEmployeeRecords] = useState(employees);
  const [payrollRequests, setPayrollRequests] = useState(requests);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"All" | "regular" | "extra">("All");
  const [statusFilter, setStatusFilter] = useState<"All" | "active" | "on-leave" | "inactive">("All");
  const [selected, setSelected] = useState<Employee | null>(null);

  useEffect(() => {
    Promise.all([apiFetch('/api/employees'), apiFetch('/api/payroll-requests')])
      .then(async ([employeeResponse, payrollResponse]) => {
        if (employeeResponse.ok) setEmployeeRecords(await employeeResponse.json());
        if (payrollResponse.ok) setPayrollRequests(await payrollResponse.json());
      }).catch(() => {});
  }, []);

  const filtered = employeeRecords.filter((e) => {
    const matchesSearch = e.name.toLowerCase().includes(search.toLowerCase()) || e.id.toLowerCase().includes(search.toLowerCase());
    const normalizedRole = e.role === "extra" ? "extra" : "regular";
    const matchesRole = roleFilter === "All" || normalizedRole === roleFilter;
    const matchesStatus = statusFilter === "All" || e.status === statusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Payslip & Payroll Management</h2>
        <p className="text-sm text-slate-500">Generate, review, email, and confirm employee payroll</p>
      </div>

      {/* Search + Filters */}
      <div data-guide="payroll-filters" className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search employees to generate payslips…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          <div className="flex gap-2 overflow-x-auto scrollbar-thin">
            {["All", "regular", "extra"].map((r) => (
              <button
                key={r}
onClick={() => setRoleFilter(r as "All" | "regular" | "extra")}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  roleFilter === r
                    ? "bg-[#8642ED] text-white"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                }`}
              >
                {r === "All" ? "All Roles" : r === "regular" ? "Regular" : "Extra"}
              </button>
            ))}
          </div>
          <div className="flex gap-2 overflow-x-auto scrollbar-thin">
            {[
              ["All", "All Statuses"],
              ["active", "Active"],
              ["on-leave", "On Leave"],
              ["inactive", "Inactive"],
            ].map(([val, label]) => (
              <button
                key={String(val)}
onClick={() => setStatusFilter(val as "All" | "active" | "on-leave" | "inactive")}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  statusFilter === val
                    ? "bg-[#8642ED] text-white"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Payroll List */}
      <Card data-guide="payroll-hub">
        <CardHeader>
          <CardTitle>Payroll Hub</CardTitle>
          <CardDescription>Select an employee to view or generate their payslip</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50">
                <TableHead>Employee</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Gross Salary</TableHead>
                <TableHead>Employment</TableHead>
                <TableHead>Payroll Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-slate-200 to-slate-300 text-xs font-bold text-slate-600">
                        {e.name.split(" ").map((n) => n[0]).join("")}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{e.name}</p>
                        <p className="text-xs text-slate-400">{e.id}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="capitalize text-slate-600">{e.role === "employee" ? "Regular" : e.role}</TableCell>
                  <TableCell className="font-medium text-slate-900">{formatCurrency(e.grossSalary)}</TableCell>
                  <TableCell>
                    {e.status === "active" && <Badge variant="success">Active</Badge>}
                    {e.status === "on-leave" && <Badge variant="info">On Leave</Badge>}
                    {e.status === "inactive" && <Badge variant="neutral">Inactive</Badge>}
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const req = payrollRequests.find((r) => r.employeeId === e.id && r.status !== "carried_over");
                      if (!req) return <span className="text-sm text-slate-400">—</span>;
                      if (req.status === "processing") return <Badge variant="warning">Processing</Badge>;
                      if (req.status === "paid") return <Badge variant="success">Paid</Badge>;
                      if (req.status === "approved") return <Badge variant="success">Approved</Badge>;
                      if (req.status === "carried_over") return <Badge variant="info">Carried Forward</Badge>;
                      return <Badge variant="danger">Rejected</Badge>;
                    })()}
                  </TableCell>
                  <TableCell className="text-right">
                    {(() => {
                      const req = payrollRequests.find((r) => r.employeeId === e.id && r.status !== "carried_over");
                      if (!req) {
                        return (
                          // 3. UPDATED: Replaced local store append with a clean backend event hook
                          <Button size="sm" onClick={async () => {
                            if (onProcessPayslip) onProcessPayslip(e);
                            const additions = (e.identifiers ?? []).reduce((sum, identifier) => sum + (Number(identifier.amount) || 0), 0);
                            const response = await apiFetch('/api/payroll-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employeeId: e.id, currentAmount: e.grossSalary + additions }) });
                            if (response.ok) {
                              const created = await response.json() as PayrollRequest;
                              setPayrollRequests((current) => current.some((item) => item.id === created.id) ? current : [...current, created]);
                              setSelected({ ...e, carryOverAmount: Number(created.carryOverAmount || 0) });
                              toast({ title: "Payroll started", description: `${e.name}'s payslip is ready for review.`, variant: "success" });
                            } else toast({ title: "Unable to process payroll", description: "Please try again or check the server connection.", variant: "error" });
                          }}>
                            <ReceiptText className="h-3.5 w-3.5" />
                            Process Payslip
                          </Button>
                        );
                      }
                      if (req.status === 'processing') {
                        return <div className="flex justify-end gap-2"><Button size="sm" variant="ghost" title="View payslip" onClick={() => setSelected({ ...e, carryOverAmount: Number(req.carryOverAmount || 0) })}><ReceiptText className="h-3.5 w-3.5" /></Button><Button size="sm" variant="outline" onClick={async () => {
                          const response = await apiFetch(`/api/payroll-requests/${req.id}/confirm-payment`, { method: 'PATCH' });
                          if (response.ok) {
                            setPayrollRequests((current) => current.map((item) => item.id === req.id ? { ...item, status: 'paid' } : item));
                            toast({ title: "Payment confirmed", description: `${e.name}'s payroll was marked as paid.`, variant: "success" });
                          } else toast({ title: "Payment was not updated", variant: "error" });
                        }}><Check className="h-3.5 w-3.5" /> Confirm Paid</Button><Button size="sm" variant="destructive" aria-label="Mark payroll as not paid" title="Mark as not paid" onClick={async () => {
                          const response = await apiFetch(`/api/payroll-requests/${req.id}/reject-payment`, { method: 'PATCH' });
                          if (response.ok) {
                            setPayrollRequests((current) => current.map((item) => item.id === req.id ? { ...item, status: 'rejected' } : item));
                            toast({ title: "Payroll marked unpaid", description: `${e.name}'s payroll status was updated.`, variant: "info" });
                          } else toast({ title: "Payroll was not updated", variant: "error" });
                        }}><X className="h-3.5 w-3.5" /></Button></div>;
                      }
                      return <Button size="sm" variant="outline" onClick={() => setSelected({ ...e, carryOverAmount: Number(req.carryOverAmount || 0) })}><ReceiptText className="h-3.5 w-3.5" /> View Summary</Button>;
                    })()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {filtered.length === 0 && (
            <div className="py-12 text-center text-sm text-slate-400">
              No employees found.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payslip Detail Modal */}
      <PayslipModal employee={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function PayslipModal({ employee, onClose }: { employee: Employee | null; onClose: () => void }) {
  const { toast } = useToast();
  const [sending, setSending] = useState(false);
  if (!employee) return null;
  const payslip = computePayslip(employee);
  const totalAdditions = payslip.additions.reduce((sum, item) => sum + item.value, 0);
  const carryOverAmount = Number(employee.carryOverAmount || 0);
  const netSalary = payslip.grossSalary + totalAdditions + carryOverAmount;
  const periodEnd = new Date();
  const periodStart = new Date();
  periodStart.setDate(periodEnd.getDate() - 14);
  const periodLabel = `${periodStart.toLocaleDateString("en-PH", { month: "short", day: "2-digit" })} – ${periodEnd.toLocaleDateString("en-PH", { month: "short", day: "2-digit", year: "numeric" })}`;

  return (
    <Dialog open={!!employee} onClose={onClose} className="max-w-xl print:max-h-none print:max-w-none print:overflow-visible print:border-0 print:shadow-none">
      <div className="print-payslip">
      <DialogHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#8642ED]">
            <ReceiptText className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Payslip Detail</h2>
            <p className="text-sm text-slate-500">15-day pay period: {periodLabel}</p>
          </div>
        </div>
        <DialogClose onClose={onClose} />
      </DialogHeader>

      <div className="px-6 pb-6 space-y-5">
        {/* Employee Info */}
        <div className="flex items-center gap-4 rounded-xl bg-slate-50 p-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#8642ED] to-[#8642ED] text-sm font-bold text-white">
            {employee.name.split(" ").map((n) => n[0]).join("")}
          </div>
          <div className="flex-1">
            <p className="font-semibold text-slate-900">{employee.name}</p>
            <p className="text-sm capitalize text-slate-500">{employee.role === "employee" ? "Regular" : employee.role} · ₱{employee.role === "extra" ? 40 : 50}/hour</p>
            <p className="text-xs text-slate-400">{employee.id}</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Calendar className="h-3.5 w-3.5" />
            Semi-monthly
          </div>
        </div>

        {/* Salary Computation */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Salary Computation</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
              <span className="text-sm text-slate-600">Gross Salary{employee.hoursWorked != null ? ` (${employee.hoursWorked} hours)` : ""}</span>
              <span className="text-lg font-bold text-slate-900">{formatCurrency(payslip.grossSalary)}</span>
            </div>
          </div>
        </div>

        {/* Additional payroll amounts */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Government & Payroll Additions</h3>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            {payslip.additions.length === 0 && <div className="px-4 py-3 text-sm text-slate-400">No additional amounts configured.</div>}
            {payslip.additions.map((item, i) => (
              <div
                key={item.label}
                className={`flex items-center justify-between px-4 py-3 ${
                  i !== payslip.additions.length - 1 ? "border-b border-slate-100" : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  <span className="text-sm text-slate-600">{item.label}</span>
                </div>
                <span className="text-sm font-medium text-emerald-600">+{formatCurrency(item.value)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between bg-emerald-50 px-4 py-3">
              <span className="text-sm font-semibold text-slate-700">Total Additions</span>
              <span className="text-sm font-bold text-emerald-600">+{formatCurrency(totalAdditions)}</span>
            </div>
          </div>
        </div>

        {/* Net Salary */}
        {carryOverAmount > 0 && <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"><div><p className="text-sm font-semibold text-amber-800">Unpaid balance carried forward</p><p className="text-xs text-amber-600">Unconfirmed amount from an earlier pay period</p></div><span className="font-bold text-amber-700">+{formatCurrency(carryOverAmount)}</span></div>}
        <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 px-5 py-4">
          <div>
            <p className="text-sm font-medium text-emerald-700">Net Salary</p>
            <p className="text-xs text-emerald-600">Gross salary plus payroll additions</p>
          </div>
          <span className="text-2xl font-bold text-emerald-700">{formatCurrency(netSalary)}</span>
        </div>

        {employee.identifiers?.filter((identifier) => identifier.value).length ? <div className="rounded-xl border border-slate-200 p-4"><h3 className="mb-2 text-sm font-semibold text-slate-900">Profile Identifiers</h3>{employee.identifiers.filter((identifier) => identifier.value).map((identifier) => <div key={identifier.type} className="flex justify-between gap-4 py-1 text-sm"><span className="text-slate-500">{identifier.type}</span><span className="text-right font-medium text-slate-700">{identifier.value} · +{formatCurrency(Number(identifier.amount) || 0)}</span></div>)}</div> : null}
        <div className="no-print grid gap-2 sm:grid-cols-2"><Button variant="outline" size="lg" onClick={() => window.print()}><Printer className="h-4 w-4" />Print Summary</Button><Button size="lg" disabled={sending || !employee.email} onClick={async () => {
          setSending(true);
          try {
            const response = await apiFetch(`/api/payroll/${employee.id}/email-summary`, { method: 'POST' });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Unable to send payroll summary');
            toast({ title: "Payroll summary sent", description: `Delivered to ${employee.email}.`, variant: "success" });
          } catch (reason) { toast({ title: "Summary not sent", description: reason instanceof Error ? reason.message : 'Unable to send payroll summary', variant: "error" }); }
          finally { setSending(false); }
        }}>
          <Mail className="h-4 w-4" />
          {sending ? 'Sending...' : employee.email ? `Email Summary to ${employee.email}` : 'Add Employee Email First'}
        </Button></div>
      </div>
      </div>
    </Dialog>
  );
}
