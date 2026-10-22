import { readFile } from "node:fs/promises";
import { join } from "node:path";

// A build-derived index prevents the Worker proxy and RSC bundles from each
// parsing the full catalogue. Node development keeps revision-aware readers.
export function parseRoutingIndex(value: unknown): { day: string; jobs: Set<string>; readings: Set<string> } {
  const raw = value as { schema?: number; day?: unknown; jobs?: unknown; readings?: unknown } | null;
  const valid = (items: unknown): items is string[] => Array.isArray(items) && items.length > 0 && items.every(id => typeof id === "string" && id.length > 0);
  if (raw?.schema !== 1 || typeof raw.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.day) || !valid(raw.jobs) || !valid(raw.readings)) throw new Error("Invalid deployment routing index");
  return { day: raw.day, jobs: new Set(raw.jobs), readings: new Set(raw.readings) };
}
let pending: Promise<ReturnType<typeof parseRoutingIndex>> | undefined;
function index() {
  return pending ??= readFile(join(process.cwd(), "data/routing-index.json"), "utf8")
    .then(text => parseRoutingIndex(JSON.parse(text)))
    .catch(error => { pending = undefined; throw error; });
}
export async function routingJobExists(id: string) {
  if (process.env.CURVEHOP_RUNTIME === "cloudflare") return (await index()).jobs.has(id);
  return (await import("./published-data")).publishedJobExists(id);
}
export async function routingReadingState(id: string): Promise<"exists" | "missing" | "unavailable"> {
  if (process.env.CURVEHOP_RUNTIME === "cloudflare") {
    const value = await index();
    // Research validity advances by UTC day. After that boundary use the
    // existing date-aware research reader; immutable job IDs stay indexed.
    if (value.day === new Date().toISOString().slice(0, 10)) return value.readings.has(id) ? "exists" : "missing";
  }
  return (await import("./published-data")).publishedReadingState(id);
}
