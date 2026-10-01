import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { MISSING } from '../domain/types';

/** Units per location (excluding MISSING). */
export function useLocationCounts(): Map<string, number> {
  return (
    useLiveQuery(async () => {
      const m = new Map<string, number>();
      for (const b of await db().balances.toArray()) {
        if (b.location === MISSING) continue;
        m.set(b.location, (m.get(b.location) ?? 0) + b.qty);
      }
      return m;
    }, []) ?? new Map()
  );
}

export function useOpenProblemCount(): number {
  return useLiveQuery(() => db().problems.where('status').equals('open').count(), []) ?? 0;
}
