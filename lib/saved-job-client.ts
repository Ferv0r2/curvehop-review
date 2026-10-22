import type { SavedJob } from "./bookmarks";
import { SAVED_BATCH_SIZE, validSavedId } from "./saved-job-contract";

export async function fetchSavedJobs(ids: string[], signal: AbortSignal): Promise<SavedJob[]> {
  const valid = [...new Set(ids.filter(validSavedId))], jobs: SavedJob[] = [];
  if (!valid.length) return jobs;
  signal.throwIfAborted();
  const controller = new AbortController();
  const cancel = () => controller.abort(signal.reason);
  signal.addEventListener("abort", cancel, { once: true });
  // Bound the entire lookup, including response bodies and subsequent batches.
  // The caller owns navigation/selection cancellation; timeout owns only this lookup.
  const timer = setTimeout(() => controller.abort(new DOMException("공고 조회 시간이 초과됐어요.", "TimeoutError")), 15_000);
  try {
    for (let i = 0; i < valid.length; i += SAVED_BATCH_SIZE) {
      const batch = valid.slice(i, i + SAVED_BATCH_SIZE);
      const response = await fetch("/api/saved-jobs", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: batch }), signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error("공고 정보를 불러오지 못했어요.");
      const data = await response.json();
      if (!Array.isArray(data.jobs) || data.jobs.some((job: SavedJob) => !job || !batch.includes(job.id) ||
        [job.company, job.color, job.title, job.locationLabel].some(value => typeof value !== "string") ||
        (job.companyId !== undefined && typeof job.companyId !== "string"))) throw new Error("공고 응답을 확인하지 못했어요.");
      jobs.push(...data.jobs);
    }
    return jobs.sort((a, b) => a.company.localeCompare(b.company, "ko") || a.title.localeCompare(b.title, "ko"));
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
  }
}
