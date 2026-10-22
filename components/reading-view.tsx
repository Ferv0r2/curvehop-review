import { publicResearchCaveat } from "@/lib/research-public-copy";
import type { ReactNode } from "react";
import Link from "@/components/navigation-link";
import { readingCheckedOn, readingTopics, type Reading } from "@/lib/reading";
import { cardSummary } from "@/lib/card-summary";

import { CompanyMark } from "./company-mark";
import { RelDate } from "./rel-date";
import { dotDates, relativeAge } from "@/lib/relative-date";
import type { ContentChange } from "@/lib/reading-changes";
export { CompanyMark } from "./company-mark";

/** ISO dates in prose read as dotted dates (2026.10.01), which never split across lines. */
export const keepDates = dotDates;

/** "자료 확인" date, defined in lib/reading.ts so scripts share it (scripts/content-metrics.ts). */
export { readingCheckedOn };

/**
 * A reading's limitation led by when its sources were confirmed, so a past
 * research note ("조사 때 접속에 실패해 …") is not read as the live job
 * collection status beside it.
 */
export function DatedLimitation({ reading, className }: { reading: Reading; className?: string }) {
  const on = readingCheckedOn(reading);
  return (
    <p className={className}>
      {on && <span className="research-asof">자료 확인 <RelDate value={on} /></span>}
      {dotDates(publicResearchCaveat(reading.limitation))}
    </p>
  );
}

export function ReadingCard({
  reading,
  from,
  reason,
  compact = false,
  origin = from,
  withinCompany = false,
  contentChange,
  deliveryContentHash,
  discovery = false,
}: {
  reading: Reading;
  from: string;
  reason?: string;
  compact?: boolean;
  origin?: string;
  /** On the company's own page the logo and name would repeat on every card. */
  withinCompany?: boolean;
  /** Proven content reflection time, distinct from source publication/retrieval. */
  contentChange?: ContentChange;
  deliveryContentHash?: string;
  /** Discovery leads with the question; source detail remains in the article. */
  discovery?: boolean;
}) {
  return (
    <Link
      data-analytics="content_select" data-destination-type="reading" data-destination-id={reading.id} data-destination-company-id={reading.companyId} data-placement="card"
      data-reading-recent={contentChange ? reading.id : undefined}
      data-reading-content={deliveryContentHash}
      className={`story-card${compact ? " compact" : ""}`}
      aria-labelledby={withinCompany ? `q-${reading.id}` : undefined}
      href={`/read/${reading.id}?${new URLSearchParams({ from, origin })}`}
    >
      {withinCompany ? (
        <span className="story-topic">{readingTopics[reading.topic]}</span>
      ) : (
        <div className="story-company">
          <CompanyMark companyId={reading.companyId} name={reading.companyName} color={reading.companyColor} />
          <span>{reading.companyName}</span>
          <span className="story-topic">{readingTopics[reading.topic]}</span>
        </div>
      )}
      {reason && <p className="story-reason">{reason}</p>}
      <h3 id={withinCompany ? `q-${reading.id}` : undefined}>{reading.question}</h3>
      {withinCompany ? (
        <>
          {/* A short answer written from the reading's own answer (the whole
              answer if the summary is stale), and the whole limitation. */}
          <p className="story-answer">{keepDates(cardSummary(reading.id, reading.answer) ?? reading.answer)}</p>
          {reading.limitation && <DatedLimitation reading={reading} className="story-limit" />}
        </>
      ) : (
        !compact && <p className="story-preview">{reading.preview}</p>
      )}
      {contentChange && !discovery && <p className="story-content-change">
        <span>{contentChange.kind === "added" ? "새로 담음" : "내용 수정"}</span>
        <span>내용 반영 <RelDate value={contentChange.recordedAt} /></span>
      </p>}
      {discovery && contentChange && <p className="story-discovery-date">
        {contentChange.kind === "added" ? "새로 담은 글" : "수정한 글"} <RelDate value={contentChange.recordedAt} />
      </p>}
      {!withinCompany && !discovery && <div className="story-tail">
        <span>
          {compact
            ? "이야기 읽기"
            : `참고 자료 ${reading.evidence.length}개 · 자료 확인 ${relativeAge(reading.evidence
                .map((e) => e.checkedOn)
                .sort()
                .at(-1)!) ?? ""}`}
        </span>
      </div>}
    </Link>
  );
}

// Next 16.3.7 can append a cached fragment twice on an anchored return.
// Native navigation keeps the exact URL and opens details containing the target.
export function ContextLink({
  href,
  className,
  children,
  restore = false,
}: {
  restore?: boolean;
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return href.includes("#") ? (
    <a href={href} className={className} data-restore-scroll={restore ? "" : undefined}>
      {children}
    </a>
  ) : (
    <Link href={href} className={className} data-restore-scroll={restore ? "" : undefined}>
      {children}
    </Link>
  );
}
