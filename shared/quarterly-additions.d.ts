export function additionFrequency(item: { frequency?: string }): 'quarterly' | 'per-payroll';
export function quarterForDate(date: string): string;
export function validQuarter(quarter: unknown): boolean;
export function quarterLabel(quarter: string): string;
export function nextQuarter(quarter: string): string;
export function allowanceKey(item: { sourceKey?: string; type?: string; label?: string }): string;
export function manilaDate(date?: Date): string;
export function frequencyForQuarter(item: { frequency?: string; frequencyHistory?: { fromQuarter: string; frequency: string }[] }, quarter: string): string | null;
export function configuredAdditions(employee: { identifiers?: { type: string; value: string; amount: number; frequency?: string }[] }, frequency: 'quarterly' | 'per-payroll', quarter?: string): { label: string; value: number; quarter?: string }[];
