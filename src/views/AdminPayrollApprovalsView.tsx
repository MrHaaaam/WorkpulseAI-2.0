import { useEffect, useState } from "react";
import { X, Check } from "lucide-react";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../components/ui/Card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../components/ui/Table";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { payrollRequestsStore, formatCurrency, type PayrollRequest } from "../lib/data";

export function AdminPayrollApprovalsView() {
  const [payrollRequests, setPayrollRequests] = useState<PayrollRequest[]>(() => payrollRequestsStore.get());

useEffect(() => {
    const unsubscribe = payrollRequestsStore.subscribe(() => setPayrollRequests(payrollRequestsStore.get()));
    return () => {
      unsubscribe();
    };
  }, []);

  function handleApprovePayroll(id: string) {
    payrollRequestsStore.update(id, "approved");
  }

  function handleRejectPayroll(id: string) {
    payrollRequestsStore.update(id, "rejected");
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Payroll Approvals</h2>
        <p className="text-sm text-slate-500">Admin approval queue (approve or reject manager-submitted payrolls)</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pending Payroll Requests</CardTitle>
          <CardDescription>Only requests in <span className="font-medium">Processing</span> can be approved or rejected.</CardDescription>
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
                    {p.status === "processing" ? (
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
                    ) : (
                      <span className="text-sm text-slate-400">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {payrollRequests.length === 0 && (
            <div className="py-6 text-center text-sm text-slate-400">No payroll requests.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

