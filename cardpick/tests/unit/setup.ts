import 'fake-indexeddb/auto';
import { beforeEach } from 'vitest';
import { CardPickDB, useDatabase } from '../../src/db/db';
import { ensureSystemLocations } from '../../src/db/inventory';

let n = 0;
beforeEach(async () => {
  useDatabase(new CardPickDB(`test-${Date.now()}-${n++}`));
  await ensureSystemLocations();
});
