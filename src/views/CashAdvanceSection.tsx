import { useEffect, useMemo, useState } from 'react'
import { Check, RefreshCw, Search, WalletCards, X } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Dialog, DialogClose, DialogHeader } from '../components/ui/Dialog'
import { Input } from '../components/ui/Input'
import { PaginationControls } from '../components/ui/Pagination'
import { usePagination } from '../hooks/usePagination'
import { apiFetch } from '../lib/api'
import { useAdminPasswordRetry } from '../lib/adminPasswordRetry'
import type { Employee } from '../lib/data'
import { nextPayrollPeriod, payrollPeriodRange } from '../lib/payrollPeriod'
import { nextCashAdvanceRepayment } from '../lib/cashAdvancePreview'
import type { PayrollRequest } from './PayrollView'
import { CashAdvancesDialog } from './CashAdvancesDialog'

type AdvanceRequest = { id: string; employeeId: string; employeeName: string; amount: number; reason: string; status: 'pending' | 'approved' | 'accepted' | 'rejected' | 'cancelled' | 'disbursed'; startPeriod?: string; requestedAt: string; disbursedDate?: string; adminNote?: string }
type Summary = { employeeId: string; employeeName: string; advanced: number; repaid: number; balance: number; advances: { id: string; amount: number; date: string; startPeriod?: string }[]; repayments: { payrollId: string; periodStart: string; amount: number }[] }
const money = (value: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value)
const today = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).filter(part => part.type !== 'literal').map(part => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}
const periodKey = (date: string) => `${date.slice(0, 7)}-${Number(date.slice(8, 10)) <= 15 ? '01' : '16'}`
const periodOptions = () => {
  const [year, month, day] = periodKey(today()).split('-').map(Number)
  return Array.from({ length: 24 }, (_, index) => {
    const half = (day === 16 ? 1 : 0) + index
    const date = new Date(year, month - 1 + Math.floor(half / 2), 1)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${half % 2 === 0 ? '01' : '16'}`
  })
}
const statusText: Record<AdvanceRequest['status'], string> = { pending: 'Needs review', approved: 'Waiting for employee', accepted: 'Ready to give cash', rejected: 'Rejected', cancelled: 'Cancelled', disbursed: 'Cash given' }

function RepaymentPreview({ row, payroll }: { row: Summary; payroll: PayrollRequest[] }) {
  const next = nextCashAdvanceRepayment(row.balance, row.advances, payroll.filter(record => record.employeeId === row.employeeId))
  if (!next) return null
  return <span className="mt-1 block text-xs font-medium text-violet-700">{next.calculated ? 'Planned deduction' : 'Next possible deduction'}: {next.calculated ? money(next.amount) : `up to ${money(next.amount)}`} · {payrollPeriodRange(next.periodStart)}</span>
}

export function CashAdvanceSection({ employees, payroll, onPayrollChanged }: { employees: Employee[]; payroll: PayrollRequest[]; onPayrollChanged: () => Promise<void> }) {
  const [requests, setRequests] = useState<AdvanceRequest[]>([])
  const [summaries, setSummaries] = useState<Summary[]>([])
  const [search, setSearch] = useState('')
  const [target, setTarget] = useState<AdvanceRequest | null>(null)
  const [directOpen, setDirectOpen] = useState(false)
  const [decision, setDecision] = useState<'approve' | 'reject' | 'disburse'>('approve')
  const [startPeriod, setStartPeriod] = useState(() => nextPayrollPeriod(periodKey(today())))
  const [givenDate, setGivenDate] = useState(today)
  const [note, setNote] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const passwordRetrySeconds = useAdminPasswordRetry()
  const [loadingError, setLoadingError] = useState('')
  async function load() {
    const [requestResponse, summaryResponse] = await Promise.all([apiFetch('/api/cash-advance-requests'), apiFetch('/api/cash-advances')])
    if (!requestResponse.ok || !summaryResponse.ok) throw new Error('Unable to load cash advances.')
    setRequests(await requestResponse.json()); setSummaries(await summaryResponse.json()); setLoadingError('')
  }
  useEffect(() => {
    void Promise.all([apiFetch('/api/cash-advance-requests'), apiFetch('/api/cash-advances')]).then(async ([requestsResponse, summariesResponse]) => {
      if (!requestsResponse.ok || !summariesResponse.ok) throw new Error('Unable to load cash advances.')
      setRequests(await requestsResponse.json()); setSummaries(await summariesResponse.json())
    }).catch(cause => setLoadingError(cause.message))
  }, [])
  const query = search.trim().toLowerCase()
  const shownRequests = useMemo(() => requests.filter(item => `${item.employeeName} ${item.employeeId}`.toLowerCase().includes(query)), [requests, query])
  const shownSummaries = useMemo(() => summaries.filter(item => `${item.employeeName} ${item.employeeId}`.toLowerCase().includes(query)), [summaries, query])
  const requestsPage = usePagination(shownRequests, `requests|${search}`, 8)
  const balancesPage = usePagination(shownSummaries, `balances|${search}`, 8)
  function open(request: AdvanceRequest, action: 'approve' | 'reject' | 'disburse') {
    const options = periodOptions().filter(period => !payroll.some(row => row.employeeId === request.employeeId && row.periodStart === period && ['paid', 'approved'].includes(row.status)))
    setTarget(request); setDecision(action); setStartPeriod(request.startPeriod || options.find(period => period >= nextPayrollPeriod(periodKey(today()))) || options[0] || nextPayrollPeriod(periodKey(today()))); setGivenDate(today()); setNote(''); setPassword(''); setError('')
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!target || passwordRetrySeconds > 0) return
    setSaving(true); setError('')
    try {
      const url = decision === 'disburse' ? `/api/cash-advance-requests/${target.id}/disburse` : `/api/cash-advance-requests/${target.id}/decision`
      const response = await apiFetch(url, { method: decision === 'disburse' ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(decision === 'disburse' ? { date: givenDate, password } : { decision, startPeriod, note, password }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to update request.')
      setTarget(null); await load(); if (decision === 'disburse') await onPayrollChanged()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to update request.') }
    finally { setSaving(false) }
  }
  return <section className="space-y-4" aria-label="Cash advances">
    <Card className="overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-violet-50/60 px-5 py-4"><div className="flex items-center gap-3"><span className="rounded-xl bg-violet-100 p-2 text-violet-700"><WalletCards size={20}/></span><div><h2 className="font-bold text-slate-900">Cash advances</h2><p className="text-sm text-slate-500">Review requests, confirm cash given, and track repayments.</p></div></div><div className="flex flex-wrap items-center gap-2"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><Input aria-label="Search cash advances" placeholder="Search employee" value={search} onChange={event => setSearch(event.target.value)} className="w-48 pl-9"/></div><Button variant="outline" size="sm" onClick={() => void load().catch(cause => setLoadingError(cause.message))}><RefreshCw size={14}/>Refresh</Button></div></div>
      {loadingError && <p className="m-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{loadingError}</p>}
      <div className="space-y-3 p-4 sm:p-5"><div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="font-semibold text-slate-900">Employee requests</h3><span className="text-sm text-violet-700">{requests.filter(item => item.status === 'pending').length} to review</span></div><div className="space-y-2">{requestsPage.pageItems.map(request => <div key={request.id} className="grid gap-3 rounded-xl border border-slate-200 p-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-center"><div className="min-w-0"><p className="font-semibold text-slate-900">{request.employeeName}</p><p className="text-xs text-slate-500">{request.employeeId} · {request.reason || 'No reason entered'}</p></div><div><p className="font-bold text-slate-900">{money(request.amount)}</p><p className="text-xs text-slate-500">Requested {new Date(request.requestedAt).toLocaleDateString('en-PH')}</p></div><div><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${request.status === 'pending' ? 'bg-amber-50 text-amber-800' : request.status === 'accepted' ? 'bg-violet-100 text-violet-800' : request.status === 'disbursed' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{statusText[request.status]}</span>{request.startPeriod && <p className="mt-1 text-xs text-slate-500">Repayment starts {payrollPeriodRange(request.startPeriod)}</p>}</div><div className="flex flex-wrap gap-2 lg:justify-end">{request.status === 'pending' && <><Button size="sm" onClick={() => open(request, 'approve')}><Check size={14}/>Approve</Button><Button size="sm" variant="outline" onClick={() => open(request, 'reject')}><X size={14}/>Reject</Button></>}{request.status === 'accepted' && <Button size="sm" onClick={() => open(request, 'disburse')}>Confirm cash given</Button>}</div></div>)}{!shownRequests.length && <p className="rounded-xl border border-slate-200 py-8 text-center text-sm text-slate-500">No cash advance requests found.</p>}</div><PaginationControls {...requestsPage} onPageChange={requestsPage.setPage}/></div>
      <div className="space-y-3 border-t border-slate-200 p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold text-slate-900">Cash given and balances</h3><p className="text-xs text-slate-500">Repayments appear here after payroll is marked paid.</p></div><Button variant="outline" size="sm" onClick={() => setDirectOpen(true)}>Record cash given without a request</Button></div><div className="space-y-2">{balancesPage.pageItems.map(row => <details key={row.employeeId} className="rounded-xl border border-slate-200 p-3"><summary className="grid cursor-pointer gap-2 lg:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))] lg:items-center"><span className="font-semibold text-slate-900">{row.employeeName} <span className="block text-xs font-normal text-slate-500">{row.employeeId}</span></span><span className="text-sm text-slate-600">Given <strong className="block text-slate-900">{money(row.advanced)}</strong></span><span className="text-sm text-slate-600">Repaid <strong className="block text-slate-900">{money(row.repaid)}</strong></span><span className="text-sm text-slate-600">Still owed <strong className="block text-violet-700">{money(row.balance)}</strong><RepaymentPreview row={row} payroll={payroll}/></span></summary><div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 text-sm sm:grid-cols-2"><div><p className="font-semibold text-slate-700">Cash given</p>{row.advances.map(item => <p key={item.id} className="mt-1 text-slate-600">{item.date}: {money(item.amount)} · starts {item.startPeriod ? payrollPeriodRange(item.startPeriod) : 'legacy record'}</p>)}</div><div><p className="font-semibold text-slate-700">Paid through payroll</p>{row.repayments.map(item => <p key={item.payrollId} className="mt-1 text-slate-600">{payrollPeriodRange(item.periodStart)}: {money(item.amount)}</p>)}</div></div></details>)}{!shownSummaries.length && <p className="rounded-xl border border-slate-200 py-8 text-center text-sm text-slate-500">No cash has been recorded as given.</p>}</div><PaginationControls {...balancesPage} onPageChange={balancesPage.setPage}/></div>
    </Card>
    {directOpen && <CashAdvancesDialog employees={employees} onClose={() => setDirectOpen(false)} onSaved={async () => { await load(); await onPayrollChanged() }} />}
    <Dialog open={Boolean(target)} className="max-w-lg" onClose={() => !saving && setTarget(null)}><DialogHeader><div><h3 className="font-bold text-slate-900">{decision === 'disburse' ? 'Confirm cash given' : decision === 'approve' ? 'Approve cash advance' : 'Reject cash advance'}</h3><p className="mt-1 text-sm text-slate-500">{target?.employeeName} · {money(target?.amount || 0)}</p></div><DialogClose onClose={() => setTarget(null)}/></DialogHeader><form onSubmit={submit} className="space-y-4 px-6 pb-6 pt-4">{decision === 'approve' && <label className="block space-y-1 text-sm font-medium text-slate-700">First repayment payroll<select className="input w-full" value={startPeriod} onChange={event => setStartPeriod(event.target.value)}>{periodOptions().filter(period => !payroll.some(row => row.employeeId === target?.employeeId && row.periodStart === period && ['paid', 'approved'].includes(row.status))).map(period => <option key={period} value={period}>{payrollPeriodRange(period)}{period === periodKey(today()) ? ' (current; only if unpaid)' : ''}</option>)}</select><span className="block text-xs font-normal text-slate-500">These are 15-day payroll periods, not payment dates. The employee must accept before cash is given.</span></label>}{decision === 'disburse' && <><label className="block space-y-1 text-sm font-medium text-slate-700">Date cash was given<Input type="date" required max={today()} value={givenDate} onChange={event => setGivenDate(event.target.value)}/></label><p className="rounded-xl bg-violet-50 p-3 text-sm text-violet-800">This creates the debt. The first deduction is on an eligible payroll that has not been paid yet.</p></>}{decision !== 'disburse' && <label className="block space-y-1 text-sm font-medium text-slate-700">Note (optional)<Input maxLength={500} value={note} onChange={event => setNote(event.target.value)}/></label>}<label className="block space-y-1 text-sm font-medium text-slate-700">Admin password<Input type="password" autoComplete="current-password" required disabled={passwordRetrySeconds > 0} value={password} onChange={event => setPassword(event.target.value)}/></label>{error && <p role="alert" className="rounded-lg bg-rose-50 p-2 text-sm text-rose-700">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setTarget(null)}>Cancel</Button><Button disabled={saving || !password || passwordRetrySeconds > 0} type="submit">{saving ? 'Saving...' : decision === 'disburse' ? 'Confirm cash given' : decision === 'approve' ? 'Approve request' : 'Reject request'}</Button></div></form></Dialog>
  </section>
}
