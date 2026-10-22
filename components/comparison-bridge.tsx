import Link from "@/components/navigation-link";
import { isSameProblem, sameProblemInvitation, type NextReading, type Reading, type StoryComparison } from "@/lib/reading";
import type { Evidence } from "@/lib/research";
import { CompanyMark, ContextLink, ReadingCard, keepDates } from "@/components/reading-view";
import { RelDate } from "./rel-date";

export type StoryBridge = { reading: Reading; comparison: StoryComparison };

/** One entry of "이어서 궁금할 이야기": the reserved same-problem comparison, or the usual reading card. */
export function NextReadingItem({ current, item, from, origin }: {
  current: Reading; item: NextReading; from: string; origin: string;
}) {
  return item.reserved && isSameProblem(item.comparison)
    ? <ComparisonBridge current={current} bridge={{ reading: item.reading, comparison: item.comparison }} from={from} origin={origin} placement="sidebar" />
    : <ReadingCard reading={item.reading} from={from} origin={origin} reason={item.reason} compact />;
}

/**
 * A comparison between the current reading and a reading of another company.
 * A same-problem comparison (problem + limit) opens with the invitation
 * "같은 문제를 ○○은 어떻게 풀고 있을까요?", then the problem, the common
 * point, the difference and the limit in full, and the cited sources of both
 * sides. Inline it sits in the story body; in the sidebar it replaces the
 * reading card of a reading without a story bridge.
 */
export function ComparisonBridge({ current, bridge, from, origin, placement }: {
  current: Reading; bridge: StoryBridge; from: string; origin: string; placement: "inline" | "sidebar";
}) {
  const { reading: target, comparison } = bridge;
  const destination = `/read/${target.id}?${new URLSearchParams({ from, origin })}`;
  const Heading = placement === "inline" ? "h2" : "h3";
  if (!isSameProblem(comparison)) return <section className="story-bridge" aria-label="이 이야기와 연결되는 회사">
    <p className="reading-kicker">이 관심사로 다른 회사까지</p>
    <div className="bridge-company"><CompanyMark companyId={target.companyId} name={target.companyName} color={target.companyColor}/><Heading>{target.companyName}도 함께 읽어볼까요?</Heading></div>
    <dl><div><dt>닮은 점</dt><dd>{comparison.common}</dd></div><div><dt>다른 점</dt><dd>{comparison.difference}</dd></div></dl>
    <p className="bridge-basis">공개 자료를 비교한 해석 · 실제 조직문화의 일치나 지원 적합도 평가는 아니에요.</p>
    <div className="bridge-evidence">
      {comparison.evidenceIds.from.map((id,i)=><a key={id} href={`#reading-source-${id}`}>{current.companyName} 참고 자료 {i+1}</a>)}
      {comparison.evidenceIds.to.map((id,i)=><ContextLink key={id} href={`${destination}#reading-source-${id}`}>{target.companyName} 참고 자료 {i+1}</ContextLink>)}
    </div>
    <Link data-analytics="content_select" data-destination-type="reading" data-destination-id={target.id} data-destination-company-id={target.companyId} data-placement="bridge" className="bridge-destination" href={destination}>{target.question}</Link>
  </section>;
  const sides = [
    { side: "from", reading: current, ids: comparison.evidenceIds.from, href: (id: string) => `#reading-source-${id}` },
    { side: "to", reading: target, ids: comparison.evidenceIds.to, href: (id: string) => `${destination}#reading-source-${id}` },
  ];
  const headingId = `same-problem-${placement}-${target.id}`;
  return <section className="story-bridge same-problem" aria-labelledby={headingId}>
    <p className="reading-kicker">이 관심사로 다른 회사까지</p>
    <div className="bridge-company"><CompanyMark companyId={target.companyId} name={target.companyName} color={target.companyColor}/><Heading id={headingId}>{sameProblemInvitation(target.companyName)}</Heading></div>
    <p className="bridge-problem">{keepDates(comparison.problem)}</p>
    <dl>
      <div><dt>닮은 점</dt><dd>{keepDates(comparison.common)}</dd></div>
      <div><dt>다른 점</dt><dd>{keepDates(comparison.difference)}</dd></div>
      <div><dt>함께 알아둘 점</dt><dd>{keepDates(comparison.limit)}</dd></div>
    </dl>
    <p className="bridge-basis">두 회사의 공개 자료를 나란히 읽은 해석 · 해결 방식의 우열이나 지원 적합도 평가는 아니에요.</p>
    <div className="bridge-sources">
      {sides.map(({ side, reading, ids, href }) => <div className="bridge-source-side" key={side}>
        <p className="bridge-source-company">{reading.companyName} 자료</p>
        <div className="story-citations">
          {ids.map(id => {
            const e = reading.evidence.find(item => item.id === id);
            return e ? <SourceCitation key={id} evidence={e} href={href(id)} /> : null;
          })}
        </div>
      </div>)}
    </div>
    <Link data-analytics="content_select" data-destination-type="reading" data-destination-id={target.id} data-destination-company-id={target.companyId} data-placement="bridge" className="bridge-destination" href={destination}>{target.question}</Link>
  </section>;
}

/**
 * The story citation pattern: publisher as the link, the publication date after it in plain text.
 * Both hrefs carry a fragment, so a native anchor keeps the exact URL (see ContextLink).
 */
function SourceCitation({ evidence, href }: { evidence: Evidence; href: string }) {
  return <span className="story-citation">
    <a href={href} aria-label={`${evidence.publisher} 자료로 이동`}>{evidence.publisher}</a>
    {" · "}{evidence.publishedOn ? <>게시 <RelDate value={evidence.publishedOn} /></> : "게시일 미확인"}
  </span>;
}
