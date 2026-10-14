import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import type { Insights } from '../views/AIInsightsView';

type AttentionItem = { title: string; description: string; critical?: boolean };

export function useInsightsAttention() {
  const [insights, setInsights] = useState<Insights | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    let pending = false;
    const controller = new AbortController();
    async function load() {
      if (pending) return;
      pending = true;
      try {
        const response = await apiFetch('/api/ai-insights', { signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Unable to load Insights.');
        if (active) { setInsights(body); setError(''); }
      } catch {
        if (active) setError('Insights could not refresh. Open Insights to retry.');
      } finally {
        pending = false;
        if (active) setLoading(false);
      }
    }
    void load();
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 60_000);
    const refresh = () => { if (!document.hidden) void load(); };
    document.addEventListener('visibilitychange', refresh);
    return () => { active = false; controller.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, []);

  const items: AttentionItem[] = [];
  if (error) items.push({ title: 'Insights unavailable', description: error });
  if (insights) {
    const flagged = insights.risk.employees.filter(employee => employee.tier === 'orange' || employee.tier === 'red');
    const red = flagged.filter(employee => employee.tier === 'red').length;
    if (flagged.length) items.push({ title: 'Attendance flags in Insights', description: `${flagged.length} employee${flagged.length === 1 ? '' : 's'} flagged for unapproved absences in the last 30 days${red ? `, including ${red} red flag${red === 1 ? '' : 's'}` : ''}.`, critical: red > 0 });
    const anomalies = insights.anomaly.anomalies.length;
    if (anomalies) items.push({ title: 'Arrival times to review', description: `${anomalies} unusual clock-in${anomalies === 1 ? '' : 's'} identified in Insights.` });
    const scanners = insights.verification.scanners.filter(scanner => scanner.status === 'attention' || scanner.status === 'critical');
    if (scanners.length) items.push({ title: 'Fingerprint scanners need attention', description: `${scanners.length} scanner${scanners.length === 1 ? '' : 's'} require review.`, critical: scanners.some(scanner => scanner.status === 'critical') });
    const matches = insights.verification.recentMatches.filter(match => !match.accepted || (match.matchStrength != null && match.matchStrength < 95)).length;
    if (matches) items.push({ title: 'Fingerprint results to review', description: `${matches} recent scan result${matches === 1 ? '' : 's'} need attention in Insights.` });
    if (insights.forecast.dataStale) items.push({ title: 'Insights attendance data is outdated', description: insights.forecast.latestDataDate ? `Latest attendance data: ${insights.forecast.latestDataDate}. Review the attendance records.` : 'No recent attendance data is available for the forecast.' });
    const limited = [insights.forecast, insights.risk, insights.anomaly, insights.verification].filter(model => model.status === 'limited').length;
    if (limited) items.push({ title: 'Insights has limited data', description: `${limited} analysis section${limited === 1 ? '' : 's'} have limited data. Review Insights before relying on the results.` });
  }
  return { items, loading };
}
