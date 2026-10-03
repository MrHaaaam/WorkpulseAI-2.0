import { useMemo, useState } from 'react'
import { CalendarDays, Search } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { PaginationControls } from '../components/ui/Pagination'
import { usePagination } from '../hooks/usePagination'
import { paidAdditionEntries } from '../../shared/paid-additions.js'
import type { Employee } from '../lib/data'
import type { PayrollRequest } from './PayrollView'

const money = (value: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value)
const paidDate = (value: string) => new Date(value).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Manila' })
function periodLabel(start?: string) {
  if (!start || !/^\d{4}-\d{2}-(01|16)$/.test(start)) return 'Older payroll'
  const year = Number(start.slice(0, 4))
  const month = Number(start.slice(5, 7))
  const first = start.endsWith('-01')
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const monthName = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-PH', { month: 'short', timeZone: 'UTC' })
  return `${monthName} ${first ? '1–15' : `16–${lastDay}`}, ${year}`
}

export function QuarterlyAllowanceHistory({ payroll, employees }: { payroll: PayrollRequest[]; employees: Employee[] }) {
  const [search, setSearch] = useState('')
  const [month, setMonth] = useState('')
  const [half, setHalf] = useState('all')
  const entries = useMemo(() => paidAdditionEntries(payroll, employees), [payroll, employees])
  const query = search.trim().toLowerCase()
  const shown = entries.filter(entry => `${entry.employeeName} ${entry.employeeId} ${entry.allowances.map(item => item.label).join(' ')}`.toLowerCase().includes(query) && (!month || entry.periodStart?.startsWith(month)) && (half === 'all' || entry.periodStart?.endsWith(half)))
  const page = usePagination(shown, `${search}|${month}|${half}`, 8)

  return <Card className="overflow-hidden" aria-label="Salary additions paid">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-violet-50/60 px-5 py-4">
      <div className="flex items-center gap-3"><span className="rounded-xl bg-violet-100 p-2 text-violet-700"><CalendarDays size={20}/></span><div><h2 className="font-bold text-slate-900">Salary additions paid</h2><p className="text-sm text-slate-500">Extra pay included in completed payroll, including amounts carried from an earlier period.</p></div></div>
      <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto"><div className="relative min-w-44 flex-1 xl:w-52 xl:flex-none"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><Input aria-label="Search paid additions" placeholder="Search employee" value={search} onChange={event => setSearch(event.target.value)} className="w-full pl-9"/></div><Input type="month" aria-label="Filter payroll month" value={month} onChange={event => { setMonth(event.target.value); setHalf('all') }} className="w-40"/><select aria-label="Filter half-month payroll period" value={half} disabled={!month} onChange={event => setHalf(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 disabled:opacity-50"><option value="all">Both periods</option><option value="-01">1–15</option><option value="-16">16–end</option></select>{month && <button type="button" onClick={() => { setMonth(''); setHalf('all') }} className="text-xs font-semibold text-violet-700 hover:underline">All periods</button>}</div>
    </div>
    <div className="p-4 sm:p-5">
      <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto_auto] gap-4 border-b border-slate-200 px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid"><span>Employee / payroll period</span><span>Addition paid</span><span>Total</span><span>Marked paid</span></div>
      <div className="space-y-2 pt-2">{page.pageItems.map(entry => <div key={entry.id} className="grid gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto_auto] md:items-center md:gap-4">
        <div className="min-w-0"><p className="font-semibold text-slate-900">{entry.employeeName}</p><p className="text-xs text-slate-500">{periodLabel(entry.periodStart)}</p></div>
        <div className="min-w-0 space-y-1">{entry.allowances.map(item => <p key={item.label} className="text-sm text-slate-700">{item.label}: <span className="font-semibold text-violet-700">{money(item.value)}</span></p>)}</div>
        <p className="text-sm font-bold text-slate-900"><span className="mr-2 font-normal text-slate-500 md:hidden">Total</span>{money(entry.total)}</p>
        <p className="whitespace-nowrap text-sm text-slate-600"><span className="mr-2 text-slate-500 md:hidden">Marked paid</span>{paidDate(entry.paidAt)}</p>
      </div>)}{!shown.length && <p className="rounded-xl border border-slate-200 py-8 text-center text-sm text-slate-500">{query || month ? 'No paid additions match this search or period.' : 'No salary additions have been marked paid yet.'}</p>}</div>
      <PaginationControls {...page} onPageChange={page.setPage}/>
    </div>
  </Card>
}
