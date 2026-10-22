import { readPublishedSnapshotState } from "@/lib/published-data";
import { savedCards } from "@/lib/saved-job-lookup";
import { parseSavedIds, SAVED_BODY_BYTES } from "@/lib/saved-job-contract";

const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) return reply({ error: "JSON 요청이 필요해요." }, 415);
  if (Number(request.headers.get("content-length")) > SAVED_BODY_BYTES) return reply({ error: "요청이 너무 커요." }, 413);
  const reader = request.body?.getReader();
  if (!reader) return reply({ error: "공고 ID 목록이 필요해요." }, 400);
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > SAVED_BODY_BYTES) { await reader.cancel(); return reply({ error: "요청이 너무 커요." }, 413); }
      chunks.push(value);
    }
  } catch { return reply({ error: "요청을 읽지 못했어요." }, 400); }
  let ids: string[] | null;
  try { ids = parseSavedIds(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
  catch { return reply({ error: "공고 ID 목록을 확인해 주세요." }, 400); }
  if (!ids) return reply({ error: "공고 ID는 한 번에 100개까지 조회할 수 있어요." }, 400);
  if (!ids.length) return reply({ jobs: [] });
  try {
    const { snapshot, available } = await readPublishedSnapshotState();
    if (!available) return reply({ error: "공고 정보를 불러오지 못했어요." }, 503);
    return reply({ jobs: savedCards(snapshot.jobs, ids) });
  } catch { return reply({ error: "공고 정보를 불러오지 못했어요." }, 503); }
}
