import { useMemo, useState } from "react";
import { Check, Clock, Fingerprint, Grid2X2, List, Pencil, Plus, Search, X } from "lucide-react";

import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent } from "../components/ui/Card";
import { Dialog, DialogClose, DialogHeader } from "../components/ui/Dialog";
import { Input } from "../components/ui/Input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/Table";

export interface Employee {
  id: string;
  name: string;
  role: string;
  casualLeave: { total: number; used: number };
  sickLeave: { total: number; used: number };
  biometricStatus: "enrolled" | "pending" | "none";
  status: "active" | "on-leave" | "inactive";
  grossSalary?: number;
  email?: string;
  phone?: string;
  address?: string;
  sssNumber?: string;
  philHealthNumber?: string;
  pagIbigNumber?: string;
  tinNumber?: string;
  identifiers?: { type: string; value: string }[];
}

interface EmployeeDirectoryViewProps { employees: Employee[] }
type ViewMode = "table" | "cards";

const emptyEmployee: Employee = {
  id: "",
  name: "",
  role: "employee",
  casualLeave: { used: 0, total: 10 },
  sickLeave: { used: 0, total: 10 },
  biometricStatus: "none",
  status: "active",
  grossSalary: 0,
  email: "",
  phone: "",
  address: "",
};

function initials(name: string) {
  return name.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "--";
}

function BiometricBadge({ status }: { status: Employee["biometricStatus"] }) {
  if (status === "enrolled") return <Badge variant="success"><Check className="h-3 w-3" /> Enrolled</Badge>;
  if (status === "pending") return <Badge variant="warning"><Clock className="h-3 w-3" /> Pending</Badge>;
  return <Badge variant="neutral"><X className="h-3 w-3" /> Not Enrolled</Badge>;
}

function StatusBadge({ status }: { status: Employee["status"] }) {
  if (status === "active") return <Badge variant="success">Active</Badge>;
  if (status === "on-leave") return <Badge variant="info">On Leave</Badge>;
  return <Badge variant="neutral">Inactive</Badge>;
}

export function EmployeeDirectoryView({ employees: initialEmployees }: Partial<EmployeeDirectoryViewProps>) {
  const [employees, setEmployees] = useState<Employee[]>(initialEmployees ?? []);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | Employee["status"]>("All");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Employee>(emptyEmployee);
  const [identifierType, setIdentifierType] = useState("SSS");
  const [customIdentifierType, setCustomIdentifierType] = useState("");
  const [fingerprintRegistering, setFingerprintRegistering] = useState(false);

  const filtered = useMemo(() => employees.filter((employee) => {
    const query = search.toLowerCase();
    const matchesSearch = [employee.name, employee.id, employee.role, employee.sssNumber, employee.address]
      .some((value) => value?.toLowerCase().includes(query));
    return matchesSearch && (statusFilter === "All" || employee.status === statusFilter);
  }), [employees, search, statusFilter]);

  function openAdd() {
    const nextNumber = employees.length + 1;
    setEditingId(null);
    setFingerprintRegistering(false);
    setDraft({ ...emptyEmployee, id: `EMP-${String(nextNumber).padStart(3, "0")}`, identifiers: [] });
    setEditorOpen(true);
  }

  function openEdit(employee: Employee) {
    setEditingId(employee.id);
    setFingerprintRegistering(false);
    const legacyIdentifiers = [
      employee.sssNumber && { type: "SSS", value: employee.sssNumber },
      employee.philHealthNumber && { type: "PhilHealth", value: employee.philHealthNumber },
      employee.pagIbigNumber && { type: "Pag-IBIG", value: employee.pagIbigNumber },
      employee.tinNumber && { type: "TIN", value: employee.tinNumber },
    ].filter(Boolean) as { type: string; value: string }[];
    setDraft({ ...emptyEmployee, ...employee, identifiers: employee.identifiers ?? legacyIdentifiers });
    setEditorOpen(true);
  }

  function update<K extends keyof Employee>(field: K, value: Employee[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function saveEmployee(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.id.trim() || !draft.name.trim()) return;
    setEmployees((current) => editingId
      ? current.map((employee) => employee.id === editingId ? draft : employee)
      : [...current, draft]);
    setEditorOpen(false);
  }

  function addIdentifier() {
    const type = identifierType === "Custom" ? customIdentifierType.trim() : identifierType;
    if (!type || draft.identifiers?.some((identifier) => identifier.type.toLowerCase() === type.toLowerCase())) return;
    update("identifiers", [...(draft.identifiers ?? []), { type, value: "" }]);
    setCustomIdentifierType("");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Employee Directory</h2>
          <p className="text-sm text-slate-500">Manage employee, payroll, contact, and biometric information</p>
        </div>
        <Button onClick={openAdd}><Plus className="h-4 w-4" /> Add Employee</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Search name, ID, SSS, role, or address..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="h-10 w-auto rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700">
          <option value="All">All statuses</option><option value="active">Active</option><option value="on-leave">On Leave</option><option value="inactive">Inactive</option>
        </select>
        <div className="flex rounded-lg border border-slate-200 bg-white p-1">
          <button onClick={() => setViewMode("table")} aria-label="Table view" className={`rounded-md p-2 ${viewMode === "table" ? "bg-[#8642ED] text-white" : "text-slate-500"}`}><List className="h-4 w-4" /></button>
          <button onClick={() => setViewMode("cards")} aria-label="Card view" className={`rounded-md p-2 ${viewMode === "cards" ? "bg-[#8642ED] text-white" : "text-slate-500"}`}><Grid2X2 className="h-4 w-4" /></button>
        </div>
      </div>

      {viewMode === "table" ? (
        <Card><CardContent className="p-0"><Table>
          <TableHeader><TableRow className="bg-slate-50/50"><TableHead>Employee</TableHead><TableHead>Role</TableHead><TableHead>SSS Number</TableHead><TableHead>Biometric</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>{filtered.map((employee) => <TableRow key={employee.id}>
            <TableCell><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-[#8642ED]">{initials(employee.name)}</div><div><p className="font-medium text-slate-900">{employee.name}</p><p className="text-xs text-slate-400">{employee.id}</p></div></div></TableCell>
            <TableCell className="capitalize text-slate-600">{employee.role}</TableCell>
            <TableCell className="text-slate-600">{employee.sssNumber || "Not added"}</TableCell>
            <TableCell><BiometricBadge status={employee.biometricStatus} /></TableCell>
            <TableCell><StatusBadge status={employee.status} /></TableCell>
            <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => openEdit(employee)}><Pencil className="h-3.5 w-3.5" /> Edit details</Button></TableCell>
          </TableRow>)}</TableBody>
        </Table>{filtered.length === 0 && <div className="py-12 text-center text-sm text-slate-400">No employees match your search.</div>}</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">{filtered.map((employee) => (
          <Card key={employee.id}><CardContent className="p-5">
            <div className="flex items-start justify-between"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-100 font-bold text-[#8642ED]">{initials(employee.name)}</div><div><h3 className="font-semibold text-slate-900">{employee.name}</h3><p className="text-xs text-slate-500">{employee.id} · {employee.role}</p></div></div><StatusBadge status={employee.status} /></div>
            <div className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-sm"><div className="flex justify-between"><span className="text-slate-400">SSS</span><span className="text-slate-700">{employee.sssNumber || "Not added"}</span></div><div className="flex justify-between"><span className="text-slate-400">Address</span><span className="max-w-[65%] truncate text-slate-700">{employee.address || "Not added"}</span></div><div className="flex justify-between"><span className="text-slate-400">Fingerprint</span><BiometricBadge status={employee.biometricStatus} /></div></div>
            <Button className="mt-5 w-full" variant="outline" onClick={() => openEdit(employee)}><Pencil className="h-4 w-4" /> Edit details</Button>
          </CardContent></Card>
        ))}</div>
      )}

      <Dialog open={editorOpen} onClose={() => setEditorOpen(false)} className="max-h-[85vh] max-w-xl">
        <DialogHeader><div><h3 className="text-base font-bold text-slate-900">{editingId ? "Edit Employee Details" : "Add Employee"}</h3><p className="text-xs text-slate-500">Update identity, payroll, contact, and biometric records.</p></div><DialogClose onClose={() => setEditorOpen(false)} /></DialogHeader>
        <form onSubmit={saveEmployee} className="grid grid-cols-1 gap-3 px-5 pb-5 pt-3 sm:grid-cols-2">
          <Field label="Employee ID"><Input required value={draft.id} onChange={(e) => update("id", e.target.value)} /></Field>
          <Field label="Full Name"><Input required value={draft.name} onChange={(e) => update("name", e.target.value)} /></Field>
          <Field label="Role"><Input value={draft.role} onChange={(e) => update("role", e.target.value)} /></Field>
          <Field label="Gross Monthly Salary"><Input type="number" min="0" value={draft.grossSalary ?? 0} onChange={(e) => update("grossSalary", Number(e.target.value))} /></Field>
          <Field label="Email"><Input type="email" value={draft.email ?? ""} onChange={(e) => update("email", e.target.value)} /></Field>
          <Field label="Phone"><Input value={draft.phone ?? ""} onChange={(e) => update("phone", e.target.value)} /></Field>
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:col-span-2">
            <div><h4 className="text-sm font-semibold text-slate-800">Government and Payroll IDs</h4><p className="text-xs text-slate-500">Choose an ID type or add a custom one.</p></div>
            <div className="flex flex-wrap gap-2">
              <select value={identifierType} onChange={(event) => setIdentifierType(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm">
                <option>SSS</option><option>PhilHealth</option><option>Pag-IBIG</option><option>TIN</option><option>Custom</option>
              </select>
              {identifierType === "Custom" && <Input className="h-9 w-44" value={customIdentifierType} onChange={(event) => setCustomIdentifierType(event.target.value)} placeholder="ID type name" />}
              <Button type="button" size="sm" variant="outline" onClick={addIdentifier}><Plus className="h-3.5 w-3.5" /> Add ID</Button>
            </div>
            {(draft.identifiers ?? []).length === 0 ? <p className="rounded-lg border border-dashed border-slate-200 bg-white p-3 text-center text-xs text-slate-400">No IDs added. This is allowed.</p> : null}
            <div className="grid gap-2 sm:grid-cols-2">{(draft.identifiers ?? []).map((identifier, index) => (
              <div key={`${identifier.type}-${index}`} className="rounded-lg border border-slate-200 bg-white p-2">
                <div className="mb-1 flex items-center justify-between"><span className="text-xs font-semibold text-slate-600">{identifier.type}</span><button type="button" onClick={() => update("identifiers", draft.identifiers?.filter((_, itemIndex) => itemIndex !== index))} className="text-xs font-medium text-rose-600">Remove</button></div>
                <Input value={identifier.value} onChange={(event) => update("identifiers", draft.identifiers?.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))} placeholder={`Enter ${identifier.type} number`} />
              </div>
            ))}</div>
          </div>
          <Field label="Employment Status"><select value={draft.status} onChange={(e) => update("status", e.target.value as Employee["status"])} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="active">Active</option><option value="on-leave">On Leave</option><option value="inactive">Inactive</option></select></Field>
          <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3 sm:col-span-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#8642ED]/10"><Fingerprint className="h-5 w-5 text-[#8642ED]" /></div>
                <div><p className="text-sm font-semibold text-slate-800">Fingerprint Registration</p><p className="text-xs text-slate-500">Required before a new attendance account can be created.</p></div>
              </div>
              {fingerprintRegistering ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="warning"><Clock className="h-3 w-3" /> Ready to scan</Badge>
                  <Button type="button" size="sm" onClick={() => { update("biometricStatus", "enrolled"); setFingerprintRegistering(false); }}><Fingerprint className="h-4 w-4" /> Complete Registration</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setFingerprintRegistering(false)}>Cancel</Button>
                </div>
              ) : draft.biometricStatus === "enrolled" ? (
                <div className="flex items-center gap-2"><Badge variant="success"><Check className="h-3 w-3" /> Registered</Badge><Button type="button" size="sm" variant="outline" onClick={() => setFingerprintRegistering(true)}><Fingerprint className="h-4 w-4" /> Re-register</Button></div>
              ) : (
                <Button type="button" size="sm" onClick={() => setFingerprintRegistering(true)}><Fingerprint className="h-4 w-4" /> Register Fingerprint</Button>
              )}
            </div>
          </div>
          <div className="sm:col-span-2"><Field label="Home Address"><textarea rows={2} value={draft.address ?? ""} onChange={(e) => update("address", e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#8642ED]" /></Field></div>
          {!editingId && draft.biometricStatus !== "enrolled" && <p className="text-xs font-medium text-amber-600 sm:col-span-2">Register a fingerprint to enable account creation and attendance access.</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 sm:col-span-2"><Button type="button" size="sm" variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button><Button type="submit" size="sm" disabled={!editingId && draft.biometricStatus !== "enrolled"}><Fingerprint className="h-4 w-4" /> {editingId ? "Save Employee" : "Create Account"}</Button></div>
        </form>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="space-y-1.5"><span className="text-xs font-semibold text-slate-600">{label}</span>{children}</label>;
}
