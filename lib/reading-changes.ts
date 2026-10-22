import { withoutContentChange } from "./reading-editorial";
export { withoutContentChange } from "./reading-editorial";
import { createHash } from 'node:crypto';
import type { CompanyResearch } from './research';

type Guide = NonNullable<CompanyResearch['guides']>[number];
/** Content recorded in our local candidate/history, never upstream publication or live delivery. */
export type ContentChange = { version: 1; kind: 'added' | 'updated'; recordedAt: string; contentHash: string };
const normalized = (text: string) => text.replace(/\s+/gu, ' ').trim();

/** Prose changes only: source rechecks, references, navigation and card copy do not manufacture novelty. */
export function guideContentHash(guide: Pick<Guide, 'answer' | 'limitation' | 'sections'>): string {
  return createHash('sha256').update(JSON.stringify({
    answer: normalized(guide.answer), limitation: normalized(guide.limitation),
    sections: (guide.sections ?? []).map(section => ({ title: normalized(section.title), text: normalized(section.text), kind: section.kind })),
  })).digest('hex');
}


export function contentChangeShape(value: unknown): value is ContentChange {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const stamp = value as ContentChange;
  return Object.keys(stamp).sort().join(',') === 'contentHash,kind,recordedAt,version' && stamp.version === 1 &&
    (stamp.kind === 'added' || stamp.kind === 'updated') && typeof stamp.contentHash === 'string' && /^[a-f0-9]{64}$/.test(stamp.contentHash) &&
    typeof stamp.recordedAt === 'string' && Number.isFinite(Date.parse(stamp.recordedAt)) && new Date(stamp.recordedAt).toISOString() === stamp.recordedAt;
}

/** Invalid/stale/future chronology is unknown; it does not make otherwise valid prose disappear. */
export function validContentChange(guide: Guide, now = new Date()): ContentChange | undefined {
  const stamp = guide.contentChange;
  return contentChangeShape(stamp) && Date.parse(stamp.recordedAt) <= now.getTime() && stamp.contentHash === guideContentHash(guide) ? stamp : undefined;
}

export function withContentChange(previous: Guide | undefined, next: Guide, recordedAt: Date): Guide {
  const result = withoutContentChange(next);
  if (previous && guideContentHash(previous) === guideContentHash(next)) {
    return previous.contentChange === undefined ? result : { ...result, contentChange: structuredClone(previous.contentChange) };
  }
  return { ...result, contentChange: { version: 1, kind: previous ? 'updated' : 'added', recordedAt: recordedAt.toISOString(), contentHash: guideContentHash(next) } };
}

type ChangeEnvelope = {readingChangeVersion?: unknown; task?: unknown; sourceMode?: unknown; storedMaterial?: unknown};
export function assertContentChangeBinding(manifest: ChangeEnvelope, draft: ChangeEnvelope): void {
  if (manifest.readingChangeVersion === undefined && draft.readingChangeVersion === undefined) return;
  if (manifest.readingChangeVersion !== 1 || draft.readingChangeVersion !== 1 ||
    (manifest.task !== undefined && manifest.task !== 'research') || (draft.task !== undefined && draft.task !== 'research') ||
    manifest.sourceMode !== undefined || draft.storedMaterial !== undefined) throw new Error('READING_CHANGE_ENVELOPE');
}

export function readingContentChange(reading: {id: string; company: CompanyResearch}, now = new Date()): ContentChange | undefined {
  const guide = reading.company.guides?.find(item => item.id === reading.id);
  return guide ? validContentChange(guide, now) : undefined;
}
