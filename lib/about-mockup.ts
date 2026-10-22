/**
 * /about uses the operator's name with permission (2026-10-11).
 * Numbers, jobs, dates and stories are demonstration fixtures, NOT Fervorlab
 * company facts. Every scene labels them as 시연용 예시 데이터. They must never
 * enter the company registry, research store, graph or real service counts.
 * Pure: no data files or I/O; example dates follow `now`.
 */
import type { HeadcountTimeline } from "./headcount-timeline";
import type { Hiring, ResearchFact } from "./research";
import type { ResolvedTime } from "./time-axis";

export const EXAMPLE_COMPANY = { id: "example", name: "펠보르랩", color: "#f2f2fd" } as const;
/** Pension subscribers, oldest first: gentle growth with small dips, not a straight line. */
export const EXAMPLE_HEADCOUNT = [372, 375, 379, 377, 384, 389, 393, 391, 398, 404, 411, 418] as const;

export type MockupFact = { fact: ResearchFact; time: ResolvedTime; sources: { id: string; publisher: string; publishedOn: string | null }[] };
export type MockupJob = { title: string; experience: string; role: string; place: string };
export type AboutMockup = {
  identity: { id: string; name: string; color: string };
  basics: { label: string; value: string }[];
  timeline: HeadcountTimeline;
  facts: MockupFact[];
  hiring: Hiring;
  jobs: MockupJob[];
  /** Chip counts in the lens. */
  sources: number;
  dart: boolean;
  /** Narrative examples, never published research or personal recommendations. */
  story: {
    business: string;
    team: { principle: string; context: string };
    connections: { company: string; question: string; reason: string }[];
  };
};

const pad = (value: number) => String(value).padStart(2, "0");
/** The KST calendar date of `now`, as [year, month (1–12), day]. */
function kstDate(now: Date): [number, number, number] {
  const kst = new Date(now.getTime() + 9 * 3_600_000);
  return [kst.getUTCFullYear(), kst.getUTCMonth() + 1, kst.getUTCDate()];
}
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

function time(partial: Partial<ResolvedTime> & Pick<ResolvedTime, "kind" | "origin">): ResolvedTime {
  return { occurredOn: null, asOf: null, validFrom: null, validTo: null, publishedOn: null, checkedOn: null,
    supersedes: [], supersededBy: [], sortKey: null, placeOn: null, placeBasis: null, ...partial };
}

export function aboutMockup(now: Date = new Date()): AboutMockup {
  const [year, month, day] = kstDate(now);
  // Twelve months ending the month before `now` (the pension registry lags about a month).
  const months = EXAMPLE_HEADCOUNT.map((value, i) => {
    const index = year * 12 + (month - 1) - EXAMPLE_HEADCOUNT.length + i;
    return { month: `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`, value };
  });
  // The latest annual report already filed (late March), and a blog post 18 days ago.
  const reportYear = month > 3 || (month === 3 && day >= 28) ? year - 1 : year - 2;
  const filedOn = `${reportYear + 1}-03-28`;
  const postedOn = isoDay(new Date(Date.UTC(year, month - 1, day) - 18 * 86_400_000));
  const facts: MockupFact[] = [
    {
      fact: { id: "example-report", kind: "milestone", text: `${reportYear}년 사업보고서 기준 매출은 486억원, 영업이익은 41억원이에요.`, referenceOn: `${reportYear}-12`, evidenceIds: ["example-dart"] },
      time: time({ kind: "state", origin: "stored", asOf: `${reportYear}-12`, publishedOn: filedOn, sortKey: `${reportYear}-12`, placeOn: filedOn, placeBasis: "filing" }),
      sources: [{ id: "example-dart", publisher: "DART 사업보고서", publishedOn: filedOn }],
    },
    {
      fact: { id: "example-blog", kind: "milestone", text: "결제 정산 시스템을 새 플랫폼으로 옮겼다고 회사 블로그에 밝혔어요.", referenceOn: postedOn, evidenceIds: ["example-blog"] },
      time: time({ kind: "event", origin: "stored", occurredOn: postedOn, publishedOn: postedOn, sortKey: postedOn, placeOn: postedOn, placeBasis: "occurred" }),
      sources: [{ id: "example-blog", publisher: "회사 블로그", publishedOn: postedOn }],
    },
  ];
  return {
    identity: { ...EXAMPLE_COMPANY },
    basics: [{ label: "설립일", value: "2016년 3월" }, { label: "주요 산업·도메인", value: "결제·정산 솔루션" }],
    timeline: {
      months, first: months[0].month, last: months.at(-1)!.month, observations: [], revised: false,
      events: [], markers: [], lanes: 0, chartedIds: new Set(),
    },
    facts,
    hiring: { status: "ok", jobs: [], currentCount: 14, sources: [] },
    jobs: [
      { title: "백엔드 엔지니어 (결제)", experience: "필수 · 경력 3년 이상", role: "백엔드", place: "판교 · 분당구" },
      { title: "프로덕트 디자이너", experience: "필수 · 경력 5년 이상", role: "디자인", place: "판교 · 분당구" },
    ],
    sources: 12,
    dart: true,
    story: {
      business: "온라인 사업자가 결제를 받고 정산하는 과정을 만드는 회사예요.",
      team: {
        principle: "작은 오류도 끝까지 확인하고, 결정의 이유를 함께 나눠요.",
        context: "팀 블로그에 소개한 협업 방식의 예시예요. 모든 팀의 실제 근무 경험을 뜻하지는 않아요.",
      },
      connections: [
        { company: "예시 회사 A", question: "거래가 늘어나면, 다른 팀은 정산 오류를 어떻게 줄일까요?", reason: "시스템을 바꾼 이유에서, 같은 문제를 해결한 다른 팀의 사례로" },
        { company: "예시 회사 B", question: "이런 정산 시스템을 만드는 사람은 어떤 일을 맡나요?", reason: "문제를 푼 사례에서, 그 일을 맡는 직무와 모집 조건으로" },
      ],
    },
  };
}
