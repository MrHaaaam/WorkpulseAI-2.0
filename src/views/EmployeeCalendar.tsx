import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from 'lucide-react'
import { apiFetch } from '../lib/api'

type Attendance = { date: string; status: string; checkIn?: string; checkOut?: string; sessions?: { checkIn: string; checkOut?: string | null }[] }
type Leave = { id: string; leaveType: string; status: string; startDate: string; endDate: string; requestedDates?: string[]; approvedDates?: string[] }
type Schedule = { workWeekdays: number[]; scheduleOverrides: { date: string; working: boolean; kind?: string }[]; startTime?: string; workStopTime?: string }
type CalendarData = { month: string; employees?: { id: string; name: string }[]; attendance: Attendance[]; idleDates: string[]; leaveRequests: Leave[]; workSchedule: Schedule }
type Day = { date: string; schedule: 'Workday' | 'Rest day' | 'Holiday'; idle: boolean; leave: Leave[]; attendance?: Attendance }

const dateLabel = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-PH', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
const monthLabel = (month: string) => new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-PH', { timeZone: 'UTC', month: 'long', year: 'numeric' })
const todayManila = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}
const moveMonth = (month: string, offset: number) => {
  const [year, number] = month.split('-').map(Number)
  const next = new Date(Date.UTC(year, number - 1 + offset, 1))
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`
}

function coversDate(leave: Leave, date: string) {
  const dates = leave.status === 'approved' ? leave.approvedDates : leave.requestedDates
  return Array.isArray(dates) && dates.length ? dates.includes(date) : leave.startDate <= date && date <= leave.endDate
}

function buildDays(data: CalendarData): Day[] {
  const [year, month] = data.month.split('-').map(Number)
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const overrides = new Map(data.workSchedule.scheduleOverrides.map((item) => [item.date, item]))
  const attendance = new Map(data.attendance.map((item) => [item.date, item]))
  const idle = new Set(data.idleDates)
  return Array.from({ length: count }, (_, index) => {
    const date = `${data.month}-${String(index + 1).padStart(2, '0')}`
    const override = overrides.get(date)
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
    const working = override?.working ?? data.workSchedule.workWeekdays.includes(weekday)
    const schedule = override?.kind === 'holiday' ? 'Holiday' : working ? 'Workday' : 'Rest day'
    return { date, schedule, idle: idle.has(date), leave: data.leaveRequests.filter((item) => coversDate(item, date)), attendance: attendance.get(date) }
  })
}

function dayTags(day: Day) {
  const tags: { label: string; tone: string }[] = [{ label: day.schedule, tone: day.schedule === 'Holiday' ? 'rose' : day.schedule === 'Rest day' ? 'slate' : 'emerald' }]
  if (day.idle) tags.push({ label: 'Idle day', tone: 'amber' })
  for (const leave of day.leave) tags.push({ label: `${leave.status === 'approved' ? 'Approved' : leave.status === 'passed' ? 'Passed' : 'Pending'} ${leave.leaveType}`, tone: leave.status === 'approved' ? 'violet' : leave.status === 'passed' ? 'slate' : 'amber' })
  if (day.attendance) tags.push({ label: day.attendance.status, tone: day.attendance.status === 'Absent' ? 'rose' : day.attendance.status === 'Present' ? 'emerald' : 'blue' })
  return tags
}

const tagStyles: Record<string, string> = {
  slate: 'bg-slate-100 text-slate-600', emerald: 'bg-emerald-50 text-emerald-800', rose: 'bg-rose-50 text-rose-800',
  amber: 'bg-amber-50 text-amber-800', violet: 'bg-violet-50 text-violet-800', blue: 'bg-blue-50 text-blue-800',
}

export function EmployeeCalendar({ refreshKey = 0, admin = false }: { refreshKey?: number; admin?: boolean }) {
  const today = todayManila()
  const [month, setMonth] = useState(today.slice(0, 7))
  const [selected, setSelected] = useState(today)
  const [data, setData] = useState<CalendarData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [employeeSearch, setEmployeeSearch] = useState('')
  const matches = data?.employees?.filter((employee) => employee.name.toLowerCase().includes(employeeSearch.trim().toLowerCase())) ?? []
  const employeeId = admin && employeeSearch.trim() ? matches[0]?.id ?? '' : ''

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true)
    setError('')
    try {
      const response = await apiFetch(admin ? `/api/admin/calendar?month=${month}&employeeId=${encodeURIComponent(employeeId)}` : `/api/employee/me/calendar?month=${month}`, { signal })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to load calendar')
      if (!signal.aborted) setData(result)
    } catch (reason) {
      if (!signal.aborted) setError(reason instanceof Error ? reason.message : 'Unable to load calendar')
    } finally { if (!signal.aborted) setLoading(false) }
  }, [month, employeeId, admin])

  useEffect(() => {
    const controller = new AbortController()
    queueMicrotask(() => { if (!controller.signal.aborted) void load(controller.signal) })
    return () => controller.abort()
  }, [load, refreshKey])

  const days = useMemo(() => data?.month === month ? buildDays(data) : [], [data, month])
  const selectedDay = days.find((day) => day.date === selected) ?? days[0]
  const leading = days.length ? new Date(`${days[0].date}T12:00:00Z`).getUTCDay() : 0
  const summary = {
    workdays: days.filter((day) => day.schedule === 'Workday' && !day.idle && !day.leave.some((leave) => leave.status === 'approved')).length,
    rest: days.filter((day) => day.schedule === 'Rest day').length,
    holidays: days.filter((day) => day.schedule === 'Holiday').length,
    idle: days.filter((day) => day.idle).length,
    leave: days.filter((day) => day.leave.some((leave) => leave.status === 'approved')).length,
  }

  function changeMonth(offset: number) {
    const next = moveMonth(month, offset)
    setMonth(next)
    setSelected(`${next}-01`)
  }

  return <div className="space-y-5">
    {admin && <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><label htmlFor="calendar-employee-search" className="block text-sm font-semibold text-slate-700">Find employee</label><input id="calendar-employee-search" type="search" value={employeeSearch} onChange={(event) => setEmployeeSearch(event.target.value)} placeholder="Search by name" className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100" /><p className="mt-2 text-xs text-slate-500">{employeeSearch.trim() ? matches.length ? `Showing ${matches[0].name}${matches.length > 1 ? `, first of ${matches.length} matches` : ''}` : 'No employees match your search.' : 'Showing company schedule. Type a name to open an employee calendar.'}</p></div>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {([['Scheduled work', summary.workdays], ['Rest days', summary.rest], ['Holidays', summary.holidays], ['Idle days', summary.idle], ['Approved leave', summary.leave]] as const).map(([label, value]) =>
        <div key={label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm"><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{loading ? '—' : value}</p></div>)}
    </div>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6">
          <div><p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Monthly schedule</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">{monthLabel(month)}</h2></div>
          <div className="flex items-center gap-1"><button type="button" onClick={() => changeMonth(-1)} aria-label="Previous month" className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-400"><ChevronLeft className="h-4 w-4" /></button><button type="button" onClick={() => { setMonth(today.slice(0, 7)); setSelected(today) }} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Today</button><button type="button" onClick={() => changeMonth(1)} aria-label="Next month" className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-400"><ChevronRight className="h-4 w-4" /></button></div>
        </div>
        {error && <div className="m-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error} <button type="button" className="ml-2 font-semibold underline" onClick={() => { const controller = new AbortController(); void load(controller.signal) }}>Retry</button></div>}
        {loading && <div className="grid min-h-72 place-items-center text-sm text-slate-500">Loading calendar…</div>}
        {!loading && !error && <div className="p-2 sm:p-4">
          <div className="grid grid-cols-7 border-b border-slate-100 pb-2 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400 sm:text-xs">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}</div>
          <div className="grid grid-cols-7 gap-1 pt-2 sm:gap-2">{Array.from({ length: leading }, (_, index) => <span key={`blank-${index}`} />)}{days.map((day) => {
            const approved = day.leave.some((leave) => leave.status === 'approved')
            const pending = day.leave.some((leave) => leave.status === 'pending')
            const passed = day.leave.some((leave) => leave.status === 'passed')
            const label = approved ? 'Leave' : day.idle ? 'Idle' : day.schedule === 'Holiday' ? 'Holiday' : pending ? 'Pending' : passed ? 'Passed' : day.schedule === 'Rest day' ? 'Rest' : day.attendance?.status || 'Work'
            const tone = approved ? 'bg-violet-100 text-violet-800' : day.idle ? 'bg-amber-100 text-amber-800' : day.schedule === 'Holiday' ? 'bg-rose-100 text-rose-800' : pending ? 'bg-amber-50 text-amber-800' : passed ? 'bg-slate-100 text-slate-700' : day.schedule === 'Rest day' ? 'bg-slate-100 text-slate-600' : day.attendance?.status === 'Absent' ? 'bg-rose-100 text-rose-800' : 'bg-emerald-50 text-emerald-800'
            return <button key={day.date} type="button" onClick={() => setSelected(day.date)} aria-label={`${dateLabel(day.date)}: ${dayTags(day).map((tag) => tag.label).join(', ')}`} aria-pressed={selected === day.date} className={`min-h-16 rounded-xl border p-1 text-left transition sm:min-h-24 sm:p-2 ${selected === day.date ? 'border-violet-500 ring-2 ring-violet-200' : 'border-slate-100 hover:border-slate-300'} ${day.date === today ? 'bg-violet-50/60' : 'bg-white'}`}><span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${day.date === today ? 'bg-violet-600 text-white' : 'text-slate-800'}`}>{Number(day.date.slice(-2))}</span><span className={`mt-1 block truncate rounded-md px-1 py-0.5 text-[9px] font-semibold sm:mt-2 sm:px-1.5 sm:text-[11px] ${tone}`}>{label}</span>{day.attendance && label !== day.attendance.status && <span className="mt-1 hidden truncate text-[10px] text-slate-500 sm:block">{day.attendance.status}</span>}</button>
          })}</div>
        </div>}
      </section>
      <aside className="self-start rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2 text-slate-400"><CalendarDays className="h-4 w-4" /><span className="text-[11px] font-semibold uppercase tracking-widest">Day details</span></div>{selectedDay && !loading ? <><h3 className="mt-3 text-lg font-semibold text-slate-900">{dateLabel(selectedDay.date)}</h3><div className="mt-4 flex flex-wrap gap-2">{dayTags(selectedDay).map((tag, index) => <span key={`${tag.label}-${index}`} className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${tagStyles[tag.tone]}`}>{tag.label}</span>)}</div>{selectedDay.schedule === 'Workday' && data?.workSchedule.startTime && <p className="mt-5 text-sm text-slate-600">Scheduled start: <strong className="text-slate-900">{data.workSchedule.startTime}</strong>{data.workSchedule.workStopTime && <> · End: <strong className="text-slate-900">{data.workSchedule.workStopTime}</strong></>}</p>}{selectedDay.attendance && <div className="mt-5 border-t border-slate-100 pt-4"><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><Clock3 className="h-4 w-4" />Time records</p>{(selectedDay.attendance.sessions?.length ? selectedDay.attendance.sessions : selectedDay.attendance.checkIn ? [{ checkIn: selectedDay.attendance.checkIn, checkOut: selectedDay.attendance.checkOut }] : []).map((session, index) => <p key={index} className="mt-2 text-sm text-slate-700">Session {index + 1}: {session.checkIn} – {session.checkOut || 'In progress'}</p>)}{!selectedDay.attendance.checkIn && !selectedDay.attendance.sessions?.length && <p className="mt-2 text-sm text-slate-500">No time entries recorded.</p>}</div>}</> : <p className="mt-3 text-sm text-slate-500">Select a date to see its details.</p>}<p className="mt-6 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">Holidays and special days reflect the company schedule set by your administrator. Pending leave is not yet approved.</p></aside>
    </div>
  </div>
}
