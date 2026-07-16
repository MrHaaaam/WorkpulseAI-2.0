import { useEffect, useState } from "react";
import { Search, Fingerprint, Check, Clock, X } from "lucide-react";

import { Card, CardContent } from "../components/ui/Card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../components/ui/Table";
import { Input } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";

export interface LeaveCredit {
  total: number;
  used: number;
}

export interface Employee {
  id: string;
  name: string;
  role: string;
  casualLeave: LeaveCredit;
  sickLeave: LeaveCredit;
  biometricStatus: "enrolled" | "pending" | "none";
  status: "active" | "on-leave" | "inactive";
}

interface EmployeeDirectoryViewProps {
  employees: Employee[];
}

function BiometricBadge({ status }: { status: "enrolled" | "pending" | "none" }) {
  if (status === "enrolled") {
    return (
      <Badge variant="success">
        <Check className="h-3 w-3" /> Enrolled
      </Badge>
    );
  }

  if (status === "pending") {
    return (
      <Badge variant="warning">
        <Clock className="h-3 w-3" /> Pending
      </Badge>
    );
  }

  return (
    <Badge variant="neutral">
      <X className="h-3 w-3" /> Not Enrolled
    </Badge>
  );
}

function StatusBadge({ status }: { status: "active" | "on-leave" | "inactive" }) {
  if (status === "active") return <Badge variant="success">Active</Badge>;
  if (status === "on-leave") return <Badge variant="info">On Leave</Badge>;
  return <Badge variant="neutral">Inactive</Badge>;
}

// Note: EmployeeDirectoryView is mounted by AppRoutes with <EmployeeDirectoryView />.
// To avoid prop-type errors, we keep the prop optional internally.
export function EmployeeDirectoryView({ employees: _initialEmployees }: Partial<EmployeeDirectoryViewProps>) {
  // Avoid rendering a blank white page before data is fetched
  const [loading, setLoading] = useState(true);

  const [employees, setEmployees] = useState<Employee[]>(_initialEmployees ?? []);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"All" | "employee" | "extra">("All");
  const [statusFilter, setStatusFilter] = useState<"All" | "active" | "on-leave" | "inactive">("All");

  useEffect(() => {
    let mounted = true;

    const fetchEmployees = async () => {
      try {
        setError(null);
        setLoading(false);
        const res = await fetch("http://localhost:5000/api/employees");
        if (!res.ok) throw new Error(`Failed to load employees (${res.status})`);
        const data = (await res.json()) as Employee[];
        if (mounted) setEmployees(data);
      } catch (e: any) {
        if (mounted) setError(e?.message ?? "Failed to load employees");
      }
    };

    fetchEmployees();

    return () => {
      mounted = false;
    };
  }, []);

  const filtered = employees.filter((e) => {
    const matchesSearch =
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.id.toLowerCase().includes(search.toLowerCase()) ||
      e.role.toLowerCase().includes(search.toLowerCase());

    const matchesRole = roleFilter === "All" || e.role === roleFilter;
    const matchesStatus = statusFilter === "All" || e.status === statusFilter;

    return matchesSearch && matchesRole && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Employee Directory</h2>
        <p className="text-sm text-slate-500">Manage workforce records and biometric enrollment status</p>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search by name, ID or role…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex gap-2">
          <div className="flex gap-2 overflow-x-auto scrollbar-thin">
            {(["All", "employee", "extra"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
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
            {([
              ["All", "All Statuses"],
              ["active", "Active"],
              ["on-leave", "On Leave"],
              ["inactive", "Inactive"],
            ] as const).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setStatusFilter(val)}
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

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50">
                <TableHead>Employee</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>Red Flags</TableHead>
                <TableHead>Filter</TableHead>
                <TableHead>Biometric</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {filtered.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-slate-200 to-slate-300 text-xs font-bold text-slate-600">
                        {e.name
                          .split(" ")
                          .filter(Boolean)
                          .map((n) => n[0])
                          .join("")}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{e.name}</p>
                        <p className="text-xs text-slate-400">{e.id}</p>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="text-slate-600">{e.id}</TableCell>

                  <TableCell className="text-slate-600">{e.casualLeave.used}</TableCell>
                  <TableCell className="text-slate-600">daily</TableCell>

                  <TableCell>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-500">Casual:</span>
                        <span className="font-medium text-slate-700">{e.casualLeave.total - e.casualLeave.used}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-500">Sick:</span>
                        <span className="font-medium text-slate-700">{e.sickLeave.total - e.sickLeave.used}</span>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="inline-block min-w-[90px]">
                      <BiometricBadge status={e.biometricStatus} />
                    </div>
                  </TableCell>

                  <TableCell>
                    <StatusBadge status={e.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">No employees found matching your filters.</div>
          ) : null}
        </CardContent>
      </Card>

      <p className="flex items-center gap-1.5 text-xs text-slate-400">
        <Fingerprint className="h-3.5 w-3.5" />
        Salary and payroll details are managed separately in the Payslip & Payroll view.
      </p>
    </div>
  );
}

