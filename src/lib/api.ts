export async function apiFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  const token = sessionStorage.getItem('workpulse_token')
  const csrfToken = sessionStorage.getItem('workpulse_csrf')
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`)
  if (csrfToken && !headers.has('X-CSRF-Token') && !['GET', 'HEAD'].includes(String(init.method ?? 'GET').toUpperCase())) headers.set('X-CSRF-Token', csrfToken)
  return fetch(path, { ...init, headers, credentials: 'include' })
}

export function storeSession(data: { token?: string; csrfToken?: string; role?: string }) {
  if (data.token) sessionStorage.setItem('workpulse_token', data.token)
  else sessionStorage.removeItem('workpulse_token')
  if (data.csrfToken) sessionStorage.setItem('workpulse_csrf', data.csrfToken)
  if (data.role) sessionStorage.setItem('workpulse_role', data.role)
}

export function clearSession() {
  sessionStorage.removeItem('workpulse_token')
  sessionStorage.removeItem('workpulse_csrf')
  sessionStorage.removeItem('workpulse_role')
}
