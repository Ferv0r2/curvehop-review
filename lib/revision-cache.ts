import { stat } from "node:fs/promises";

/** Published files are atomically replaced; ctime also detects in-place/same-size edits.
 * The cache observes a coherent revision at the final check, not future writes.
 * No TTL/SWR: every call checks the files. One entry per reader, not per revision.
 */
export async function fileRevision(paths: string[], day?: string): Promise<string> {
  const stamps = await Promise.all(paths.map(async path => {
    try {
      const s = await stat(path, { bigint: true });
      return `${path}:${s.dev}:${s.ino}:${s.size}:${s.mtimeNs}:${s.ctimeNs}:${s.mode}`;
    } catch (error) {
      // Readers retain their own ENOENT/error contracts. Unavailable results are
      // not retained; a restored file always has a different revision.
      return `${path}:${(error as NodeJS.ErrnoException).code ?? "stat-error"}`;
    }
  }));
  return JSON.stringify([day, ...stamps]);
}
class RevisionChanged extends Error {}
export function revisionCache<T>(revision: () => Promise<string>, load: () => Promise<T>, retain: (value: T) => boolean = () => true) {
  let entry: { key: string; promise: Promise<T> } | undefined;
  return async (): Promise<T> => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const key = await revision();
      let current = entry;
      if (!current || current.key !== key) {
        const promise = (async () => {
          let value: T;
          try { value = await load(); }
          catch (error) { if (await revision() !== key) throw new RevisionChanged(); throw error; }
          if (await revision() !== key) throw new RevisionChanged();
          return value;
        })();
        current = { key, promise };
        entry = current;
      }
      try {
        const value = await current.promise;
        // Also recheck pending/hit callers: another request can replace the
        // entry while this one is suspended. Never re-install an older entry.
        if (await revision() !== key) throw new RevisionChanged();
        if (!retain(value) && entry === current) entry = undefined;
        return value;
      } catch (error) {
        if (entry === current) entry = undefined;
        if (!(error instanceof RevisionChanged)) throw error;
      }
    }
    throw new Error("자료가 갱신되는 중입니다. 잠시 후 다시 시도해 주세요.");
  };
}
