import { useState } from "react";
import { Clock, CalendarDays, Save, CheckCircle } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../components/ui/Card";
import { Input, Label } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Button } from "../components/ui/Button";

export function SettingsView() {
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Company Settings</h2>
        <p className="text-sm text-slate-500">Configure system parameters, shift hours, and leave policies</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Core Shift Hours */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#8642ED]/10">
                <Clock className="h-5 w-5 text-[#8642ED]" />
              </div>
              <div>
                <CardTitle>Core Shift Hours</CardTitle>
                <CardDescription>Define standard work schedule</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Shift Start Time</Label>
                <Input type="time" defaultValue="09:00" />
              </div>
              <div className="space-y-2">
                <Label>Shift End Time</Label>
                <Input type="time" defaultValue="18:00" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Break Duration (minutes)</Label>
                <Input type="number" defaultValue={60} />
              </div>
              <div className="space-y-2">
                <Label>Work Days Per Week</Label>
                <Select defaultValue="5">
                  <option value="5">5 days (Mon–Fri)</option>
                  <option value="6">6 days (Mon–Sat)</option>
                  <option value="7">7 days</option>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Grace Period & Lateness */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <CardTitle>Grace Period & Lateness</CardTitle>
                <CardDescription>Set tolerance for late clock-ins</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Grace Period (minutes after shift start)</Label>
              <Input type="number" defaultValue={15} />
              <p className="text-xs text-slate-400">Clock-ins within this window are not flagged as late.</p>
            </div>
            <div className="space-y-2">
              <Label>Late Threshold (minutes)</Label>
              <Input type="number" defaultValue={30} />
              <p className="text-xs text-slate-400">Beyond this threshold, a lateness penalty is applied.</p>
            </div>
            <div className="space-y-2">
              <Label>Lateness Penalty Rate (% of daily rate)</Label>
              <Input type="number" defaultValue={1} step={0.5} />
            </div>
          </CardContent>
        </Card>

        {/* Leave Accrual Rules */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
                <CalendarDays className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <CardTitle>Leave Accrual Rules</CardTitle>
                <CardDescription>Annual leave credit allocation</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Casual Leave (days/year)</Label>
                <Input type="number" defaultValue={10} />
              </div>
              <div className="space-y-2">
                <Label>Sick Leave (days/year)</Label>
                <Input type="number" defaultValue={10} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Accrual Frequency</Label>
              <Select defaultValue="monthly">
                <option value="monthly">Monthly (pro-rated)</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual (upfront)</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Carry-over Limit (days)</Label>
              <Input type="number" defaultValue={5} />
              <p className="text-xs text-slate-400">Maximum unused leave days carried to the next year.</p>
            </div>
          </CardContent>
        </Card>

        {/* Payroll Preferences */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50">
                <CalendarDays className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <CardTitle>Payroll Preferences</CardTitle>
                <CardDescription>Pay cycle and computation settings</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Pay Cycle</Label>
              <Select defaultValue="semi-monthly">
                <option value="semi-monthly">Semi-monthly (1st & 15th)</option>
                <option value="monthly">Monthly</option>
                <option value="bi-weekly">Bi-weekly</option>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>SSS Rate (%)</Label>
                <Input type="number" defaultValue={4.5} step={0.1} />
              </div>
              <div className="space-y-2">
                <Label>PhilHealth Rate (%)</Label>
                <Input type="number" defaultValue={3} step={0.1} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Pag-IBIG Rate (%)</Label>
                <Input type="number" defaultValue={2} step={0.1} />
              </div>
              <div className="space-y-2">
                <Label>Tax Rate (%)</Label>
                <Input type="number" defaultValue={15} step={0.5} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Save Bar */}
      <div className="flex items-center justify-end gap-3">
        {saved && (
          <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600 animate-fade-in">
            <CheckCircle className="h-4 w-4" />
            Settings saved successfully
          </span>
        )}
        <Button variant="outline">Reset to Defaults</Button>
        <Button onClick={handleSave}>
          <Save className="h-4 w-4" />
          Save Changes
        </Button>
      </div>
    </div>
  );
}
