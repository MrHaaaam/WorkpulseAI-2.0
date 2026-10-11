import { cacheRead, cachedRead, clearOfflineReads, connectionChanged, offlineChanged, offlineOperation, offlineOwner, queueOffline } from './offline';
type SessionData = { authenticated?: boolean; token?: string; csrfToken?: string; role?: string; accountType?: string; mustChangePassword?: boolean; expiresAt?: string; offlineOwner?: string }

let csrfRefreshPromise: Promise<string | null> | null = null
let sessionRestorePromise: Promise<{ response: Response; data: SessionData | null }> | null = null

async function refreshCsrfToken() {
  if (csrfRefreshPromise) return csrfRefreshPromise
  csrfRefreshPromise = (async () => {
    const headers = new Headers()
    const token = sessionStorage.getItem('workpulse_token')
    if (token) headers.set('Authorization', `Bearer ${token}`)
    const response = await fetch('/api/auth/session', { headers, credentials: 'include' })
    if (!response.ok) return null
    const data = await response.json() as SessionData
    if (!data.csrfToken) return null
    storeSession(data)
    return data.csrfToken
  })().finally(() => { csrfRefreshPromise = null })
  return csrfRefreshPromise
}

export async function apiNetworkFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  const token = sessionStorage.getItem('workpulse_token')
  const csrfToken = sessionStorage.getItem('workpulse_csrf')
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`)
  if (csrfToken && !headers.has('X-CSRF-Token') && !['GET', 'HEAD'].includes(String(init.method ?? 'GET').toUpperCase())) headers.set('X-CSRF-Token', csrfToken)
  const signal = init.signal || AbortSignal.timeout(30_000);
  const response = await fetch(path, { ...init, signal, headers, credentials: 'include' })
  if ([401, 429].includes(response.status)) {
    const failure = await response.clone().json().catch(() => null)
    recordAdminPasswordRetry(response, failure?.error)
    if (response.status === 401 && !path.startsWith('/api/auth/') && !/incorrect (?:admin|administrator) password/i.test(String(failure?.error ?? ''))) {
      clearSession()
      window.location.replace('/')
      return response
    }
  }
  if (response.status !== 403 || path === '/api/auth/session') return response

  const error = await response.clone().json().catch(() => null)
  if (error?.error !== 'Invalid or missing CSRF token') return response
  const refreshedToken = await refreshCsrfToken()
  if (!refreshedToken) return response
  headers.set('X-CSRF-Token', refreshedToken)
  return fetch(path, { ...init, signal, headers, credentials: 'include' })
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const ownerAtStart = offlineOwner();
  const method = String(init.method || 'GET').toUpperCase();
  const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
  const operation = offlineOperation(path, method, body);
  const id = operation ? crypto.randomUUID() : '';
  try {
    if (!navigator.onLine) throw new TypeError('No internet connection');
    const response = operation ? await apiNetworkFetch('/api/offline/sync', { ...init, method: 'POST', body: JSON.stringify({ operation: { id, ...operation }, ...(operation.kind === 'attendance' ? { password: body.password } : {}) }) }) : await apiNetworkFetch(path, init);
    if (response.status === 502 || response.status === 504 || (operation && response.status === 503)) throw new TypeError('Service temporarily unavailable');
    connectionChanged(true);
    if (method === 'GET' && response.ok) {
      const data = await response.clone().json().catch(() => undefined);
      if (data !== undefined) void cacheRead(path, data, ownerAtStart).catch(() => {});
    }
    return response;
  } catch (error) {
    if (init.signal?.aborted) throw error;
    connectionChanged(false);
    if (operation) {
      if (!ownerAtStart || offlineOwner() !== ownerAtStart) throw new Error('The account changed during this request. Review it after signing into the original account.', { cause: error });
      await queueOffline(operation.kind, operation.payload, id);
      return Response.json({ queued: true, operationId: id }, { status: 202 });
    }
    if (method === 'GET') {
      const data = await cachedRead(path);
      if (data !== undefined) return Response.json(data, { headers: { 'X-WorkPulse-Offline': 'true' } });
    }
    const message = method === 'GET' ? 'Connection unavailable and no recent local copy exists. Connect once to prepare this page.' : 'This action requires an online connection. Nothing was changed.';
    if (method !== 'GET') window.dispatchEvent(new CustomEvent('workpulse-offline-toast', { detail: { title: 'Online connection required', description: message, variant: 'error' } }));
    throw new Error(message, { cause: error });
  }
}

export function restoreSession() {
  if (!sessionRestorePromise) {
    sessionRestorePromise = apiNetworkFetch('/api/auth/session').then(async (response) => ({
      response,
      data: response.ok ? await response.json() as SessionData : null,
    })).catch(error => {
      connectionChanged(false);
      const expiresAt = sessionStorage.getItem('workpulse_session_expires');
      const role = sessionStorage.getItem('workpulse_role');
      if (!offlineOwner() || !expiresAt || Date.parse(expiresAt) <= Date.now() || !role) throw error;
      return { response: Response.json({ authenticated: true }), data: { authenticated: true, role, expiresAt, offlineOwner: offlineOwner(), mustChangePassword: sessionStorage.getItem('workpulse_must_change_password') === 'true' } };
    })
  }
  return sessionRestorePromise
}

export function storeSession(data: { token?: string; csrfToken?: string; role?: string; expiresAt?: string; offlineOwner?: string; mustChangePassword?: boolean }) {
  if (data.offlineOwner) sessionStorage.setItem('workpulse_offline_owner', data.offlineOwner);
  if (typeof data.mustChangePassword === 'boolean') sessionStorage.setItem('workpulse_must_change_password', String(data.mustChangePassword));
  if (data.token) sessionStorage.setItem('workpulse_token', data.token)
  else sessionStorage.removeItem('workpulse_token')
  if (data.csrfToken) sessionStorage.setItem('workpulse_csrf', data.csrfToken)
  if (data.role) sessionStorage.setItem('workpulse_role', data.role)
  if ('expiresAt' in data && typeof data.expiresAt === 'string') sessionStorage.setItem('workpulse_session_expires', data.expiresAt)
  offlineChanged();
}

export function clearSession() {
  const owner = offlineOwner();
  if (owner) void clearOfflineReads(owner).catch(() => {});
  sessionStorage.removeItem('workpulse_offline_owner');
  sessionStorage.removeItem('workpulse_must_change_password');
  sessionStorage.removeItem('workpulse_token')
  sessionStorage.removeItem('workpulse_csrf')
  sessionStorage.removeItem('workpulse_role')
  sessionStorage.removeItem('workpulse_session_expires')
  sessionRestorePromise = null
  offlineChanged();
}
import { recordAdminPasswordRetry } from './adminPasswordRetry'
