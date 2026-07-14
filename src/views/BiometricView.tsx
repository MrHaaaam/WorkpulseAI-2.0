import { useState } from "react";
import { Fingerprint, ScanLine, Check, Plus, Shield, Activity, Usb, Wifi } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { employees } from "../lib/data";

export function BiometricView() {
  const [enrolling, setEnrolling] = useState(false);
  const enrolledCount = employees.filter((e) => e.biometricStatus === "enrolled").length;
  const pendingCount = employees.filter((e) => e.biometricStatus === "pending").length;
  const noneCount = employees.filter((e) => e.biometricStatus === "none").length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Biometric Hub & Terminal Setup</h2>
        <p className="text-sm text-slate-500">Fingerprint terminal management and biometric key enrollment</p>
      </div>

      {/* Terminal Status Banner */}
      <Card className="border-emerald-200 bg-gradient-to-r from-emerald-50 to-green-50">
        <CardContent className="flex items-center gap-4 p-5">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 shadow-lg shadow-emerald-600/30">
            <Fingerprint className="h-7 w-7 text-white" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-slate-900">Fingerprint Terminal Integrated & Configured</h3>
              <Badge variant="success">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Active
              </Badge>
            </div>
            <p className="text-sm text-slate-600">Biometric scanning is the primary authentication protocol for all clock-ins</p>
          </div>
          <div className="hidden gap-6 sm:flex">
            <div className="text-center">
              <p className="text-2xl font-bold text-emerald-700">{enrolledCount}</p>
              <p className="text-xs text-slate-500">Enrolled</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-amber-600">{pendingCount}</p>
              <p className="text-xs text-slate-500">Pending</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-slate-400">{noneCount}</p>
              <p className="text-xs text-slate-500">Unenrolled</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Terminal Info + Enroll Action */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Terminal Details */}
        <Card>
          <CardHeader>
            <CardTitle>Terminal Configuration</CardTitle>
            <CardDescription>Connected fingerprint scanner device details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <ConfigRow icon={Usb} label="Device Model" value="ZKTeco F22" />
              <ConfigRow icon={Wifi} label="Connection" value="TCP/IP · 192.168.1.201" />
              <ConfigRow icon={Activity} label="Firmware Version" value="v3.2.1 (Latest)" />
              <ConfigRow icon={Shield} label="Security Protocol" value="AES-256 Encrypted" />
              <ConfigRow icon={ScanLine} label="Scan Mode" value="Fingerprint + RFID" />
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-[#8642ED]/10 p-3">
              <Check className="h-4 w-4 text-[#8642ED]" />
              <span className="text-sm text-[#8642ED]">Last sync: 2 minutes ago — all systems operational</span>
            </div>
          </CardContent>
        </Card>

        {/* Enroll New Finger Key */}
        <Card>
          <CardHeader>
            <CardTitle>Enroll New Biometric Key</CardTitle>
            <CardDescription>Register a new employee fingerprint</CardDescription>
          </CardHeader>
          <CardContent>
            {!enrolling ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#8642ED]/10">
                  <Fingerprint className="h-10 w-10 text-[#8642ED]" />
                </div>
                <p className="mt-4 text-sm text-slate-500">
                  Start the enrollment process to register a new fingerprint key on the terminal.
                </p>
                <Button className="mt-5" onClick={() => setEnrolling(true)}>
                  <Plus className="h-4 w-4" />
                  Begin Enrollment
                </Button>
              </div>
            ) : (
              <EnrollmentFlow onComplete={() => setEnrolling(false)} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Authentication Protocol Info */}
      <Card>
        <CardHeader>
          <CardTitle>Authentication Protocol</CardTitle>
          <CardDescription>How biometric authentication works in WorkPULSE AI</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <ProtocolStep
              step="1"
              title="Fingerprint Scan"
              description="Employee places finger on the terminal scanner at clock-in."
              icon={ScanLine}
            />
            <ProtocolStep
              step="2"
              title="Template Matching"
              description="Terminal matches the scan against enrolled biometric templates."
              icon={Fingerprint}
            />
            <ProtocolStep
              step="3"
              title="Attendance Log"
              description="Verified clock-in is logged with timestamp and synced instantly."
              icon={Check}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ConfigRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-100 px-4 py-3">
      <div className="flex items-center gap-3">
        <Icon className="h-4 w-4 text-slate-400" />
        <span className="text-sm text-slate-600">{label}</span>
      </div>
      <span className="text-sm font-medium text-slate-900">{value}</span>
    </div>
  );
}

function ProtocolStep({ step, title, description, icon: Icon }: { step: string; title: string; description: string; icon: React.ElementType }) {
  return (
    <div className="relative rounded-xl border border-slate-200 p-5">
      <div className="absolute -top-3 left-5 flex h-6 w-6 items-center justify-center rounded-full bg-[#8642ED] text-xs font-bold text-white">
        {step}
      </div>
      <Icon className="h-8 w-8 text-[#8642ED]" />
      <h4 className="mt-3 font-semibold text-slate-900">{title}</h4>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
  );
}

function EnrollmentFlow({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const steps = [
    "Select employee to enroll",
    "Place finger on scanner (1 of 3)",
    "Lift and place again (2 of 3)",
    "Final scan (3 of 3)",
    "Enrollment complete",
  ];

  return (
    <div className="space-y-5">
      {/* Progress */}
      <div className="flex items-center gap-2">
        {steps.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i <= step ? "bg-[#8642ED]" : "bg-slate-200"
            }`}
          />
        ))}
      </div>

      <div className="flex flex-col items-center py-6 text-center">
        <div className={`flex h-20 w-20 items-center justify-center rounded-full ${step === steps.length - 1 ? "bg-emerald-50" : "bg-[#8642ED]/10"} animate-pulse-ring`}>
          {step === steps.length - 1 ? (
            <Check className="h-10 w-10 text-emerald-600" />
          ) : (
            <Fingerprint className="h-10 w-10 text-[#8642ED]" />
          )}
        </div>
        <p className="mt-4 font-medium text-slate-900">{steps[step]}</p>
        <p className="mt-1 text-sm text-slate-500">
          {step === 0
            ? "Choose an employee from the directory to link the fingerprint."
            : step === steps.length - 1
            ? "The biometric key has been registered successfully."
            : "Keep the finger steady on the scanner surface."}
        </p>
      </div>

      <div className="flex gap-3">
        {step < steps.length - 1 ? (
          <Button className="flex-1" onClick={() => setStep((s) => s + 1)}>
            {step === 0 ? "Select & Continue" : "Confirm Scan"}
          </Button>
        ) : (
          <Button className="flex-1" variant="success" onClick={onComplete}>
            <Check className="h-4 w-4" />
            Done
          </Button>
        )}
        <Button variant="outline" onClick={onComplete}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
