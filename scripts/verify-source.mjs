import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function verifySource(root = process.cwd()) {
  const manifest = JSON.parse(readFileSync(join(root, 'SOURCE_MANIFEST.json'), 'utf8'));
  if (manifest.schema !== 1 || !/^[a-f0-9]{40}$/.test(manifest.sourceCommit) || !Array.isArray(manifest.files)) throw new Error('Invalid source manifest');
  const paths = new Set();
  for (const entry of manifest.files) {
    if (!entry.path || entry.path.startsWith('/') || entry.path.includes('\\') || entry.path.split('/').some(p => !p || p === '.' || p === '..') || paths.has(entry.path)) throw new Error('Unsafe or duplicate source path');
    paths.add(entry.path);
    const path = join(root, entry.path);
    let parent = root;
    for (const part of entry.path.split('/')) { parent = join(parent, part); if (lstatSync(parent).isSymbolicLink()) throw new Error(`Symlink is not a source file: ${entry.path}`); }
    const digest = createHash('sha256').update(readFileSync(path)).digest('hex');
    if (digest !== entry.exportSha256) throw new Error(`Changed from reviewed snapshot: ${entry.path}`);
    if (!['exact', 'adapter', 'generated'].includes(entry.kind) || entry.kind === 'exact' && entry.sourceSha256 !== digest) throw new Error(`Invalid provenance: ${entry.path}`);
  }
  return { sourceCommit: manifest.sourceCommit, files: paths.size, exact: manifest.files.filter(f => f.kind === 'exact').length };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(verifySource()); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
