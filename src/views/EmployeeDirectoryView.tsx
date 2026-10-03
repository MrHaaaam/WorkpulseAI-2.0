import { BoundedNumberInput } from "../components/ui/BoundedNumberInput";
import { ADDITION_MAX, HOURLY_RATE_MAX, identifierInput, identifierLengths, identifiersValidationError, validBoundedNumber } from "../../shared/field-limits.js";
import { nameInput, emailInput, validEmail } from '../../shared/input-format.js';
import { AdminPageHeader } from "../components/AdminPageHeader";
import { useEffect, useMemo, useState } from "react";
import { Archive, BriefcaseBusiness, CalendarDays, Check, Clock, Contact, Fingerprint, Grid2X2, IdCard, KeyRound, List, Mail, MapPin, Pencil, Phone, Plus, ScanLine, Search, ShieldCheck, UserRound, Wallet, X } from "lucide-react";

import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent } from "../components/ui/Card";
import { Dialog, DialogClose, DialogHeader } from "../components/ui/Dialog";
import { Input } from "../components/ui/Input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/Table";
import { useToast } from "../components/ui/Toast";
import { apiFetch } from "../lib/api";
import { EmployeeEmailVerification } from "../components/EmployeeEmailVerification";
import { FingerprintEnrollment } from "../components/biometric/FingerprintEnrollment";
import { PaginationControls } from "../components/ui/Pagination";
import { usePagination } from "../hooks/usePagination";

export interface Employee {
  id: string;
  firstName?: string;
  lastName?: string;
  name: string;
  role: string;
  biometricStatus: "enrolled" | "pending" | "none";
  status: "active" | "on-leave" | "inactive";
  grossSalary?: number;
  hoursWorked?: number;
  hourlyRate?: number;
  hourlyRateOverride?: number | null;
  email?: string;
  phone?: string;
  address?: string;
  createdAt?: string;
  sssNumber?: string;
  philHealthNumber?: string;
  pagIbigNumber?: string;
  tinNumber?: string;
  identifiers?: { type: string; value: string; amount: number; frequency?: "quarterly" | "per-payroll"; eligibleFromQuarter?: string; frequencyHistory?: { fromQuarter: string; frequency: "quarterly" | "per-payroll" }[] }[];
  salaryAddition?: { amount: number; frequency: "quarterly" | "per-payroll"; eligibleFromQuarter?: string; frequencyHistory?: { fromQuarter: string; frequency: "quarterly" | "per-payroll" }[] };
  salaryAdditionNeedsReview?: boolean;
}

interface EmployeeDirectoryViewProps { employees: Employee[] }
type ViewMode = "table" | "cards";
const REQUIRED_FINGERPRINT_SCANS = 3;

const emptyEmployee: Employee = {
  id: "",
  firstName: "",
  lastName: "",
  name: "",
  role: "regular",
  biometricStatus: "none",
  status: "active",
  grossSalary: 0,
  hoursWorked: 0,
  hourlyRate: 50,
  hourlyRateOverride: null,
  salaryAddition: { amount: 0, frequency: "quarterly" },
  email: "",
  phone: "",
  address: "",
};

function initials(name: string) {
  return name.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "--";
}

function primaryGovernmentId(employee: Employee) {
  const identifier = employee.identifiers?.find((item) => item.value?.trim());
  if (identifier) return `${identifier.type} — ${identifier.value}`;
  return employee.sssNumber ? `SSS — ${employee.sssNumber}` : "Not added";
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
  const [roleFilter, setRoleFilter] = useState<"All" | Employee["role"]>("All");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Employee>(emptyEmployee);
  const [savedDraft, setSavedDraft] = useState<Employee | null>(null);
  const [adminPassword, setAdminPassword] = useState("");
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordPurpose, setPasswordPurpose] = useState<"save" | "email">("save");
  const [invalidField, setInvalidField] = useState("");
  const [passwordRetrySeconds, setPasswordRetrySeconds] = useState(0);
  const [identifierType, setIdentifierType] = useState("SSS");
  const [customIdentifierType, setCustomIdentifierType] = useState("");
  const [fingerprintRegistering, setFingerprintRegistering] = useState(false);
  const [fingerprintSamples, setFingerprintSamples] = useState<string[]>([]);
  const [fingerprintDeviceUid, setFingerprintDeviceUid] = useState("");
  const [fingerprintEnrollmentKey, setFingerprintEnrollmentKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [emailVerificationId, setEmailVerificationId] = useState("");
  const [emailVerificationCode, setEmailVerificationCode] = useState("");
  const [sendingVerification, setSendingVerification] = useState(false);
  const [sendingLogin, setSendingLogin] = useState(false);
  const [formError, setFormError] = useState("");
  const [archiveTarget, setArchiveTarget] = useState<Employee | null>(null);
  const [archivePassword, setArchivePassword] = useState("");
  const [archiveError, setArchiveError] = useState("");
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    apiFetch('/api/employees').then((response) => response.ok ? response.json() : Promise.reject()).then(setEmployees).catch(() => {});
  }, []);

  useEffect(() => {
    if (passwordRetrySeconds <= 0) return;
    const timer = window.setInterval(() => setPasswordRetrySeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [passwordRetrySeconds]);

  async function checkCompletedFingerprint(samples: string[], deviceUid: string) {
    setFormError("");
    try {
      const response = await apiFetch('/api/fingerprints/check-enrollment', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fingerprintSamples: samples }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'The fingerprint could not be checked.');
      setFingerprintSamples(samples);
      setFingerprintDeviceUid(deviceUid);
      update("biometricStatus", "enrolled");
      setFingerprintRegistering(false);
      toast({ title: "Fingerprint ready", description: "All three scans match and this finger is not registered in the system.", variant: "success" });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'The fingerprint could not be checked.';
      setFingerprintSamples([]);
      setFingerprintDeviceUid("");
      setFormError(message);
      setFingerprintEnrollmentKey((key) => key + 1);
      toast({ title: "Fingerprint not accepted", description: message, variant: "error" });
    }
  }

  async function checkFingerprintScan(sample: string) {
    const response = await apiFetch('/api/fingerprints/check-scan', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fingerprintSamples: [sample] }),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) return;
    const message = data.error || 'The fingerprint could not be checked. Please scan again.';
    toast({ title: response.status === 409 ? "Fingerprint already registered" : "Fingerprint check failed", description: message, variant: "error" });
    throw new Error(message);
  }

  const filtered = useMemo(() => employees.filter((employee) => {
    const query = search.toLowerCase();
    const matchesSearch = [employee.name, employee.id, employee.role, employee.sssNumber, employee.address, ...(employee.identifiers ?? []).flatMap((item) => [item.type, item.value])]
      .some((value) => value?.toLowerCase().includes(query));
    return matchesSearch && (statusFilter === "All" || employee.status === statusFilter) && (roleFilter === "All" || employee.role === roleFilter);
  }), [employees, search, statusFilter, roleFilter]);
  const employeePage = usePagination(filtered, `${search}|${statusFilter}|${roleFilter}`);

  async function openAdd() {
    setEmailVerificationId("");
    setEmailVerificationCode("");
    const nextNumber = employees.reduce((maximum, employee) => {
      const match = /^EMP-(\d+)$/i.exec(employee.id);
      return match ? Math.max(maximum, Number(match[1])) : maximum;
    }, 0) + 1;
    setEditingId(null);
    setSavedDraft(null);
    setAdminPassword("");
    setFingerprintRegistering(false);
    setFingerprintSamples([]);
    setFingerprintDeviceUid("");
    setDraft({ ...emptyEmployee, id: `EMP-${String(nextNumber).padStart(3, "0")}`, identifiers: [] });
    setEditorOpen(true);
    try {
      const response = await apiFetch('/api/employees-next-id');
      const data = await response.json();
      if (response.ok && data.id) setDraft((current) => ({ ...current, id: data.id }));
    } catch { /* Keep the local preview; the server still assigns the final ID. */ }
  }

  function openEdit(employee: Employee) {
    setEditingId(employee.id);
    setPasswordOpen(false);
    setAdminPassword("");
    setInvalidField("");
    setFormError("");
    setFingerprintRegistering(false);
    setFingerprintSamples([]);
    setFingerprintDeviceUid("");
    const legacyIdentifiers = [
      employee.sssNumber && { type: "SSS", value: employee.sssNumber },
      employee.philHealthNumber && { type: "PhilHealth", value: employee.philHealthNumber },
      employee.pagIbigNumber && { type: "Pag-IBIG", value: employee.pagIbigNumber },
      employee.tinNumber && { type: "TIN", value: employee.tinNumber },
    ].filter(Boolean).map((identifier) => ({ ...identifier, amount: 0 })) as { type: string; value: string; amount: number; frequency?: "quarterly" | "per-payroll"; eligibleFromQuarter?: string; frequencyHistory?: { fromQuarter: string; frequency: "quarterly" | "per-payroll" }[] }[];
    const normalizedRole = ["regular", "extra", "manager", "supervisor"].includes(employee.role) ? employee.role : "regular";
    const hourlyRate = normalizedRole === "extra" ? 40 : 50;
    const nameParts = employee.name.trim().split(/\s+/);
    const identifiers = employee.identifiers ?? legacyIdentifiers;
    const fallbackAmount = Math.round(identifiers.reduce((sum, item) => sum + Number(item.amount || 0), 0) * 100) / 100;
    const salaryAddition = { ...(employee.salaryAddition ?? { amount: fallbackAmount }), frequency: "quarterly" as const };
    const editable = { ...emptyEmployee, ...employee, firstName: employee.firstName || nameParts[0] || "", lastName: employee.lastName || nameParts.slice(1).join(" "), role: normalizedRole, hourlyRate, hoursWorked: employee.hoursWorked ?? ((employee.grossSalary ?? 0) / hourlyRate), identifiers, salaryAddition };
    setDraft(editable);
    setSavedDraft(editable);
    setAdminPassword("");
    setEditorOpen(true);
  }

  function closeEditor() {
    if (saving || sendingVerification) return;
    setPasswordOpen(false);
    setEditorOpen(false);
    setAdminPassword("");
    setFormError("");
    setFingerprintRegistering(false);
    setFingerprintSamples([]);
    setFingerprintDeviceUid("");
  }

  function revertChanges() {
    if (!savedDraft) return;
    setDraft(savedDraft);
    setAdminPassword("");
    setPasswordOpen(false);
    setInvalidField("");
    setFormError("");
    setFingerprintRegistering(false);
    setFingerprintSamples([]);
    setFingerprintDeviceUid("");
  }

  function update<K extends keyof Employee>(field: K, value: Employee[K]) {
    setInvalidField("");
    setFormError("");
    if (field === 'email') {
      setEmailVerificationId("");
      setEmailVerificationCode("");
    }
    const inputValue = typeof value === 'string' ? field === 'email' ? emailInput(value) : field === 'firstName' || field === 'lastName' ? nameInput(value) : value : value;
    setDraft((current) => ({ ...current, [field]: inputValue }));
  }

  async function sendEmailVerification() {
    if (sendingVerification || saving) return;
    setSendingVerification(true);
    setFormError("");
    setEmailVerificationId("");
    setEmailVerificationCode("");
    try {
      const response = await apiFetch('/api/employees/email-verification', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: draft.email }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to send verification code');
      setEmailVerificationId(data.verificationId);
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : 'Unable to send verification code');
    } finally { setSendingVerification(false); }
  }

  function updateRole(role: "regular" | "extra" | "manager" | "supervisor") {
    const hourlyRate = role === "extra" ? 40 : 50;
    setDraft((current) => ({ ...current, role, hourlyRate }));
  }

  function showFieldError(field: string, message: string) {
    setFormError(message);
    setInvalidField(field);
    requestAnimationFrame(() => {
      const input = document.querySelector<HTMLElement>(`[data-employee-field="${field}"]`);
      input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      input?.focus({ preventScroll: true });
    });
  }

  function saveEmployee(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    const identifierError = identifiersValidationError(draft.identifiers);
    if (identifierError) { const index = draft.identifiers?.findIndex(item => identifiersValidationError([item])) ?? -1; showFieldError(index >= 0 ? `identifier-${index}` : 'identifiers', identifierError); return; }
    if (!validBoundedNumber(draft.salaryAddition?.amount, 0, ADDITION_MAX)) { showFieldError('salaryAddition', 'Enter an amount from 0 to 1,000,000 with up to 2 decimal places.'); return; }
    const names = [draft.firstName, draft.lastName].map(value => (value ?? '').normalize('NFC').trim().replace(/ +/g, ' '));
    const badName = names.findIndex(value => value.length < 2 || value.length > 50 || !/^(?=.*\p{L})[\p{L}\p{M} '\u2019.-]+$/u.test(value));
    if (badName >= 0) { showFieldError(badName === 0 ? 'firstName' : 'lastName', 'Enter a name using 2 to 50 characters.'); return; }
    if (!validEmail(draft.email)) { showFieldError('email', 'Enter a valid email address.'); return; }
    if (!/^\+639\d{9}$/.test(draft.phone ?? '')) { showFieldError('phone', 'Phone number must use +639XXXXXXXXX.'); return; }
    if ((draft.address ?? '').trim().length < 5 || (draft.address ?? '').trim().length > 255) { showFieldError('address', 'Address must be 5 to 255 characters.'); return; }
    if (draft.hourlyRateOverride != null && !validBoundedNumber(draft.hourlyRateOverride, 1, HOURLY_RATE_MAX)) { showFieldError('hourlyRateOverride', 'Employee hourly rate must be from 1 to 10,000 with at most 2 decimal places.'); return; }
    if (!editingId && (!emailVerificationId || !/^\d{6}$/.test(emailVerificationCode))) { setFormError('Request a verification code and enter the code received by the employee.'); return; }
    if (!editingId && fingerprintSamples.length !== REQUIRED_FINGERPRINT_SCANS) { setFormError('Capture three fingerprint scans before creating the employee.'); return; }
    setInvalidField('');
    setFormError('');
    if (editingId) { setPasswordPurpose('save'); setPasswordOpen(true); return; }
    void persistEmployee();
  }

  async function persistEmployee() {
    setSaving(true); setFormError("");
    try {
      if (editingId) {
        const verificationResponse = await apiFetch('/api/auth/verify-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: adminPassword }),
        });
        const verificationType = verificationResponse.headers.get('content-type') ?? '';
        const verificationData = verificationType.includes('application/json') ? await verificationResponse.json() : null;
        if (verificationResponse.status === 429) {
          const seconds = Number(verificationData?.retryAfterSeconds || verificationResponse.headers.get('Retry-After') || 0);
          setPasswordRetrySeconds(seconds);
          throw new Error(`Too many password attempts. Try again in ${seconds} seconds.`);
        }
        if (!verificationResponse.ok) throw new Error(verificationData?.error || 'Incorrect admin password');
      }
      if (editingId && fingerprintSamples.length === REQUIRED_FINGERPRINT_SCANS) {
        const fingerprintResponse = await apiFetch(`/api/employees/${editingId}/fingerprint`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ adminPassword, fingerprintSamples, fingerprintDeviceUid }),
        });
        const fingerprintData = await fingerprintResponse.json().catch(() => ({}));
        if (!fingerprintResponse.ok) throw new Error(fingerprintData.error || 'Unable to replace the fingerprint registration');
      }
      const payload = editingId ? { ...draft, adminPassword } : { ...draft, fingerprintSamples, fingerprintDeviceUid, emailVerificationId, emailVerificationCode };
      const response = await apiFetch(`/api/employees${editingId ? `/${editingId}` : ''}`, { method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to save employee');
      if (fingerprintSamples.length === REQUIRED_FINGERPRINT_SCANS) data.biometricStatus = 'enrolled';
      const { loginEmailSent, ...employeeData } = data;
      if (!editingId && loginEmailSent !== true) {
        throw new Error('The server did not confirm that the login email was sent. Check the employee directory before trying again.');
      }
      setEmployees((current) => editingId ? current.map((employee) => employee.id === editingId ? employeeData : employee) : [...current, employeeData]);
      setEditorOpen(false);
      setPasswordOpen(false);
      setAdminPassword("");
      setFingerprintSamples([]);
      setFingerprintDeviceUid("");
      toast({ title: editingId ? "Employee updated" : "Employee account created", description: editingId ? `${employeeData.name}'s record was saved successfully.` : `Email verified. Login details were sent to ${employeeData.email}.`, variant: "success" });
    } catch (reason) { const message = reason instanceof Error ? reason.message : 'Unable to save employee'; setFormError(message); toast({ title: editingId ? "Update failed" : "Account creation failed", description: message, variant: "error" }); }
    finally { setSaving(false); }
  }

  function addIdentifier() {
    const type = identifierType === "Custom" ? customIdentifierType.trim() : identifierType;
    if (!type || draft.identifiers?.some((identifier) => identifier.type.toLowerCase() === type.toLowerCase())) return;
    update("identifiers", [...(draft.identifiers ?? []), { type, value: "", amount: 0, frequency: "quarterly" }]);
    setCustomIdentifierType("");
  }

  async function sendNewLoginEmail() {
    if (!editingId || !adminPassword) return;
    setSendingLogin(true);
    setFormError("");
    try {
      const response = await apiFetch(`/api/employees/${editingId}/send-login-email`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ adminPassword }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to send new login details");
      setPasswordOpen(false);
      setAdminPassword("");
      toast({ title: "Login email sent", description: data.message, variant: "success" });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Unable to send new login details";
      setFormError(message);
      toast({ title: "Login email not sent", description: message, variant: "error" });
    } finally {
      setSendingLogin(false);
    }
  }

  async function archiveEmployee(event: React.FormEvent) {
    event.preventDefault();
    if (!archiveTarget || !archivePassword) return;
    setArchiving(true); setArchiveError("");
    try {
      const response = await apiFetch(`/api/employees/${archiveTarget.id}/archive`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: archivePassword }) });
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
      <AdminPageHeader title="Employee Directory" description="Find employees and manage their account details." icon={Contact} actions={<><Button variant="outline" onClick={() => window.open('/kiosk', '_blank', 'noopener,noreferrer')}><ScanLine className="h-4 w-4" /> Open Kiosk</Button><Button data-guide="employee-add" onClick={openAdd}><Plus className="h-4 w-4" /> Add Employee</Button></>} />

      <div data-guide="employee-filters" className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center lg:grid-cols-[minmax(18rem,28rem)_auto_auto_auto_1fr]">
        <div className="relative min-w-0">
          <label htmlFor="employee-directory-search" className="sr-only">Search employees</label><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <Input id="employee-directory-search" type="search" placeholder="Search employees..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <label htmlFor="employee-role-filter" className="sr-only">Filter by employee role</label><select id="employee-role-filter" aria-label="Filter by employee role" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 focus:border-violet-500 focus:outline-none focus:ring-4 focus:ring-violet-200 sm:w-auto">
          <option value="All">All roles</option><option value="regular">Regular</option><option value="extra">Extra</option><option value="manager">Manager</option><option value="supervisor">Supervisor</option>
        </select>
        <label htmlFor="employee-status-filter" className="sr-only">Filter by employment status</label><select id="employee-status-filter" aria-label="Filter by employment status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 focus:border-violet-500 focus:outline-none focus:ring-4 focus:ring-violet-200 sm:w-auto">
          <option value="All">All statuses</option><option value="active">Active</option><option value="on-leave">On Leave</option><option value="inactive">Inactive</option>
        </select>
        <div className="flex rounded-lg border border-slate-200 bg-white p-1">
          <button onClick={() => setViewMode("table")} aria-label="Show employees in a table" aria-pressed={viewMode === "table"} className={`rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-violet-500 ${viewMode === "table" ? "bg-[#8642ED] text-white" : "text-slate-500"}`}><List className="h-4 w-4" aria-hidden="true" /></button>
          <button onClick={() => setViewMode("cards")} aria-label="Show employees as cards" aria-pressed={viewMode === "cards"} className={`rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-violet-500 ${viewMode === "cards" ? "bg-[#8642ED] text-white" : "text-slate-500"}`}><Grid2X2 className="h-4 w-4" aria-hidden="true" /></button>
        </div>
        <p className="text-sm text-slate-600 lg:ml-auto" role="status" aria-live="polite">Showing {filtered.length} of {employees.length} employees</p>
      </div>

      {viewMode === "table" ? (
        <Card data-guide="employee-list" className="min-w-0 overflow-hidden"><CardContent className="p-0"><Table className="min-w-[760px]" aria-label="Employee directory">
          <caption className="sr-only">Employee names, roles, government IDs, work status, and available actions.</caption>
          <TableHeader><TableRow className="bg-slate-50/50"><TableHead>Employee</TableHead><TableHead>Role</TableHead><TableHead>Government ID</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>{employeePage.pageItems.map((employee) => <TableRow key={employee.id}>
            <TableCell><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-[#8642ED]">{initials(employee.name)}</div><div><p className="font-medium text-slate-900">{employee.name}</p><p className="text-xs text-slate-400">{employee.id}</p></div></div></TableCell>
            <TableCell className="capitalize text-slate-600">{employee.role}</TableCell>
            <TableCell className="text-slate-600">{primaryGovernmentId(employee)}</TableCell>
            <TableCell><StatusBadge status={employee.status} /></TableCell>
            <TableCell><div className="flex justify-end gap-2"><Button size="sm" variant="outline" aria-label={`Edit details for ${employee.name}`} onClick={() => openEdit(employee)}><Pencil className="h-3.5 w-3.5" /> Edit details</Button><Button size="sm" variant="outline" aria-label={`Archive ${employee.name}`} className="text-rose-600 hover:bg-rose-50" onClick={() => { setArchiveTarget(employee); setArchivePassword(""); setArchiveError(""); }}><Archive className="h-3.5 w-3.5" /> Archive</Button></div></TableCell>
          </TableRow>)}</TableBody>
        </Table>{filtered.length === 0 && <div className="py-12 text-center text-sm text-slate-400">No employees match your search.</div>}<PaginationControls {...employeePage} onPageChange={employeePage.setPage} /></CardContent></Card>
      ) : (
        <div><div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">{employeePage.pageItems.map((employee) => (
          <Card key={employee.id}><CardContent className="p-5 !pt-5">
            <div className="flex min-w-0 items-start justify-between gap-2"><div className="flex min-w-0 items-center gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-100 font-bold text-[#8642ED]">{initials(employee.name)}</div><div className="min-w-0"><h3 className="truncate font-semibold text-slate-900">{employee.name}</h3><p className="truncate text-xs text-slate-500">{employee.id} · {employee.role}</p></div></div><div className="shrink-0"><StatusBadge status={employee.status} /></div></div>
            <div className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-sm"><div className="flex justify-between gap-3"><span className="text-slate-500">Government ID</span><span className="text-right text-slate-700">{primaryGovernmentId(employee)}</span></div><div className="flex justify-between gap-3"><span className="text-slate-500">Address</span><span className="max-w-[65%] truncate text-slate-700">{employee.address || "Not added"}</span></div><div className="flex justify-between"><span className="text-slate-500">Fingerprint</span><BiometricBadge status={employee.biometricStatus} /></div></div>
            <div className="mt-5 grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => openEdit(employee)}><Pencil className="h-4 w-4" /> Edit</Button><Button variant="outline" className="text-rose-600 hover:bg-rose-50" onClick={() => { setArchiveTarget(employee); setArchivePassword(""); setArchiveError(""); }}><Archive className="h-4 w-4" /> Archive</Button></div>
          </CardContent></Card>
        ))}</div><PaginationControls {...employeePage} onPageChange={employeePage.setPage} /></div>
      )}

      <Dialog open={editorOpen} onClose={closeEditor} className="max-h-[92vh] max-w-3xl overflow-hidden">
        <div className="border-b border-slate-100 bg-gradient-to-r from-violet-50 via-white to-white">
          <DialogHeader><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#8642ED] text-white shadow-sm"><UserRound className="h-5 w-5" /></div><div><h3 className="text-lg font-bold text-slate-900">{editingId ? "Edit employee" : "Add new employee"}</h3><p className="mt-0.5 text-xs text-slate-500">{editingId ? `Update ${draft.name || "this employee"}'s profile and access.` : "Create a complete profile and attendance account."}</p></div></div><DialogClose onClose={closeEditor} /></DialogHeader>
          <div className="flex flex-wrap gap-3 px-4 pb-4 text-xs font-medium text-slate-400 sm:gap-5 sm:px-6"><span className="flex items-center gap-1.5 text-[#8642ED]"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#8642ED] text-[10px] text-white">1</span> Employee details</span><span className="flex items-center gap-1.5"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[10px] text-slate-500">2</span> Fingerprint access</span></div>
        </div>
        <form noValidate onSubmit={saveEmployee} className="flex max-h-[calc(92vh-132px)] flex-col">
          <div className="scrollbar-thin flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <FormSection icon={<Contact className="h-4 w-4" />} title="Personal & contact information" description="Basic details used across the employee directory.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="First name" error={invalidField==="firstName"?formError:undefined} required hint="2 to 50 characters"><Input data-employee-field="firstName" aria-invalid={invalidField==='firstName'} className={invalidField==='firstName'?'border-rose-500 ring-2 ring-rose-200':''} required minLength={2} maxLength={50} placeholder="e.g. Juan" value={draft.firstName ?? ""} onChange={(e) => update("firstName", e.target.value)} /></Field>
              <Field label="Last name" error={invalidField==="lastName"?formError:undefined} required hint="2 to 50 characters"><Input data-employee-field="lastName" aria-invalid={invalidField==='lastName'} className={invalidField==='lastName'?'border-rose-500 ring-2 ring-rose-200':''} required minLength={2} maxLength={50} placeholder="e.g. Dela Cruz" value={draft.lastName ?? ""} onChange={(e) => update("lastName", e.target.value)} /></Field>
              <Field label="Employee ID" required hint="Assigned automatically"><Input required readOnly className="bg-slate-100 text-slate-500" value={draft.id} /></Field>
              <Field label="Account creation date" hint="Cannot be edited"><div className="relative"><CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input readOnly className="bg-slate-100 pl-9 text-slate-500" value={draft.createdAt ? new Date(draft.createdAt).toLocaleString("en-PH") : "Assigned when employee is created"} /></div></Field>
              <Field label="Email address" error={invalidField==="email"?formError:undefined} required hint="Up to 254 characters; no spaces"><div className="relative"><Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input data-employee-field="email" aria-invalid={invalidField==='email'} required disabled={sendingVerification || saving} className={`pl-9 ${invalidField==='email'?'border-rose-500 ring-2 ring-rose-200':''}`} type="email" maxLength={254} placeholder="name@company.com" value={draft.email ?? ""} onChange={(e) => update("email", e.target.value)} /></div></Field>
              <Field label="Phone number" error={invalidField==="phone"?formError:undefined} required hint="No spaces"><div className="relative"><Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input data-employee-field="phone" aria-invalid={invalidField==='phone'} required className={`pl-9 ${invalidField==='phone'?'border-rose-500 ring-2 ring-rose-200':''}`} type="tel" inputMode="numeric" pattern="\+639[0-9]{9}" maxLength={13} placeholder="+639123456789" value={draft.phone ?? ""} onChange={(e) => { const digits = e.target.value.replace(/\D/g, "").replace(/^63?/, "").slice(0, 10); update("phone", `+63${digits.startsWith("9") ? digits : `9${digits.replace(/^9/, "")}`}`.slice(0, 13)); }} /></div></Field>
              <div className="sm:col-span-2"><Field label="Home address" error={invalidField==="address"?formError:undefined} required hint="5 to 255 characters"><div className="relative"><MapPin className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><textarea data-employee-field="address" aria-invalid={invalidField==='address'} required minLength={5} maxLength={255} rows={2} placeholder="Street, barangay, city, province" value={draft.address ?? ""} onChange={(e) => update("address", e.target.value)} className={`w-full resize-none rounded-lg border bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition focus:ring-2 ${invalidField==='address'?'border-rose-500 ring-2 ring-rose-200':'border-slate-200 focus:border-[#8642ED] focus:ring-[#8642ED]/20'}`} /></div></Field></div>
            </div>
          </FormSection>
          <FormSection icon={<BriefcaseBusiness className="h-4 w-4" />} title="Employment details" description="Role, compensation, and current employment state.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Employee role"><select value={draft.role} onChange={(e) => updateRole(e.target.value as "regular" | "extra" | "manager" | "supervisor")} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#8642ED] focus:ring-2 focus:ring-[#8642ED]/20"><option value="regular">Regular</option><option value="extra">Extra</option><option value="manager">Manager</option><option value="supervisor">Supervisor</option></select></Field>
              <Field label="Hourly rate" error={invalidField==="hourlyRateOverride"?formError:undefined} hint="Blank uses the role default"><BoundedNumberInput data-employee-field="hourlyRateOverride" aria-invalid={invalidField==='hourlyRateOverride'} className={invalidField==='hourlyRateOverride'?'border-rose-500 ring-2 ring-rose-200':''} min="1" max={HOURLY_RATE_MAX} value={draft.hourlyRateOverride ?? ""} onChange={(event) => update("hourlyRateOverride", event.target.value === "" ? null : Number(event.target.value))} placeholder="Use System Settings rate" aria-label="Employee hourly rate override" /></Field>
              <div className="sm:col-span-2"><label htmlFor="employee-employment-status" className="mb-1 block text-sm font-medium text-slate-600">Employment status</label><select id="employee-employment-status" value={draft.status === "inactive" ? "inactive" : "active"} onChange={(e) => update("status", e.target.value as "active" | "inactive")} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#8642ED] focus:ring-2 focus:ring-[#8642ED]/20"><option value="active">Active</option><option value="inactive">Inactive</option></select><p className="mt-1 text-xs text-slate-500">Inactive stops new clock-ins and absences. Past records stay.</p></div>
            </div>
          </FormSection>
          <FormSection icon={<IdCard className="h-4 w-4" />} title="Government IDs" description="Add an ID type now; its number can be filled in later. IDs do not change payroll.">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <select value={identifierType} onChange={(event) => setIdentifierType(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm">
                  <option>SSS</option><option>PhilHealth</option><option>Pag-IBIG</option><option>TIN</option><option>Custom</option>
                </select>
                {identifierType === "Custom" && <Input className="h-9 w-44" maxLength={50} value={customIdentifierType} onChange={(event) => setCustomIdentifierType(event.target.value)} placeholder="ID type name" />}
                <Button type="button" size="sm" variant="outline" onClick={addIdentifier}><Plus className="h-3.5 w-3.5" /> Add ID</Button>
              </div>
              {(draft.identifiers ?? []).length === 0 && <p className="rounded-lg border border-dashed border-slate-200 bg-white p-3 text-center text-xs text-slate-400">No IDs added. This is allowed.</p>}
              <div className="grid gap-3 sm:grid-cols-2">{(draft.identifiers ?? []).map((identifier, index) => (
                <div key={`${identifier.type}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                  <div className="mb-2 flex items-center justify-between"><span className="rounded-md bg-violet-100 px-2 py-1 text-xs font-bold text-violet-700">{identifier.type}</span><button type="button" onClick={() => update("identifiers", draft.identifiers?.filter((_, itemIndex) => itemIndex !== index))} className="text-xs font-medium text-rose-600 hover:text-rose-700">Remove</button></div>
                  <Field label={`${identifier.type} identification number (optional)`} hint={identifierLengths(identifier.type) ? `${identifierLengths(identifier.type)!.join(" or ")} digits if provided` : "Up to 50 characters if provided"}><Input data-employee-field={`identifier-${index}`} aria-invalid={invalidField===`identifier-${index}`} className={invalidField===`identifier-${index}`?"border-rose-500 ring-2 ring-rose-200":""} inputMode={identifierLengths(identifier.type) ? "numeric" : "text"} maxLength={identifierLengths(identifier.type) ? Math.max(...identifierLengths(identifier.type)!) + 4 : 50} value={identifier.value} onChange={(event) => update("identifiers", draft.identifiers?.map((item, itemIndex) => itemIndex === index ? { ...item, value: identifierInput(identifier.type, event.target.value) } : item))} placeholder="Add number later" /></Field>
                  {invalidField===`identifier-${index}` && <p className="mt-1 text-xs font-medium text-rose-700">{formError}</p>}
                </div>
              ))}</div>
            </div>
          </FormSection>
          <FormSection icon={<Wallet className="h-4 w-4" />} title="Owner-funded addition" description="One extra amount for this employee, separate from government IDs.">
            <div className="grid gap-4 sm:grid-cols-2">
              {draft.salaryAdditionNeedsReview && <p className="sm:col-span-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">The old amounts need review. Check the combined amount before saving.</p>}
              <Field label="Amount" hint="One amount for all owner-funded additions" error={invalidField==="salaryAddition"?formError:undefined}><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">₱</span><BoundedNumberInput data-employee-field="salaryAddition" aria-invalid={invalidField==="salaryAddition"} className={`pl-8 ${invalidField==="salaryAddition"?"border-rose-500 ring-2 ring-rose-200":""}`} min="0" max={ADDITION_MAX} value={draft.salaryAddition?.amount || ""} onChange={(event) => update("salaryAddition", { ...draft.salaryAddition, amount: event.target.value === "" ? 0 : Number(event.target.value), frequency: draft.salaryAddition?.frequency ?? "quarterly" })} placeholder="0.00" /></div></Field>
              <p className="self-center text-sm text-violet-800">Added once each quarter: Mar 16–31, Jun 16–30, Sep 16–30, and Dec 16–31.</p>
              <p className="sm:col-span-2 text-xs leading-5 text-slate-500">Changing this amount updates future quarterly additions. An amount already placed in payroll stays as recorded, even if that payroll has not been paid yet. Paid payrolls never change.</p>
            </div>
          </FormSection>          <FormSection icon={<ShieldCheck className="h-4 w-4" />} title="Attendance access" description="Register the fingerprint used to clock in and out.">
          <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#8642ED]/10"><Fingerprint className="h-5 w-5 text-[#8642ED]" /></div>
                <div><p className="text-sm font-semibold text-slate-800">Fingerprint Registration</p><p className="text-xs text-slate-500">Required before a new attendance account can be created.</p></div>
              </div>
              {!fingerprintRegistering && (draft.biometricStatus === "enrolled" || fingerprintSamples.length === REQUIRED_FINGERPRINT_SCANS) ? (
                <div className="flex items-center gap-2"><Badge variant="success"><Check className="h-3 w-3" /> {fingerprintSamples.length === REQUIRED_FINGERPRINT_SCANS ? (editingId ? 'Replacement ready' : 'Ready to enroll') : 'Registered'}</Badge><Button type="button" size="sm" variant="outline" onClick={() => { setFingerprintSamples([]); setFingerprintDeviceUid(""); setFingerprintRegistering(true); }}><Fingerprint className="h-4 w-4" /> Re-register</Button></div>
              ) : !fingerprintRegistering ? (
                <Button type="button" size="sm" onClick={() => { setFingerprintSamples([]); setFingerprintDeviceUid(""); setFingerprintRegistering(true); }}><Fingerprint className="h-4 w-4" /> Register Fingerprint</Button>
              ) : (
                <Badge variant="warning"><Clock className="h-3 w-3" /> Enrollment in progress</Badge>
              )}
            </div>
            {fingerprintRegistering && <div className="mt-4"><FingerprintEnrollment key={fingerprintEnrollmentKey} validateScan={checkFingerprintScan} onComplete={(samples, uid) => void checkCompletedFingerprint(samples, uid)} onCancel={() => setFingerprintRegistering(false)} /></div>}
          </div>
          {!editingId && fingerprintSamples.length !== REQUIRED_FINGERPRINT_SCANS && <p className="mt-2 text-xs font-medium text-amber-600">Capture three scans of the same finger; all three must match accurately.</p>}
          </FormSection>
          {!editingId && <FormSection icon={<KeyRound className="h-4 w-4" />} title="Verify employee email" description="The employee must receive a code before their account can be created.">
            <EmployeeEmailVerification email={draft.email ?? ""} sent={!!emailVerificationId} code={emailVerificationCode} sending={sendingVerification} saving={saving} onSend={sendEmailVerification} onChange={setEmailVerificationCode} />
          </FormSection>}
          {formError && !invalidField && !passwordOpen && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{formError}</p>}
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 bg-white px-6 py-4"><p className="hidden text-xs text-slate-400 sm:block"><span className="text-rose-500">*</span> Required fields</p><div className="ml-auto flex flex-wrap justify-end gap-2">{editingId && <Button type="button" variant="outline" disabled={sendingLogin} onClick={()=>{setPasswordPurpose('email');setFormError('');setPasswordOpen(true)}}><Mail className="h-4 w-4" />{sendingLogin ? "Sending..." : "Send new login email"}</Button>}{editingId && <Button type="button" variant="outline" onClick={revertChanges}>Revert changes</Button>}<Button type="button" variant="outline" onClick={closeEditor}>Cancel</Button><Button type="submit" disabled={saving || sendingVerification || (!editingId && (!emailVerificationId || emailVerificationCode.length !== 6)) || fingerprintRegistering || passwordRetrySeconds > 0 || (!editingId && fingerprintSamples.length !== REQUIRED_FINGERPRINT_SCANS)}><Fingerprint className="h-4 w-4" /> {saving ? (editingId ? 'Saving...' : 'Creating account and sending email...') : passwordRetrySeconds > 0 ? `Wait ${passwordRetrySeconds}s` : editingId ? "Save changes" : "Create employee"}</Button></div></div>
        </form>
      </Dialog>
      <Dialog open={passwordOpen} onClose={()=>!saving&&!sendingLogin&&setPasswordOpen(false)} className="max-w-sm"><DialogHeader><h3 className="text-base font-bold text-slate-900">{passwordPurpose==='save'?'Confirm changes':'Send login email'}</h3><DialogClose onClose={()=>setPasswordOpen(false)} /></DialogHeader><form onSubmit={event=>{event.preventDefault();if(passwordPurpose==='save')void persistEmployee();else void sendNewLoginEmail()}} className="space-y-4 px-6 pb-6 pt-3"><Field label="Administrator password" required><Input type="password" autoFocus autoComplete="current-password" value={adminPassword} disabled={passwordRetrySeconds>0} onChange={event=>{setAdminPassword(event.target.value);setFormError('')}} placeholder="Enter your password" /></Field>{passwordRetrySeconds>0&&<p className="text-xs text-amber-700">Try again in {passwordRetrySeconds} seconds.</p>}{formError&&<p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={()=>setPasswordOpen(false)}>Cancel</Button><Button type="submit" disabled={!adminPassword||saving||sendingLogin||passwordRetrySeconds>0}>{saving||sendingLogin?'Working...':passwordPurpose==='save'?'Save changes':'Send email'}</Button></div></form></Dialog>
      <Dialog open={!!archiveTarget} onClose={() => setArchiveTarget(null)} className="max-w-sm"><DialogHeader><div><h3 className="flex items-center gap-2 text-base font-bold text-slate-900"><KeyRound className="h-4 w-4 text-rose-600" /> Archive employee</h3><p className="mt-1 text-xs text-slate-500">{archiveTarget?.name} will become inactive and move to Admin Controls.</p></div><DialogClose onClose={() => setArchiveTarget(null)} /></DialogHeader><form onSubmit={archiveEmployee} className="space-y-3 px-6 pb-6 pt-3"><Field label="Confirm your admin password" required><Input type="password" autoFocus value={archivePassword} onChange={(event) => { setArchivePassword(event.target.value); setArchiveError(""); }} placeholder="Enter your password" /></Field>{archiveError && <p className="text-xs font-medium text-rose-600">{archiveError}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setArchiveTarget(null)}>Cancel</Button><Button type="submit" variant="destructive" disabled={archiving || !archivePassword}><Archive className="h-4 w-4" />{archiving ? "Archiving..." : "Archive employee"}</Button></div></form></Dialog>
    </div>
  );
}

function FormSection({ icon, title, description, children }: { icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="mb-4 flex items-start gap-3"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-[#8642ED]">{icon}</div><div><h4 className="text-sm font-bold text-slate-800">{title}</h4><p className="mt-0.5 text-xs text-slate-500">{description}</p></div></div>{children}</section>;
}

function Field({ label, hint, required, error, children }: { label: string; hint?: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5"><span className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-600"><span>{label}{required && <span className="ml-0.5 text-rose-500">*</span>}</span>{hint && <span className="font-normal text-slate-400">{hint}</span>}</span>{children}{error&&<span className="block text-xs font-medium text-rose-700">{error}</span>}</label>;
}
