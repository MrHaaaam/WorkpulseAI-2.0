/// <reference types="@digitalpersona/websdk" />
/// <reference types="@digitalpersona/fingerprint" />

import { useEffect, useRef, useState } from "react";
import { Fingerprint as FingerprintIcon, LoaderCircle } from "lucide-react";
import { apiFetch } from "../../lib/api";
import { readCapturedFingerprintSample, selectPreferredFingerprintDevice } from "../../lib/fingerprintDevices";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";

type Classification = "TA" | "TR" | "FA" | "FR";
type Trial = { id: string; classification: Classification | null; scanKind?: "automatic" | "controlled"; expectedType: "genuine" | "impostor" | "automatic"; expectedEmployeeName: string | null; actualEmployeeName: string | null; accepted: boolean; matchStrength: number | null; responseTimeMs: number };
export type EvaluationSummary = { counts: Record<Classification, number>; totalTrials: number; accuracy: number | null; far: number | null; frr: number | null; averageResponseTimeMs: number; genuineTrialCount: number; impostorTrialCount: number; wrongIdentificationCount: number; minimumRecommendedTrials: number; recentTrials: Trial[] };

export function FingerprintEvaluation({ data, onTrialSaved }: { data: EvaluationSummary; onTrialSaved: () => void }) {
  const apiRef = useRef<Fingerprint.WebApi | null>(null);
  const [identifying, setIdentifying] = useState(false);
  const [message, setMessage] = useState("Press Scan and identify, then place one finger flat on the reader.");

  useEffect(() => {
    return () => { if (apiRef.current) { void apiRef.current.stopAcquisition().catch(() => undefined); apiRef.current.off(); } };
  }, []);

  const identifyFinger = async () => {
    setIdentifying(true); setMessage("Connecting to the reader…");
    try {
      const api = new Fingerprint.WebApi();
      apiRef.current = api;
      const device = await api.enumerateDevices().then((devices) => selectPreferredFingerprintDevice(api, devices));
      if (!device) throw new Error("No supported fingerprint reader was found.");
      api.onQualityReported = (event) => { if (event.deviceUid === device.uid) setMessage(event.quality === 0 ? "Good scan—identifying the employee…" : "Adjust your finger and keep it flat."); };
      api.onSamplesAcquired = async (event) => {
        if (event.deviceUid !== device.uid) return;
        try {
          await api.stopAcquisition(event.deviceUid);
          const sample = readCapturedFingerprintSample(event.samples);
          setMessage("Looking for the employee who owns this fingerprint…");
          const response = await apiFetch("/api/fingerprints/identify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fingerprintSamples: [sample], deviceUid: device.uid }) });
          const result = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(result.error || "The fingerprint could not be identified.");
          setMessage(result.recognized ? `${result.employeeName} was identified${result.matchStrength == null ? "." : ` with ${result.matchStrength}% match quality.`}` : `No registered employee matched this fingerprint${result.matchStrength == null ? "." : ` (${result.matchStrength}% match quality).`}`);
          onTrialSaved();
        } catch (reason) { setMessage(reason instanceof Error ? reason.message : "The fingerprint could not be identified."); }
        finally { setIdentifying(false); api.off(); apiRef.current = null; }
      };
      api.onErrorOccurred = () => { setIdentifying(false); setMessage("The reader could not capture the fingerprint. Try again."); api.off(); apiRef.current = null; };
      setMessage("Reader ready—place the registered finger flat and hold still.");
      await api.startAcquisition(Fingerprint.SampleFormat.Raw, device.uid);
    } catch (reason) { setIdentifying(false); setMessage(reason instanceof Error ? reason.message : "Cannot connect to the reader."); apiRef.current?.off(); apiRef.current = null; }
  };

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="border-b border-slate-200 bg-slate-50/80 px-5 py-4"><p className="text-xs font-semibold uppercase tracking-[.16em] text-violet-700">Fingerprint review</p><h3 className="mt-1 text-lg font-bold text-slate-900">Automatic identification and measured results</h3><p className="mt-1 text-sm text-slate-600">Identify a fingerprint automatically and review earlier controlled test results.</p></div>
    <div className="space-y-5 p-5">
      <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-950"><strong>No employee selection is needed.</strong> Press “Scan and identify.” A recognized employee or “No registered match” will appear here and in Recent Fingerprint Scans.</div>
      <div className="overflow-hidden rounded-2xl border border-slate-200"><div className="border-b border-slate-200 bg-slate-50 px-4 py-3"><h4 className="text-sm font-bold text-slate-900">How each result is decided</h4><p className="mt-1 text-xs leading-5 text-slate-600"><strong>95% or higher</strong> means the scanner found a match. Below 95% means no acceptable match. The selected test type then decides the result.</p></div><div className="grid gap-px bg-slate-200 sm:grid-cols-2"><DecisionRule code="TA" title="Registered finger + correct employee matched" note="Correct acceptance" tone="emerald" /><DecisionRule code="FR" title="Registered finger + no acceptable match" note="Incorrect rejection" tone="amber" /><DecisionRule code="TR" title="Unregistered finger + no acceptable match" note="Correct rejection" tone="sky" /><DecisionRule code="FA" title="Unregistered or wrong finger matched" note="Incorrect acceptance" tone="red" /></div><p className="bg-violet-50 px-4 py-3 text-xs leading-5 text-violet-900"><strong>Important:</strong> 99% is not automatically TA. It is TA only when it matches the employee you selected; otherwise it is FA.</p></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Count code="TA" label="Registered finger accepted" value={data.counts.TA} color="emerald" /><Count code="TR" label="Unregistered finger rejected" value={data.counts.TR} color="sky" /><Count code="FA" label="Unregistered or wrong finger accepted" value={data.counts.FA} color="red" /><Count code="FR" label="Registered finger rejected" value={data.counts.FR} color="amber" /></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Metric label="Overall accuracy" value={data.accuracy == null ? "Not enough tests" : `${data.accuracy}%`} /><Metric label="False acceptance rate" value={data.far == null ? "Need impostor tests" : `${data.far}%`} /><Metric label="False rejection rate" value={data.frr == null ? "Need employee tests" : `${data.frr}%`} /><Metric label="Average response" value={data.totalTrials ? `${(data.averageResponseTimeMs / 1000).toFixed(2)} seconds` : "No tests yet"} /></div>
      {(data.totalTrials < data.minimumRecommendedTrials || data.impostorTrialCount === 0) && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900"><strong>Preliminary result only.</strong> You have {data.totalTrials} controlled trials: {data.genuineTrialCount} employee tests and {data.impostorTrialCount} non-enrolled-finger tests. Run at least {data.minimumRecommendedTrials} balanced trials before interpreting the percentages. {data.wrongIdentificationCount > 0 && `${data.wrongIdentificationCount} wrong-employee match must also be investigated.`}</div>}
      <div className="rounded-2xl border border-violet-200 bg-violet-50/50 p-4"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h4 className="text-sm font-bold text-violet-950">Automatic fingerprint identification</h4><p className="mt-1 max-w-2xl text-xs leading-5 text-violet-800">Scan once. The system will automatically show the employee name or “No registered match,” then add the result to Recent Fingerprint Scans.</p></div><Button disabled={identifying} onClick={() => void identifyFinger()}>{identifying ? <LoaderCircle className="animate-spin" size={16} /> : <FingerprintIcon size={16} />}{identifying ? "Identifying…" : "Scan and identify"}</Button></div><div aria-live="polite" className="mt-3 rounded-lg bg-white px-3 py-3 text-sm font-medium text-slate-700">{message}</div></div>
      {data.recentTrials.length > 0 && <div className="overflow-hidden rounded-xl border border-slate-200"><div className="bg-slate-50 px-4 py-3"><h4 className="text-sm font-bold text-slate-900">Recent controlled scans</h4><p className="mt-1 text-xs text-slate-500">Testing-ground scans only. These do not change attendance.</p></div>{data.recentTrials.slice(0, 10).map((trial) => { const automatic = trial.scanKind === "automatic" || trial.expectedType === "automatic"; return <div key={trial.id} className="grid gap-3 border-t border-slate-100 px-4 py-3 sm:grid-cols-[1fr_auto_auto] sm:items-center"><div><p className="text-sm font-semibold text-slate-800">{automatic ? trial.accepted ? trial.actualEmployeeName || "Registered employee recognized" : "No registered match" : trial.expectedType === "genuine" ? `Registered finger expected: ${trial.expectedEmployeeName || "employee"}` : "Finger expected to be unregistered"}</p><p className="mt-1 text-xs leading-5 text-slate-500">{classificationExplanation(trial)}</p></div><div className="text-left sm:text-right"><p className="text-lg font-bold text-slate-900">{trial.matchStrength == null ? "No score" : `${trial.matchStrength}%`}</p><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Match quality</p></div>{automatic ? <Badge variant={trial.accepted ? "success" : "neutral"}>{trial.accepted ? "Recognized" : "No match"}</Badge> : trial.classification ? <ClassBadge value={trial.classification} /> : null}</div>; })}</div>}
    </div>
  </section>;
}

function classificationExplanation(trial: Trial) {
  if (trial.scanKind === "automatic" || trial.expectedType === "automatic") return trial.accepted ? `Automatically identified as ${trial.actualEmployeeName || "a registered employee"}.` : "No registered employee matched this test scan.";
  if (trial.classification === "TA") return `The registered finger correctly matched ${trial.actualEmployeeName || trial.expectedEmployeeName || "the selected employee"}.`;
  if (trial.classification === "TR") return "The finger was marked as not registered and correctly matched nobody.";
  if (trial.classification === "FA") return `The scan matched ${trial.actualEmployeeName || "an employee"}, even though that match was not expected.`;
  return `The test expected ${trial.expectedEmployeeName || "the selected employee"}, but the scanner found no match.`;
}

function DecisionRule({ code, title, note, tone }: { code: Classification; title: string; note: string; tone: "emerald" | "amber" | "sky" | "red" }) {
  const styles = { emerald: "text-emerald-700", amber: "text-amber-700", sky: "text-sky-700", red: "text-red-700" };
  return <div className="flex items-start gap-3 bg-white p-4"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-50 text-sm font-black ${styles[tone]}`}>{code}</span><div><p className="text-sm font-semibold text-slate-900">{title}</p><p className="mt-1 text-xs text-slate-500">{note}</p></div></div>;
}

function Count({ code, label, value, color }: { code: string; label: string; value: number; color: string }) { const styles: Record<string,string> = { emerald: "border-emerald-200 bg-emerald-50 text-emerald-700", sky: "border-sky-200 bg-sky-50 text-sky-700", red: "border-red-200 bg-red-50 text-red-700", amber: "border-amber-200 bg-amber-50 text-amber-700" }; return <div className={`rounded-xl border p-4 ${styles[color]}`}><p className="text-xs font-bold">{code}</p><p className="mt-1 text-2xl font-bold">{value}</p><p className="text-[11px] opacity-75">{label}</p></div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-slate-200 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 text-sm font-bold text-slate-900">{value}</p></div>; }
function ClassBadge({ value }: { value: Classification }) { return <Badge variant={value === "TA" ? "success" : value === "TR" ? "info" : value === "FA" ? "danger" : "warning"}>{value}</Badge>; }
