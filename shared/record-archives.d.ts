export type ArchiveKind = 'leave' | 'payroll' | 'additions' | 'cash' | 'cash-given' | 'repayment';
export interface ArchiveRecord {
  status?: string;
  requestedDates?: string[];
  endDate?: string;
  startDate?: string;
  periodStart?: string;
  paidAt?: string;
  requestedAt?: string;
  date?: string;
  createdAt?: string;
}
export function archiveCutoff(now?: Date): string;
export function recordArchiveDate(kind: ArchiveKind, record: ArchiveRecord): string;
export function isArchivedRecord(kind: ArchiveKind, record: ArchiveRecord, cutoff?: string): boolean;
export function keepActiveRecord(kind: ArchiveKind, record: ArchiveRecord, cutoff?: string): boolean;
