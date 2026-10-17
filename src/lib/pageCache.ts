// Session-only display cache. Every page still revalidates against the server.
const entries = new Map<string, unknown>();
let generation = 0;
export const pageCacheGeneration = () => generation;
export function readPageCache<T>(key: string): T | undefined {
  return entries.get(key) as T | undefined;
}
export function writePageCache<T>(key: string, value: T, started = generation) {
  if (started !== generation) return;
  if (entries.size >= 100 && !entries.has(key)) entries.delete(entries.keys().next().value!);
  entries.set(key, value);
}
export function clearPageCache() { generation++; entries.clear(); }
