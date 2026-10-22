/** Cached public objects are read-only at runtime as well as by convention. */
const ownedFrozen = new WeakSet<object>();
export function isFrozenData(value: object): boolean { return ownedFrozen.has(value); }
export function freezeData<T>(value: T, seen = new WeakSet<object>()): T {
  if (value && typeof value === "object" && !seen.has(value)) {
    seen.add(value);
    for (const child of Object.values(value)) freezeData(child, seen);
    Object.freeze(value);
    ownedFrozen.add(value);
  }
  return value;
}
