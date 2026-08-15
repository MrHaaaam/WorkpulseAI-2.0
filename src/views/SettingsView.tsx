import { useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, Clock, Info, Save } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/Card";
import { Input, Label } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { useToast } from "../components/ui/Toast";
import { apiFetch } from "../lib/api";

type Settings = {
  shift: { enabled: boolean; startTime: string; maxHours: number; workDays: number };
  leave: { monthlyCredits: number };
};

const defaults: Settings = {
  shift: { enabled: false, startTime: "09:00", maxHours: 8, workDays: 5 },
  leave: { monthlyCredits: 10 },
};

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (enabled: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={enabled ? "Turn off automatic clock-out" : "Turn on automatic clock-out"}
      onClick={() => onChange(!enabled)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition ${enabled ? "bg-[#8642ED]" : "bg-slate-300"}`}
    >
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${enabled ? "left-6" : "left-1"}`} />
    </button>
  );
}

export function SettingsView() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<Settings>(defaults);
  const [saving, setSaving] = useState(false);

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
              <Toggle enabled={settings.shift.enabled} onChange={(enabled) => setShift({ enabled })} />
            </div>
          </CardHeader>
          <CardContent className="space-y-5 pt-5">
            <div className={`rounded-xl border px-4 py-3 text-sm ${settings.shift.enabled ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="h-4 w-4" />
                {settings.shift.enabled ? "Automatic clock-out is active" : "Automatic clock-out is off"}
              </div>
              <p className="mt-1 text-xs opacity-80">When active, an open session closes after the maximum paid hours below.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Work starts at</Label>
                <Input disabled={!settings.shift.enabled} type="time" value={settings.shift.startTime} onChange={(event) => setShift({ startTime: event.target.value })} />
                <p className="text-xs text-slate-500">The company’s usual starting time.</p>
              </div>
              <div className="space-y-2">
                <Label>Maximum hours per day</Label>
                <Input disabled={!settings.shift.enabled} className="no-number-arrows" type="number" min="1" max="24" step="0.5" value={settings.shift.maxHours || ""} onChange={(event) => setShift({ maxHours: Number(event.target.value) })} />
                <p className="text-xs text-slate-500">Default: 8 hours.</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Work days each week</Label>
              <div className="grid grid-cols-3 gap-2">
                {[5, 6, 7].map((days) => (
                  <button key={days} type="button" disabled={!settings.shift.enabled} onClick={() => setShift({ workDays: days })} className={`rounded-xl border px-3 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${settings.shift.workDays === days ? "border-violet-400 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-600 hover:border-violet-200"}`}>
                    {days} days
                  </button>
                ))}
              </div>
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
