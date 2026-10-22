import type { Identity } from "./companies";
import type { Reading, ReadingTopic } from "./reading";

// Navigation labels, not claims of answer sufficiency or current hiring.
const entryTopics: Record<ReadingTopic, string> = {
  vision: "사업·제품", culture: "팀 이야기", work: "직무 이야기",
  process: "채용 과정", business: "사업 변화",
};

/** Feed the corrected public readings and pending IDs, never raw research prose.
 * One projection for document/social metadata, the visible intro, and the offline audit. */
export function companySearchEntry(
  identity: Pick<Identity, "id" | "name">,
  readings: readonly Pick<Reading, "id" | "companyId" | "topic">[],
  pendingGuideIds: readonly string[] = [],
) {
  const pending = new Set(pendingGuideIds);
  const own = readings.filter(r => r.companyId === identity.id && !pending.has(r.id));
  const topics = (Object.keys(entryTopics) as ReadingTopic[]).flatMap(topic => {
    const readingIds = own.filter(r => r.topic === topic).map(r => r.id);
    return readingIds.length ? [{ topic, label: entryTopics[topic], readingIds }] : [];
  });
  const labels = topics.map(t => t.label);
  const introduction = labels.length ? `지원 전에 살펴볼 내용: ${labels.join(", ")}` : null;
  return {
    path: `/companies/${encodeURIComponent(identity.id)}`,
    title: `${identity.name} 기업정보${labels.length ? ` · ${labels.slice(0, 2).join(", ")}` : ""}`,
    description: labels.length
      ? `${identity.name}에 지원하기 전, ${labels.join(", ")} 관련 자료와 출처를 한곳에서 살펴보세요.`
      : `${identity.name}의 회사 정보와 공개 자료를 확인하는 페이지예요.`,
    introduction,
    topics,
  };
}
