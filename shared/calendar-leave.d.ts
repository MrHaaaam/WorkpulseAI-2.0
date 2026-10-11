type CalendarLeave = { status: string; startDate: string; endDate: string; requestedDates?: string[]; approvedDates?: string[] };
export function calendarLeavesForDate<T extends CalendarLeave>(requests: T[], date: string, today: string): T[];
export function requestedLeaveDatesFor(request: CalendarLeave): string[];
export function leaveDateStatus(request: CalendarLeave, date: string, today: string): string;
export function leaveDateProgress(request: CalendarLeave, today: string): { status: string; pendingDates: string[]; passedDates: string[] };
