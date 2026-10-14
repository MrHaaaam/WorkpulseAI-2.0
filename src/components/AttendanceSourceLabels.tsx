import { Pencil, ShieldCheck } from 'lucide-react';

export type AttendanceSource = {
  manualClockOutByName?: string; manualClockOutBy?: string; manualRecordedByName?: string; manualRecordedBy?: string; captureMethod?: string; deviceUid?: string | null; correctedAt?: string | Date;
  manualClockOut?: boolean; forcedClockOut?: boolean; autoClockedOut?: boolean;
  checkOut?: string | null;
};

export function AttendanceSourceLabels({ session }: { session: AttendanceSource }) {
  const manualIn = session.captureMethod === 'admin-manual';
  const manualOut = session.manualClockOut || session.forcedClockOut;
  const names = [...new Set([manualIn ? session.manualRecordedByName || session.manualRecordedBy : null, manualOut ? session.manualClockOutByName || session.manualClockOutBy : null].filter(Boolean))].join(', ');
  if (!manualIn && !manualOut && !session.correctedAt) return null;
  if (session.correctedAt) return <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700"><Pencil className="h-3 w-3" />Edited by admin {session.manualRecordedByName || session.manualRecordedBy || 'Administrator'}</span>;
  return <span title={session.correctedAt ? 'Attendance corrected by administrator' : manualIn && manualOut ? 'Time-in and time-out recorded by administrator' : manualIn ? 'Time-in recorded by administrator' : 'Time-out recorded by administrator'} className="mt-1 inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700"><ShieldCheck className="h-3 w-3" />Recorded by admin {names || 'Administrator'}</span>;
}
