import { useCallback, useRef, useState, type SetStateAction } from 'react';
import { pageCacheGeneration, readPageCache, writePageCache } from '../lib/pageCache';

// Cache only server records, never passwords, dialog state, or unsaved forms.
export function useCachedState<T>(key: string, initial: T) {
  const generation = pageCacheGeneration();
  const initialRef = useRef(initial);
  const [state, setState] = useState(() => ({ key, value: readPageCache<T>(key) ?? initial }));
  const value = state.key === key ? state.value : readPageCache<T>(key) ?? initial;
  const update = useCallback((action: SetStateAction<T>) => {
    if (generation !== pageCacheGeneration()) return;
    setState(previous => {
      if (generation !== pageCacheGeneration()) return previous;
      const current = previous.key === key ? previous.value : readPageCache<T>(key) ?? initialRef.current;
      const next = typeof action === 'function' ? (action as (value: T) => T)(current) : action;
      writePageCache(key, next, generation);
      return { key, value: next };
    });
  }, [key, generation]);
  return [value, update] as const;
}
