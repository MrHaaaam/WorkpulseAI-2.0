import { nextPayrollPeriod } from './payrollPeriod'

type Advance = { startPeriod?: string }
type Payroll = { periodStart?: string; status: string; advanceDeduction?: number; rolledInto?: string }

const manilaPeriod = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).filter(part => part.type !== 'literal').map(part => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${Number(parts.day) <= 15 ? '01' : '16'}`
}

export function nextCashAdvanceRepayment(balance: number, advances: Advance[], payroll: Payroll[]) {
  if (balance <= 0 || !advances.length) return null
  const planned = payroll.filter(row => row.periodStart && !row.rolledInto && !['paid', 'approved', 'carried_over'].includes(row.status) && Number(row.advanceDeduction) > 0).sort((a, b) => String(a.periodStart).localeCompare(String(b.periodStart)))[0]
  if (planned?.periodStart) return { periodStart: planned.periodStart, amount: Number(planned.advanceDeduction), calculated: true }
  const firstStart = advances.map(row => row.startPeriod).filter((period): period is string => Boolean(period)).sort()[0]
  if (!firstStart) return null
  let periodStart = firstStart > manilaPeriod() ? firstStart : manilaPeriod()
  while (payroll.some(row => row.periodStart === periodStart && ['paid', 'approved'].includes(row.status))) periodStart = nextPayrollPeriod(periodStart)
  return { periodStart, amount: Math.min(200, balance), calculated: false }
}
