export const bookmarkPrefix = "nextstep:bookmark:";
export const bookmarkChanged = "nextstep:bookmark-changed";

/** Keep the original per-job flags: existing bookmarks need no migration. */
export function readBookmarkIds(storage: Pick<Storage, "length" | "key" | "getItem">): string[] {
  const ids: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(bookmarkPrefix) && storage.getItem(key) === "1") {
      const id = key.slice(bookmarkPrefix.length);
      if (id) ids.push(id);
    }
  }
  return ids;
}

export type SavedJob = {
  id: string;
  company: string;
  companyId?: string;
  color: string;
  title: string;
  locationLabel: string;
};
