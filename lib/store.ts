import type { HiringTrend } from "./hiring-trend";
import { mkdir, readFile, rename, writeFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Job, SourceState } from "./jobs";

export type Snapshot = {
  version: 1;
  jobs: Job[];
  sources: SourceState[];
  /** Derived from the observation archive by the collector; absent until the archive exists. */
  trend?: HiringTrend;
};
export const snapshotPath = () => join(process.cwd(), "data", "jobs.json");
export const emptySnapshot = (): Snapshot => ({
  version: 1,
  jobs: [],
  sources: [],
});

export async function readSnapshot(path = snapshotPath()): Promise<Snapshot> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return emptySnapshot();
    throw error;
  }
  const data = JSON.parse(raw) as Snapshot;
  if (
    !data ||
    data.version !== 1 ||
    !Array.isArray(data.jobs) ||
    !Array.isArray(data.sources)
  )
    throw new Error(
      "공고 데이터 파일 형식이 잘못되었습니다. 백업을 복원한 뒤 pnpm sync를 실행하세요.",
    );
  return data;
}

export async function writeSnapshot(snapshot: Snapshot, path = snapshotPath()) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(snapshot, null, 2) + "\n", {
      flag: "wx",
    });
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}
