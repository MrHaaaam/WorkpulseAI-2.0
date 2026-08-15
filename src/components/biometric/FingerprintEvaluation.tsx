/// <reference types="@digitalpersona/websdk" />
/// <reference types="@digitalpersona/fingerprint" />

import { useEffect, useRef, useState } from "react";
import { Fingerprint as FingerprintIcon, LoaderCircle } from "lucide-react";
import { apiFetch } from "../../lib/api";
import { readCapturedFingerprintSample, selectPreferredFingerprintDevice } from "../../lib/fingerprintDevices";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";

type Classification = "TA" | "TR" | "FA" | "FR";
type Trial = { id: string; classification: Classification; expectedType: "genuine" | "impostor"; expectedEmployeeName: string | null; actualEmployeeName: string | null; accepted: boolean; responseTimeMs: number };
export type EvaluationSummary = { counts: Record<Classification, number>; totalTrials: number; accuracy: number | null; far: number | null; frr: number | null; averageResponseTimeMs: number; genuineTrialCount: number; impostorTrialCount: number; wrongIdentificationCount: number; minimumRecommendedTrials: number; recentTrials: Trial[] };

export function FingerprintEvaluation({ data, onTrialSaved }: { data: EvaluationSummary; onTrialSaved: () => void }) {
  const apiRef = useRef<Fingerprint.WebApi | null>(null);
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [expectedType, setExpectedType] = useState<"genuine" | "impostor">("genuine");
  const [employeeId, setEmployeeId] = useState("");
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState("Choose the expected result, then start one test scan.");
  const [lastClass, setLastClass] = useState<Classification | null>(null);

  useEffect(() => {
    void apiFetch("/api/employees").then(async (response) => {
      if (!response.ok) return;
      const records = await response.json() as { id: string; name: string; biometricStatus?: string }[];
      const enrolled = records.filter((employee) => employee.biometricStatus === "enrolled");
      setEmployees(enrolled);
      if (enrolled[0]) setEmployeeId(enrolled[0].id);
    }).catch(() => undefined);
    return () => { if (apiRef.current) { void apiRef.current.stopAcquisition().catch(() => undefined); apiRef.current.off(); } };
  }, []);

  const startTest = async () => {
    if (expectedType === "genuine" && !employeeId) return setMessage("Choose an enrolled employee first.");
    setScanning(true); setLastClass(null); setMessage("Connecting to the reader…");
    try {
      const api = new Fingerprint.WebApi();
      apiRef.current = api;
      const device = await api.enumerateDevices().then((devices) => selectPreferredFingerprintDevice(api, devices));
      if (!device) throw new Error("No supported fingerprint reader was found.");
      api.onQualityReported = (event) => { if (event.deviceUid === device.uid) setMessage(event.quality === 0 ? "Good scan—checking the result…" : "Adjust your finger and keep it flat."); };
      api.onSamplesAcquired = async (event) => {
        if (event.deviceUid !== device.uid) return;
        try {
          await api.stopAcquisition(event.deviceUid);
          const sample = readCapturedFingerprintSample(event.samples);
          setMessage("Comparing the fingerprint…");
          const response = await apiFetch("/api/biometric-evaluation-trials", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedType, expectedEmployeeId: expectedType === "genuine" ? employeeId : null, fingerprintSamples: [sample], deviceUid: device.uid }) });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Evaluation could not be recorded.");
          setLastClass(result.classification); setMessage(`Trial saved as ${result.classification}.`); onTrialSaved();
        } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Evaluation could not be recorded."); }
        finally { setScanning(false); api.off(); apiRef.current = null; }
      };
      api.onErrorOccurred = () => { setScanning(false); setMessage("The reader could not capture the fingerprint. Try again."); api.off(); apiRef.current = null; };
      setMessage(`Reader ready—place the ${expectedType === "genuine" ? "selected employee's enrolled" : "non-enrolled"} finger flat.`);
      await api.startAcquisition(Fingerprint.SampleFormat.Raw, device.uid);
    } catch (reason) { setScanning(false); setMessage(reason instanceof Error ? reason.message : "Cannot connect to the reader."); apiRef.current?.off(); apiRef.current = null; }
  };

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="border-b border-slate-200 bg-slate-50/80 px-5 py-4"><p className="text-xs font-semibold uppercase tracking-[.16em] text-violet-700">Measured evaluation</p><h3 className="mt-1 font-bold text-slate-900">TA, TR, FA and FR results</h3><p className="mt-1 text-xs text-slate-500">Only controlled test scans recorded here are included.</p></div>
    <div className="space-y-5 p-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Count code="TA" label="Correctly accepted" value={data.counts.TA} color="emerald" /><Count code="TR" label="Correctly rejected" value={data.counts.TR} color="sky" /><Count code="FA" label="Wrongly accepted" value={data.counts.FA} color="red" /><Count code="FR" label="Wrongly rejected" value={data.counts.FR} color="amber" /></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Metric label="Overall accuracy" value={data.accuracy == null ? "Not enough tests" : `${data.accuracy}%`} /><Metric label="False acceptance rate" value={data.far == null ? "Need impostor tests" : `${data.far}%`} /><Metric label="False rejection rate" value={data.frr == null ? "Need employee tests" : `${data.frr}%`} /><Metric label="Average response" value={data.totalTrials ? `${(data.averageResponseTimeMs / 1000).toFixed(2)} seconds` : "No tests yet"} /></div>
      {(data.totalTrials < data.minimumRecommendedTrials || data.impostorTrialCount === 0) && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900"><strong>Preliminary result only.</strong> You have {data.totalTrials} controlled trials: {data.genuineTrialCount} employee tests and {data.impostorTrialCount} non-enrolled-finger tests. Run at least {data.minimumRecommendedTrials} balanced trials before interpreting the percentages. {data.wrongIdentificationCount > 0 && `${data.wrongIdentificationCount} wrong-employee match must also be investigated.`}</div>}
      <div className="rounded-2xl border border-violet-200 bg-violet-50/50 p-4"><div className="grid gap-3 md:grid-cols-[180px_1fr_auto]"><Select label="Expected result" value={expectedType} disabled={scanning} onChange={(value) => setExpectedType(value as "genuine" | "impostor")} options={[['genuine','Enrolled employee'],['impostor','Non-enrolled finger']]} />{expectedType === "genuine" ? <Select label="Employee expected to match" value={employeeId} disabled={scanning} onChange={setEmployeeId} options={employees.map((employee) => [employee.id, `${employee.name} (${employee.id})`])} /> : <div><p className="text-xs font-semibold text-slate-700">Expected scanner result</p><div className="mt-1.5 flex h-10 items-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600">No match</div></div>}<Button className="self-end" disabled={scanning || (expectedType === "genuine" && !employeeId)} onClick={() => void startTest()}>{scanning ? <LoaderCircle className="animate-spin" size={16} /> : <FingerprintIcon size={16} />}{scanning ? "Scanning…" : "Start test scan"}</Button></div><div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-xs text-slate-600"><span>{message}</span>{lastClass && <ClassBadge value={lastClass} />}</div>{expectedType === "impostor" && <p className="mt-3 text-xs text-amber-800"><strong>Important:</strong> use a person or finger that is not enrolled. A match to anyone counts as False Acceptance.</p>}</div>
      {data.recentTrials.length > 0 && <div className="overflow-hidden rounded-xl border border-slate-200"><p className="bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Recent controlled trials</p>{data.recentTrials.slice(0, 8).map((trial) => <div key={trial.id} className="flex items-center justify-between gap-4 border-t border-slate-100 px-4 py-3"><div><p className="text-sm font-semibold text-slate-800">{trial.expectedType === "genuine" ? `Expected ${trial.expectedEmployeeName || "employee"}` : "Expected no match"}</p><p className="text-xs text-slate-400">Actual: {trial.accepted ? trial.actualEmployeeName || "Matched employee" : "No match"} · {(trial.responseTimeMs / 1000).toFixed(2)}s</p></div><ClassBadge value={trial.classification} /></div>)}</div>}
    </div>
  </section>;
}

function Count({ code, label, value, color }: { code: string; label: string; value: number; color: string }) { const styles: Record<string,string> = { emerald: "border-emerald-200 bg-emerald-50 text-emerald-700", sky: "border-sky-200 bg-sky-50 text-sky-700", red: "border-red-200 bg-red-50 text-red-700", amber: "border-amber-200 bg-amber-50 text-amber-700" }; return <div className={`rounded-xl border p-4 ${styles[color]}`}><p className="text-xs font-bold">{code}</p><p className="mt-1 text-2xl font-bold">{value}</p><p className="text-[11px] opacity-75">{label}</p></div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-slate-200 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 text-sm font-bold text-slate-900">{value}</p></div>; }
function Select({ label, value, disabled, onChange, options }: { label: string; value: string; disabled: boolean; onChange: (value: string) => void; options: string[][] }) { return <label className="text-xs font-semibold text-slate-700">{label}<select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-violet-300">{options.map(([key,text]) => <option key={key} value={key}>{text}</option>)}</select></label>; }
function ClassBadge({ value }: { value: Classification }) { return <Badge variant={value === "TA" ? "success" : value === "TR" ? "info" : value === "FA" ? "danger" : "warning"}>{value}</Badge>; }
