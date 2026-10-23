import { useEffect, useState } from 'react';
import { archiveCutoff } from '../../shared/record-archives.js';

export function useArchiveCutoff() {
  const [cutoff, setCutoff] = useState(() => archiveCutoff());
  useEffect(() => {
    const refresh = () => setCutoff(archiveCutoff());
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  return cutoff;
}
