import { useCallback, useEffect, useState } from 'react'

/** Sidebar visits create history entries; Back/Forward only restores them. */
export function usePortalNavigation<T extends string>(views: readonly T[], fallback: T) {
  const readView = useCallback(() => {
    const value = new URLSearchParams(window.location.search).get('view') as T
    return views.includes(value) ? value : fallback
  }, [views, fallback])
  const [view, setView] = useState(readView)

  useEffect(() => {
    const restoreView = () => setView(readView())
    window.addEventListener('popstate', restoreView)
    return () => window.removeEventListener('popstate', restoreView)
  }, [readView])

  const navigate = useCallback((next: T) => {
    if (!views.includes(next) || next === readView()) return
    const url = new URL(window.location.href)
    url.searchParams.set('view', next)
    url.searchParams.delete('role')
    window.history.pushState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
    setView(next)
  }, [views, readView])

  return [view, navigate] as const
}
