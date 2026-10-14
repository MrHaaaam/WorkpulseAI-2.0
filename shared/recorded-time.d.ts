type RecordedSession = { checkIn?: string | null; checkOut?: string | null };
export function recordedDayTime(record?: (RecordedSession & { sessions?: RecordedSession[] }) | null): { minutes: number; openSessions: number; label: string };
