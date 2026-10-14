import { ArrowRight, History, ShieldCheck } from 'lucide-react';

type Snapshot = { checkIn?: string | null; checkOut?: string | null };
export type AttendanceCorrection = {
  sessionNumber?: number; reason?: string; correctedBy?: string; correctedByName?: string; correctedAt?: string | Date;
  before?: Snapshot[]; after?: Snapshot[];
};
export type CorrectionSession = Snapshot & {
  correctedAt?: string | Date; manualNote?: string; manualRecordedBy?: string; manualRecordedByName?: string;
};

function time(value?: string | null, missing = 'Not recorded') {
  if (!value) return missing;
  const match = /^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i.exec(value.trim());
  if (!match) return value;
  let hour = Number(match[1]);
  if (match[3]) hour = hour % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0);
  return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function timestamp(value?: string | Date) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime())
    ? date.toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' · Manila time'
    : 'Date not recorded';
}

function action(before?: Snapshot, after?: Snapshot, hasHistory = true) {
  if (!hasHistory) return 'Attendance edited by admin';
  if (!before?.checkIn && after?.checkIn) return 'Session added by admin';
  const changes = [];
  if (time(before?.checkIn) !== time(after?.checkIn)) changes.push('Time-in changed');
  if (time(before?.checkOut) !== time(after?.checkOut)) {
    changes.push(!before?.checkOut ? 'Time-out added' : !after?.checkOut ? 'Time-out removed' : 'Time-out changed');
  }
  return changes.length ? changes.join(' · ') : 'Session reviewed by admin';
}

export function AttendanceCorrectionHistory({ history = [], sessions = [], expanded = false }: {
  history?: AttendanceCorrection[]; sessions?: CorrectionSession[]; expanded?: boolean;
}) {
  const entries: (AttendanceCorrection & { hasHistory: boolean })[] = history.length
    ? history.map(entry => ({ ...entry, hasHistory: Array.isArray(entry.before) && Array.isArray(entry.after) }))
    : sessions.flatMap((session, index) => session.correctedAt ? [{
      sessionNumber: index + 1, reason: session.manualNote, correctedBy: session.manualRecordedBy, correctedByName: session.manualRecordedByName,
      correctedAt: session.correctedAt, after: sessions, hasHistory: false,
    }] : []);
  if (!entries.length) return null;
  const newest = entries.at(-1)!;
  return <details open={expanded} className="rounded-xl border border-amber-200 bg-amber-50/40">
    <summary className="cursor-pointer rounded-xl px-4 py-3 text-sm text-slate-800 marker:text-amber-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">
      <span className="inline-flex items-center gap-2 font-semibold"><History aria-hidden="true" className="h-4 w-4 text-amber-700" />Admin attendance changes <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">{entries.length}</span></span>
      <span className="mt-1 block whitespace-pre-wrap break-words text-xs leading-5 text-slate-600"><span className="font-semibold">Edited by admin {newest.correctedByName || newest.correctedBy || 'Administrator'}</span><br /><span className="font-semibold">Latest reason:</span> {newest.reason || 'Reason not recorded'}</span>
    </summary>
    <ol className="space-y-3 border-t border-amber-100 px-4 py-3">
      {[...entries].reverse().map((entry, index) => {
        const sessionNumber = entry.sessionNumber && entry.sessionNumber >= 1 && entry.sessionNumber <= 3 ? entry.sessionNumber : 1;
        const before = entry.before?.[sessionNumber - 1];
        const removed = entry.hasHistory && (entry.after?.length ?? 0) < (entry.before?.length ?? 0);
        const after = removed ? undefined : entry.after?.[sessionNumber - 1];
        return <li key={index} className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-slate-900">{removed ? 'Session removed by admin' : action(before, after, entry.hasHistory)}</p><span className="rounded-md bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-700">Session {sessionNumber}</span></div>
          <p className="mt-1 flex items-start gap-1.5 break-words text-xs leading-5 text-slate-500"><ShieldCheck aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>By {entry.correctedByName || entry.correctedBy || 'Administrator'} · {timestamp(entry.correctedAt)}</span></p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg bg-slate-50 px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Before change</p>{entry.hasHistory ? <SessionTimes session={before} /> : <p className="mt-1 text-xs text-slate-500">Original times were not retained in this older record.</p>}</div>
            <div className="rounded-lg bg-violet-50 px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-wide text-violet-600">After change</p><SessionTimes session={after} /></div>
          </div>
          <div className="mt-3 border-t border-slate-100 pt-3"><p className="text-xs font-semibold text-slate-700">Reason for change</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{entry.reason || 'Reason not recorded'}</p></div>
        </li>;
      })}
    </ol>
  </details>;
}

function SessionTimes({ session }: { session?: Snapshot }) {
  return <div className="mt-1 text-xs leading-5 text-slate-700"><p><span className="text-slate-500">Time-in:</span> {time(session?.checkIn)}</p><p><ArrowRight aria-hidden="true" className="mr-1 inline-block h-3 w-3 text-slate-400" /><span className="text-slate-500">Time-out:</span> {time(session?.checkOut, session?.checkIn ? 'Open' : 'Not recorded')}</p></div>;
}
