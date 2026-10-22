import { listJobs } from "@/lib/repository";

export async function GET(request: Request) {
  const search = new URL(request.url).searchParams;
  const params = Object.fromEntries(
    [...new Set(search.keys())].map((key) => [key, search.getAll(key)]),
  );
  return Response.json(await listJobs(params), {
    headers: { "Cache-Control": "no-store" },
  });
}
