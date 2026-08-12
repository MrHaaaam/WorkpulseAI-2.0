const DAY_MS = 86_400_000;
const TIME_ZONE = 'Asia/Manila';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = (value, digits = 1) => Number(value.toFixed(digits));
// Operator-facing index: a score at the native acceptance boundary is 95,
// and a theoretically perfect dissimilarity score is capped at 99.
const matchStrength = (score, threshold) => round(clamp(99 - 4 * (score / threshold), 0, 99));
const asDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const isoDate = (date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
}).format(date);
const utcDate = (value) => {
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  return year && month && day ? new Date(Date.UTC(year, month - 1, day)) : null;
};
const addDays = (date, amount) => new Date(date.getTime() + amount * DAY_MS);
const median = (values) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const clockMinutes = (value) => {
  if (!value) return null;
  const match = String(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes >= 0 && minutes < 1_440 ? minutes : null;
};
const displayClock = (minutes) => {
  const total = ((Math.round(minutes) % 1_440) + 1_440) % 1_440;
  const hour = Math.floor(total / 60);
  const minute = total % 60;
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
};
const sessionsFor = (record) => Array.isArray(record?.sessions) && record.sessions.length
  ? record.sessions
  : [{
      checkIn: record?.checkIn, checkOut: record?.checkOut,
      matchScore: record?.matchScore, checkoutMatchScore: record?.checkoutMatchScore,
      deviceUid: record?.deviceUid, checkoutDeviceUid: record?.checkoutDeviceUid,
      checkInAt: record?.checkInAt, checkOutAt: record?.checkOutAt,
    }];

function forecastInsight(attendance, activeEmployees, today) {
  const dated = attendance.filter((item) => utcDate(item.date));
  const lastDate = dated.reduce((latest, item) => {
    const date = utcDate(item.date);
    return !latest || date > latest ? date : latest;
  }, null) || utcDate(today);
  const firstDate = dated.reduce((earliest, item) => {
    const date = utcDate(item.date);
    return !earliest || date < earliest ? date : earliest;
  }, null) || addDays(lastDate, -13);
  const startDate = new Date(Math.max(firstDate.getTime(), addDays(lastDate, -89).getTime()));
  const counts = new Map();
  for (const item of dated) {
    const present = item.status !== 'Absent' && sessionsFor(item).some((session) => session.checkIn);
    if (present) counts.set(String(item.date).slice(0, 10), (counts.get(String(item.date).slice(0, 10)) || 0) + 1);
  }
  const series = [];
  for (let date = startDate; date <= lastDate; date = addDays(date, 1)) {
    const key = date.toISOString().slice(0, 10);
    series.push({ date: key, value: counts.get(key) || 0 });
  }
  const values = series.map((item) => item.value);
  const ready = activeEmployees > 0 && values.length >= 14;
  const weekdayAverages = Array.from({ length: 7 }, (_, day) => {
    const matches = series.filter((item) => utcDate(item.date).getUTCDay() === day).map((item) => item.value);
    return matches.length ? matches.reduce((sum, value) => sum + value, 0) / matches.length : 0;
  });
  let level = values.slice(0, 7).reduce((sum, value) => sum + value, 0) / Math.max(1, Math.min(7, values.length));
  let trend = values.length >= 14
    ? (values.slice(-7).reduce((sum, value) => sum + value, 0) - values.slice(-14, -7).reduce((sum, value) => sum + value, 0)) / 49
    : 0;
  const season = weekdayAverages.map((value) => value - level);
  if (ready) {
    values.forEach((value, index) => {
      const day = utcDate(series[index].date).getUTCDay();
      const previousLevel = level;
      level = 0.45 * (value - season[day]) + 0.55 * (level + trend);
      trend = 0.2 * (level - previousLevel) + 0.8 * trend;
      season[day] = 0.3 * (value - level) + 0.7 * season[day];
    });
  }
  const forecast = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(lastDate, index + 1);
    const day = date.getUTCDay();
    const estimate = ready ? level + (index + 1) * trend + season[day] : weekdayAverages[day];
    const expectedPresent = Math.round(clamp(estimate, 0, activeEmployees));
    return {
      date: date.toISOString().slice(0, 10), expectedPresent,
      attendanceRate: activeEmployees ? round(expectedPresent / activeEmployees * 100) : 0,
    };
  });
  const average = forecast.reduce((sum, day) => sum + day.expectedPresent, 0) / forecast.length;
  return {
    version: 'Holt-Winters additive · weekly seasonality', status: ready ? 'ready' : 'limited',
    sampleDays: values.length, activeEmployees, forecast,
    summary: activeEmployees ? `${round(average)} of ${activeEmployees} employees expected per day next week` : 'Add active employees to generate a forecast',
  };
}

function leaveDateSet(leaveRequests) {
  const result = new Map();
  for (const leave of leaveRequests.filter((item) => item.status === 'approved')) {
    const start = utcDate(leave.startDate);
    const end = utcDate(leave.endDate);
    if (!start || !end) continue;
    if (!result.has(leave.employeeId)) result.set(leave.employeeId, new Set());
    for (let date = start; date <= end; date = addDays(date, 1)) result.get(leave.employeeId).add(date.toISOString().slice(0, 10));
  }
  return result;
}

function riskInsight(attendance, employees, leaveRequests, today) {
  const todayDate = utcDate(today);
  const coveredLeave = leaveDateSet(leaveRequests);
  const rows = employees.map((employee) => {
    const records = attendance.filter((item) => item.employeeId === employee.id).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const absenceDates = records
      .filter((item) => item.status === 'Absent' && !coveredLeave.get(employee.id)?.has(String(item.date).slice(0, 10)))
      .map((item) => utcDate(item.date)).filter(Boolean);
    let spells = 0;
    let previous = null;
    let weightedDays = 0;
    for (const date of absenceDates) {
      if (!previous || Math.round((date - previous) / DAY_MS) > 1) spells += 1;
      previous = date;
      weightedDays += 0.5 ** (Math.max(0, (todayDate - date) / DAY_MS) / 30);
    }
    const score = round(spells ** 2 * weightedDays);
    const lateDays = records.filter((item) => item.status === 'Late').length;
    const tier = score >= 400 ? 'severe' : score >= 125 ? 'high' : score >= 51 ? 'mild' : 'normal';
    return { employeeId: employee.id, name: employee.name || employee.fullName || employee.id, score, tier, spells, weightedDays: round(weightedDays), absenceDays: absenceDates.length, lateDays };
  }).sort((a, b) => b.score - a.score);
  return {
    version: 'Bradford factor · 30-day decay', status: rows.length ? 'ready' : 'limited',
    employeesAnalyzed: rows.length, flagged: rows.filter((row) => row.tier !== 'normal').length,
    employees: rows.slice(0, 10), summary: rows.length ? `${rows.filter((row) => row.tier !== 'normal').length} attendance patterns need review` : 'No employee records to analyze',
  };
}

function anomalyInsight(attendance, employees) {
  const names = new Map(employees.map((employee) => [employee.id, employee.name || employee.fullName || employee.id]));
  const scans = attendance.flatMap((record) => {
    const first = sessionsFor(record)[0];
    const minutes = clockMinutes(first?.checkIn);
    return minutes == null ? [] : [{ employeeId: record.employeeId, name: names.get(record.employeeId) || record.employeeId, date: String(record.date).slice(0, 10), time: first.checkIn, minutes }];
  });
  const values = scans.map((scan) => scan.minutes);
  const center = median(values);
  const mad = median(values.map((value) => Math.abs(value - center)));
  const scale = Math.max(mad, 15);
  const anomalies = scans.map((scan) => ({
    ...scan, score: round(0.6745 * (scan.minutes - center) / scale, 2), deviationMinutes: Math.round(scan.minutes - center),
  })).filter((scan) => Math.abs(scan.score) > 3.5).sort((a, b) => Math.abs(b.score) - Math.abs(a.score)).slice(0, 12);
  return {
    version: 'Modified Z-score · MAD baseline', status: scans.length >= 7 ? 'ready' : 'limited', sampleScans: scans.length,
    medianTime: values.length ? displayClock(center) : 'No data', madMinutes: round(mad), scaleMinutes: scale,
    anomalies, summary: values.length ? `${anomalies.length} unusual arrival ${anomalies.length === 1 ? 'time' : 'times'} detected` : 'No arrival scans to analyze',
  };
}

function verificationInsight(attendance, verificationAttempts, employees, threshold) {
  const matches = [];
  for (const record of attendance) {
    for (const session of sessionsFor(record)) {
      const pairs = [
        { rawScore: session.matchScore, rawDevice: session.deviceUid, rawDate: session.checkInAt || record.date, action: 'time-in', eventTime: session.checkIn },
        { rawScore: session.checkoutMatchScore, rawDevice: session.checkoutDeviceUid || session.deviceUid, rawDate: session.checkOutAt || record.date, action: 'time-out', eventTime: session.checkOut },
      ];
      for (const { rawScore, rawDevice, rawDate, action, eventTime } of pairs) {
        if (rawScore == null || !Number.isFinite(Number(rawScore))) continue;
        matches.push({
          score: Number(rawScore), deviceUid: rawDevice || 'Unknown reader',
          at: asDate(rawDate) || utcDate(record.date), action, eventTime,
          employeeId: record.employeeId, name: record.name || record.employeeId,
        });
      }
    }
  }
  matches.sort((a, b) => (b.at?.getTime() || 0) - (a.at?.getTime() || 0));
  const recent = matches.slice(0, 500);
  const groups = new Map();
  for (const match of recent) {
    if (!groups.has(match.deviceUid)) groups.set(match.deviceUid, []);
    groups.get(match.deviceUid).push(match.score);
  }
  const scanners = [...groups.entries()].map(([deviceUid, scores]) => {
    const averageScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const health = matchStrength(averageScore, threshold);
    return { deviceUid, scans: scores.length, averageScore: Math.round(averageScore), health, status: health >= 95 ? 'healthy' : health >= 80 ? 'attention' : 'critical' };
  }).sort((a, b) => a.health - b.health);
  const averageHealth = scanners.length ? round(scanners.reduce((sum, scanner) => sum + scanner.health, 0) / scanners.length) : 0;
  const attendanceMatches = recent.slice(0, 20).map((match) => ({
    employeeId: match.employeeId, name: match.name, action: match.action,
    eventTime: match.eventTime || null, scannedAt: match.at?.toISOString() || null,
    deviceUid: match.deviceUid, score: match.score, accepted: true, responseTimeMs: null,
    matchStrength: matchStrength(match.score, threshold),
  }));
  const names = new Map(employees.map((employee) => [employee.id, employee.name || employee.fullName || employee.id]));
  const loggedAttempts = verificationAttempts.map((attempt) => {
    const score = attempt.score == null || !Number.isFinite(Number(attempt.score)) ? null : Number(attempt.score);
    const attemptThreshold = Number(attempt.threshold) > 0 ? Number(attempt.threshold) : threshold;
    return {
      employeeId: attempt.employeeId || null,
      name: attempt.accepted ? names.get(attempt.employeeId) || attempt.employeeId || 'Recognized employee' : 'Unrecognized fingerprint',
      action: attempt.accepted ? 'recognized' : 'no-match', eventTime: null,
      scannedAt: asDate(attempt.createdAt)?.toISOString() || null,
      deviceUid: attempt.deviceUid || 'Unknown reader', score,
      accepted: Boolean(attempt.accepted), responseTimeMs: Number(attempt.responseTimeMs) || null,
      matchStrength: score == null ? null : matchStrength(score, attemptThreshold),
    };
  }).sort((a, b) => String(b.scannedAt).localeCompare(String(a.scannedAt))).slice(0, 20);
  const recentMatches = loggedAttempts.length ? loggedAttempts : attendanceMatches;
  return {
    version: 'Rolling FingerJet operational health', status: recent.length ? 'ready' : 'limited', matchesAnalyzed: recent.length,
    threshold, averageHealth, scanners, recentMatches,
    summary: recent.length ? `${averageHealth}% average scanner match quality` : 'No verified fingerprint matches recorded yet',
  };
}

export function buildAIInsights({ attendance = [], employees = [], leaveRequests = [], verificationAttempts = [], now = new Date(), fingerJetThreshold = 21_474 } = {}) {
  const today = isoDate(now);
  const activeEmployees = employees.filter((employee) => employee.archived !== true && employee.status !== 'inactive');
  return {
    generatedAt: now.toISOString(), today,
    forecast: forecastInsight(attendance, activeEmployees.length, today),
    risk: riskInsight(attendance, activeEmployees, leaveRequests, today),
    anomaly: anomalyInsight(attendance, activeEmployees),
    verification: verificationInsight(attendance, verificationAttempts, activeEmployees, fingerJetThreshold),
    disclaimer: 'These signals support human review. They must not be used as the sole basis for discipline, payroll decisions, or employment action.',
  };
}
