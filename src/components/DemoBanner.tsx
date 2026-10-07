import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'

export function DemoBanner() {
  const [demo, setDemo] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    void apiFetch('/api/auth/demo-config', { signal: controller.signal }).then(response => response.ok ? response.json() : null).then(data => { if (data) setDemo(data.demoDeployment === true) }).catch(() => {})
    return () => controller.abort()
  }, [])
  return demo ? <div role="status" className="fixed bottom-0 left-0 right-0 z-[100] border-t border-amber-300 bg-amber-100 px-3 py-2 text-center text-xs font-semibold text-amber-950">Demo workspace — sample data only. Do not enter real employee or payroll information.</div> : null
}
