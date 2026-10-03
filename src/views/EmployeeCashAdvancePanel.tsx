import { useState } from 'react'
import { WalletCards } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { apiFetch } from '../lib/api'
import { currentPayrollPeriod, nextPayrollPeriod, payrollPeriodForDate, payrollPeriodRange } from '../lib/payrollPeriod'
import { nextCashAdvanceRepayment } from '../lib/cashAdvancePreview'

export type CashAdvanceRequest = { id: string; amount: number; reason: string; status: 'pending' | 'approved' | 'accepted' | 'rejected' | 'cancelled' | 'disbursed'; startPeriod?: string; requestedAt: string; disbursedDate?: string; adminNote?: string }
export type CashAdvanceSummary = { advanced: number; repaid: number; balance: number; installment: number; advances: { startPeriod?: string; issuePeriod?: string; date?: string }[]; repayments: { payrollId: string; periodStart: string; amount: number }[] }
const money = (value: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value || 0)
const labels: Record<CashAdvanceRequest['status'], string> = { pending: 'Waiting for admin', approved: 'Review and accept terms', accepted: 'Waiting for cash', rejected: 'Rejected', cancelled: 'Cancelled', disbursed: 'Cash received' }

export function EmployeeCashAdvancePanel({ summary, maxAmount, payroll, requests, onChanged }: { summary?: CashAdvanceSummary; maxAmount?: number; payroll: { periodStart?: string; status: string; advanceDeduction?: number; rolledInto?: string }[]; requests: CashAdvanceRequest[]; onChanged: () => Promise<void> }) {
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const amountError = amount && (Number(amount) <= 0 ? 'Enter an amount greater than zero.' : Number(amount) > (maxAmount || 1000) ? `The limit is ${money(maxAmount || 1000)} per payroll period.` : '')
  const openRequest = requests.some(request => ['pending', 'approved', 'accepted'].includes(request.status))
  const currentPeriod = currentPayrollPeriod()
  const receivedThisPeriod = (summary?.advances || []).some(advance => (advance.issuePeriod || (advance.date && payrollPeriodForDate(advance.date))) === currentPeriod)
    || requests.some(request => request.status === 'disbursed' && request.disbursedDate && payrollPeriodForDate(request.disbursedDate) === currentPeriod)
  const nextRepayment = nextCashAdvanceRepayment(summary?.balance || 0, summary?.advances || [], payroll)
  async function sendRequest(event: React.FormEvent) {
    event.preventDefault(); if (receivedThisPeriod || openRequest || amountError) return; setBusy(true); setError('')
    try {
      const response = await apiFetch('/api/employee/me/cash-advance-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: Number(amount), reason, repaymentAgreed: agreed }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to send request.')
      setAmount(''); setReason(''); setAgreed(false); await onChanged()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to send request.'); await onChanged() }
    finally { setBusy(false) }
  }
  async function changeRequest(request: CashAdvanceRequest, action: 'accept' | 'cancel') {
    setBusy(true); setError('')
    try {
      const response = await apiFetch(`/api/employee/me/cash-advance-requests/${request.id}/${action}`, { method: 'PATCH' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to update request.')
      await onChanged()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to update request.') }
    finally { setBusy(false) }
  }
  return <section className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center gap-3 border-b border-slate-100 bg-violet-50/50 p-5"><span className="rounded-xl bg-violet-100 p-2 text-violet-700"><WalletCards size={20}/></span><div><h2 className="font-bold text-slate-900">Cash advance</h2><p className="text-sm text-slate-500">Request cash and track what you still owe.</p></div></div><div className="space-y-5 p-5">
    <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-violet-50 p-3"><p className="text-xs text-violet-700">Still owed</p><p className="mt-1 font-bold text-violet-950">{money(summary?.balance || 0)}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Cash received</p><p className="mt-1 font-bold text-slate-900">{money(summary?.advanced || 0)}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Repaid</p><p className="mt-1 font-bold text-slate-900">{money(summary?.repaid || 0)}</p></div></div>
    <p className="text-sm text-slate-600">Repayment is up to ₱200 once per paid payroll, not per day.</p>{nextRepayment && <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900"><strong>{nextRepayment.calculated ? 'Planned deduction' : 'Next possible deduction'}: {nextRepayment.calculated ? money(nextRepayment.amount) : `up to ${money(nextRepayment.amount)}`}</strong><span className="block">Payroll period: {payrollPeriodRange(nextRepayment.periodStart)}</span><span className="block text-xs text-violet-700">This is taken only when that payroll is marked paid, and cannot exceed earned hourly pay.</span></div>}
    {!openRequest && receivedThisPeriod && <p role="status" className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900">Cash was already given in the {payrollPeriodRange(currentPeriod)} payroll period. You can request another advance in {payrollPeriodRange(nextPayrollPeriod(currentPeriod))}, even if you still owe money.</p>}{!openRequest && !receivedThisPeriod && <form onSubmit={sendRequest} className="space-y-3 rounded-xl border border-violet-200 p-4"><h3 className="font-semibold text-slate-900">Request cash</h3><p className="text-xs text-slate-500">Up to {money(maxAmount || 1000)} once per 15-day payroll period. You can request again in a later period even if you still owe money.</p><div className="grid gap-3 sm:grid-cols-2"><label className="block space-y-1 text-sm font-medium text-slate-700">Amount (₱)<Input required type="text" inputMode="decimal" placeholder="0.00" aria-invalid={Boolean(amountError)} className={amountError ? "border-rose-400 focus:border-rose-500 focus:ring-rose-100" : ""} value={amount} onChange={event => { if (/^\d{0,7}(?:\.\d{0,2})?$/.test(event.target.value)) setAmount(event.target.value) }}/>{amountError && <span className="block text-xs text-rose-700">{amountError}</span>}</label><label className="block space-y-1 text-sm font-medium text-slate-700">Reason (optional)<Input maxLength={500} value={reason} onChange={event => setReason(event.target.value)} placeholder="Why you need it"/></label></div><label className="flex items-start gap-2 text-sm text-slate-600"><input type="checkbox" required checked={agreed} onChange={event => setAgreed(event.target.checked)} className="mt-1 accent-violet-600"/><span>If I receive the cash, up to ₱200 will be deducted <strong>once per paid payroll (about every 15 days), not every day</strong>. The deduction cannot be more than my earned hourly pay for that payroll. I will see and accept the first repayment payroll before receiving cash.</span></label><div className="flex justify-end"><Button disabled={busy || !amount || !agreed || Boolean(amountError)} type="submit">{busy ? 'Sending...' : 'Send request'}</Button></div></form>}
    <div><h3 className="mb-2 font-semibold text-slate-900">Requests</h3><div className="space-y-2">{requests.map(request => <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"><div><p className="font-semibold text-slate-900">{money(request.amount)} <span className="ml-2 rounded-full bg-violet-50 px-2 py-1 text-xs font-medium text-violet-700">{labels[request.status]}</span></p><p className="mt-1 text-xs text-slate-500">{request.reason || 'No reason entered'}{request.startPeriod ? ` · Repayment starts with payroll ${payrollPeriodRange(request.startPeriod)}` : ''}</p>{request.adminNote && <p className="mt-1 text-xs text-slate-500">Admin note: {request.adminNote}</p>}</div><div className="flex gap-2">{request.status === 'approved' && <Button size="sm" disabled={busy} onClick={() => void changeRequest(request, 'accept')}>Accept terms</Button>}{['pending', 'approved', 'accepted'].includes(request.status) && <Button size="sm" variant="outline" disabled={busy} onClick={() => void changeRequest(request, 'cancel')}>Cancel</Button>}</div></div>)}{!requests.length && <p className="rounded-xl border border-slate-200 py-6 text-center text-sm text-slate-500">No requests yet.</p>}</div></div>
    {Boolean(summary?.repayments.length) && <div><h3 className="mb-2 font-semibold text-slate-900">Repayments</h3><div className="space-y-1 text-sm text-slate-600">{summary?.repayments.map(item => <p key={item.payrollId} className="flex justify-between border-b border-slate-100 py-1"><span>Payroll {payrollPeriodRange(item.periodStart)}</span><strong className="text-slate-900">{money(item.amount)}</strong></p>)}</div></div>}
    {error && !receivedThisPeriod && <p role="alert" className="rounded-lg bg-rose-50 p-2 text-sm text-rose-700">{error}</p>}
  </div></section>
}
