export function createLoginCooldown() {
  const states = new Map();
  return {
    remaining(key, now = Date.now()) {
      return Math.max(0, Math.ceil(((states.get(key)?.until ?? 0) - now) / 1000));
    },
    fail(key, now = Date.now()) {
      const failures = (states.get(key)?.failures ?? 0) + 1;
      const seconds = Math.max(0, failures - 4) * 10;
      states.set(key, { failures, until: now + seconds * 1000 });
      return seconds;
    },
    reset(key) { states.delete(key); },
  };
}
