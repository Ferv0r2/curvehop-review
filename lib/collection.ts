import { collectGreeting } from "./greeting";
import { collectWorkday } from "./workday";
import { normalizeGreenhouse } from "./greenhouse";
import { sourceKey, type Source } from "./sources";
import { normalizeLever } from "./lever";
import { isInScope } from "./eligibility";
import type { Job } from "./jobs";
import type { Snapshot } from "./store";
import { EmptyListError } from "./source-errors";

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
async function readPayload(
  response: Response,
  format: "json" | "text" = "json",
) {
  if (!response.ok)
    throw new Error(
      `API 응답 오류 (${response.status}). 잠시 후 다시 수집하세요.`,
    );
  if (!response.body) throw new Error("API 응답 본문이 없습니다.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 30 * 1024 * 1024)
        throw new Error("API 응답이 30MB 제한을 넘었습니다.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return format === "json" ? JSON.parse(text) : text;
}

async function fetchJobs(
  source: Source,
  fetcher: Fetcher,
  now: string,
): Promise<Job[]> {
  const request = async (url: string, format: "json" | "text" = "json") =>
    readPayload(
      await fetcher(url, {
        headers: {
          Accept:
            format === "json"
              ? "application/json"
              : "text/html,application/xml,text/plain",
          "User-Agent": "NextstepJobBoard/0.1",
        },
        signal: AbortSignal.timeout(20000),
        redirect: "error",
      }),
      format,
    );
  if (source.provider === "greeting")
    return collectGreeting(source, (url) => request(url, "text"), now);
  if (source.provider === "workday")
    return collectWorkday(source, (url) => request(url, "text"), now);
  const board = encodeURIComponent(source.board);
  if (source.provider === "lever") {
    const jobs: Job[] = [];
    const seen = new Set<string>();
    for (let skip = 0; skip < 10000; skip += 100) {
      const page = await request(
        `https://api.lever.co/v0/postings/${board}?mode=json&limit=100&skip=${skip}`,
      );
      if (Array.isArray(page) && !skip && !page.length)
        throw new EmptyListError(
          "Lever 공고 목록이 비어 있습니다. 이전 데이터를 유지합니다.",
        );
      if (!Array.isArray(page) || page.length > 100)
        throw new Error("Lever 공고 목록 형식이 변경됐습니다.");
      for (const raw of page) {
        const job = normalizeLever(raw, source, now);
        if (seen.has(job.id))
          throw new Error(
            "Lever 페이지에 중복 공고가 있습니다. 전체 수집을 다시 시도하세요.",
          );
        seen.add(job.id);
        jobs.push(job);
      }
      if (page.length < 100) return jobs;
    }
    throw new Error("Lever 전체 목록을 받지 못했습니다.");
  }
  const payload = await request(
    `https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`,
  );
  if (!payload || !Array.isArray(payload.jobs))
    throw new Error("공고 목록 형식이 변경됐습니다. 이전 데이터를 유지합니다.");
  if (!payload.jobs.length)
    throw new EmptyListError(
      "공고 목록이 비어 있습니다. 이전 데이터를 유지합니다.",
    );
  if (
    payload.meta?.total !== undefined &&
    payload.meta.total !== payload.jobs.length
  )
    throw new Error(
      "전체 공고 목록을 받지 못했습니다. 이전 데이터를 유지합니다.",
    );
  return payload.jobs.map((job: unknown) =>
    normalizeGreenhouse(job, source, now),
  );
}

/**
 * One source's result before the Seoul/Pangyo filter. History archives these
 * as observed; the snapshot below keeps only in-scope jobs for the web.
 */
export type Observation = {
  key: string;
  status: "ok" | "empty" | "error";
  error?: string;
  jobs: Job[];
};

/**
 * `firstSeenAt` of every posting id in the previous snapshot. A posting that
 * was there before the field existed maps to null: its first sighting is
 * unknown and is never invented.
 */
export function firstSeenFrom(jobs: readonly Job[]): ReadonlyMap<string, string | null> {
  return new Map(jobs.map((job) => [job.id, job.firstSeenAt ?? null]));
}

/**
 * A collected posting with its first sighting: carried unchanged (null
 * included) when the previous snapshot had the same id (`<provider>-<board>-<posting id>`),
 * otherwise this collection's time.
 */
export function withFirstSeen(job: Job, seen: ReadonlyMap<string, string | null>, now: string): Job {
  return { ...job, firstSeenAt: seen.has(job.id) ? seen.get(job.id)! : now };
}

export async function collectSources(
  previous: Snapshot,
  sources: Source[],
  fetcher: Fetcher = fetch,
  now = new Date().toISOString(),
): Promise<Snapshot> {
  return (await collectObservations(previous, sources, fetcher, now)).snapshot;
}

export async function collectObservations(
  previous: Snapshot,
  sources: Source[],
  fetcher: Fetcher = fetch,
  now = new Date().toISOString(),
): Promise<{ snapshot: Snapshot; observations: Observation[] }> {
  const seen = firstSeenFrom(previous.jobs);
  // A failed source's postings stay exactly as they were (an absent firstSeenAt reads as unknown);
  // a collected source's postings get the field from `withFirstSeen`.
  const result: Snapshot = {
    version: 1,
    jobs: previous.jobs.filter(isInScope),
    sources: [...previous.sources],
  };
  const observations: Observation[] = [];
  async function collectOne(source: Source) {
    const key = sourceKey(source);
    const previousState = previous.sources.find(
      (item) => sourceKey(item) === key,
    );
    result.sources = result.sources.filter((item) => sourceKey(item) !== key);
    try {
      const fetched = await fetchJobs(source, fetcher, now);
      const unique = [...new Map(fetched.map((job) => [job.id, job])).values()];
      observations.push({ key, status: "ok", jobs: unique });
      result.jobs = [
        ...result.jobs.filter(
          (job) =>
            sourceKey({ provider: job.source, board: job.sourceBoard }) !== key,
        ),
        ...unique.filter(isInScope).map((job) => withFirstSeen(job, seen, now)),
      ];
      result.sources.push({
        provider: source.provider ?? "greenhouse",
        board: source.board,
        company: source.company,
        status: "ok",
        checkedAt: now,
        lastSuccessAt: now,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "수집 실패";
      const empty = error instanceof EmptyListError;
      // History always sees "empty" and closes postings only after its own streak rule.
      observations.push({ key, status: empty ? "empty" : "error", error: message, jobs: [] });
      // A board that was already empty, or a new one, answering empty is a healthy observation:
      // collected, zero postings (phase 3 spec §6). One that had Seoul/Pangyo postings and now
      // answers empty keeps them and is marked empty (audit P2-b): a one-off empty answer from a
      // big board must not erase it or trip the per-source drop gate.
      const hadPostings = previous.jobs.some(
        (job) =>
          sourceKey({ provider: job.source, board: job.sourceBoard }) === key &&
          isInScope(job),
      );
      if (empty && !hadPostings) {
        result.sources.push({
          provider: source.provider ?? "greenhouse",
          board: source.board,
          company: source.company,
          status: "ok",
          checkedAt: now,
          lastSuccessAt: now,
        });
        return;
      }
      result.sources.push({
        provider: source.provider ?? "greenhouse",
        board: source.board,
        company: source.company,
        status: "error",
        ...(empty ? { errorCode: "empty" as const } : {}),
        checkedAt: now,
        lastSuccessAt: previousState?.lastSuccessAt ?? null,
        error: message,
      });
    }
  }
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(3, sources.length) }, async () => {
      while (next < sources.length) await collectOne(sources[next++]);
    }),
  );
  result.sources.sort((a, b) => sourceKey(a).localeCompare(sourceKey(b)));
  result.jobs.sort(
    (a, b) =>
      (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "") ||
      a.id.localeCompare(b.id),
  );
  observations.sort((a, b) => a.key.localeCompare(b.key));
  return { snapshot: result, observations };
}
