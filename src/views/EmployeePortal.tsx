import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { CalendarDays, CheckCircle2, Clock3, Fingerprint, LayoutDashboard, LogOut, Send, UserRound, WalletCards } from 'lucide-react'
import { apiFetch, clearSession } from '../lib/api'
import { useToast } from '../components/ui/Toast'

type EmployeeProfile = {
  id: string; name: string; email?: string; phone?: string; address?: string; createdAt?: string; role: 'regular' | 'extra'; status: string; biometricStatus: string;
  casualLeave?: { total: number; used: number }; sickLeave?: { total: number; used: number }; hourlyRate?: number; grossSalary?: number;
}
type Attendance = { date: string; checkIn?: string; checkOut?: string; status: string; autoClockedOut?: boolean }
type Leave = { id: string; leaveType: string; startDate: string; endDate: string; totalDays: number; reason: string; status: string }
type Payroll = { id: string; amount?: number; currentAmount?: number; carryOverAmount?: number; status: string; periodStart?: string }
type Workspace = { profile: EmployeeProfile; attendance: Attendance[]; leaveRequests: Leave[]; payroll: Payroll[] }
type Section = 'overview' | 'attendance' | 'leave' | 'payroll' | 'profile'

const money = (value: number | undefined) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value || 0))
const formatDate = (value?: string) => value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

export function EmployeePortal() {
  const { toast } = useToast()
  const [section, setSection] = useState<Section>('overview')
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [leaveDraft, setLeaveDraft] = useState({ leaveType: 'Annual Leave', startDate: '', endDate: '', reason: '' })

  async function loadWorkspace() {
    try {
      const response = await apiFetch('/api/employee/me')
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to load your workspace')
      setWorkspace(data)
    } catch (reason) {
      toast({ title: 'Workspace unavailable', description: reason instanceof Error ? reason.message : 'Please sign in again.', variant: 'error' })
    } finally { setLoading(false) }
  }

  useEffect(() => { void loadWorkspace() }, [])

  const attendanceSummary = useMemo(() => {
    const records = workspace?.attendance ?? []
    return { present: records.filter((item) => item.status === 'Present').length, late: records.filter((item) => item.status === 'Late').length, total: records.length }
  }, [workspace])

  async function submitLeave(event: FormEvent) {
    event.preventDefault(); setSubmitting(true)
    try {
      const response = await apiFetch('/api/employee/me/leave-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(leaveDraft) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to submit leave request')
      setWorkspace((current) => current ? { ...current, leaveRequests: [data, ...current.leaveRequests] } : current)
      setLeaveDraft({ leaveType: 'Annual Leave', startDate: '', endDate: '', reason: '' })
      toast({ title: 'Leave request submitted', description: 'Your request is now waiting for administrator review.', variant: 'success' })
    } catch (reason) { toast({ title: 'Request not submitted', description: reason instanceof Error ? reason.message : 'Please try again.', variant: 'error' }) }
    finally { setSubmitting(false) }
  }

  async function logout() {
    try { await apiFetch('/api/auth/logout', { method: 'POST' }) } finally { clearSession(); window.location.href = '/' }
  }

  if (loading) return <div className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-500">Loading your secure workspace…</div>
  if (!workspace) return <div className="grid min-h-screen place-items-center bg-slate-50"><button onClick={() => { clearSession(); window.location.href = '/' }} className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white">Return to sign in</button></div>
  const { profile } = workspace
  const initials = profile.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
  const nav = [
    { key: 'overview' as const, label: 'Overview', icon: LayoutDashboard }, { key: 'attendance' as const, label: 'My Attendance', icon: Clock3 },
    { key: 'leave' as const, label: 'Leave Requests', icon: CalendarDays }, { key: 'payroll' as const, label: 'My Payroll', icon: WalletCards },
    { key: 'profile' as const, label: 'My Profile', icon: UserRound },
  ]

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-600 text-white"><Fingerprint className="h-5 w-5" /></div><div><p className="font-bold">Workpulse<span className="text-indigo-600">AI</span></p><p className="text-[10px] uppercase tracking-widest text-slate-400">Employee workspace</p></div></div>
        <div className="flex items-center gap-3"><div className="hidden text-right sm:block"><p className="text-sm font-semibold">{profile.name}</p><p className="text-xs capitalize text-slate-500">{profile.role} employee</p></div><div className="grid h-9 w-9 place-items-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-700">{initials}</div><button onClick={logout} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Log out"><LogOut className="h-4 w-4" /></button></div>
      </div>
    </header>
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[220px_1fr]">
      <nav className="flex gap-2 overflow-x-auto lg:flex-col">{nav.map(({ key, label, icon: Icon }) => <button key={key} onClick={() => setSection(key)} className={`flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${section === key ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/15' : 'text-slate-600 hover:bg-white hover:text-indigo-600'}`}><Icon className="h-4 w-4" />{label}</button>)}</nav>
      <main className="min-w-0">
        {section === 'overview' && <div className="space-y-6"><div className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-7 text-white shadow-xl"><p className="text-sm text-indigo-200">Welcome back,</p><h1 className="mt-1 text-3xl font-bold text-white">{profile.name}</h1><div className="mt-5 flex flex-wrap gap-2"><span className="rounded-full bg-white/10 px-3 py-1 text-xs capitalize ring-1 ring-white/10">{profile.role}</span><span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200 ring-1 ring-emerald-300/20">{profile.status}</span><span className="rounded-full bg-white/10 px-3 py-1 text-xs ring-1 ring-white/10">ID {profile.id}</span></div></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Recent attendance" value={`${attendanceSummary.present}/${attendanceSummary.total}`} note="Present records" /><Stat label="Late arrivals" value={String(attendanceSummary.late)} note="Recent records" /><Stat label="Pending leave" value={String(workspace.leaveRequests.filter((item) => item.status === 'pending').length)} note="Awaiting review" /><Stat label="Latest payroll" value={workspace.payroll[0] ? money(workspace.payroll[0].currentAmount ?? workspace.payroll[0].amount) : 'No record'} note={workspace.payroll[0]?.status ?? '—'} /></div></div>}
        {section === 'attendance' && <Panel title="My Attendance" subtitle="Your 60 most recent attendance records"><DataTable headers={['Date', 'Clock in', 'Clock out', 'Status']} rows={workspace.attendance.map((item) => [formatDate(item.date), item.checkIn || '—', item.checkOut || '—', <Status key={item.date} value={item.status} />])} empty="No attendance records yet." /></Panel>}
        {section === 'payroll' && <Panel title="My Payroll" subtitle="Your own payroll summaries only"><DataTable headers={['Period', 'Amount', 'Carry over', 'Status']} rows={workspace.payroll.map((item) => [formatDate(item.periodStart), money(item.currentAmount ?? item.amount), money(item.carryOverAmount), <Status key={item.id} value={item.status} />])} empty="No payroll records yet." /></Panel>}
        {section === 'leave' && <div className="grid gap-6 xl:grid-cols-[.85fr_1.15fr]"><Panel title="Request Leave" subtitle="Your administrator will review this request"><form onSubmit={submitLeave} className="space-y-4"><Field label="Leave type"><select value={leaveDraft.leaveType} onChange={(e) => setLeaveDraft((current) => ({ ...current, leaveType: e.target.value }))} className="input"><option>Annual Leave</option><option>Sick Leave</option><option>Personal Leave</option><option>Maternity Leave</option></select></Field><div className="grid grid-cols-2 gap-3"><Field label="Start date"><input required type="date" value={leaveDraft.startDate} onChange={(e) => setLeaveDraft((current) => ({ ...current, startDate: e.target.value }))} className="input" /></Field><Field label="End date"><input required type="date" value={leaveDraft.endDate} onChange={(e) => setLeaveDraft((current) => ({ ...current, endDate: e.target.value }))} className="input" /></Field></div><Field label="Reason"><textarea required minLength={5} maxLength={500} rows={4} value={leaveDraft.reason} onChange={(e) => setLeaveDraft((current) => ({ ...current, reason: e.target.value }))} className="input h-auto py-3" placeholder="Briefly explain your request" /></Field><button disabled={submitting} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"><Send className="h-4 w-4" />{submitting ? 'Submitting…' : 'Submit request'}</button></form></Panel><Panel title="Request History" subtitle="Updates from your administrator"><DataTable headers={['Type', 'Dates', 'Days', 'Status']} rows={workspace.leaveRequests.map((item) => [item.leaveType, `${formatDate(item.startDate)} – ${formatDate(item.endDate)}`, String(item.totalDays), <Status key={item.id} value={item.status} />])} empty="No leave requests yet." /></Panel></div>}
        {section === 'profile' && <Panel title="My Profile" subtitle="Contact an administrator to change protected information"><div className="grid gap-4 sm:grid-cols-2"><ProfileItem label="Employee ID" value={profile.id} /><ProfileItem label="Account created" value={profile.createdAt ? new Date(profile.createdAt).toLocaleString('en-PH') : 'Not recorded'} /><ProfileItem label="Employment type" value={profile.role} /><ProfileItem label="Email" value={profile.email || 'Not provided'} /><ProfileItem label="Phone" value={profile.phone || 'Not provided'} /><ProfileItem label="Address" value={profile.address || 'Not provided'} /><ProfileItem label="Biometric status" value={profile.biometricStatus} /></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><LeaveBalance title="Casual leave" balance={profile.casualLeave} /><LeaveBalance title="Sick leave" balance={profile.sickLeave} /></div></Panel>}
      </main>
    </div>
  </div>
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) { return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4"><h2 className="text-lg font-bold">{title}</h2><p className="text-sm text-slate-500">{subtitle}</p></div><div className="p-5">{children}</div></section> }
function Stat({ label, value, note }: { label: string; value: string; note: string }) { return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p><p className="mt-2 truncate text-2xl font-bold">{value}</p><p className="mt-1 text-xs capitalize text-slate-500">{note}</p></div> }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">{label}</span>{children}</label> }
function Status({ value }: { value: string }) { const good = ['approved', 'paid', 'Present', 'active'].includes(value); const bad = ['rejected', 'Absent'].includes(value); return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${good ? 'bg-emerald-50 text-emerald-700' : bad ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>{value}</span> }
function DataTable({ headers, rows, empty }: { headers: string[]; rows: React.ReactNode[][]; empty: string }) { return <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead><tr className="border-b border-slate-200">{headers.map((header) => <th key={header} className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index} className="border-b border-slate-100 last:border-0">{row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-3 text-slate-600">{cell}</td>)}</tr>)}</tbody></table>{!rows.length && <p className="py-10 text-center text-sm text-slate-400">{empty}</p>}</div> }
function ProfileItem({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-400">{label}</p><p className="mt-1 capitalize font-semibold text-slate-800">{value}</p></div> }
function LeaveBalance({ title, balance }: { title: string; balance?: { total: number; used: number } }) { const remaining = Math.max(0, Number(balance?.total || 0) - Number(balance?.used || 0)); return <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4"><div className="flex items-center gap-2 text-sm font-semibold text-indigo-900"><CheckCircle2 className="h-4 w-4 text-indigo-600" />{title}</div><p className="mt-3 text-2xl font-bold text-indigo-700">{remaining} <span className="text-xs font-medium text-indigo-500">days remaining</span></p></div> }
