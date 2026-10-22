import { Fragment, type ReactNode } from "react";
import type { ResearchFact } from "@/lib/research";
import type { ResolvedTime } from "@/lib/time-axis";
import { RelDate } from "@/components/rel-date";
import { absoluteDate } from "@/lib/relative-date";

/** "2023년 1월", "2023년", "2023년 1월 5일": a span end as a screen reader says it. */
function spokenDate(value: string): string {
  const [y, m, d] = value.split("-");
  return [`${y}년`, ...(m ? [`${Number(m)}월`] : []), ...(d ? [`${Number(d)}일`] : [])].join(" ");
}

/** A stated span in point dates only ("2023.01~2024.12"); its age would repeat the dates. */
export function Period({ from, to }: { from: string; to: string }) {
  return (
    <span role="group" aria-label={`${spokenDate(from)}부터 ${spokenDate(to)}까지`}>
      <time dateTime={from}>{absoluteDate(from)}</time>~<time dateTime={to}>{absoluteDate(to)}</time>
    </span>
  );
}

/** The one time role of a fact, as fragments of the meta line (spec: DESIGN.md '시간 축'). */
function roleParts(fact: Pick<ResearchFact, "kind" | "referenceOn">, time: ResolvedTime | undefined, now: Date | undefined): ReactNode[] {
  const dated = (label: string, value: string) => <>{label} <RelDate value={value} now={now} /></>;
  if (!time || time.kind === "unclassified")
    return fact.referenceOn ? [dated(fact.kind === "funding" ? "발표 맥락" : "기준", fact.referenceOn)] : ["소개 자료", "기준일 미확인"];
  if (time.kind === "timeless") return ["소개 자료"];
  if (time.kind === "composite") return ["날짜는 본문에"];
  if (time.kind === "event") {
    if (time.occurredOn === null) return ["날짜 미확인"];
    return [dated(time.origin === "dart-event" ? "공시" : fact.kind === "funding" ? "발표 맥락" : "날짜", time.occurredOn)];
  }
  // A state: its span when the source states both ends, else its one point.
  if (time.validFrom && time.validTo) return [<Period key="period" from={time.validFrom} to={time.validTo} />];
  if (time.asOf) return [dated("기준", time.asOf)];
  if (time.validFrom) return [dated("시작", time.validFrom)];
  if (time.validTo) return [dated("끝", time.validTo)];
  return ["기준일 미확인"];
}

/**
 * The fact list's time meta: what the fact's date means, and nothing else
 * (publication and check dates stay with the citations on the same line). A
 * state that a later record replaced links to that record, only when the list
 * actually draws it; a retracted or hidden successor is not named. The old
 * fact is never dimmed. Each '·' fragment stays on one line.
 */
export function FactTimeMeta({ fact, time, rendered, now }: {
  fact: Pick<ResearchFact, "kind" | "referenceOn">;
  /** `resolveFactTimes` of the whole company for this fact. */
  time: ResolvedTime | undefined;
  /** Facts the list draws, in list order, by ID → the title shown for them (the link's accessible name). */
  rendered: ReadonlyMap<string, string>;
  now?: Date;
}) {
  const parts = roleParts(fact, time, now);
  const successors = time?.kind === "state" ? time.supersededBy.filter(id => rendered.has(id)) : [];
  if (successors.length) {
    const ordered = [...rendered.keys()].filter(id => successors.includes(id)), first = ordered[0], title = rendered.get(first)!;
    parts.push(
      <a href={`#fact-${first}`} aria-label={ordered.length > 1 ? `후속 기록 ${ordered.length}개 중 첫 기록: ${title}` : `후속 기록: ${title}`}>
        {ordered.length > 1 ? `후속 기록 ${ordered.length}개` : "후속 기록"}
      </a>,
    );
  }
  return (
    <span className="fact-time">
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && " "}
          <span className="fact-time-part">{i > 0 && "· "}{part}</span>
        </Fragment>
      ))}
    </span>
  );
}
