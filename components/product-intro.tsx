import type { CSSProperties, ReactNode } from "react";
import { brand } from "@/lib/brand";
import { EVIDENCE_ORIGIN_DESCRIPTIONS, EVIDENCE_ORIGIN_LABELS } from "@/lib/evidence-origin";
import { ACCESS_METHOD_LABELS, JOB_COLLECTION_ACCESS } from "@/lib/source-access";
import type { GraphLayout } from "@/lib/product-graph";
import { scheduleOf, type ProductStats } from "@/lib/product-intro";
import type { AboutMockup } from "@/lib/about-mockup";
import { RelDate } from "@/components/rel-date";
import { GraphTable, ProductGraph } from "@/components/product-graph";
import { HeroScene } from "@/components/hero-scene";

/**
 * Sections of the /about landing (DESIGN.md 제품 소개, 제품 소개 랜딩 예외).
 * Server components; every number comes from the page's published data and
 * an unreadable one reads 미확인, never 0. Copy follows DESIGN.md 제품 문구
 * 기준: one plain sentence where one is enough.
 */
export const count = (value: number | null, unit: string) => (value === null ? "미확인" : `${value.toLocaleString("ko-KR")}${unit}`);
const delay = (index: number) => ({ "--reveal-delay": `${index * 80}ms` }) as CSSProperties;
/** Jobs cadence in the worker's own words ("6시간마다"), so the copy follows the crontab test. */
const jobsCadence = scheduleOf("jobs").cadence.split(" · ")[0];

/** Line icons for the principles. Decorative: the heading next to each says what it means. */
const ICONS = {
  document: <><path d="M7 3h7l4 4v14H6V3z" /><path d="M14 3v5h4M9 12h6M9 16h6" /></>,
  clock: <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>,
  link: <><path d="M9 15l6-6M8 13l-2 2a3 3 0 0 0 4 4l3-3M11 8l3-3a3 3 0 0 1 4 4l-2 2" /></>,
  block: <><circle cx="12" cy="12" r="8" /><path d="M6.4 6.4l11.2 11.2" /></>,
  cite: <><path d="M5 18c2.5-.5 4-2.5 4-5.5V7H5v5h4" /><path d="M14 18c2.5-.5 4-2.5 4-5.5V7h-4v5h4" /></>,
  gate: <><path d="M12 3.5l7 2.6v5.6c0 4.2-3 7.6-7 8.8-4-1.2-7-4.6-7-8.8V6.1z" /><path d="M9 12.2l2.2 2.2 4-4.4" /></>,
  question: <><circle cx="12" cy="12" r="8" /><path d="M9.6 9.6a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.6" /><path d="M12 16.8v.2" /></>,
} as const;
export type IconName = keyof typeof ICONS;
export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="about-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.75"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {ICONS[name]}
    </svg>
  );
}

/** Glass illustrations in public/about (DESIGN.md 제품 소개 랜딩 예외). Decorative and loaded lazily below the fold. */
export const ART = { building: 512, bars: 320, docs: 320, collect: 320, shield: 320, browser: 320, nodes: 320 } as const;
export type ArtName = keyof typeof ART;
export function Art({ name, className }: { name: ArtName; className: string }) {
  return <img className={className} src={`/about/${name}.webp`} width={ART[name]} height={ART[name]} alt="" aria-hidden="true" loading="lazy" decoding="async" />;
}

function SectionHead({ id, title, children, align = "start", art }: {
  id: string; title: string; children?: ReactNode; align?: "start" | "center"; art?: ArtName;
}) {
  return (
    <header className={`about-section-head${align === "center" ? " is-center" : ""}${art ? " has-art" : ""}`} data-reveal="">
      {art && <Art name={art} className="about-section-art" />}
      <h2 id={id}>{title}</h2>
      {children && <p className="about-section-lead">{children}</p>}
    </header>
  );
}

function Actions({ tone }: { tone: "band" | "light" }) {
  return (
    <div className={`about-actions is-${tone}`}>
      <a className="about-button is-primary" href="/companies">회사 둘러보기</a>
      <a className="about-button is-secondary" href="/jobs">채용 공고 보기</a>
    </div>
  );
}

const lastCheck = (stats: ProductStats) =>
  stats.checkedAt ? <>마지막 공고 확인 <RelDate value={stats.checkedAt} /></> : "마지막 공고 확인 미확인";

/** The two hero lines, one sentence each. */
export const HERO_LINES = [
  "커브홉에서 서울·판교 회사의 사업과 팀을 알아보세요.",
  "공개된 인재상과 투자 이력을 공고와 함께 살펴봐요.",
] as const;

export function AboutHero({ mockup }: { mockup: AboutMockup }) {
  const headline = brand.tagline.match(/^(.+,) (.+)$/);
  return (
    <header className="about-hero about-band">
      <div className="about-inner about-hero-grid">
        <div className="about-hero-copy">
          {/* The brand line; its second phrase never breaks inside, so the headline reads in its two halves. */}
          <h1>{headline ? <>{headline[1]} <span className="about-keep">{headline[2]}</span></> : brand.tagline}</h1>
          <p className="about-hero-lead">{HERO_LINES.map((line, i) => <span key={line}>{i > 0 && " "}{line}</span>)}</p>
          <Actions tone="band" />
        </div>
        <div className="about-hero-visual">
          <HeroScene mockup={mockup} />
        </div>
      </div>
    </header>
  );
}

export const VALUE_PROPS = [
  { art: "bars", title: "규모와 추이", text: "국민연금 가입자 수는 달마다, DART 재무는 해마다 보여줘요." },
  { art: "docs", title: "출처가 붙은 리서치", text: "회사가 밝힌 방향과 사업 변화를 출처와 함께 정리해요." },
  { art: "building", title: "회사 원문 공고", text: `회사 채용 사이트에서 ${jobsCadence} 가져와요.` },
] as const satisfies readonly { art: ArtName; title: string; text: string }[];

export function ValueProps({ stats }: { stats: ProductStats }) {
  const proof = [
    `국민연금 월별 기록 ${count(stats.pensionObservations, "개")}`,
    `인용한 자료 ${count(stats.evidence, "개")}`,
    `공고 수집 경로 ${count(stats.sources, "곳")}`,
  ];
  return (
    <section className="about-section about-values" aria-labelledby="about-values">
      <div className="about-inner">
        <SectionHead id="about-values" title="공고만으로는 알기 어려운 것" />
        <ul className="about-cards">
          {VALUE_PROPS.map((item, index) => (
            <li key={item.title} className="about-card" data-reveal="" style={delay(index)}>
              <Art name={item.art} className="about-card-art" />
              <h3>{item.title}</h3>
              <p className="about-card-text">{item.text}</p>
              <p className="about-card-proof">{proof[index]}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function NumbersBand({ stats }: { stats: ProductStats }) {
  const items: { label: string; value: string; note?: ReactNode }[] = [
    { label: "공고가 있는 회사", value: count(stats.companiesWithJobs, "곳"),
      note: stats.sources === null ? undefined : `등록된 공고 수집 경로 ${count(stats.sources, "곳")} · 직접 검토 ${stats.reviewedSources} · 자동 등록 ${stats.discoveredSources}` },
    { label: "서울·판교 공고", value: count(stats.postings, "건"), note: lastCheck(stats) },
    { label: "리서치한 회사", value: count(stats.researchCompanies, "곳"),
      note: stats.evidence === null ? undefined : `현재 설명에 인용한 자료 ${stats.evidence.toLocaleString("ko-KR")}개` },
    { label: "출처가 붙은 기록", value: count(stats.records, "개"),
      note: stats.pensionObservations === null ? undefined : `국민연금 월별 기록 ${stats.pensionObservations.toLocaleString("ko-KR")}개 포함` },
  ];
  return (
    <section className="about-section about-numbers" aria-labelledby="about-numbers">
      <div className="about-inner">
        <SectionHead id="about-numbers" title="지금 사이트에 있는 자료" />
        <dl className="about-stats" data-reveal="">
          {items.map((item) => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              <dd>
                <span className={item.value === "미확인" ? "about-stat-value is-unknown" : "about-stat-value"}>{item.value}</span>
                {item.note && <span className="about-stat-note">{item.note}</span>}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

export const STEPS = [
  { art: "collect", title: "매일 자동 수집", text: `공고는 ${jobsCadence}, 국민연금은 매일, DART는 7일마다 확인해요.` },
  { art: "shield", title: "검증한 변경만 반영", text: "기록을 다시 계산하고 원문과 대조한 변경만 올려요." },
  { art: "browser", title: "사이트 · 위키", text: "통과한 변경은 자동으로 배포하고 내부 위키도 다시 만들어요." },
] as const satisfies readonly { art: ArtName; title: string; text: string }[];

export function HowItWorks() {
  return (
    <section className="about-section about-how" aria-labelledby="about-architecture">
      <div className="about-inner">
        <SectionHead id="about-architecture" title="자료는 어떻게 사이트에 오나요?" />
        <ol className="about-steps">
          {STEPS.map((step, index) => (
            <li key={step.title} className="about-step" data-reveal="" style={delay(index)}>
              <div className="about-step-top">
                <Art name={step.art} className="about-step-art" />
                <span className="about-step-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              </div>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
        <details className="about-details" data-reveal="">
          <summary>자세히 보기 <span>원천 · 작업 주기 · 자동 검사</span></summary>
          <ArchitectureDiagram />
        </details>
      </div>
    </section>
  );
}

/**
 * Evidence counts describe the published explanations; collection paths describe
 * how postings arrive (#73: research is separate from the job collectors). Two
 * groups, never one source ratio. Continues the numbers section.
 */
export function SourceOverview({ stats }: { stats: ProductStats }) {
  return (
    <section className="about-section about-sources" aria-labelledby="about-sources">
      <div className="about-inner">
        <SectionHead id="about-sources" title="회사를 이해하는 자료와 공고를 가져오는 경로">
          회사 설명에 인용한 자료와 공고를 가져오는 경로는 서로 다른 연결이에요.
        </SectionHead>
        <div className="source-overview source-overview-columns" data-reveal="">
          <div className="source-card">
            <h3>회사 설명에 참고한 자료</h3>
            <p className="source-card-lead">회사 설명과 읽을거리에 실제로 인용한 자료예요.</p>
            <dl className="source-rows">{stats.evidenceOrigins.map((row) => (
              <div key={row.origin}>
                <dt>{EVIDENCE_ORIGIN_LABELS[row.origin]}</dt>
                <dd>{row.records.toLocaleString("ko-KR")}개 자료 · {row.companies}개 회사</dd>
              </div>
            ))}</dl>
            <details className="source-details">
              <summary>자료의 범위와 기준</summary>
              <p>한 회사가 여러 유형에 들 수 있어요.</p>
              <ul>{stats.evidenceOrigins.map(row => <li key={row.origin}><strong>{EVIDENCE_ORIGIN_LABELS[row.origin]}</strong><span>{EVIDENCE_ORIGIN_DESCRIPTIONS[row.origin]}</span></li>)}</ul>
            </details>
          </div>
          <div className="source-card">
            <h3>공고를 가져오는 경로</h3>
            <p className="source-card-lead">기업의 공식 채용 홈페이지와 그 홈페이지에 쓰이는 채용 시스템이에요.</p>
            <dl className="source-rows">{stats.collectors.map((row) => {
              const access = JOB_COLLECTION_ACCESS[row.provider];
              return (
                <div key={row.provider}>
                  <dt>{access.label} <span>{row.companies}개 회사</span></dt>
                  <dd>{ACCESS_METHOD_LABELS[access.method]}</dd>
                </div>
              );
            })}</dl>
            <details className="source-details">
              <summary>수집 방식 자세히</summary>
              <p>그리팅은 기업이 채용 홈페이지를 만들고 지원자를 관리하는 서비스예요. 여기서는 각 기업이 그리팅에 직접 올린 공식 공고를 읽어요. 원티드·잡코리아 같은 공고 모음 서비스에서 재수집하는 것과 구분해요. 여기 표시한 회사 수는 회사 자료의 출처 비율을 뜻하지 않아요.</p>
              <ul>{stats.collectors.map(row => <li key={row.provider}><strong>{JOB_COLLECTION_ACCESS[row.provider].label}</strong><span>{JOB_COLLECTION_ACCESS[row.provider].description}</span></li>)}</ul>
            </details>
          </div>
        </div>
      </div>
    </section>
  );
}

export function GraphSection({ layout }: { layout: GraphLayout }) {
  const of = (kind: string) => layout.nodes.filter((node) => node.kind === kind).length;
  const sources = of("official") + of("origin");
  return (
    <section className="about-section about-graph" aria-labelledby="about-graph">
      <div className="about-inner">
        <SectionHead id="about-graph" title="어떤 자료가 서로 이어져 있나요?" art="nodes">
          회사를 고르면 설명에 참고한 자료와 공고를 가져오는 경로가 따로 보여요.
        </SectionHead>
        <p id="about-graph-title" className="visually-hidden">회사와 자료의 연결 그림</p>
        <p id="about-graph-desc" className="about-graph-counts">
          {[`회사 ${of("company")}곳`, `회사 자료 연결 ${sources}종류`, `공고 수집 경로 ${of("system")}종류`, `업종 범위 ${of("scope")}개`,
            ...(of("subsidiary") > 0 ? [`종속기업 ${of("subsidiary")}곳`] : []), `연결 ${layout.edges.length}개`].join(" · ")}
        </p>
        <div className="about-graph-panel">
          <ProductGraph layout={layout} titleId="about-graph-title" descId="about-graph-desc" />
          <p className="about-graph-limit">
            업종 범위는 자동 등록한 회사에만 있어요. 금융위원회·공정거래위원회 자료로 확인한 등록 정보는 이 그림의 인용 수에 포함하지 않아요.
          </p>
          <GraphTable layout={layout} />
        </div>
      </div>
    </section>
  );
}

type Item = { name: string; text: string; cadence?: string };
type Stage = { title: string; summary: string; groups: { label?: string; items: Item[] }[] };

export const PIPELINE: readonly Stage[] = [
  {
    title: "원천",
    summary: "공공 자료, 회사 공고 원문, 회사 공식 자료와 언론 보도를 써요. 채용 플랫폼은 쓰지 않아요.",
    groups: [
      { label: "공공 자료", items: [
        { name: "국민연금공단", text: "사업장 가입자 수(월별)", cadence: "하루 한 번" },
        { name: "금융감독원 DART", text: "연간 재무제표, 주요사항보고서, 종속기업 지분 변화", cadence: "7일에 한 번" },
        { name: "금융위원회 · 공정거래위원회", text: "새 채용 원천을 등록할 때 법인과 홈페이지를 확인해요." },
      ] },
      { label: "회사 채용 시스템", items: [
        { name: "그리팅 · Greenhouse · Lever · Workday", text: "회사가 올린 공고 원문" },
      ] },
      { label: "회사 공식 자료 · 언론 보도", items: [
        { name: "리서치가 여는 원문", text: "회사 소개·제품·팀·투자 자료와 기사부터 조사해요. 채용 시스템 연결과 상관없이 조사하고, 원문을 연 자료와 검색 결과만 본 자료를 나눠요." },
      ] },
    ],
  },
  {
    title: "작업 컴퓨터",
    summary: "정해진 시각에 수집·리서치·탐지를 돌리고 원본을 보관해요.",
    groups: [{ items: [
      { name: scheduleOf("jobs").title, text: "끝나면 국민연금·DART 갱신 차례인지 보고 이어서 돌려요.", cadence: scheduleOf("jobs").cadence },
      { name: scheduleOf("research").title, text: "조사와 독립 검토를 한 번씩 해요.", cadence: scheduleOf("research").cadence },
      { name: scheduleOf("discover").title, text: "국민연금 사업장 목록에서 회사를 찾고 법인·홈페이지·채용 경로 확인 기록을 남겨요.", cadence: scheduleOf("discover").cadence },
      { name: scheduleOf("watchdog").title, text: "원본 보관이 늦어지면 알리고, 코드가 바뀌면 발행을 한 번 더 해요.", cadence: scheduleOf("watchdog").cadence },
    ] }],
  },
  {
    title: "자동 검사",
    summary: "검사를 모두 통과한 변경만 다음 단계로 가요.",
    groups: [{ items: [
      { name: "반영 기록 다시 계산", text: "국민연금·DART·리서치 반영 기록을 다시 계산해 똑같이 나와야 해요." },
      { name: "원문 대조", text: "민감한 주장은 원문과 대조하고, 공식 출처 1건이나 다른 매체 2곳이 있어야 실어요." },
      { name: "채용 플랫폼 차단", text: "원티드·잡코리아·사람인·잡플래닛 등은 가져오지도, 근거로 쓰지도 않아요." },
      { name: "robots.txt 확인", text: "공개 페이지의 수집 지침을 확인해요. 공개 접근이나 robots.txt 허용을 제휴·재이용 허가로 보지 않아요." },
      { name: "공고 수 확인", text: "공고가 30% 넘게 줄거나, 20건 이상인 출처가 80% 넘게 줄면 보류해요." },
      { name: "검증", text: "사이트 코드가 제대로 돌아가는지, 공고가 회사 화면에 이어지는지 자동으로 확인해요." },
    ] }],
  },
  {
    title: "위키 · 사이트",
    summary: "통과한 자료로 근거 색인과 화면을 다시 만들어요.",
    groups: [{ items: [
      { name: "위키", text: "회사별 문서와 검색 색인을 다시 만들어요. 사이트에는 싣지 않아요." },
      { name: "사이트", text: "검사를 통과한 변경을 그대로 사이트에 자동으로 반영해요. 검사 뒤에 달라진 변경은 보류하고 알려요.", cadence: `${scheduleOf("publish").cadence} 발행` },
    ] }],
  },
];

/** The detailed pipeline: sources → mini PC worker (작업 컴퓨터) → proof gates (자동 검사) → wiki · site, with the worker's real schedule. */
export function ArchitectureDiagram() {
  return (
    <ol className="pipeline">
      {PIPELINE.map((stage, index) => (
        <li key={stage.title} className="pipeline-stage">
          <p className="pipeline-step" aria-hidden="true">{String(index + 1).padStart(2, "0")}</p>
          <h3>{stage.title}</h3>
          <p className="pipeline-summary">{stage.summary}</p>
          {stage.groups.map((group, groupIndex) => (
            <div key={group.label ?? groupIndex} className="pipeline-group">
              {group.label && <p className="pipeline-group-label">{group.label}</p>}
              <ul>
                {group.items.map((item) => (
                  <li key={item.name}>
                    <span className="pipeline-item-name">{item.name}</span>
                    {item.cadence && <span className="pipeline-cadence">{item.cadence}</span>}
                    <span className="pipeline-item-text">{item.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </li>
      ))}
    </ol>
  );
}

export const PRINCIPLES = [
  { icon: "document", title: "회사가 올린 공고", text: "기업의 공식 채용 페이지에서 모집 조건을 확인해요." },
  { icon: "clock", title: "숫자 옆에 기준 시점", text: "인원과 실적이 언제의 정보인지 함께 보여줘요." },
  { icon: "cite", title: "사실과 해석을 구분", text: "회사의 발표와 자료를 읽은 해석을 나눠 보여줘요." },
  { icon: "link", title: "필요할 때 원문까지", text: "더 확인하고 싶은 내용은 연결된 출처에서 살펴봐요." },
] as const satisfies readonly { icon: IconName; title: string; text: string }[];

export function Principles() {
  return (
    <section className="about-section about-principles" aria-labelledby="about-principles">
      <div className="about-inner">
        <SectionHead id="about-principles" title="지원 판단에 필요한 맥락까지." />
        <ul className="principles">
          {PRINCIPLES.map((item, index) => (
            <li key={item.title} data-reveal="" style={delay(index)}>
              <span className="about-principle-icon"><Icon name={item.icon} /></span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function FinalCta({ stats }: { stats: ProductStats }) {
  const known = stats.companiesWithJobs !== null && stats.postings !== null;
  return (
    <section className="about-cta about-band" aria-labelledby="about-cta">
      <div className="about-inner about-cta-inner" data-reveal="">
        <h2 id="about-cta">관심 있는 회사부터 열어 보세요</h2>
        <p className="about-cta-lead">
          {known ? `공고가 있는 회사 ${count(stats.companiesWithJobs, "곳")}, 서울·판교 공고 ${count(stats.postings, "건")}. ` : ""}가입은 필요 없어요.
        </p>
        <Actions tone="band" />
      </div>
    </section>
  );
}
