import { useToast } from '../ui/Toast';
/// <reference types="@digitalpersona/websdk" />
/// <reference types="@digitalpersona/fingerprint" />

import { useEffect, useRef, useState } from "react";
import { Fingerprint as FingerprintIcon, LoaderCircle, Search, Check, ChevronLeft, ChevronRight, ShieldCheck } from "lucide-react";
import { apiFetch } from "../../lib/api";
import { readCapturedFingerprintSample, selectPreferredFingerprintDevice } from "../../lib/fingerprintDevices";
import { Button } from "../ui/Button";

type Classification = "TA" | "TR" | "FA" | "FR";
type Trial = { assessment?: "correct" | "wrong" | null; id: string; classification: Classification | null; scanKind?: "automatic" | "controlled"; expectedType: "genuine" | "impostor" | "automatic"; expectedEmployeeName: string | null; actualEmployeeName: string | null; accepted: boolean; wrongEmployeeMatch?: boolean; matchStrength: number | null; responseTimeMs: number; createdAt?: string | null };
export type EvaluationSummary = { counts: Record<Classification, number>; totalTrials: number; correctTrialCount?: number; accuracy: number | null; far: number | null; frr: number | null; averageResponseTimeMs: number; genuineTrialCount: number; impostorTrialCount: number; wrongIdentificationCount: number; minimumRecommendedTrials: number; recentTrials: Trial[] };

export function FingerprintEvaluation({ data, onTrialSaved }: { data: EvaluationSummary; onTrialSaved: () => void }) {
  const { toast } = useToast();
  const apiRef = useRef<Fingerprint.WebApi | null>(null);
  const [historySearch, setHistorySearch] = useState("");
  const [historyFilter, setHistoryFilter] = useState("controlled");
  const [page, setPage] = useState(0);
  const [pending, setPending] = useState<Trial[]>([]);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [captureErrors, setCaptureErrors] = useState(0);
  const busyRef = useRef(false);
  const [identifying, setIdentifying] = useState(false);
  const [message, setMessage] = useState("Start a trial, scan any finger, then assess the result.");

  useEffect(() => {
    let active = true;
    void apiFetch("/api/biometric-evaluation-trials/pending").then(async response => {
      if (!response.ok) throw new Error("Unable to load tester. Reload Insights to try again.");
      const unfinished = await response.json();
      if (active) { setPending(unfinished); setReady(true); }
    }).catch(reason => { if (active) setMessage(reason.message); });
    return () => { active = false; };
  }, []);

  const confirm = async (assessment: "correct" | "wrong") => {
    setSaving(true);
    try {
      const response = await apiFetch(`/api/biometric-evaluation-trials/${pending[0].id}/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assessment }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Unable to save assessment. Please retry.");
      setPending(previous => previous.slice(1)); setMessage("Assessment saved. Lift your finger before starting the next trial."); toast({ title: "Trial assessment saved", description: assessment === "correct" ? "The trial was marked correct." : "The trial was marked wrong.", variant: "success" }); onTrialSaved();
    } catch (reason) { const message = reason instanceof Error ? reason.message : "Unable to confirm trial."; setMessage(message); toast({ title: "Assessment not saved", description: message, variant: "error" }); }
    finally { setSaving(false); }
  };

  useEffect(() => {
    return () => { if (apiRef.current) { void apiRef.current.stopAcquisition().catch(() => undefined); apiRef.current.off(); } };
  }, []);

  const identifyFinger = async () => {
    if (busyRef.current || pending.length || !ready) return;
    busyRef.current = true;
    setIdentifying(true); setMessage("Connecting to the reader...");
    try {
      const api = new Fingerprint.WebApi();
      apiRef.current = api;
      const device = await api.enumerateDevices().then((devices) => selectPreferredFingerprintDevice(api, devices));
      if (!device) throw new Error("No supported fingerprint reader was found.");
      api.onQualityReported = (event) => { if (event.deviceUid === device.uid) setMessage(event.quality === 0 ? "Good scan - identifying the employee..." : "Adjust your finger and keep it flat."); };
      let captured = false;
      api.onSamplesAcquired = async (event) => {
        if (event.deviceUid !== device.uid || captured) return;
        captured = true;
        try {
          await api.stopAcquisition(event.deviceUid);
          const sample = readCapturedFingerprintSample(event.samples);
          setMessage("Identifying fingerprint...");
          const response = await apiFetch("/api/biometric-evaluation-trials", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fingerprintSamples: [sample], deviceUid: device.uid, expectedType: "automatic", preview: true }) });
          const result = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(result.error || "The fingerprint could not be identified.");
          setPending([result]);
          setMessage("Review the scan result, then assess whether the identification or rejection was correct.");
        } catch (reason) { setCaptureErrors(value => value + 1); setMessage(reason instanceof Error ? reason.message : "The fingerprint could not be identified."); }
        finally { busyRef.current = false; setIdentifying(false); api.off(); apiRef.current = null; }

      };
      api.onErrorOccurred = () => { busyRef.current = false; setCaptureErrors(value => value + 1); void api.stopAcquisition().catch(() => undefined); setIdentifying(false); setMessage("The reader could not capture the fingerprint. Try again."); api.off(); apiRef.current = null; };
      setMessage("Reader ready - place the test finger flat and hold still.");
      await api.startAcquisition(Fingerprint.SampleFormat.Raw, device.uid);
    } catch (reason) { busyRef.current = false; setCaptureErrors(value => value + 1); setIdentifying(false); setMessage(reason instanceof Error ? reason.message : "Cannot connect to the reader."); apiRef.current?.off(); apiRef.current = null; }
  };

  const percent = (value: number | null) => value == null ? "N/A" : `${value}%`;
  const trial = pending[0];
  const locked = !ready || identifying || pending.length > 0;
  const history = data.recentTrials.filter(item => {
    const labeled = item.assessment != null || item.classification != null;
    const correct = item.assessment ? item.assessment === "correct" : item.classification === "TA" || item.classification === "TR";
    return (historyFilter === "all" || (historyFilter === "controlled" && labeled) || (historyFilter === "incorrect" && labeled && !correct))
      && `${item.expectedEmployeeName || ""} ${item.actualEmployeeName || ""} ${outcome(item)}`.toLowerCase().includes(historySearch.trim().toLowerCase());
  });
  const pageCount = Math.max(1, Math.ceil(history.length / 5));
  const currentPage = Math.min(page, pageCount - 1);
  const inputClass = "w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 disabled:opacity-50";

  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-5 sm:px-6">
      <div><h3 className="text-base font-semibold text-slate-900">Fingerprint evaluation</h3><p className="mt-1 text-sm text-slate-500">Scan any finger and review whether the result is correct.</p></div>
      <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600"><ShieldCheck size={14} /> Test mode / No attendance changes</span>
    </header>
    <div className="grid grid-cols-2 border-b border-slate-200 lg:grid-cols-4">
      {[["Reviewed accuracy", percent(data.accuracy), `${data.correctTrialCount ?? data.counts.TA + data.counts.TR} correct / ${data.totalTrials} assessed trials`], ["Correct trials", String(data.correctTrialCount ?? data.counts.TA + data.counts.TR), "Marked correct"], ["Wrong trials", String(data.totalTrials - (data.correctTrialCount ?? data.counts.TA + data.counts.TR)), "Marked wrong"], ["Average identification time", data.totalTrials ? `${(data.averageResponseTimeMs / 1000).toFixed(2)} seconds` : "N/A", "Time to identify a fingerprint"]].map(([label, value, note]) => <div key={label} className="border-r border-slate-100 px-5 py-5 last:border-r-0 sm:px-6"><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">{value}</p><p className="mt-1 text-xs text-slate-400">{note}</p></div>)}
    </div>
    <div className="p-5 sm:p-6">
      <p className="mb-4 text-sm text-slate-500">Press Start trial and place any finger on the reader. Check the identified name, then choose Correct or Wrong. No employee selection is needed.</p>
      <div className="flex min-w-0 flex-col rounded-lg border border-slate-200 bg-slate-50/60 p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900"><FingerprintIcon size={18} className="text-violet-600" /> Fingerprint capture</div>
        <p role="status" className="my-4 text-sm leading-6 text-slate-500">{message}</p>
        {trial && <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4"><span className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${outcomeStyle(trial)}`}>{outcome(trial)}</span><dl className="mt-3 space-y-2 text-sm"><div className="flex justify-between gap-3"><dt className="text-slate-500">Identified as</dt><dd className="text-right font-medium text-slate-800">{trial.accepted ? trial.actualEmployeeName || 'Registered employee' : 'No registered match'}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">Match quality</dt><dd className="font-medium text-slate-800 tabular-nums">{percent(trial.matchStrength)}</dd></div></dl></div>}
        <div className="mt-auto">{trial ? <div className="flex flex-wrap gap-2"><Button disabled={saving} onClick={() => void confirm("correct")}><Check size={16} />Correct trial assessment</Button><Button variant="destructive" disabled={saving} onClick={() => void confirm("wrong")}>Wrong trial assessment</Button>{saving && <span role="status" className="text-sm text-slate-500">Saving...</span>}</div> : <Button className="w-full sm:w-auto" disabled={locked} onClick={() => void identifyFinger()}>{identifying ? <LoaderCircle className="animate-spin" size={16} /> : <FingerprintIcon size={16} />}{identifying ? 'Scanning...' : 'Start trial'}</Button>}</div>
        <p className="mt-3 text-xs leading-5 text-slate-400">{trial ? 'Choose Correct when the scan identified the right person or correctly rejected an unregistered finger. Choose Wrong otherwise. Accuracy is correct assessments divided by all assessed trials.' : 'Lift your finger between trials. Each retry is a separate test.'}</p>
      </div>
    </div>
    <div className="border-t border-slate-200">
      <div className="flex flex-col justify-between gap-4 px-5 py-4 sm:px-6 xl:flex-row xl:items-center"><div><h4 className="text-sm font-semibold text-slate-900">Trial history</h4><p className="mt-1 text-xs text-slate-400">Search the latest {data.recentTrials.length} records. Unassessed scans are excluded from accuracy.</p></div><div className="flex flex-col gap-2 sm:flex-row"><div className="relative"><Search size={16} className="pointer-events-none absolute left-3 top-3 text-slate-400" /><input aria-label="Search trial history" value={historySearch} onChange={event => { setHistorySearch(event.target.value); setPage(0); }} placeholder="Search name or outcome..." className={inputClass} /></div><select aria-label="Filter trial history" value={historyFilter} onChange={event => { setHistoryFilter(event.target.value); setPage(0); }} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600 outline-none focus:border-violet-400"><option value="controlled">Assessed trials</option><option value="incorrect">Incorrect results</option><option value="all">All scans</option></select></div></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="border-y border-slate-200 bg-slate-50 text-[11px] font-medium uppercase tracking-wider text-slate-500"><tr><th scope="col" className="px-6 py-3 font-medium">Trial</th><th scope="col" className="px-6 py-3 font-medium">Identified as</th><th scope="col" className="px-6 py-3 font-medium">Result</th><th scope="col" className="px-6 py-3 text-right font-medium">Match quality</th></tr></thead><tbody className="divide-y divide-slate-100">{history.slice(currentPage * 5, currentPage * 5 + 5).map(item => <tr key={item.id} className="hover:bg-slate-50/60"><td className="px-6 py-4"><p className="font-medium text-slate-800">{item.expectedType === 'automatic' ? 'Automatic identification' : item.expectedEmployeeName || 'Unregistered finger'}</p><p className="mt-1 text-xs text-slate-400">{item.createdAt ? new Date(item.createdAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : item.classification ? 'Controlled trial' : 'Identification scan'}</p></td><td className="px-6 py-4 text-slate-600">{item.accepted ? item.actualEmployeeName || 'Registered employee' : 'No registered match'}</td><td className="px-6 py-4"><span className={`inline-flex whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium ${outcomeStyle(item)}`}>{outcome(item)}</span></td><td className="px-6 py-4 text-right font-medium text-slate-700 tabular-nums">{percent(item.matchStrength)}</td></tr>)}{!history.length && <tr><td colSpan={4} className="px-6 py-10 text-center"><p className="text-sm font-medium text-slate-600">{historySearch ? 'No matching trials' : 'No trials to display'}</p><p className="mt-1 text-xs text-slate-400">{historySearch ? 'Try another name or adjust the filter.' : historyFilter === 'controlled' ? 'Assess a fingerprint trial to see it here, or select All scans.' : 'Try a different filter.'}</p></td></tr>}</tbody></table></div>
      <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 sm:px-6"><p className="text-xs text-slate-400">{history.length ? `${currentPage * 5 + 1}-${Math.min((currentPage + 1) * 5, history.length)} of ${history.length} records` : '0 records'}</p><div className="flex items-center gap-2"><button type="button" aria-label="Previous page" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} className="rounded-md border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-30"><ChevronLeft size={15} /></button><span className="text-xs text-slate-500">{currentPage + 1} / {pageCount}</span><button type="button" aria-label="Next page" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)} className="rounded-md border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-30"><ChevronRight size={15} /></button></div></div>
    </div>
    <footer className="flex flex-wrap justify-between gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3 text-xs leading-5 text-slate-400 sm:px-6"><span>Match quality is a scan score, not overall accuracy.</span><span>Session capture / connection errors: <span className="font-medium text-slate-600">{captureErrors}</span> ? Excluded from accuracy</span></footer>
  </section>;
}

function outcome(trial: Trial) {
  if (trial.assessment) return trial.assessment === "correct" ? "Assessed correct" : "Assessed wrong";
  if (trial.wrongEmployeeMatch) return "Wrong identity";
  return trial.classification ? { TA: "Correct identification", TR: "Correct rejection", FA: "False acceptance", FR: "False rejection" }[trial.classification] : "Awaiting assessment";
}

function outcomeStyle(trial: Trial) {
  if (trial.assessment) return trial.assessment === "correct" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700";
  if (!trial.classification) return "bg-slate-100 text-slate-500";
  return trial.classification === "TA" || trial.classification === "TR" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700";
}
