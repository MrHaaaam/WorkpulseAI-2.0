import { useState } from "react"; // Added useState for local filter tracking
import { X, Check, Search } from "lucide-react"; // Added Search icon

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../components/ui/Card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../components/ui/Table";
import { Input } from "../components/ui/Input"; // Added Input for search
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { formatCurrency, type PayrollRequest } from "../lib/data";

interface AdminPayrollApprovalsViewProps {
  payrollRequests: PayrollRequest[];
  onApprovePayroll?: (id: string) => void;
  onRejectPayroll?: (id: string) => void;
}

export function AdminPayrollApprovalsView({
  payrollRequests = [],
  onApprovePayroll,
  onRejectPayroll,
}: AdminPayrollApprovalsViewProps) {
  // 1. ADDED: Filter states
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | "processing" | "approved" | "rejected">("All");

  // 2. ADDED: Client-side filtration layer
  const filteredRequests = payrollRequests.filter((p) => {
    const matchesSearch =
      p.employeeName.toLowerCase().includes(search.toLowerCase()) ||
      p.id.toLowerCase().includes(search.toLowerCase()) ||
      p.employeeId.toLowerCase().includes(search.toLowerCase());
      
    const matchesStatus = statusFilter === "All" || p.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Payroll Approvals</h2>
        <p className="text-sm text-slate-500">Admin approval queue (approve or reject manager-submitted payrolls)</p>
      </div>

      {/* 3. ADDED: Search & Status Filter Control Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search by name, request ID, or employee ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-thin">
          {[
            ["All", "All Statuses"],
            ["processing", "Processing"],
            ["approved", "Approved"],
            ["rejected", "Rejected"],
          ].map(([val, label]) => (
            <button
              key={val}
onClick={() => setStatusFilter(val as "All" | "processing" | "approved" | "rejected")}
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
              {/* 4. UPDATED: Render filtered requests array instead of raw prop array */}
              {filteredRequests.map((p) => (
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
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => onRejectPayroll && onRejectPayroll(p.id)}
                        >
                          <X className="h-3.5 w-3.5" />
                          Reject
                        </Button>
                        <Button 
                          size="sm" 
                          onClick={() => onApprovePayroll && onApprovePayroll(p.id)}
                        >
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

          {/* 5. UPDATED: Fallback conditional checking filtered results size */}
          {filteredRequests.length === 0 && (
            <div className="py-12 text-center text-sm text-slate-400">
              No matching payroll requests found.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}