export type AttendanceWindow = { workStartTime?: string; overtimeStopTime?: string };
export function attendanceWindowError(checkIn: string, checkOut: string, schedule?: AttendanceWindow | null): string | null;
