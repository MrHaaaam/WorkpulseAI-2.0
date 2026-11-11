import { useEffect, useState } from 'react'

let retryUntil = 0
const listeners = new Set<() => void>()

export function recordAdminPasswordRetry(response: Response, error: unknown) {
  if (![401, 429].includes(response.status) || !/incorrect (?:admin|administrator) password/i.test(String(error ?? ''))) return
  const seconds = Number(response.headers.get('Retry-After')) || Number(/try again in (\d+) seconds?/i.exec(String(error))?.[1]) || 0
  if (seconds > 0) {
    retryUntil = Math.max(retryUntil, Date.now() + seconds * 1000)
    listeners.forEach(listener => listener())
  }
}

export function useAdminPasswordRetry() {
  const [seconds, setSeconds] = useState(() => Math.max(0, Math.ceil((retryUntil - Date.now()) / 1000)))
  useEffect(() => {
    const update = () => setSeconds(Math.max(0, Math.ceil((retryUntil - Date.now()) / 1000)))
    listeners.add(update)
    const timer = window.setInterval(update, 250)
    return () => { listeners.delete(update); window.clearInterval(timer) }
  }, [])
  return seconds
}
