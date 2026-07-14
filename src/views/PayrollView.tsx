import { useState, useEffect } from "react";
import { Search, ReceiptText, Calendar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/Card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../components/ui/Table";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Dialog, DialogHeader, DialogClose } from "../components/ui/Dialog";
import { employees, formatCurrency, payrollRequestsStore, type Employee } from "../lib/data";

interface PayslipData {
  grossSalary: number;
  deductions: {
    tax: number;
    philhealth: number;
    sss: number;
    pagibig: number;
    latenessPenalty: number;
  };
}

function computePayslip(emp: Employee): PayslipData {
  const gross = emp.grossSalary;
  const tax = Math.round(gross * 0.15);
  const sss = Math.round(gross * 0.045);
  const philhealth = Math.round(gross * 0.03);
  const pagibig = Math.round(gross * 0.02);
  const latenessPenalty = Math.round(gross * 0.01);
  return { grossSalary: gross, deductions: { tax, philhealth, sss, pagibig, latenessPenalty } };
}

export function PayrollView() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"All" | "employee" | "extra">("All");
  const [statusFilter, setStatusFilter] = useState<"All" | "active" | "on-leave" | "inactive">("All");
  const [selected, setSelected] = useState<Employee | null>(null);
  const [requests, setRequests] = useState(() => payrollRequestsStore.get());

  useEffect(() => {
    const unsub = payrollRequestsStore.subscribe(() => setRequests(payrollRequestsStore.get()));
    return unsub;
  }, []);

  const filtered = employees.filter((e) => {
    const matchesSearch = e.name.toLowerCase().includes(search.toLowerCase()) || e.id.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === "All" || e.role === roleFilter;
    const matchesStatus = statusFilter === "All" || e.status === statusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Payslip & Payroll Management</h2>
        <p className="text-sm text-slate-500">Generate, review, and download employee payslips</p>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
            {["All", "employee", "extra"].map((r) => (
              <button
                key={r}
                onClick={() => setRoleFilter(r as any)}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  roleFilter === r
                    ? "bg-[#8642ED] text-white"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                }`}
              >
                {r === "All" ? "All Roles" : r === "employee" ? "Employee" : "Extra"}
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
                onClick={() => setStatusFilter(val as any)}
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
      <Card>
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
                  <TableCell className="text-slate-600">{e.role}</TableCell>
                  <TableCell className="font-medium text-slate-900">{formatCurrency(e.grossSalary)}</TableCell>
                  <TableCell>
                    {e.status === "active" && <Badge variant="success">Active</Badge>}
                    {e.status === "on-leave" && <Badge variant="info">On Leave</Badge>}
                    {e.status === "inactive" && <Badge variant="neutral">Inactive</Badge>}
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const req = requests.find((r) => r.employeeId === e.id);
                      if (!req) return <span className="text-sm text-slate-400">—</span>;
                      if (req.status === "processing") return <Badge variant="secondary">Processing</Badge>;
                      if (req.status === "approved") return <Badge variant="success">Approved</Badge>;
                      return <Badge variant="destructive">Rejected</Badge>;
                    })()}
                  </TableCell>
                  <TableCell className="text-right">
                    {(() => {
                      const req = requests.find((r) => r.employeeId === e.id);
                      if (!req) {
                        return (
                          <Button size="sm" onClick={() => {
                            const id = `PR-${Date.now()}`;
                            payrollRequestsStore.add({ id, employeeId: e.id, employeeName: e.name, amount: e.grossSalary, status: 'processing' });
                            setSelected(e);
                          }}>
                            <ReceiptText className="h-3.5 w-3.5" />
                            Process Payslip
                          </Button>
                        );
                      }
                      if (req.status === 'processing') {
                        return <Button size="sm" variant="outline" disabled>Processing</Button>;
                      }
                      // approved or denied: show status only
                      return null;
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
  if (!employee) return null;
  const payslip = computePayslip(employee);
  const totalDeductions =
    payslip.deductions.tax +
    payslip.deductions.philhealth +
    payslip.deductions.sss +
    payslip.deductions.pagibig +
    payslip.deductions.latenessPenalty;
  const netSalary = payslip.grossSalary - totalDeductions;

  const deductionItems = [
    { label: "Withholding Tax", value: payslip.deductions.tax },
    { label: "SSS Contribution", value: payslip.deductions.sss },
    { label: "PhilHealth", value: payslip.deductions.philhealth },
    { label: "Pag-IBIG", value: payslip.deductions.pagibig },
    { label: "Lateness Penalties", value: payslip.deductions.latenessPenalty },
  ];

  return (
    <Dialog open={!!employee} onClose={onClose} className="max-w-xl">
      <DialogHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#8642ED]">
            <ReceiptText className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Payslip Detail</h2>
            <p className="text-sm text-slate-500">Pay period: July 01 – 15, 2026</p>
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
            <p className="text-sm text-slate-500">{employee.role}</p>
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
              <span className="text-sm text-slate-600">Gross Salary</span>
              <span className="text-lg font-bold text-slate-900">{formatCurrency(payslip.grossSalary)}</span>
            </div>
          </div>
        </div>

        {/* Deductions Breakdown */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Deductions Breakdown</h3>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            {deductionItems.map((item, i) => (
              <div
                key={item.label}
                className={`flex items-center justify-between px-4 py-3 ${
                  i !== deductionItems.length - 1 ? "border-b border-slate-100" : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-red-400" />
                  <span className="text-sm text-slate-600">{item.label}</span>
                </div>
                <span className="text-sm font-medium text-red-600">-{formatCurrency(item.value)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between bg-red-50 px-4 py-3">
              <span className="text-sm font-semibold text-slate-700">Total Deductions</span>
              <span className="text-sm font-bold text-red-600">-{formatCurrency(totalDeductions)}</span>
            </div>
          </div>
        </div>

        {/* Net Salary */}
        <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 px-5 py-4">
          <div>
            <p className="text-sm font-medium text-emerald-700">Net Salary</p>
            <p className="text-xs text-emerald-600">Take-home pay after all deductions</p>
          </div>
          <span className="text-2xl font-bold text-emerald-700">{formatCurrency(netSalary)}</span>
        </div>

        {/* Download Button */}
        <Button className="w-full" size="lg">
          <Download className="h-4 w-4" />
          Download Payslip PDF
        </Button>
      </div>
    </Dialog>
  );
}
