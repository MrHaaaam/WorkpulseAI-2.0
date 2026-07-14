import { useMemo, useState, useEffect } from "react";
import { X, Check } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../components/ui/Card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../components/ui/Table";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { employees, formatCurrency, payrollRequestsStore, type Employee } from "../lib/data";

interface ManagerUser {
  id: string;
  name: string;
  role: "manager" | string;
  status: "active" | "inactive";
  banned?: boolean;
}

// PayrollRequest type is defined in the shared store (`payrollRequestsStore`)

export function AdminView() {
  const [localEmployees, setLocalEmployees] = useState(() => employees.map((e) => ({ ...e, banned: false })) as (Employee & { banned?: boolean })[]);

  // Mock managers list (since managers are separate users in real DB)
  const [managers, setManagers] = useState<ManagerUser[]>([
    { id: "MAN-001", name: "Ramon Lopez", role: "manager", status: "active", banned: false },
    { id: "MAN-002", name: "Evelyn Cruz", role: "manager", status: "active", banned: false },
  ]);

  const [payrollRequests, setPayrollRequests] = useState(() => payrollRequestsStore.get());

  useEffect(() => {
    const unsub = payrollRequestsStore.subscribe(() => setPayrollRequests(payrollRequestsStore.get()));
    return unsub;
  }, []);

  const totals = useMemo(() => {
    const total = localEmployees.length;
    const active = localEmployees.filter((e) => e.status === "active").length;
    const onLeave = localEmployees.filter((e) => e.status === "on-leave").length;
    const inactive = localEmployees.filter((e) => e.status === "inactive").length;
    const banned = localEmployees.filter((e) => (e as any).banned).length + managers.filter((m) => m.banned).length;
    return { total, active, onLeave, inactive, banned };
  }, [localEmployees, managers]);

  function toggleBanEmployee(id: string) {
    setLocalEmployees((prev) => prev.map((e) => (e.id === id ? { ...e, banned: !(e as any).banned } : e)));
  }

  function toggleBanManager(id: string) {
    setManagers((prev) => prev.map((m) => (m.id === id ? { ...m, banned: !m.banned } : m)));
  }

  function handleApprovePayroll(id: string) {
    payrollRequestsStore.update(id, "approved");
  }

  function handleRejectPayroll(id: string) {
    payrollRequestsStore.update(id, "rejected");
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Admin Dashboard</h2>
        <p className="text-sm text-slate-500">Monitor employees, managers and system-wide controls</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardContent>
            <CardTitle>Total Employees</CardTitle>
            <div className="mt-3 text-2xl font-bold text-slate-900">{totals.total}</div>
            <CardDescription className="mt-2">Active / On-leave / Inactive</CardDescription>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <CardTitle>Active</CardTitle>
            <div className="mt-3 text-2xl font-bold text-slate-900">{totals.active}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <CardTitle>On Leave</CardTitle>
            <div className="mt-3 text-2xl font-bold text-slate-900">{totals.onLeave}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <CardTitle>Banned</CardTitle>
            <div className="mt-3 text-2xl font-bold text-slate-900">{totals.banned}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Employee Management</CardTitle>
            <CardDescription>Ban or unban employees from this panel</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {localEmployees.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{e.id}</TableCell>
                    <TableCell>
                      <div className="font-medium text-slate-900">{e.name}</div>
                      <div className="text-xs text-slate-500">{e.casualLeave.used}/{e.casualLeave.total} CL</div>
                    </TableCell>
                    <TableCell className="text-slate-600">{e.role}</TableCell>
                    <TableCell>
                      {e.status === "active" && <Badge variant="success">Active</Badge>}
                      {e.status === "on-leave" && <Badge variant="info">On Leave</Badge>}
                      {e.status === "inactive" && <Badge variant="neutral">Inactive</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant={(e as any).banned ? "outline" : undefined} onClick={() => toggleBanEmployee(e.id)}>
                        {(e as any).banned ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            Unban
                          </>
                        ) : (
                          <>
                            <X className="h-3.5 w-3.5" />
                            Ban
                          </>
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Manager Users</CardTitle>
            <CardDescription>Admins can manage manager accounts</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {managers.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{m.id}</TableCell>
                    <TableCell>
                      <div className="font-medium text-slate-900">{m.name}</div>
                      <div className="text-xs text-slate-500">{m.role}</div>
                    </TableCell>
                    <TableCell>
                      {m.status === "active" && <Badge variant="success">Active</Badge>}
                      {m.status === "inactive" && <Badge variant="neutral">Inactive</Badge>}
                      {m.banned && <Badge variant="danger">Banned</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant={m.banned ? "outline" : undefined} onClick={() => toggleBanManager(m.id)}>
                        {m.banned ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            Unban
                          </>
                        ) : (
                          <>
                            <X className="h-3.5 w-3.5" />
                            Ban
                          </>
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payroll Approvals</CardTitle>
            <CardDescription>Approve or reject payrolls submitted by managers</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payrollRequests.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.id}</TableCell>
                    <TableCell>
                      <div className="font-medium text-slate-900">{p.employeeName}</div>
                      <div className="text-xs text-slate-500">{p.employeeId}</div>
                    </TableCell>
                    <TableCell className="font-medium text-slate-900">{formatCurrency(p.amount)}</TableCell>
                    <TableCell>
                      {p.status === "processing" && <Badge variant="warning">Processing</Badge>}
                      {p.status === "approved" && <Badge variant="success">Approved</Badge>}
                      {p.status === "rejected" && <Badge variant="danger">Rejected</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      {p.status === "processing" && (
                        <div className="flex items-center justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => handleRejectPayroll(p.id)}>
                            <X className="h-3.5 w-3.5" />
                            Reject
                          </Button>
                          <Button size="sm" onClick={() => handleApprovePayroll(p.id)}>
                            <Check className="h-3.5 w-3.5" />
                            Approve
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {payrollRequests.length === 0 && <div className="py-6 text-center text-sm text-slate-400">No payroll requests.</div>}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Analytics</CardTitle>
            <CardDescription>Admin analytics (placeholder)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-48 w-full rounded-lg border-2 border-dashed border-slate-200" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Admin Settings</CardTitle>
            <CardDescription>System controls</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-slate-100 px-4 py-3">
              <div>
                <p className="font-medium text-slate-900">Maintenance Mode</p>
                <p className="text-xs text-slate-500">Toggle site-wide maintenance (admin only)</p>
              </div>
              <div>
                <Button variant="outline">Toggle</Button>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-slate-100 px-4 py-3">
              <div>
                <p className="font-medium text-slate-900">User Roles</p>
                <p className="text-xs text-slate-500">Manage admin and manager accounts</p>
              </div>
              <div>
                <Button variant="outline">Manage</Button>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-slate-100 px-4 py-3">
              <div>
                <p className="font-medium text-slate-900">System Logs</p>
                <p className="text-xs text-slate-500">View recent system activity</p>
              </div>
              <div>
                <Button variant="outline">View</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
