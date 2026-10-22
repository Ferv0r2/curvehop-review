/** Writes under the state dir: whole files only, never a half-written one. */
import { randomBytes } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

/** Writes to a temporary file beside `path`, then renames it into place; the temporary file is removed on any error. */
export async function atomicWrite(path: string, data: string | Uint8Array) {
  const temp = join(dirname(path), `.${basename(path)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  try {
    await writeFile(temp, data);
    await rename(temp, path);
  } finally {
    await rm(temp, { force: true }).catch(() => {});
  }
}
