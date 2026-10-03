export function payrollPeriodRange(start: string) {
  const match = /^(20\d{2})-(0[1-9]|1[0-2])-(01|16)$/.exec(start)
  if (!match) return start
  const year = Number(match[1])
  const month = Number(match[2])
  const first = Number(match[3])
  const last = first === 1 ? 15 : new Date(year, month, 0).getDate()
  const monthName = new Intl.DateTimeFormat('en-PH', { month: 'short' }).format(new Date(year, month - 1, 1))
  return `${monthName} ${first}–${last}, ${year}`
}

export function quarterRange(quarter: string) {
  const match = /^(20\d{2})-Q([1-4])$/.exec(quarter)
  if (!match) return quarter
  const year = Number(match[1])
  const firstMonth = (Number(match[2]) - 1) * 3
  const month = new Intl.DateTimeFormat('en-PH', { month: 'short' })
  return `${month.format(new Date(year, firstMonth, 1))}–${month.format(new Date(year, firstMonth + 2, 1))} ${year}`
}

export function nextPayrollPeriod(start: string) {
  const [year, month, day] = start.split('-').map(Number)
  if (day === 1) return `${year}-${String(month).padStart(2, '0')}-16`
  const next = new Date(year, month, 1)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`
}

export function payrollPeriodForDate(date: string) {
  return `${date.slice(0, 7)}-${Number(date.slice(8, 10)) <= 15 ? '01' : '16'}`
}

export function currentPayrollPeriod() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).filter(part => part.type !== 'literal').map(part => [part.type, part.value]))
  return payrollPeriodForDate(`${parts.year}-${parts.month}-${parts.day}`)
}
