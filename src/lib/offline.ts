export type OfflineKind = 'attendance' | 'leave' | 'cash-advance';
export type OfflineItem = { id: string; owner: string; kind: OfflineKind; payload: Record<string, unknown>; createdAt: string; status: 'pending' | 'review' | 'synced'; attemptedAt?: string; error?: string };
type CachedRead = { id: string; owner: string; value: unknown; savedAt: number };
const DATABASE = 'workpulse-offline-v1';
let opening: Promise<IDBDatabase> | undefined;
export const offlineOwner = () => sessionStorage.getItem('workpulse_offline_owner') || '';
export function offlineChanged() { window.dispatchEvent(new Event('workpulse-offline-change')); }
export function connectionChanged(online: boolean) { const value = online ? 'online' : 'offline'; if (sessionStorage.getItem('workpulse_network') !== value) { sessionStorage.setItem('workpulse_network', value); offlineChanged(); } }
export const isOffline = () => !navigator.onLine || sessionStorage.getItem('workpulse_network') === 'offline';
function database() {
  if (!opening) opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error('Offline storage is unavailable in this browser. Use a verified attendance sheet.'));
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('queue', { keyPath: 'id' }); request.result.createObjectStore('reads', { keyPath: 'id' }); };
    request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); opening = undefined; }; resolve(request.result); };
    request.onerror = () => { opening = undefined; reject(new Error('Cannot open offline storage. No record was saved locally.')); };
    request.onblocked = () => reject(new Error('Close other WorkPulse tabs to enable offline storage.'));
  });
  return opening;
}
async function transaction<T>(store: 'queue' | 'reads', mode: IDBTransactionMode, work: (objectStore: IDBObjectStore) => IDBRequest<T>) {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode); const request = work(tx.objectStore(store));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = tx.onabort = () => reject(new Error('Local storage failed or is full. The record was not saved. Free space and retry.'));
  });
}
export async function offlineItems() {
  const owner = offlineOwner();
  return (await transaction<OfflineItem[]>('queue', 'readonly', store => store.getAll())).filter(item => item.owner === owner).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
export async function updateOfflineItem(item: OfflineItem) {
  if (!offlineOwner() || item.owner !== offlineOwner()) throw new Error('Sign into the account that created this local record.');
  await transaction('queue', 'readwrite', store => store.put(item)); offlineChanged();
}
export async function deleteOfflineItem(id: string) {
  const item = (await offlineItems()).find(item => item.id === id);
  if (!item) throw new Error('Local record not found for this account.');
  await transaction('queue', 'readwrite', store => store.delete(id)); offlineChanged();
}
export async function queueOffline(kind: OfflineKind, payload: Record<string, unknown>, id: string = crypto.randomUUID()) {
  const owner = offlineOwner();
  if (!owner) throw new Error('Connect and sign in once to prepare offline storage for this account.');
  const expires = Date.parse(sessionStorage.getItem('workpulse_session_expires') || '');
  if (!Number.isFinite(expires) || expires <= Date.now()) throw new Error('Your session expired. Sign in online again before adding offline records. Existing records are retained.');
  if ((await offlineItems()).filter(item => item.status !== 'synced').length >= 200) throw new Error('There are 200 unsynced local records. Synchronize or review them before adding more.');
  if (JSON.stringify(payload).length > 20000 || /"(?:password|token|csrfToken|fingerprintSamples)"\s*:/.test(JSON.stringify(payload))) throw new Error('This data cannot be stored offline.');
  const item: OfflineItem = { id, owner, kind, payload, createdAt: new Date().toISOString(), status: 'pending' };
  await updateOfflineItem(item);
  window.dispatchEvent(new CustomEvent('workpulse-offline-toast', { detail: { title: 'Saved locally - pending sync', description: 'This record is on this browser only. Server validation happens after reconnection.', variant: 'info' } }));
  return item;
}
const cacheable = (path: string) => /^\/api\/(?:employees$|attendance(?:\?|$|\/manual$|\/correction\?)|employee\/me$|employee\/me\/(?:calendar\?|notifications$))/.test(path);
export async function cacheRead(path: string, value: unknown, owner = offlineOwner()) {
  if (!owner || owner !== offlineOwner() || !cacheable(path)) return;
  // The directory API can contain account fields; offline attendance only needs these.
  if (path === '/api/employees' && Array.isArray(value)) value = value.map(({ id, name, role, status, createdAt }) => ({ id, name, role, status, createdAt }));
  const cached: CachedRead = { id: `${owner}:${path}`, owner, value, savedAt: Date.now() };
  await transaction('reads', 'readwrite', store => store.put(cached));
  const records = (await transaction<CachedRead[]>('reads', 'readonly', store => store.getAll())).filter(item => item.owner === owner).sort((a, b) => b.savedAt - a.savedAt);
  for (const old of records.slice(150)) await transaction('reads', 'readwrite', store => store.delete(old.id));
}
export async function cachedRead(path: string) {
  if (!offlineOwner() || !cacheable(path)) return undefined;
  const cached = await transaction<CachedRead | undefined>('reads', 'readonly', store => store.get(`${offlineOwner()}:${path}`));
  if (!cached || Date.now() - cached.savedAt > 7 * 24 * 60 * 60 * 1000) return undefined;
  return cached.value;
}
export async function clearOfflineReads(owner: string) {
  const records = await transaction<CachedRead[]>('reads', 'readonly', store => store.getAll());
  for (const item of records.filter(item => item.owner === owner)) await transaction('reads', 'readwrite', store => store.delete(item.id));
}
export function offlineOperation(path: string, method: string, body: unknown): { kind: OfflineKind; payload: Record<string, unknown> } | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const payload = { ...body } as Record<string, unknown>;
  if (path === '/api/attendance/correction' && method === 'PATCH') { delete payload.password; return { kind: 'attendance', payload }; }
  if (path === '/api/employee/me/leave-requests' && method === 'POST') {
    const capturedOn = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    return { kind: 'leave', payload: { ...payload, capturedOn } };
  }
  if (path === '/api/employee/me/cash-advance-requests' && method === 'POST') {
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    return { kind: 'cash-advance', payload: { ...payload, requestPeriod: `${date.slice(0, 7)}-${Number(date.slice(8, 10)) <= 15 ? '01' : '16'}` } };
  }
  return null;
}
