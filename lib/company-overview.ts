import { assessmentForCompany, facetGuideId } from "./question-assessment";
import { companyScaleScopeLabels, validCompanyScale, type CompanyResearch, type Evidence } from "./research";
import { HEADCOUNT_SCOPE, citedSources, headcountMeasurement } from "./research-labels";
import { industryLabel } from "./company-fact-presentation";

/** Read the existing domain, or the published machine-owned business fact; never create a second fact. */
function businessFact(company?: CompanyResearch) {
  if (!company) return undefined;
  const curated = company.facts.find(f => f.id === `${company.id}-domain` && f.kind === "context");
  if (curated) return curated; // Never replace an existing curated field, including one whose evidence is unavailable.
  const guideId = `${company.id}-pipeline-business`, factId = `${guideId}-fact`;
  if (!company.pipeline?.factIds.includes(factId) || !company.pipeline.guideIds.includes(guideId)) return undefined;
  const guide = company.guides?.find(g => g.id === guideId && g.publication);
  const fact = company.facts.find(f => f.id === factId && f.kind === "context");
  if (!guide || !fact || !fact.text.trim() || guide.answer !== fact.text
    || !fact.evidenceIds.length || JSON.stringify(guide.evidenceIds) !== JSON.stringify(fact.evidenceIds)
    || fact.evidenceIds.some(id => !company.evidence.some(e => e.id === id && e.access === "page"))) return undefined;
  // Reuse the existing binding contract: corrections change the guide/evidence and invalidate
  // its stored assessment. A pending explanation must not become an unqualified header.
  const product = assessmentForCompany(company).questions.find(q => q.questionId === "company.identity")?.facets.find(f => f.facetId === "identity.product");
  if (!product || !["partial", "sufficient"].includes(product.status) || facetGuideId(company.id, product) !== guideId) return undefined;
  return fact;
}

/** Fully sourced business prose reuses its original fact ID and citations. */
export function companyBusinessIntro(company?: CompanyResearch) {
  const fact = businessFact(company);
  if (!company || !fact || industryLabel(fact.text) || !fact.text.trim() || fact.text === "미확인" || !fact.evidenceIds.length) return null;
  const sources = fact.evidenceIds.map(id => company.evidence.find(e => e.id === id));
  if (sources.some(source => !source || source.access !== "page")) return null;
  return { fact, sources: sources.filter((s): s is Evidence => !!s) };
}

export type CompanyOverviewField = {
  label: string;
  value: string;
  note: string;
  sources: Evidence[];
  caveat?: string;
  dateLabel?: string;
  /** The newest differently measured public count from the same two years. Shown beside the value as published, never merged or judged. */
  contrast?: { value: string; referenceOn: string; scope: string; basis: string; sources: Evidence[] };
  /** Facts in 회사 현황 the field points to when it cannot name a value itself, newest first. */
  records?: string[];
};

/** The header value for a listing history. Chips read this value, never the label. */
export const LISTED_VALUE = "상장 이력 확인";

const INVESTMENT_RECORD = /시리즈\s*[A-F]|Series\s*[A-F]|Pre-?IPO|투자\s*유치|투자를\s*유치|투자\s*계약|전략적\s*투자|유상증자|상장|IPO|NYSE|Nasdaq|나스닥|코스피|코스닥|KOSPI|KOSDAQ|뉴욕증권거래소/i;
const LISTING_RECORD = /상장|IPO|NYSE|Nasdaq|나스닥|코스피|코스닥|KOSPI|KOSDAQ|뉴욕증권거래소/i;

export function companyOverview(company?: CompanyResearch): CompanyOverviewField[] {
  const sourcesFor = (ids: string[]): Evidence[] => citedSources(company, ids);
  const fields: CompanyOverviewField[] = [
    { label: "설립일", value: "미확인", note: "", sources: [] },
    { label: "주요 산업·도메인", value: "미확인", note: "", sources: [] },
    { label: "인원 규모", value: "미확인", note: "", sources: [] },
    { label: "투자 시리즈", value: "미확인", note: "", sources: [] },
  ];
  if (!company) return fields;

  // Explicitly curated facts, never an inference from the company name or jobs.
  // Index-only evidence remains in the research detail, not a verified header.
  for (const [index, suffix] of ["founded", "domain"].entries()) {
    const fact = suffix === "domain" ? businessFact(company) : company.facts.find(f => f.id === `${company.id}-${suffix}` && f.kind === "context");
    const sources = sourcesFor(fact?.evidenceIds ?? []);
    if (fact && sources.length && sources.every(source => source.access === "page")) {
      fields[index] = { ...fields[index], value: fact.text, note: "", sources };
    }
  }

  const scaleCheckedOn = (ids: string[]) => sourcesFor(ids).map(source => source.checkedOn).sort().at(-1) ?? "";
  const scaleFacts = company.facts
    .filter(fact => fact.kind === "context" && validCompanyScale(fact.scale) && sourcesFor(fact.evidenceIds).length && sourcesFor(fact.evidenceIds).every(source => source.access === "page"))
    .toSorted((a, b) => {
      const scopeOrder = {"legal-entity":0,domestic:1,global:2,group:3,unspecified:4};
      return (b.scale!.asOf ?? "").localeCompare(a.scale!.asOf ?? "") ||
        scopeOrder[a.scale!.scope] - scopeOrder[b.scale!.scope] ||
        scaleCheckedOn(b.evidenceIds).localeCompare(scaleCheckedOn(a.evidenceIds));
    });
  const verifiedHeadcount = company.headcount
    .filter(h => h.entityId === company.id && sourcesFor(h.evidenceIds).length && sourcesFor(h.evidenceIds).every(source => source.access === "page"))
    .toSorted((a, b) => b.referenceOn.localeCompare(a.referenceOn));
  const headcount = verifiedHeadcount[0];
  // Prefer a newer explicit size only when its scope matches the numeric
  // observation. Undated or global summaries must not replace dated local data.
  const newerSameScope = scaleFacts.find(fact => !!headcount && !!fact.scale!.asOf && fact.scale!.scope === headcount.scope && countDateIsNewer(fact.scale!.asOf, headcount.referenceOn));
  const scaleFact = newerSameScope ?? scaleFacts[0];
  if (headcount && !newerSameScope) {
    const scope = HEADCOUNT_SCOPE[headcount.scope];
    const basis = headcount.referenceBasis === "publication" ? publicationLabel(company, headcount.evidenceIds) : "집계 기준";
    const measurement = headcountMeasurement(headcount);
    fields[2] = {
      ...fields[2],
      value: `${headcount.approximate ? "약 " : ""}${headcount.value.toLocaleString("ko-KR")}명`,
      note: `${headcount.referenceOn} ${basis} · ${scope} ${measurement} · 현재 규모 미확인`,
      sources: sourcesFor(headcount.evidenceIds),
      // A dated pension observation is a usable measure, not missing data.
      // Do not present it as today's total workforce or infer its month from a
      // repost's publication/visit date.
      ...(headcount.measurement === "pension-subscribers" && headcount.referenceBasis === "observation"
        ? { caveat: "국민연금 기준 · 해당 사업장 가입자 수", dateLabel: "집계 기준" }
        : {}),
    };
    // A single registered workplace can be a fraction of the company, so a
    // differently measured public count from the past two years is shown next
    // to the value whatever the gap; the reader compares the two originals.
    // Candidates: other numeric headcount observations, and single-number
    // size statements whose scope may be unstated. Ranges are not single counts.
    const candidates = [
      ...verifiedHeadcount.filter(other => other !== headcount && other.measurement !== headcount.measurement).map(other => ({
        value: other.value, approximate: other.approximate, referenceOn: other.referenceOn, evidenceIds: other.evidenceIds,
        scope: HEADCOUNT_SCOPE[other.scope],
        basis: headcountMeasurement(other),
      })),
      ...scaleFacts.flatMap(fact => {
        const scale = fact.scale!, count = scale.value.match(/^(약\s*)?(\d[\d,]*)\s*명(?:\s*수준)?$/);
        if (!count || !scale.asOf) return [];
        return [{ value: Number(count[2].replace(/,/g, "")), approximate: !!count[1] || /수준/.test(scale.value), referenceOn: scale.asOf, evidenceIds: fact.evidenceIds,
          scope: companyScaleScopeLabels[scale.scope], basis: "보고 인원" }];
      }),
    ].filter(other => monthsBetween(other.referenceOn, headcount.referenceOn) <= 24)
      .toSorted((a, b) => b.referenceOn.localeCompare(a.referenceOn));
    const contrast = candidates[0];
    if (contrast) {
      fields[2].contrast = {
        value: `${contrast.approximate ? "약 " : ""}${contrast.value.toLocaleString("ko-KR")}명`,
        referenceOn: contrast.referenceOn, scope: contrast.scope, basis: contrast.basis,
        sources: sourcesFor(contrast.evidenceIds),
      };
    }
  } else if (scaleFact?.scale) {
    const scale = scaleFact.scale, sources = sourcesFor(scaleFact.evidenceIds);
    const scope = companyScaleScopeLabels[scale.scope];
    const prefix = {"legal-entity":"",domestic:"국내 ",global:"글로벌 ",group:"그룹 전체 ",unspecified:""}[scale.scope];
    const basis = sources.every(source => source.kind === "official") ? "공식 소개 기준" : "공개 자료 기준";
    const caveats = [basis, ...(scale.asOf ? [] : ["집계일 미표기"]), scope];
    if (scale.scope === "global" || scale.scope === "group") caveats.push("한국 조직 규모는 별도");
    fields[2] = {
      label: "인원 규모", value: prefix + scale.value,
      note: `${scale.asOf ? `${scale.asOf} · ` : ""}${caveats.join(" · ")}`,
      sources, caveat: caveats.join(" · "), dateLabel: "집계 기준",
    };
  } else {
    const global = company.facts.find(f => f.id === `${company.id}-global-team`);
    const sources = sourcesFor(global?.evidenceIds ?? []);
    // The curated fact's first sentence describes the observation. Later sentences
    // may contain prior counts or deltas and must not enter the headline.
    // Preserve employment categories and qualifiers; never add them together.
    const counts = global?.text.split(/[.!?]\s+/)[0].match(/(?:(?:정규직|시간제)(?:은|는)?\s*)?(?:약\s*)?\d[\d,]*명(?:\s*(?:이상|초과))?/g)
      ?.map(text => text.replace(/(정규직|시간제)(?:은|는)\s*/g, "$1 "));
    if (global && counts?.length && sources.length && sources.every(s => s.access === "page")) {
      const publicationDate = !!global.referenceOn && sources.some(s => s.publishedOn === global.referenceOn);
      const scope = global.text.includes("독립 스튜디오") ? "스튜디오·사업 조직" : "글로벌";
      fields[2] = {
        label: "인원 규모",
        value: `${scope} ${counts.join(" · ")}`,
        note: `${global.referenceOn ? `${global.referenceOn} · ` : ""}${global.text}`,
        sources,
        caveat: publicationDate ? "실제 집계일·현재 규모 미확인" : `${global.referenceOn ? "" : "집계일 미확인 · "}한국 조직 규모 미확인`,
        dateLabel: publicationDate ? "자료 게시일" : "자료 기준",
      };
    }
  }

  const funding = company.facts
    .filter(f => f.kind === "funding" && f.round && f.referenceOn && sourcesFor(f.evidenceIds).length)
    .toSorted((a, b) => b.referenceOn!.localeCompare(a.referenceOn!))[0];
  if (funding) {
    // A capital increase or unspecified follow-on investment is not a series.
    const namedSeries = /^(?:Pre[- ]?)?Series [A-Z](?:[- ]\d+)?$/i.test(funding.round!);
    fields[3] = {
      ...fields[3],
      value: namedSeries ? funding.round! : "시리즈 미확인",
      note: `${funding.referenceOn} · ${funding.text}`,
      sources: sourcesFor(funding.evidenceIds),
    };
  }
  const listed = company.facts.find(f => f.id === `${company.id}-listed` || f.id === `${company.id}-listing-context`);
  const listingSources = sourcesFor(listed?.evidenceIds ?? []);
  if (listed && listingSources.length && listingSources.every(s => s.access === "page")) {
    fields[3] = {
      label: "상장·투자",
      value: LISTED_VALUE,
      note: `${listed.referenceOn ? `${listed.referenceOn} · ` : ""}${listed.text}`,
      sources: listingSources,
      caveat: listed.text,
      dateLabel: listingSources.some(s => !!listed.referenceOn && s.publishedOn === listed.referenceOn) ? "자료 게시일" : "이력 기준",
    };
  }
  if (fields[3].value === "미확인") {
    // No structured round or listing, yet 회사 현황 records a round, a raise or
    // a listing from opened sources (plans and withdrawals included): point to
    // those records rather than call the field unconfirmed. Free text never
    // becomes a stage or a listing; index-only records stay out of the header.
    const opened = (ids: string[]) => sourcesFor(ids).length > 0 && sourcesFor(ids).every(s => s.access === "page");
    const records = company.facts
      .filter(f => INVESTMENT_RECORD.test(f.text) && opened(f.evidenceIds))
      .toSorted((a, b) => (b.referenceOn ?? "").localeCompare(a.referenceOn ?? ""));
    if (records.length) fields[3] = {
      label: records.some(f => LISTING_RECORD.test(f.text)) ? "상장·투자" : "투자 시리즈",
      value: "단계 미확인",
      note: "",
      sources: [],
      records: records.map(f => f.id),
    };
  }
  return fields;
}

/** A press source's date is when the article ran; a repost or page states when its data was shown. */
export function publicationLabel(company: CompanyResearch, evidenceIds: readonly string[]) {
  const kinds = evidenceIds.map((id) => company.evidence.find((e) => e.id === id)?.kind);
  return kinds.length && kinds.every((kind) => kind === "press") ? "기사 게시 시점" : "자료 시점";
}

/** Whole months between two YYYY-MM(-DD) dates, ignoring the day. */
function monthsBetween(a: string, b: string) {
  const month = (value: string) => Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7));
  return Math.abs(month(a) - month(b));
}

/** A partial-month date is an interval, not an invented first-day observation. */
function countDateIsNewer(candidate: string, previous: string) {
  const candidateStart = Date.parse(`${candidate.length === 7 ? candidate + "-01" : candidate}T00:00:00Z`);
  const previousEnd = previous.length === 7
    ? Date.UTC(Number(previous.slice(0, 4)), Number(previous.slice(5, 7)), 0)
    : Date.parse(`${previous}T00:00:00Z`);
  return candidateStart > previousEnd;
}
