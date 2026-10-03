import { useState } from 'react'
import { WalletCards } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Dialog, DialogClose, DialogHeader } from '../components/ui/Dialog'
import { Input } from '../components/ui/Input'
import { apiFetch } from '../lib/api'
import { useAdminPasswordRetry } from '../lib/adminPasswordRetry'
import type { Employee } from '../lib/data'
import { nextPayrollPeriod, payrollPeriodRange } from '../lib/payrollPeriod'

const today = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).filter(part => part.type !== 'literal').map(part => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}
const currentPeriod = () => `${today().slice(0, 7)}-${Number(today().slice(8, 10)) <= 15 ? '01' : '16'}`
function periodOptions() {
  const [year, month, day] = currentPeriod().split('-').map(Number)
  return Array.from({ length: 24 }, (_, index) => {
    const half = (day === 16 ? 1 : 0) + index
    const date = new Date(year, month - 1 + Math.floor(half / 2), 1)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${half % 2 ? '16' : '01'}`
  })
}

export function CashAdvancesDialog({ employees, onClose, onSaved }: { employees: Employee[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [employeeId, setEmployeeId] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today)
  const [startPeriod, setStartPeriod] = useState(() => nextPayrollPeriod(currentPeriod()))
  const [note, setNote] = useState('')
  const [password, setPassword] = useState('')
  const [agreementConfirmed, setAgreementConfirmed] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const passwordRetrySeconds = useAdminPasswordRetry()
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (passwordRetrySeconds > 0) return
    setSaving(true); setError('')
    try {
      const response = await apiFetch('/api/cash-advances', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employeeId, amount: Number(amount), date, startPeriod, note, password, employeeRepaymentAgreementConfirmed: agreementConfirmed }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to record cash given.')
      await onSaved(); onClose()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to record cash given.') }
    finally { setSaving(false) }
  }
  return <Dialog open className="max-w-xl" onClose={() => !saving && onClose()}>
    <DialogHeader><div className="flex items-center gap-3"><span className="rounded-xl bg-violet-100 p-2 text-violet-700"><WalletCards size={20}/></span><div><h2 className="text-xl font-bold text-slate-900">Record cash given without a request</h2><p className="text-sm text-slate-500">Use only when cash was already handed to an employee outside the portal request process. Do not record the same cash twice.</p></div></div><DialogClose onClose={onClose}/></DialogHeader>
    <form onSubmit={submit} className="space-y-4 px-6 pb-6 pt-4">
      <label className="block space-y-1 text-sm font-medium text-slate-700">Employee<select required className="input w-full" value={employeeId} onChange={event => setEmployeeId(event.target.value)}><option value="">Choose employee</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name} ({employee.id})</option>)}</select></label>
      <div className="grid gap-3 sm:grid-cols-2"><label className="block space-y-1 text-sm font-medium text-slate-700">Amount (₱)<Input required type="text" inputMode="decimal" value={amount} onChange={event => { if (/^\d{0,7}(?:\.\d{0,2})?$/.test(event.target.value)) setAmount(event.target.value) }} placeholder="0.00"/></label><label className="block space-y-1 text-sm font-medium text-slate-700">Date cash was given<Input required type="date" max={today()} value={date} onChange={event => setDate(event.target.value)}/></label></div>
      <label className="block space-y-1 text-sm font-medium text-slate-700">First repayment payroll<select className="input w-full" value={startPeriod} onChange={event => setStartPeriod(event.target.value)}>{periodOptions().map(period => <option key={period} value={period}>{payrollPeriodRange(period)}{period === currentPeriod() ? ' (current; only if unpaid)' : ''}</option>)}</select></label>
      <p className="text-xs text-slate-500">The selected range is a payroll period, not the day cash is paid.</p><label className="block space-y-1 text-sm font-medium text-slate-700">Note (optional)<Input maxLength={500} value={note} onChange={event => setNote(event.target.value)} placeholder="Why this cash was given"/></label>
      <label className="block space-y-1 text-sm font-medium text-slate-700">Admin password<Input required type="password" autoComplete="current-password" disabled={passwordRetrySeconds > 0} value={password} onChange={event => setPassword(event.target.value)}/></label>
      
      <label className="flex items-start gap-2 text-sm text-slate-600"><input type="checkbox" checked={agreementConfirmed} required onChange={event => setAgreementConfirmed(event.target.checked)} className="mt-1 accent-violet-600"/><span>I confirm the employee agreed to repay up to ₱200 from each paid payroll, starting with the period selected above.</span></label>
      <p className="rounded-xl bg-violet-50 p-3 text-sm text-violet-800">Confirming cash given creates the debt. Each paid payroll can repay up to ₱200 from earned hourly pay.</p>
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-2 text-sm text-rose-700">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={saving || passwordRetrySeconds > 0 || !employeeId || !password || !amount || !agreementConfirmed} type="submit">{saving ? 'Saving...' : 'Confirm cash given'}</Button></div>
    </form>
  </Dialog>
}
