import type { Store } from './store.js';
import type { createHippiusStorage } from './hippius.js';

export function createStorageCleanup(store: Store, storage: Pick<ReturnType<typeof createHippiusStorage>, 'remove'>) {
  let active: Promise<{ deleted: number; failed: number }> | undefined;
  async function sweep(now: Date) {
    let deleted = 0;
    let failed = 0;
    for (const { sessionId, job } of store.expiredStorage(now)) {
      try {
        await storage.remove(job.id, job.result?.storageVersionId);
        store.markStorageDeleted(sessionId, job.id);
        deleted++;
      } catch { failed++; }
    }
    return { deleted, failed };
  }
  return (now = new Date()) => {
    if (!active) active = sweep(now).finally(() => { active = undefined; });
    return active;
  };
}
