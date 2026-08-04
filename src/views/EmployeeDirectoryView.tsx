import { useEffect, useMemo, useState } from "react";
import { Archive, BriefcaseBusiness, Check, Clock, Contact, Fingerprint, Grid2X2, IdCard, KeyRound, List, Mail, MapPin, Pencil, Phone, Plus, Search, ShieldCheck, UserRound, X } from "lucide-react";

import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent } from "../components/ui/Card";
import { Dialog, DialogClose, DialogHeader } from "../components/ui/Dialog";
import { Input } from "../components/ui/Input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/Table";
import { useToast } from "../components/ui/Toast";
import { apiFetch } from "../lib/api";

export interface Employee {
  id: string;
  name: string;
  role: string;
  casualLeave: { total: number; used: number };
  sickLeave: { total: number; used: number };
  biometricStatus: "enrolled" | "pending" | "none";
  status: "active" | "on-leave" | "inactive";
  grossSalary?: number;
  hoursWorked?: number;
  hourlyRate?: number;
  email?: string;
  phone?: string;
  address?: string;
  sssNumber?: string;
  philHealthNumber?: string;
  pagIbigNumber?: string;
  tinNumber?: string;
  identifiers?: { type: string; value: string; amount: number }[];
}

interface EmployeeDirectoryViewProps { employees: Employee[] }
type ViewMode = "table" | "cards";

const emptyEmployee: Employee = {
  id: "",
  name: "",
  role: "regular",
  casualLeave: { used: 0, total: 10 },
  sickLeave: { used: 0, total: 10 },
  biometricStatus: "none",
  status: "active",
  grossSalary: 0,
  hoursWorked: 0,
  hourlyRate: 50,
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
  const { toast } = useToast();
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
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [archiveTarget, setArchiveTarget] = useState<Employee | null>(null);
  const [archivePassword, setArchivePassword] = useState("");
  const [archiveError, setArchiveError] = useState("");
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    apiFetch('/api/employees').then((response) => response.ok ? response.json() : Promise.reject()).then(setEmployees).catch(() => {});
  }, []);

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
    ].filter(Boolean).map((identifier) => ({ ...identifier, amount: 0 })) as { type: string; value: string; amount: number }[];
    const normalizedRole = employee.role === "extra" ? "extra" : "regular";
    const hourlyRate = normalizedRole === "regular" ? 50 : 40;
    setDraft({ ...emptyEmployee, ...employee, role: normalizedRole, hourlyRate, hoursWorked: employee.hoursWorked ?? ((employee.grossSalary ?? 0) / hourlyRate), identifiers: employee.identifiers ?? legacyIdentifiers });
    setEditorOpen(true);
  }

  function update<K extends keyof Employee>(field: K, value: Employee[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function updateRole(role: "regular" | "extra") {
    const hourlyRate = role === "regular" ? 50 : 40;
    setDraft((current) => ({ ...current, role, hourlyRate }));
  }

  async function saveEmployee(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.id.trim() || !draft.name.trim()) return;
    setSaving(true); setFormError("");
    try {
      const response = await apiFetch(`/api/employees${editingId ? `/${editingId}` : ''}`, { method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to save employee');
      setEmployees((current) => editingId ? current.map((employee) => employee.id === editingId ? data : employee) : [...current, data]);
      setEditorOpen(false);
      toast({ title: editingId ? "Employee updated" : "Employee account created", description: `${data.name}'s record was saved successfully.`, variant: "success" });
    } catch (reason) { const message = reason instanceof Error ? reason.message : 'Unable to save employee'; setFormError(message); toast({ title: editingId ? "Update failed" : "Account creation failed", description: message, variant: "error" }); }
    finally { setSaving(false); }
  }

  function addIdentifier() {
    const type = identifierType === "Custom" ? customIdentifierType.trim() : identifierType;
    if (!type || draft.identifiers?.some((identifier) => identifier.type.toLowerCase() === type.toLowerCase())) return;
    update("identifiers", [...(draft.identifiers ?? []), { type, value: "", amount: 0 }]);
    setCustomIdentifierType("");
  }

  async function archiveEmployee(event: React.FormEvent) {
    event.preventDefault();
    if (!archiveTarget || !archivePassword) return;
    setArchiving(true); setArchiveError("");
    try {
      const token = sessionStorage.getItem('workpulse_token');
      const response = await apiFetch(`/api/employees/${archiveTarget.id}/archive`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` }, body: JSON.stringify({ password: archivePassword }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to archive employee');
      setEmployees((current) => current.filter((employee) => employee.id !== archiveTarget.id));
      toast({ title: "Employee archived", description: `${archiveTarget.name}'s account moved to Admin Controls.`, variant: "success" });
      setArchiveTarget(null); setArchivePassword("");
    } catch (reason) { const message = reason instanceof Error ? reason.message : 'Unable to archive employee'; setArchiveError(message); toast({ title: "Archive failed", description: message, variant: "error" }); }
    finally { setArchiving(false); }
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
            <TableCell className="text-slate-600">{employee.identifiers?.find((item) => item.type.toLowerCase() === "sss")?.value || employee.sssNumber || "Not added"}</TableCell>
            <TableCell><BiometricBadge status={employee.biometricStatus} /></TableCell>
            <TableCell><StatusBadge status={employee.status} /></TableCell>
            <TableCell><div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => openEdit(employee)}><Pencil className="h-3.5 w-3.5" /> Edit details</Button><Button size="sm" variant="outline" className="text-rose-600 hover:bg-rose-50" onClick={() => { setArchiveTarget(employee); setArchivePassword(""); setArchiveError(""); }}><Archive className="h-3.5 w-3.5" /> Archive</Button></div></TableCell>
          </TableRow>)}</TableBody>
        </Table>{filtered.length === 0 && <div className="py-12 text-center text-sm text-slate-400">No employees match your search.</div>}</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">{filtered.map((employee) => (
          <Card key={employee.id}><CardContent className="p-5">
            <div className="flex items-start justify-between"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-100 font-bold text-[#8642ED]">{initials(employee.name)}</div><div><h3 className="font-semibold text-slate-900">{employee.name}</h3><p className="text-xs text-slate-500">{employee.id} · {employee.role}</p></div></div><StatusBadge status={employee.status} /></div>
            <div className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-sm"><div className="flex justify-between"><span className="text-slate-400">SSS</span><span className="text-slate-700">{employee.identifiers?.find((item) => item.type.toLowerCase() === "sss")?.value || employee.sssNumber || "Not added"}</span></div><div className="flex justify-between"><span className="text-slate-400">Address</span><span className="max-w-[65%] truncate text-slate-700">{employee.address || "Not added"}</span></div><div className="flex justify-between"><span className="text-slate-400">Fingerprint</span><BiometricBadge status={employee.biometricStatus} /></div></div>
            <div className="mt-5 grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => openEdit(employee)}><Pencil className="h-4 w-4" /> Edit</Button><Button variant="outline" className="text-rose-600 hover:bg-rose-50" onClick={() => { setArchiveTarget(employee); setArchivePassword(""); setArchiveError(""); }}><Archive className="h-4 w-4" /> Archive</Button></div>
          </CardContent></Card>
        ))}</div>
      )}

      <Dialog open={editorOpen} onClose={() => setEditorOpen(false)} className="max-h-[92vh] max-w-3xl overflow-hidden">
        <div className="border-b border-slate-100 bg-gradient-to-r from-violet-50 via-white to-white">
          <DialogHeader><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#8642ED] text-white shadow-sm"><UserRound className="h-5 w-5" /></div><div><h3 className="text-lg font-bold text-slate-900">{editingId ? "Edit employee" : "Add new employee"}</h3><p className="mt-0.5 text-xs text-slate-500">{editingId ? `Update ${draft.name || "this employee"}'s profile and access.` : "Create a complete profile and attendance account."}</p></div></div><DialogClose onClose={() => setEditorOpen(false)} /></DialogHeader>
          <div className="flex gap-5 px-6 pb-4 text-xs font-medium text-slate-400"><span className="flex items-center gap-1.5 text-[#8642ED]"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#8642ED] text-[10px] text-white">1</span> Employee details</span><span className="flex items-center gap-1.5"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[10px] text-slate-500">2</span> Fingerprint access</span></div>
        </div>
        <form onSubmit={saveEmployee} className="flex max-h-[calc(92vh-132px)] flex-col">
          <div className="scrollbar-thin flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <FormSection icon={<Contact className="h-4 w-4" />} title="Personal & contact information" description="Basic details used across the employee directory.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Full name" required><Input required placeholder="e.g. Juan Dela Cruz" value={draft.name} onChange={(e) => update("name", e.target.value)} /></Field>
              <Field label="Employee ID" required hint="A unique internal reference"><Input required value={draft.id} onChange={(e) => update("id", e.target.value)} /></Field>
              <Field label="Email address"><div className="relative"><Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="pl-9" type="email" placeholder="name@company.com" value={draft.email ?? ""} onChange={(e) => update("email", e.target.value)} /></div></Field>
              <Field label="Phone number"><div className="relative"><Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="pl-9" placeholder="+63 9XX XXX XXXX" value={draft.phone ?? ""} onChange={(e) => update("phone", e.target.value)} /></div></Field>
              <div className="sm:col-span-2"><Field label="Home address"><div className="relative"><MapPin className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><textarea rows={2} placeholder="Street, barangay, city, province" value={draft.address ?? ""} onChange={(e) => update("address", e.target.value)} className="w-full resize-none rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition focus:border-[#8642ED] focus:ring-2 focus:ring-[#8642ED]/20" /></div></Field></div>
            </div>
          </FormSection>
          <FormSection icon={<BriefcaseBusiness className="h-4 w-4" />} title="Employment details" description="Role, compensation, and current employment state.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Employee role"><select value={draft.role === "extra" ? "extra" : "regular"} onChange={(e) => updateRole(e.target.value as "regular" | "extra")} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#8642ED] focus:ring-2 focus:ring-[#8642ED]/20"><option value="regular">Regular</option><option value="extra">Extra</option></select></Field>
              <Field label="Hourly rate"><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">₱</span><Input className="pl-8" readOnly value={draft.role === "extra" ? "40 / hour" : "50 / hour"} /></div></Field>
              <div className="rounded-xl border border-violet-100 bg-violet-50 p-3"><p className="text-xs font-semibold text-violet-800">Attendance-based payroll</p><p className="mt-1 text-[11px] leading-relaxed text-violet-600">Gross pay is calculated automatically from clocked hours during each 15-day period.</p></div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-semibold text-slate-600">Employment status</p><div className="mt-1 flex items-center justify-between"><span className="text-sm font-semibold capitalize text-slate-800">{draft.status.replace('-', ' ')}</span><StatusBadge status={draft.status} /></div><p className="mt-1 text-[11px] text-slate-400">Controlled by leave approval and archiving.</p></div>
            </div>
          </FormSection>
          <FormSection icon={<IdCard className="h-4 w-4" />} title="Government IDs & salary additions" description="Store each government ID and any extra amount the owner wants to add to this employee's pay.">
            <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <select value={identifierType} onChange={(event) => setIdentifierType(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm">
                <option>SSS</option><option>PhilHealth</option><option>Pag-IBIG</option><option>TIN</option><option>Custom</option>
              </select>
              {identifierType === "Custom" && <Input className="h-9 w-44" value={customIdentifierType} onChange={(event) => setCustomIdentifierType(event.target.value)} placeholder="ID type name" />}
              <Button type="button" size="sm" variant="outline" onClick={addIdentifier}><Plus className="h-3.5 w-3.5" /> Add ID</Button>
            </div>
            {(draft.identifiers ?? []).length === 0 ? <p className="rounded-lg border border-dashed border-slate-200 bg-white p-3 text-center text-xs text-slate-400">No IDs added. This is allowed.</p> : null}
            <div className="space-y-3">{(draft.identifiers ?? []).map((identifier, index) => (
              <div key={`${identifier.type}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><span className="rounded-md bg-violet-100 px-2 py-1 text-xs font-bold text-violet-700">{identifier.type}</span><span className="text-[11px] text-slate-400">Government record</span></div><button type="button" onClick={() => update("identifiers", draft.identifiers?.filter((_, itemIndex) => itemIndex !== index))} className="text-xs font-medium text-rose-600 hover:text-rose-700">Remove</button></div>
                <div className="grid gap-3 sm:grid-cols-2"><Field label={`${identifier.type} identification number`}><Input value={identifier.value} onChange={(event) => update("identifiers", draft.identifiers?.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))} placeholder={`Enter ${identifier.type} number`} /></Field><Field label="Owner-funded salary addition" hint="Added to net pay"><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">₱</span><Input className="no-number-arrows pl-8" type="number" min="0" step="0.01" value={identifier.amount || ""} onChange={(event) => update("identifiers", draft.identifiers?.map((item, itemIndex) => itemIndex === index ? { ...item, amount: event.target.value === "" ? 0 : Number(event.target.value) } : item))} aria-label={`${identifier.type} salary addition`} placeholder="Leave blank if none" /></div></Field></div>
              </div>
            ))}</div>
            {(draft.identifiers ?? []).length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3"><div><p className="text-xs font-medium text-emerald-700">Estimated net salary</p><p className="text-[11px] text-emerald-600">Gross salary plus all ID amounts</p></div><div className="text-right"><p className="text-lg font-bold text-emerald-700">₱{((draft.grossSalary ?? 0) + (draft.identifiers ?? []).reduce((sum, identifier) => sum + (Number(identifier.amount) || 0), 0)).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p><p className="text-[11px] text-emerald-600">+₱{(draft.identifiers ?? []).reduce((sum, identifier) => sum + (Number(identifier.amount) || 0), 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} additions</p></div></div>}
            </div>
          </FormSection>
          <FormSection icon={<ShieldCheck className="h-4 w-4" />} title="Attendance access" description="Register the fingerprint used to clock in and out.">
          <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4">
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
          {!editingId && draft.biometricStatus !== "enrolled" && <p className="mt-2 text-xs font-medium text-amber-600">A fingerprint is required before the employee account can be created.</p>}
          </FormSection>
          {formError && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{formError}</p>}
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 bg-white px-6 py-4"><p className="hidden text-xs text-slate-400 sm:block"><span className="text-rose-500">*</span> Required fields</p><div className="ml-auto flex gap-2"><Button type="button" variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button><Button type="submit" disabled={saving || (!editingId && draft.biometricStatus !== "enrolled")}><Fingerprint className="h-4 w-4" /> {saving ? 'Saving...' : editingId ? "Save changes" : "Create employee"}</Button></div></div>
        </form>
      </Dialog>
      <Dialog open={!!archiveTarget} onClose={() => setArchiveTarget(null)} className="max-w-sm"><DialogHeader><div><h3 className="flex items-center gap-2 text-base font-bold text-slate-900"><KeyRound className="h-4 w-4 text-rose-600" /> Archive employee</h3><p className="mt-1 text-xs text-slate-500">{archiveTarget?.name} will become inactive and move to Admin Controls.</p></div><DialogClose onClose={() => setArchiveTarget(null)} /></DialogHeader><form onSubmit={archiveEmployee} className="space-y-3 px-6 pb-6 pt-3"><Field label="Confirm your admin password" required><Input type="password" autoFocus value={archivePassword} onChange={(event) => { setArchivePassword(event.target.value); setArchiveError(""); }} placeholder="Enter your password" /></Field>{archiveError && <p className="text-xs font-medium text-rose-600">{archiveError}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setArchiveTarget(null)}>Cancel</Button><Button type="submit" variant="destructive" disabled={archiving || !archivePassword}><Archive className="h-4 w-4" />{archiving ? "Archiving..." : "Archive employee"}</Button></div></form></Dialog>
    </div>
  );
}

function FormSection({ icon, title, description, children }: { icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="mb-4 flex items-start gap-3"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-[#8642ED]">{icon}</div><div><h4 className="text-sm font-bold text-slate-800">{title}</h4><p className="mt-0.5 text-xs text-slate-500">{description}</p></div></div>{children}</section>;
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return <label className="block space-y-1.5"><span className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-600"><span>{label}{required && <span className="ml-0.5 text-rose-500">*</span>}</span>{hint && <span className="font-normal text-slate-400">{hint}</span>}</span>{children}</label>;
}
