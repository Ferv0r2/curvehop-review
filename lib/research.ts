import { validPublicDataIdentity, type PublicDataIdentity } from "./public-data-identity";
import { contentChangeShape, type ContentChange } from "./reading-changes";
import { validateQuestionKnowledge } from "./knowledge-revisions";
import { validReadingConnections } from "./reading-connections";
import { validCompanyIcon } from "./company-icon";
import { isFrozenData } from "./immutable-data";
import { providers, roleLabels, prepareJob, type Job } from "./jobs";
import { classifyRole } from "./roles";
import type { Snapshot } from "./store";
import { isVacancy } from "./eligibility";
import { sourceKey, sources as configuredSources } from "./sources";

import { companies, type Identity } from "./companies";
import { notOwnPosting, postingCompanyOf, UNCONFIRMED_COMPANY } from "./posting-company";
import { validateFactTime, validateSupersedes, type FactTime } from "./time-axis";
export { researchRoster, type Identity } from "./companies";
export type Evidence = {
  id: string;
  title: string;
  url: string;
  publisher: string;
  kind: "official" | "press" | "repost";
  access: "page" | "search-index";
  publishedOn: string | null;
  checkedOn: string;
  excerpt: string;
};
/** A source-stated size label, not a comparable numeric headcount observation. */
export type CompanyScale = {
  value: string;
  scope: "legal-entity" | "domestic" | "global" | "group" | "unspecified";
  /** Actual count reference date, never inferred from retrieval/publication date. */
  asOf: string | null;
};
/**
 * Evidence, facts and headcount observations a company may hold. Official collection adds to them
 * every month (pension observations, DART filings), so the limit is set for years, not one research run.
 */
export const MAX_COMPANY_RECORDS = 500;
/** Admission headroom; the research store's byte cap and daily call budget still apply. */
export const MAX_RESEARCH_COMPANIES = 200;
export const companyScaleScopeLabels: Record<CompanyScale["scope"], string> = {
  "legal-entity": "해당 법인", domestic: "국내 조직", global: "글로벌 전체", group: "그룹 전체", unspecified: "범위 미표기",
};
export type ResearchFact = {
  id: string;
  kind: "context" | "milestone" | "funding";
  text: string;
  referenceOn: string | null;
  evidenceIds: string[];
  amountKrw?: number;
  round?: string;
  scale?: CompanyScale;
  /** What the fact's date means (lib/time-axis.ts). A person's fact only; collectors never write it. */
  time?: FactTime;
};
export type Headcount = {
  id: string;
  entityId: string;
  scope: "legal-entity" | "domestic" | "consolidated";
  measurement: "reported-headcount" | "pension-subscribers";
  unit: "people";
  value: number;
  approximate: boolean;
  referenceOn: string;
  referenceBasis: "observation" | "publication";
  evidenceIds: string[];
};
export type StorySection = {
  id: string;
  title: string;
  text: string;
  kind: "company-statement" | "team-account" | "context";
  evidenceIds: string[];
};
export type CompanyResearch = {
  publicDataIdentity?: PublicDataIdentity;
  readingConnections?: import("./reading-connections").ReadingConnections;
  /** Script-owned registration provenance; never accepted from a model draft. */
  onboarding?: { version: 1 | 2; discoveryReceiptHash: string; derivedBusiness?: { summary: string; domainHash: string } };
  icon?: import("./company-icon").CompanyIcon;
  questionAssessment?: import("./question-assessment").StoredAssessment;
  knowledgeRevisions?: import("./knowledge-revisions").KnowledgeRevision[];
  id: string;
  summary: string;
  /** Ownership recorded by the runner, never accepted from model output. */
  pipeline?: { evidenceIds: string[]; factIds: string[]; guideIds: string[] };
  identityEvidence: string[];
  evidence: Evidence[];
  facts: ResearchFact[];
  headcount: Headcount[];
  guides?: {
    id: string;
    dependsOnFactIds?: string[];
    contentChange?: ContentChange;
    question: string;
    answer: string;
    limitation: string;
    evidenceIds: string[];
    sections?: StorySection[];
    publication?: { topic: "vision" | "culture" | "work" | "process" | "business"; preview: string; relatedIds: string[] };
  }[];
  gaps: {
    field: "headcount" | "trend" | "salary" | "news" | "funding";
    reason: string;
    question: string;
  }[];
};
export type ResearchPack = { version: 1; companies: CompanyResearch[] };
export type Issue = { path: string; message: string };
export type Comparison =
  | { status: "insufficient" | "incomparable" | "conflict" }
  | {
      status: "comparable";
      delta: number;
      percent: number | null;
      from: Headcount;
      to: Headcount;
    };
export type Hiring = {
  status:
    "unconnected" | "unavailable" | "unobserved" | "error" | "stale" | "ok";
  jobs: Job[];
  currentCount: number | null;
  sources: {
    key: string;
    status: "ok" | "error" | "unobserved";
    /** "empty": the provider answered with no postings (not a confirmed close). */
    errorCode?: "empty";
    stale: boolean;
    checkedAt: string | null;
    lastSuccessAt: string | null;
  }[];
};

const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const nonempty = (v: unknown, max = 500): v is string =>
  typeof v === "string" && !!v.trim() && v.length <= max;
const oneOf = (v: unknown, allowed: readonly string[]) =>
  typeof v === "string" && allowed.includes(v);
/** A real YYYY-MM or YYYY-MM-DD as a UTC [first day, last day] range. */
export function period(value: unknown): [number, number] | null {
  if (
    typeof value !== "string" ||
    !/^\d{4}-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?$/.test(value)
  )
    return null;
  const start = Date.parse(
    `${value.length === 7 ? value + "-01" : value}T00:00:00Z`,
  );
  if (
    !Number.isFinite(start) ||
    new Date(start).toISOString().slice(0, value.length) !== value
  )
    return null;
  const end =
    value.length === 10
      ? start
      : Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)), 0);
  return [start, end];
}
function safeUrl(value: unknown) {
  if (!nonempty(value, 2048)) return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
}

/** Allow source-stated counts/ranges while excluding arbitrary prose and inferred arithmetic. */
export function validCompanyScale(value: unknown): value is CompanyScale {
  if (!record(value) || Object.keys(value).sort().join(",") !== "asOf,scope,value" ||
      typeof value.value !== "string" || value.value.length > 60 || value.value.trim() !== value.value ||
      !["legal-entity", "domestic", "global", "group", "unspecified"].includes(String(value.scope)) ||
      (value.asOf !== null && !period(value.asOf))) return false;
  const number = "(?:0|[1-9][0-9]{0,8}|[1-9][0-9]{0,2}(?:,[0-9]{3}){1,2})";
  const match = value.value.match(new RegExp(`^(?:(?:정규직|시간제)\\s*)?(?:약\\s*)?(${number})(?:\\s*[~–-]\\s*(${number}))?\\s*명(?:\\s*(이상|초과|이하|미만))?$`, "u"));
  if (!match || (match[2] && match[3])) return false;
  return !match[2] || Number(match[1].replaceAll(",", "")) <= Number(match[2].replaceAll(",", ""));
}

/** Validity is a structural contract, never a certification of source truth. */
export function validateResearch(input: unknown, now = new Date(), knownCompanyIds?: ReadonlySet<string>): Issue[] {
  const issues: Issue[] = [];
  const check = (condition: unknown, path: string, message: string) => {
    if (!condition) issues.push({ path, message });
  };
  if (!record(input) || input.version !== 1 || !Array.isArray(input.companies))
    return [
      { path: "$", message: "version: 1과 companies 배열이 필요합니다." },
    ];
  const documents = input.companies;
  check(
    documents.length <= MAX_RESEARCH_COMPANIES,
    "companies",
    `리서치 문서는 최대 ${MAX_RESEARCH_COMPANIES}개입니다.`,
  );
  const globalIds = new Set<string>();
  const id = (value: unknown, path: string) => {
    const valid =
      typeof value === "string" &&
      /^[a-z0-9][a-z0-9-]{0,79}$/.test(value) &&
      !globalIds.has(value);
    check(
      valid,
      path,
      "중복되지 않는 영문 소문자·숫자·하이픈 ID가 필요합니다.",
    );
    if (typeof value === "string") globalIds.add(value);
  };
  const today = Date.parse(now.toISOString().slice(0, 10) + "T00:00:00Z");
  const knownSourceKeys = new Set(configuredSources.map(sourceKey));
  const ownedKeys = new Set<string>();
  for (const identity of companies)
    for (const key of identity.sourceKeys) {
      check(
        knownSourceKeys.has(key) && !ownedKeys.has(key),
        "roster.sourceKeys",
        "등록된 출처를 한 법인에만 연결하세요.",
      );
      ownedKeys.add(key);
    }
  const seenCompanies = new Set<string>();
  documents.slice(0, MAX_RESEARCH_COMPANIES).forEach((raw, index) => {
    const p = `companies[${index}]`;
    if (!record(raw)) {
      check(false, p, "기업 객체가 필요합니다.");
      return;
    }
    check(
      (knownCompanyIds ? knownCompanyIds.has(String(raw.id)) : companies.some((c) => c.id === raw.id)) &&
        typeof raw.id === "string" &&
        !seenCompanies.has(raw.id),
      p + ".id",
      "등록된 회사의 고유 ID를 사용하세요.",
    );
    if (typeof raw.id === "string") seenCompanies.add(raw.id);
    const companyId = typeof raw.id === "string" ? raw.id : "";
    if (raw.publicDataIdentity !== undefined) {
      check(validPublicDataIdentity(raw.publicDataIdentity), p + ".publicDataIdentity", "공식 신원 등록 형식이 필요합니다.");
      if (validPublicDataIdentity(raw.publicDataIdentity)) check(Array.isArray(raw.identityEvidence) && raw.identityEvidence.includes(raw.publicDataIdentity.identityEvidence), p + ".publicDataIdentity.identityEvidence", "회사 신원 근거 참조가 필요합니다.");
    }
    const onboarding = raw.onboarding;
    const validOnboarding = record(onboarding) && (onboarding.version === 1 || onboarding.version === 2) && typeof onboarding.discoveryReceiptHash === "string" && /^[a-f0-9]{64}$/.test(onboarding.discoveryReceiptHash)
      && Object.keys(onboarding).every(key => ["version", "discoveryReceiptHash", "derivedBusiness"].includes(key))
      && (onboarding.derivedBusiness === undefined || (record(onboarding.derivedBusiness) && nonempty(onboarding.derivedBusiness.summary)
        && typeof onboarding.derivedBusiness.domainHash === "string" && /^[a-f0-9]{64}$/.test(onboarding.derivedBusiness.domainHash)
        && Object.keys(onboarding.derivedBusiness).sort().join(",") === "domainHash,summary"));
    if (onboarding !== undefined) check(validOnboarding, p + ".onboarding", "스크립트 등록 출처·버전·소유한 사업 설명 해시가 필요합니다.");
    if (raw.icon !== undefined) check(validCompanyIcon(raw.icon) && validOnboarding && raw.icon.discoveryReceiptHash === onboarding.discoveryReceiptHash,
      p + ".icon", "검증된 등록 출처에 연결된 크기 제한 PNG가 필요합니다.");
    check(
      nonempty(raw.summary) || (validOnboarding && raw.summary === "" && onboarding.derivedBusiness === undefined),
      p + ".summary",
      "500자 이내 요약이 필요합니다.",
    );
    for (const field of ["evidence", "facts", "headcount", "gaps"]) {
      const limit = field === "gaps" ? 50 : MAX_COMPANY_RECORDS;
      check(
        Array.isArray(raw[field]) && raw[field].length <= limit,
        p + "." + field,
        `최대 ${limit}개 배열이 필요합니다.`,
      );
    }
    const evidence = new Map<string, Record<string, unknown>>();
    if (Array.isArray(raw.evidence))
      raw.evidence.slice(0, MAX_COMPANY_RECORDS).forEach((e, i) => {
        const ep = p + `.evidence[${i}]`;
        if (!record(e)) {
          check(false, ep, "근거 객체가 필요합니다.");
          return;
        }
        id(e.id, ep + ".id");
        if (typeof e.id === "string") evidence.set(e.id, e);
        for (const key of ["title", "publisher", "excerpt"])
          check(
            nonempty(e[key]),
            ep + "." + key,
            "1~500자 텍스트가 필요합니다.",
          );
        check(
          safeUrl(e.url),
          ep + ".url",
          "인증 정보 없는 https 원문 URL을 사용하세요.",
        );
        check(
          oneOf(e.kind, ["official", "press", "repost"]),
          ep + ".kind",
          "official/press/repost 출처 종류가 필요합니다.",
        );
        check(
          oneOf(e.access, ["page", "search-index"]),
          ep + ".access",
          "page/search-index 확인 경로가 필요합니다.",
        );
        const checked = period(e.checkedOn),
          published = period(e.publishedOn);
        check(
          checked && String(e.checkedOn).length === 10 && checked[0] <= today,
          ep + ".checkedOn",
          "미래가 아닌 실제 확인일 YYYY-MM-DD를 입력하세요.",
        );
        check(
          e.publishedOn === null ||
            (published && checked && published[0] <= checked[0]),
          ep + ".publishedOn",
          "확인일 이전의 유효한 게시일 또는 null이 필요합니다.",
        );
      });
    const refs = (value: unknown, path: string, referenceOn?: unknown) => {
      check(
        Array.isArray(value) && value.length > 0 && value.length <= 50,
        path,
        "이 법인의 근거 ID를 최소 하나 연결하세요.",
      );
      if (!Array.isArray(value)) return;
      check(
        new Set(value).size === value.length,
        path,
        "중복 인용을 제거하세요.",
      );
      for (const ref of value) {
        const e = evidence.get(ref);
        check(!!e, path, "이 법인에 존재하는 evidence ID를 참조하세요.");
        if (referenceOn !== null && referenceOn !== undefined) {
          const r = period(referenceOn),
            c = period(e?.checkedOn);
          check(
            r && c && r[0] <= c[0],
            path,
            "기준일은 근거 확인일 이후일 수 없습니다.",
          );
        }
      }
    };
    refs(raw.identityEvidence, p + ".identityEvidence");
    if (raw.guides !== undefined) {
      check(
        Array.isArray(raw.guides) && raw.guides.length <= 20,
        p + ".guides",
        "질문 카드는 최대 20개입니다.",
      );
      if (Array.isArray(raw.guides))
        raw.guides.slice(0, 20).forEach((g, i) => {
          const gp = p + `.guides[${i}]`;
          if (!record(g)) {
            check(false, gp, "질문 카드 객체가 필요합니다.");
            return;
          }
          id(g.id, gp + ".id");
          for (const field of ["question", "answer", "limitation"])
            check(
              nonempty(g[field]),
              gp + "." + field,
              "1~500자 텍스트가 필요합니다.",
            );
          refs(g.evidenceIds, gp + ".evidenceIds");
          if (g.contentChange !== undefined) check(contentChangeShape(g.contentChange), gp + ".contentChange", "내용 반영 기록의 버전·시각·해시를 확인하세요.");
          if (g.publication !== undefined) {
            const pub = g.publication;
            check(record(pub) && oneOf(pub.topic, ["vision", "culture", "work", "process", "business"])
              && nonempty(pub.preview, 200) && Array.isArray(pub.relatedIds) && pub.relatedIds.length <= 6
              && new Set(pub.relatedIds).size === pub.relatedIds.length
              && pub.relatedIds.every((target: unknown) => typeof target === "string" && target !== g.id
                && Array.isArray(raw.guides) && raw.guides.some((other: unknown) => record(other) && other.id === target)),
              gp + ".publication", "같은 회사의 유효한 읽을거리·주제·미리보기를 지정하세요.");
          }
          if (g.sections !== undefined) {
            check(Array.isArray(g.sections) && g.sections.length > 0 && g.sections.length <= 6,
              gp + ".sections", "이야기는 1~6개 절로 구성하세요.");
            const sectionIds = new Set<string>();
            if (Array.isArray(g.sections)) g.sections.slice(0, 6).forEach((section, j) => {
              const sp = gp + `.sections[${j}]`;
              if (!record(section)) { check(false, sp, "절 객체가 필요합니다."); return; }
              check(typeof section.id === "string" && /^[a-z][a-z0-9-]{0,59}$/.test(section.id) && !sectionIds.has(section.id),
                sp + ".id", "이 이야기 안에서 고유한 영문 소문자·숫자·하이픈 ID가 필요합니다.");
              if (typeof section.id === "string") sectionIds.add(section.id);
              check(nonempty(section.title, 120), sp + ".title", "120자 이내 절 제목이 필요합니다.");
              check(nonempty(section.text, 1200), sp + ".text", "1200자 이내 절 설명이 필요합니다.");
              check(oneOf(section.kind, ["company-statement", "team-account", "context"]), sp + ".kind", "회사 선언·팀 설명·자료 해석을 구분하세요.");
              refs(section.evidenceIds, sp + ".evidenceIds");
              check(Array.isArray(section.evidenceIds) && section.evidenceIds.every(ref => Array.isArray(g.evidenceIds) && g.evidenceIds.includes(ref)),
                sp + ".evidenceIds", "절의 근거는 이 이야기의 인용 범위 안에 있어야 합니다.");
            });
          }
        });
    }
    if (Array.isArray(raw.facts))
      raw.facts.slice(0, MAX_COMPANY_RECORDS).forEach((f, i) => {
        const fp = p + `.facts[${i}]`;
        if (!record(f)) {
          check(false, fp, "사실 객체가 필요합니다.");
          return;
        }
        id(f.id, fp + ".id");
        check(
          oneOf(f.kind, ["context", "milestone", "funding"]),
          fp + ".kind",
          "context/milestone/funding 종류가 필요합니다.",
        );
        check(nonempty(f.text), fp + ".text", "1~500자 설명이 필요합니다.");
        check(
          f.referenceOn === null || period(f.referenceOn),
          fp + ".referenceOn",
          "YYYY-MM 또는 YYYY-MM-DD 기준일 또는 null이 필요합니다.",
        );
        refs(f.evidenceIds, fp + ".evidenceIds", f.referenceOn);
        if (f.scale !== undefined) {
          check(f.kind === "context" && validCompanyScale(f.scale), fp + ".scale", "인원 규모·범위·실제 집계일 또는 null을 지정하세요.");
          if (validCompanyScale(f.scale)) refs(f.evidenceIds, fp + ".scale.evidenceIds", f.scale.asOf);
          check(Array.isArray(f.evidenceIds) && f.evidenceIds.every(ref => evidence.get(ref)?.access === "page"), fp + ".scale", "직접 읽은 원문으로 인원 규모를 확인하세요.");
        }

        if (f.kind === "funding") {
          check(
            Number.isSafeInteger(f.amountKrw) && Number(f.amountKrw) > 0,
            fp + ".amountKrw",
            "해당 라운드 총 투자금의 원화 정수가 필요합니다.",
          );
          check(
            nonempty(f.round, 100),
            fp + ".round",
            "역사적 투자 라운드 이름이 필요합니다.",
          );
        } else
          check(
            f.amountKrw === undefined && f.round === undefined,
            fp,
            "투자금은 funding 사실에만 기록하세요.",
          );
        for (const issue of validateFactTime(companyId, f, raw, evidence, fp)) issues.push(issue);
      });
    for (const issue of validateSupersedes(companyId, raw, evidence, p)) issues.push(issue); // no spread: one issue per target
    if (Array.isArray(raw.headcount))
      raw.headcount.slice(0, MAX_COMPANY_RECORDS).forEach((o, i) => {
        const op = p + `.headcount[${i}]`;
        if (!record(o)) {
          check(false, op, "인원 관측 객체가 필요합니다.");
          return;
        }
        id(o.id, op + ".id");
        check(
          o.entityId === raw.id,
          op + ".entityId",
          "현재 법인 ID와 일치해야 합니다.",
        );
        check(
          oneOf(o.scope, ["legal-entity", "domestic", "consolidated"]),
          op + ".scope",
          "집계 범위를 지정하세요.",
        );
        check(
          oneOf(o.measurement, ["reported-headcount", "pension-subscribers"]),
          op + ".measurement",
          "보고 인원 또는 연금 가입자 측정을 지정하세요.",
        );
        check(
          o.unit === "people" &&
            Number.isSafeInteger(o.value) &&
            Number(o.value) >= 0,
          op + ".value",
          "people 단위의 0 이상 정수가 필요합니다.",
        );
        check(
          typeof o.approximate === "boolean",
          op + ".approximate",
          "근사값 여부를 명시하세요.",
        );
        check(
          oneOf(o.referenceBasis, ["observation", "publication"]),
          op + ".referenceBasis",
          "실제 집계 기준인지 게시 시점인지 지정하세요.",
        );
        check(
          period(o.referenceOn),
          op + ".referenceOn",
          "유효한 YYYY-MM 또는 YYYY-MM-DD가 필요합니다.",
        );
        refs(o.evidenceIds, op + ".evidenceIds", o.referenceOn);
      });
    if (raw.pipeline !== undefined) {
      const owned = raw.pipeline;
      for (const [key, items] of [["evidenceIds",raw.evidence],["factIds",raw.facts],["guideIds",raw.guides ?? []]] as const) {
        const values = record(owned) ? owned[key] : undefined;
        check(Array.isArray(values) && values.length <= 50 && new Set(values).size === values.length
          && values.every(value => typeof value === "string" && Array.isArray(items) && items.some(item => record(item) && item.id === value)),
          p + ".pipeline." + key, "실제 파이프라인 소유 항목만 기록하세요.");
      }
    }
    if (raw.questionAssessment !== undefined || raw.knowledgeRevisions !== undefined) {
      for (const issue of validateQuestionKnowledge(raw as unknown as CompanyResearch)) issues.push({ ...issue, path: p + "." + issue.path });
    }
    if (raw.readingConnections !== undefined) check(validReadingConnections(raw.readingConnections), p + ".readingConnections", "읽을거리 연결 버전·형식·고정값을 확인하세요.");
    const gaps = new Set<string>();
    if (Array.isArray(raw.gaps))
      raw.gaps.slice(0, 50).forEach((g, i) => {
        const gp = p + `.gaps[${i}]`;
        if (!record(g)) {
          check(false, gp, "미확인 항목 객체가 필요합니다.");
          return;
        }
        check(
          oneOf(g.field, ["headcount", "trend", "salary", "news", "funding"]) &&
            typeof g.field === "string" &&
            !gaps.has(g.field),
          gp + ".field",
          "고유한 미확인 항목 종류를 지정하세요.",
        );
        if (typeof g.field === "string") gaps.add(g.field);
        check(
          nonempty(g.reason) && nonempty(g.question),
          gp,
          "미확인 사유와 확인할 질문을 입력하세요.",
        );
      });
  });
  return issues;
}

export function compareHeadcount(observations: Headcount[]): Comparison {
  if (observations.length < 2) return { status: "insufficient" };
  const basis = (o: Headcount) =>
    `${o.entityId}|${o.scope}|${o.measurement}|${o.unit}`;
  // Contradictions are same-period claims, not legitimate change across time.
  for (const a of observations)
    for (const b of observations)
      if (
        basis(a) === basis(b) &&
        a.referenceOn === b.referenceOn &&
        a.value !== b.value
      )
        return { status: "conflict" };
  if (
    observations.some(
      (o) =>
        o.approximate ||
        o.referenceBasis !== "observation" ||
        !period(o.referenceOn) ||
        basis(o) !== basis(observations[0]),
    )
  )
    return { status: "incomparable" };
  const unique = [
    ...new Map(observations.map((o) => [o.referenceOn, o])).values(),
  ].sort((a, b) => a.referenceOn.localeCompare(b.referenceOn));
  if (unique.length < 2) return { status: "insufficient" };
  for (let i = 1; i < unique.length; i++)
    if (
      period(unique[i - 1].referenceOn)![1] >= period(unique[i].referenceOn)![0]
    )
      return { status: "incomparable" };
  const from = unique[0],
    to = unique[unique.length - 1],
    delta = to.value - from.value;
  return {
    status: "comparable",
    from,
    to,
    delta,
    percent: from.value === 0 ? null : (delta / from.value) * 100,
  };
}

export { JOB_FRESHNESS_MS } from "./jobs";
import { JOB_FRESHNESS_MS } from "./jobs";
export function joinCompanyJobs(
  identity: Identity,
  snapshot: Snapshot | null,
  now = new Date(),
): Hiring {
  const unavailable: Hiring = {
    status: "unavailable",
    jobs: [],
    currentCount: null,
    sources: [],
  };
  if (!identity.sourceKeys.length)
    return { ...unavailable, status: "unconnected" };
  if (
    !snapshot ||
    !Array.isArray(snapshot.jobs) ||
    !Array.isArray(snapshot.sources)
  )
    return unavailable;
  // Old snapshot readers validate only the envelope. Keep malformed entries
  // from taking down the independent research document or producing false zero.
  if (
    snapshot.jobs.some(
      (j) =>
        !j ||
        ![
          j.id,
          j.title,
          j.locationLabel,
          j.roleLabel,
          j.sourceBoard,
          j.sourceJobId,
        ].every((v) => nonempty(v, 1000)) ||
        !oneOf(j.source, providers) ||
        (j.workplaceType !== undefined &&
          !oneOf(j.workplaceType, ["remote", "hybrid", "on-site"])),
    )
  )
    return unavailable;
  if (
    snapshot.sources.some(
      (s) =>
        !s ||
        !nonempty(s.board) ||
        !oneOf(s.status, ["ok", "error"]) ||
        (s.provider !== undefined &&
          !oneOf(s.provider, providers)),
    )
  )
    return unavailable;
  const stateMap = new Map(snapshot.sources.map((s) => [sourceKey(s), s]));
  if (stateMap.size !== snapshot.sources.length) return unavailable;
  const timestamp = (s: unknown) =>
    typeof s === "string" &&
    /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{3})?Z$/.test(
      s,
    ) &&
    period(s.slice(0, 10)) &&
    Number.isFinite(Date.parse(s)) &&
    Date.parse(s) <= now.getTime()
      ? s
      : null;
  const states: Hiring["sources"] = identity.sourceKeys.map((key) => {
    const s = stateMap.get(key),
      lastSuccessAt = timestamp(s?.lastSuccessAt),
      checkedAt = timestamp(s?.checkedAt);
    return {
      key,
      status:
        s?.status === "error"
          ? "error"
          : s &&
              lastSuccessAt &&
              checkedAt &&
              Date.parse(lastSuccessAt) <= Date.parse(checkedAt)
            ? "ok"
            : "unobserved",
      ...(s?.errorCode === "empty" ? { errorCode: "empty" as const } : {}),
      stale:
        !!lastSuccessAt &&
        now.getTime() - Date.parse(lastSuccessAt) > JOB_FRESHNESS_MS,
      checkedAt,
      lastSuccessAt,
    };
  });
  const status: Hiring["status"] = states.some((s) => s.status === "error")
    ? "error"
    : states.some((s) => s.status === "unobserved")
      ? "unobserved"
      : states.some((s) => s.stale)
        ? "stale"
        : "ok";
  const jobs = snapshot.jobs.filter(
    (j) =>
      identity.sourceKeys.includes(
        sourceKey({ provider: j.source, board: j.sourceBoard }),
      ) && isVacancy(j) && !notOwnPosting(j),
  )
    // The role taxonomy evolves; label stored jobs with today's rules.
    .map((j) => {
      if (isFrozenData(j)) return prepareJob(j);
      const role = classifyRole(j.title);
      return { ...j, role, roleLabel: roleLabels[role] };
    });
  return {
    status,
    jobs,
    currentCount: status === "ok" ? jobs.length : null,
    sources: states,
  };
}

/**
 * Postings on the company's boards that are not its own (lib/posting-company.ts): another company's,
 * by that company in first-seen order, then the unconfirmed ones. Shown apart on the company page,
 * never counted as the company's.
 */
export function boardOtherJobs(identity: Identity, snapshot: Snapshot | null): { company: string; confirmed: boolean; jobs: Job[] }[] {
  const groups = new Map<string, Job[]>(), unconfirmed: Job[] = [];
  for (const job of snapshot?.jobs ?? []) {
    if (!identity.sourceKeys.includes(sourceKey({ provider: job.source, board: job.sourceBoard })) || !isVacancy(job)) continue;
    const company = postingCompanyOf(job);
    if (company.kind === "other") groups.set(company.company, [...(groups.get(company.company) ?? []), job]);
    else if (company.kind === "unconfirmed") unconfirmed.push(job);
  }
  return [...[...groups].map(([company, jobs]) => ({ company, confirmed: true, jobs })),
    ...(unconfirmed.length ? [{ company: UNCONFIRMED_COMPANY, confirmed: false, jobs: unconfirmed }] : [])];
}

/**
 * Pension observations of one workplace form a monthly series on their own.
 * Mixing them with a reported headcount made every such company "incomparable".
 */
export function headcountComparison(headcount: Headcount[]) {
  const pension = headcount.filter(item => item.measurement === "pension-subscribers" && item.referenceBasis === "observation");
  return compareHeadcount(new Set(pension.map(item => item.referenceOn)).size >= 2 ? pension : headcount);
}

/**
 * A company the onboarding seed (lib/company-onboarding.ts) registered and nobody has researched
 * yet: the research file has its entry, but only the identity evidence. 리서치 전(미조사), never a
 * researched company with no facts. The listing hides it until business and a reading exist.
 */
export function onboardingIdentityOnly(company: CompanyResearch): boolean {
  return !!company.onboarding && company.summary === "" && !company.facts.length && !company.headcount.length
    && !company.guides?.length && !company.gaps.length;
}

export function researchCoverage(pack: ResearchPack) {
  return {
    companies: pack.companies.length,
    evidence: pack.companies.reduce((n, c) => n + c.evidence.length, 0),
    historicalHeadcount: pack.companies.filter((c) => c.headcount.length)
      .length,
    comparableHeadcount: pack.companies.filter(
      (c) => headcountComparison(c.headcount).status === "comparable",
    ).length,
    salaryBands: 0,
    gaps: pack.companies.map((c) => ({
      id: c.id,
      unknown: c.gaps.map((g) => ({ field: g.field, reason: g.reason })),
    })),
  };
}
