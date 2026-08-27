import { useEffect, useState } from "react";
import { CalendarDays, Clock, Info, Save } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/Card";
import { Input, Label } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { useToast } from "../components/ui/Toast";
import { apiFetch } from "../lib/api";

type Settings = {
  shift: { enabled: boolean; startTime: string; maxHours: number; workDays: number; workWeekdays: number[]; scheduleOverrides: { date: string; working: boolean }[] };
  leave: { monthlyCredits: number };
};

function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function upcomingDates(count: number) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    return { value: isoDate(date), day: date.toLocaleDateString("en-PH", { weekday: "short" }), date: date.toLocaleDateString("en-PH", { month: "short", day: "numeric" }) };
  });
}

const defaults: Settings = {
  shift: { enabled: true, startTime: "09:00", maxHours: 8, workDays: 5, workWeekdays: [1, 2, 3, 4, 5], scheduleOverrides: [] },
  leave: { monthlyCredits: 10 },
};

export function SettingsView() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<Settings>(defaults);
  const [saving, setSaving] = useState(false);
  const [scheduleRange, setScheduleRange] = useState<7 | 30>(7);
  const visibleScheduleDates = upcomingDates(scheduleRange);
  const specialScheduleActive = settings.shift.scheduleOverrides.length > 0;

  useEffect(() => {
    apiFetch("/api/settings")
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => setSettings({
        shift: { ...defaults.shift, ...(data.shift ?? {}) },
        leave: { ...defaults.leave, ...(data.leave ?? {}) },
      }))
      .catch(() => undefined);
  }, []);

  const setShift = (value: Partial<Settings["shift"]>) => {
    setSettings((current) => ({ ...current, shift: { ...current.shift, ...value } }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const response = await apiFetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!response.ok) throw new Error("The server could not save your settings.");
      const saved = await response.json();
      setSettings({
        shift: { ...defaults.shift, ...(saved.shift ?? {}) },
        leave: { ...defaults.leave, ...(saved.leave ?? {}) },
      });
      toast({ title: "Settings saved", description: "The company rules are now up to date.", variant: "success" });
    } catch (reason) {
      toast({ title: "Settings not saved", description: reason instanceof Error ? reason.message : "Please try again.", variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="rounded-2xl border border-violet-100 bg-gradient-to-r from-violet-50 to-white p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-600">Company rules</p>
        <h2 className="mt-1 text-2xl font-bold text-slate-900">System Settings</h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">Choose the basic attendance and leave rules used by WorkPulse. Save once when you are finished.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-slate-100 bg-slate-50/70">
            <div className="flex items-start justify-between gap-4">
              <div className="flex gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-100">
                  <Clock className="h-5 w-5 text-[#8642ED]" />
                </div>
                <div>
                  <CardTitle>Work Hour Control</CardTitle>
                  <CardDescription>Set the normal work schedule and maximum daily hours.</CardDescription>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 pt-5">
            <p className="text-sm text-slate-500">Work-hour rules apply automatically.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Work starts at</Label>
                <Input type="time" value={settings.shift.startTime} onChange={(event) => setShift({ startTime: event.target.value })} />
                <p className="text-xs text-slate-500">The company’s usual starting time.</p>
              </div>
              <div className="space-y-2">
                <Label>Maximum hours per day</Label>
                <Input className="no-number-arrows" type="number" min="1" max="24" step="0.5" value={settings.shift.maxHours || ""} onChange={(event) => setShift({ maxHours: Number(event.target.value) })} />
                <p className="text-xs text-slate-500">Default: 8 hours.</p>
              </div>
            </div>

            <div className="hidden">
              <Label>Normal work days each week</Label>
              <div className="grid grid-cols-3 gap-2">
                {[5, 6, 7].map((days) => (
                  <button key={days} type="button" disabled={specialScheduleActive} onClick={() => setShift({ workDays: days, workWeekdays: Array.from({ length: days }, (_, index) => index + 1).map((day) => day === 7 ? 0 : day) })} className={`rounded-xl border px-3 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 ${!specialScheduleActive && settings.shift.workDays === days ? "border-violet-400 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-600 hover:border-violet-200"}`}>
                    {days} days
                  </button>
                ))}
              </div>
              {specialScheduleActive && <p className="text-xs text-slate-500">Normal schedule choices are paused while special dates exist.</p>}
              {!specialScheduleActive && <div className="space-y-2 pt-1"><p className="text-xs font-semibold text-slate-700">Select exactly {settings.shift.workDays} regular workdays</p><div className="grid grid-cols-4 gap-2 sm:grid-cols-7">{[[1,"Mon"],[2,"Tue"],[3,"Wed"],[4,"Thu"],[5,"Fri"],[6,"Sat"],[0,"Sun"]].map(([day,label]) => {
                const selected = settings.shift.workWeekdays.includes(day as number);
                return <button key={day} type="button" aria-pressed={selected} onClick={() => setShift({ workWeekdays: selected ? settings.shift.workWeekdays.filter((value) => value !== day) : settings.shift.workWeekdays.length < settings.shift.workDays ? [...settings.shift.workWeekdays, day as number] : settings.shift.workWeekdays })} className={`rounded-lg border px-2 py-2 text-xs font-bold transition ${selected ? "border-violet-400 bg-violet-100 text-violet-800" : "border-slate-200 bg-white text-slate-500 hover:border-violet-300"}`}>{label}</button>;
              })}</div><p className={`text-xs ${settings.shift.workWeekdays.length === settings.shift.workDays ? "text-emerald-600" : "font-medium text-amber-600"}`}>{settings.shift.workWeekdays.length} of {settings.shift.workDays} days selected{settings.shift.workWeekdays.length === settings.shift.workDays ? "." : " — select the remaining days before saving."}</p></div>}
            </div>

            <div className="space-y-3 rounded-xl border border-violet-200 bg-violet-50/50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold text-violet-950">Work Schedule</p><p className="mt-1 text-xs text-violet-700">Select a date to switch it between Work and Off.</p></div><div className="flex rounded-lg border border-violet-200 bg-white p-1"><button type="button" onClick={() => setScheduleRange(7)} className={`rounded-md px-2.5 py-1 text-xs font-semibold ${scheduleRange === 7 ? "bg-violet-600 text-white" : "text-slate-500"}`}>7 Days</button><button type="button" onClick={() => setScheduleRange(30)} className={`rounded-md px-2.5 py-1 text-xs font-semibold ${scheduleRange === 30 ? "bg-violet-600 text-white" : "text-slate-500"}`}>30 Days</button></div></div>
              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">{visibleScheduleDates.map((item) => {
                const override = settings.shift.scheduleOverrides.find((entry) => entry.date === item.value);
                const normalWorking = settings.shift.workWeekdays.includes(new Date(`${item.value}T12:00:00`).getDay());
                const working = override?.working ?? normalWorking;
                return <button key={item.value} type="button" title={`${item.day}, ${item.date}: ${working ? "Work day" : "Off day"}`} onClick={() => setShift({ scheduleOverrides: [...settings.shift.scheduleOverrides.filter((entry) => entry.date !== item.value), { date: item.value, working: !working }].sort((a, b) => a.date.localeCompare(b.date)) })} className={`min-w-0 rounded-lg border px-1 py-1.5 text-center transition ${working ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-500"}`}><span className="block truncate text-[10px] font-bold">{item.day}</span><span className="block truncate text-[9px]">{item.date}</span><span className="mt-0.5 block text-[9px] font-bold">{working ? "Work" : "Off"}</span></button>;
              })}</div>
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[11px] text-slate-500">Green = work day. White = off day.</p>{specialScheduleActive && <Button type="button" size="sm" variant="ghost" onClick={() => setShift({ scheduleOverrides: [] })}>Clear Special Dates</Button>}</div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="border-b border-slate-100 bg-slate-50/70">
            <div className="flex gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50">
                <CalendarDays className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <CardTitle>Monthly Leave Credits</CardTitle>
                <CardDescription>The administrator decides how many leave credits are provided each month.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 pt-5">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-semibold text-emerald-900">Monthly allowance</p>
              <p className="mt-1 text-xs text-emerald-700">The initial company setting is 10 credits. You can change it below.</p>
            </div>

            <div className="space-y-2">
              <Label>Leave credits per employee, per month</Label>
              <div className="relative max-w-xs">
                <Input className="no-number-arrows pr-20 text-lg font-semibold" type="number" min="0" max="31" step="1" value={settings.leave.monthlyCredits} onChange={(event) => setSettings((current) => ({ ...current, leave: { monthlyCredits: Number(event.target.value) } }))} />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">credits</span>
              </div>
            </div>

            <div className="flex gap-2 rounded-xl bg-sky-50 p-4 text-xs leading-5 text-sky-800">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <p>This is a monthly company allowance. Change the number whenever management updates the leave policy.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col-reverse gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">Changes only take effect after you select Save Settings.</p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setSettings(defaults)}>Reset</Button>
          <Button onClick={save} disabled={saving}><Save className="h-4 w-4" />{saving ? "Saving..." : "Save Settings"}</Button>
        </div>
      </div>
    </div>
  );
}
