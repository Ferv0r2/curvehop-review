import type { Job, Role } from "./jobs";
import { compilerWork, webRole } from "./roles";

export type JobInsights = {
  /** Source lines by section, verbatim; the basis for keyword extraction. */
  sections: { duties: string[]; required: string[]; preferred: string[] };
  /** Lines listed under a tech stack / environment heading (for stack tags only). */
  stack: string[];
  /** Section lines that were list items (bulleted or numbered), for quoting. */
  items: { duties: string[]; required: string[]; preferred: string[] };
  /** Work and hiring terms: location, work style, employment type, process, deadline. */
  conditions: string[];
  roles: Role[];
  scope: "dedicated" | "combined" | "unknown";
  evidence: { role: Role; text: string }[];
  experience: {
    kind: "required" | "preferred" | "unspecified";
    text: string;
    evidence: string;
    role?: Role;
    /** Stated in the posting title; it stands beside the body's conditions. */
    fromTitle?: true;
  }[];
};

const rolePatterns: [Role, RegExp][] = [
  [
    "frontend",
    /front[ -]?end|프론트[ -]?엔드|\bweb (?:engineer|developer)\b|웹\s*(?:개발자|엔지니어)/i,
  ],
  ["backend", /back[ -]?end|백[ -]?엔드|서버\s*(?:개발|엔지니어)/i],
  ["design", /\bdesigner\b|디자이너/iu],
  ["mobile", /\b(?:ios|android)\s*(?:engineer|developer)\b|모바일\s*(?:개발자|엔지니어)|^\s*mobile engineer\b/i],
];
const rolesIn = (text: string, compiler = compilerWork(text)) =>
  rolePatterns
    .filter(([role, pattern]) => pattern.test(text) && !(compiler && webRole(role)))
    .map(([role]) => role);
const collaboration =
  /협업|소통|함께|개발팀|collaborat|work(?:ing)? (?:with|closely)|partner(?:ing)? with|ensure|alongside/i;
// "4년제 대학" is a degree, not a duration.
const duration =
  /(?<!\d)\d{1,2}(?:\s*[~–-]\s*\d{1,2})?\s*\+?\s*(?:년(?!\s*제)|years?\b)/i;
const career =
  /경력|경험|실무|experience|years?\s+of\s+(?:software|backend|frontend|professional|relevant)\b/i;
const applicant =
  /(?:경력|경험).*(?:가지|가진|갖추|갖춘|보유|있으|있는|이신|이상인|이상이신).*분|(?:experience|경력)\s*[:：]|(?:you\s+(?:have|bring)|must\s+have|we\s+(?:require|seek)|required|preferred)/i;
const narrativeDuration =
  /\d+\s*년\s*(?:차.*(?:曰|이야기|인터뷰)|즈음|연속)|합류\s*후|after\s+(?:joining|you join)/i;

/**
 * Lines to interpret. Some providers (Workday JSON-LD) flatten a posting into
 * one long line with inline "•" bullets and headings; split those at bullets
 * and sentence ends so headings such as "What is Required" stand alone.
 */
export function jobLines(description: string): string[] {
  return description
    .split(/\r?\n/)
    .flatMap((line) =>
      line.length > 300
        ? line.split(/\s+(?=•)|(?<=[.!?。])\s+|\s+(?=(?:What|How|Who|Why|About|Benefits|Perks|Our)\s+[A-Z])/)
        : [line],
    )
    .map((line) => line.trim())
    .filter(Boolean);
}
// Bullets, markdown, pipes and emoji that decorate headings ("🔎 이런 분을…", "| 이런 분이면…").
const leadingMarks = /^(?:[\s•*#\-|│▶►■□◆◇●○※)\u200b\u200d\ufe0f]|\p{Extended_Pictographic})+/u;
// Headings that close the current section (process, logistics, tools, links).
const closingHeading =
  /^(?:사용하는툴|기술스택|개발환경|채용정보|합류여정|영입여정|채용과정|전형절차|채용절차|참고사항|유의사항|꼭확인|지원전|근무조건|근무형태|근무지|고용형태|복지|혜택|benefits|perks|contact|문의|채용원칙|기타사항|제출서류|필요서류|이렇게합류|더알아보|궁금하다면|howwework|howtoapply|howwehire|whyjoin|ourbenefits|interviewprocess|additionalinformation|whoweare|about[a-z]*privacy|privacypolicy|connectwith|equalopportunity|lifeat|perksandbenefits)/i;
/** A heading is short and does not end like a sentence; content lines never switch sections. */
/** Heading test that also accepts sentence-style headings recognised by their wording. */
const isHeadingLine = (clean: string, heading: string) =>
  headingLike(clean) ||
  (clean.length <= 45 &&
    !/[,，]/.test(clean) &&
    !/\d+\s*\+?\s*(?:년|years?)/i.test(clean) &&
    (conversationalRequired.test(heading) || conversationalPreferred.test(heading) || conversationalDuties.test(heading)));
const headingLike = (clean: string) =>
  clean.length <= 50 &&
  !/[,，]/.test(clean) &&
  !/\d+\s*\+?\s*(?:년|years?)/i.test(clean) &&
  !/(?:니다|분|다)\s*\.?$|[.。]$/.test(clean);
// Sentence-style headings: "이런 동료를 기다립니다", "합류하면 이런 업무를 해요".
const conversationalRequired = /^(?:이런|어떤)(?:분|동료|사람)(?:을|과|이|를)?(?:찾|함께|기다|원|모)|함께하고싶|이런경험을가진분|이런분이라면(?:꼭)?(?:도전|지원)/;
const conversationalPreferred = /(?:이라면|이면|있으면|있다면)더(?:욱)?좋|더(?:욱)?좋아요|우대합니다$/;
const conversationalDuties = /^(?:합류하(?:면|시면|게되면)|함께하(?:면|시면|게되면)|입사하(?:면|시면|게되면)).*(?:업무|일)|이런(?:업무|일)(?:들)?(?:을|를)|어떤(?:일|업무)을(?:담당|하)|담당할업무|하게될(?:업무|일)|함께할미션|합류하면이런/;
const qualificationHeading =
  /^(?:(?:공통|지원|필수)?자격(?:요건|조건|사항)?|지원요건|경험및자격|필요(?:역량|경험|조건)|필수(?:요건|사항|역량|조건)|howdoiknowiftheroleisright|whatwerequire|(?:basic|minimum|required|essential|key)?(?:qualifications?|requirements?)|required|whatisrequired|whatwe(?:are|re)lookingfor|whoyouare|whatyou(?:will)?need|whatyoullneed|whatyou(?:will|ll)?bring|youneedtohave|youshouldhave|mustha?ves?|어떤(?:경력|역량|경험)|필요한(?:역량|경험|자격)|이런분을찾|이런분과함께)/i;
// A heading may carry its kind at the end: "이런 경험을 가진 분과 … (필수요건)".
const taggedRequired = /필수(?:요건|사항|조건)/;
const taggedPreferred = /우대(?:요건|사항|조건)/;
const preferredHeading =
  /^(?:우대(?:사항|요건|조건)|(?:preferred|desired)(?:qualifications|requirements|skills)?|whatispreferred|whatwevalue|nicetohave|bonuspoints?|pluses|이런점이있으면더좋|이런분이면더좋)/i;
// Employment terms and document instructions mention years without being a requirement.
// List markers. Hollow marks (□ ○ ◦ ▪) are items too; solid ■ ▶ often mark headings.
const listItem = /^\s*[•·\-*□○◦▪][\s\u200b]/u;
/** True when a line is a duties / qualifications / preferred section heading. */
export function sectionHeading(line: string): "duties" | "required" | "preferred" | null {
  if (listItem.test(line)) return null;
  const clean = line.replace(leadingMarks, "").replace(/^[\[【](.*)[\]】]$/, "$1").trim();
  const heading = clean.replace(/[\s\u200b:：?？!'’*#()[\]【】]/g, "").toLowerCase();
  if (!isHeadingLine(clean, heading)) return null;
  if (preferredHeading.test(heading) || taggedPreferred.test(heading) || conversationalPreferred.test(heading)) return "preferred";
  if (qualificationHeading.test(heading) || taggedRequired.test(heading) || conversationalRequired.test(heading)) return "required";
  if (dutiesHeading.test(heading) || conversationalDuties.test(heading)) return "duties";
  return null;
}
const dutiesHeading =
  /^(?:주요업무|담당업무|업무내용|업무소개|주요책임|역할및책임|팀소개및업무|어떤업무를담당|(?:key)?responsibilities|whatyou(?:will|ll)?do|(?:about)?therole$|roleoverview$|yourrole$|whythisroleexists|theopportunity$)/i;
const conditionsHeading =
  /^(?:근무조건|근무형태|근무지|근무장소|근무환경및조건|고용형태|채용형태|근무시간|채용절차|전형절차|채용과정|전형과정|어떤방식으로채용|합류여정|영입여정|채용정보|employmenttype|workinghours|worklocation|location|recruitmentprocess|hiringprocess|interviewprocess)/i;
const MAX_CONDITIONS = 30;
/** Comma clauses outside parentheses: "A (x, y 우대), B" → ["A (x, y 우대)", "B"]. */
export function topLevelClauses(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "(" || c === "[" || c === "（") depth++;
    else if ((c === ")" || c === "]" || c === "）") && depth > 0) depth--;
    else if ((c === "," || c === "，") && depth === 0) {
      out.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(text.slice(start).trim());
  return out.filter(Boolean);
}
// Terms that decide whether and when to apply come before general notes.
const conditionRank = (line: string) =>
  /근무\s*(?:지|장소|형태)|재택|하이브리드|hybrid|remote|location/i.test(line) ? 0
  : /고용\s*형태|정규직|계약직|인턴|수습|employment|full-time|contract/i.test(line) ? 1
  : /마감|deadline|조기\s*종료/i.test(line) ? 2
  : /전형|면접|interview|과제|→|>|-\s*최종/i.test(line) ? 3
  : 4;
/** Terms block heading (근무 조건, 전형 절차, Hiring process …): a jump target for "더 보기". */
export const isConditionsHeading = (line: string) =>
  conditionsHeading.test(line.replace(leadingMarks, "").replace(/[\s:：?？!'’*#()[\]【】]/g, "").toLowerCase());
const principlesLabel = /^(?:우리는)?이렇게일(?:합니다|해요)|^일하는방식|^우리가일하는방식|^howwework$/i;
// Bulleted sub-labels inside a terms block ("• 전형 절차", "• 참고 사항").
const subLabel = /^(?:전형절차|채용절차|참고사항|안내사항|기타사항|유의사항)$/;
const inlineConditionLine =
  /^(?:근무\s*(?:지|장소|형태|시간|조건)|고용\s*형태|채용\s*형태|수습\s*기간|location|employment\s*type|work(?:ing)?\s*(?:hours|location|type))\s*(?:[:：]|은|는)/i;
// Role introductions: prose about the role. Their lines are duties only when
// the posting has no explicit duties list ("Role Overview" then "Responsibilities").
const overviewHeading = /^(?:(?:about)?therole|roleoverview|yourrole|whythisroleexists|theopportunity)$/i;
const contractLength =
  /계약\s*기간|근무\s*기간|기간제|고용\s*형태|계약직|정규직\s*전환|재직\s*시|수습|contract\s+(?:term|length|duration)|probation|submit|제출/i;

/** Conservative source-text interpretation; unknown is not a disqualification. */
export function analyzeJob(
  job: Pick<Job, "title" | "description" | "role" | "experience">,
): JobInsights {
  const compilerTitle = compilerWork(job.title);
  const titleRoles = rolesIn(job.title, compilerTitle);
  const roles = new Set<Role>(titleRoles.length ? titleRoles : [job.role]);
  const evidence: JobInsights["evidence"] = titleRoles.map((role) => ({
    role,
    text: job.title,
  }));
  const experience: JobInsights["experience"] = [];
  const titleScope = titleRoles.length === 1 ? titleRoles[0] : undefined;
  // Only a generic title may gain body roles from its duties.
  const openTitle = job.role === "engineering" || job.role === "other";
  let activeRole = titleScope;
  let kind: JobInsights["experience"][number]["kind"] = "unspecified";
  let section: "neutral" | "duties" | "qualifications" | "ignored" = "neutral";
  const tracks = new Set<string>(titleRoles);
  const sections: JobInsights["sections"] = { duties: [], required: [], preferred: [] };
  const stack: string[] = [];
  const items: JobInsights["items"] = { duties: [], required: [], preferred: [] };
  let inStack = false;
  let afterBullet = false;
  let inPrinciples = false;
  const overview: string[] = [];
  const conditions: string[] = [];
  // Stated terms (location, employment type) come first: they decide applying.
  const statedTerms: string[] = [];
  let inConditions = false;
  let inOverview = false;

  for (const line of jobLines(job.description)) {
    // A source sometimes glues the next item's marker onto a line ("….○");
    // quoted lines drop it, the full posting keeps the original text.
    const text = line.replace(/([^\s○◦▪□•])\s*[○◦▪□•]+\s*$/, "$1");
    const clean = text
      .replace(leadingMarks, "")
      .replace(/^[\[【](.*)[\]】]$/, "$1")
      .trim();
    // Normalised heading text: no spaces or punctuation ("Basic Qualifications:" → basicqualifications).
    const heading = clean.replace(/[\s\u200b:：?？!'’*#()[\]【】]/g, "").toLowerCase();
    // A bulleted line is a list item, never a heading, however short.
    // Some boards put the bullet on its own line ("•" then the item text).
    // A stray bullet before a real section heading does not demote it.
    const isHeading =
      !listItem.test(text) &&
      isHeadingLine(clean, heading) &&
      (!afterBullet || sectionHeading(text) !== null || closingHeading.test(heading)) &&
      // "근무지: 구의오피스" is a stated term, not a heading.
      !(inlineConditionLine.test(clean) && /[:：]\s*\S/.test(clean));
    // "우리는 이렇게 일합니다" introduces team principles, not this role's
    // duties; they run until the next heading or bracketed role label.
    if (isHeading || /^[\[【]/.test(clean)) inPrinciples = false;
    if (!isHeading && principlesLabel.test(heading)) {
      inPrinciples = true;
      continue;
    }
    // A list item: bulleted, numbered, or the line after a lone bullet.
    const listed = listItem.test(text) || /^\s*\d{1,2}[.)]\s/.test(text) || afterBullet;
    afterBullet = /^\s*[•·\-*□○◦▪]\s*$/.test(text);
    // Document-retention notices. Not applied inside duties/qualifications,
    // where privacy roles legitimately mention 파기·보관 ("정보관리" also
    // contains "보관" as a substring).
    if (
      section !== "duties" &&
      section !== "qualifications" &&
      /(?:서류|개인정보|이력서).*(?:(?:보관|보유)\s*(?:기간|후)|파기|삭제|반환)|인재\s*DB|resume.*(?:retention|retain)/i.test(
        clean,
      )
    ) {
      section = "ignored";
      kind = "unspecified";
      activeRole = titleScope;
      continue;
    }
    // Work and hiring terms a seeker checks before applying; kept verbatim,
    // never used for role or tenure inference.
    if (isHeading) inConditions = conditionsHeading.test(heading);
    else if (inConditions && clean && !subLabel.test(heading) && !inlineConditionLine.test(clean)) conditions.push(clean);
    // "근무지: 구의오피스 (재택병행)" or "고용형태는 정규직…" stated inline in any section.
    const inlineCondition = !isHeading && inlineConditionLine.test(clean);
    if (inlineCondition && !statedTerms.includes(clean)) statedTerms.push(clean);
    // A tech stack list names the role's tools; keep it for tags only.
    if (isHeading) inStack = /^(?:기술스택|개발환경|사용하는툴|Techstack|Ourstack|Tools)/i.test(heading);
    else if (inStack && clean) stack.push(clean);
    // Stop role/tenure inference in tech lists, employee stories and legal copy.
    if (
      isHeading &&
      /^(?:기술스택|개발환경|함께일할사람들의이야기|개인정보(?:(?:처리|수집|이용)(?:방침|안내|동의|에관한)|보관|안내|보호(?:정책|방침|안내))|아래의개인정보|Techstack|Technology|Ourstories|Employee stories)/i.test(
        heading,
      ) ||
      /^보유기간/.test(heading)
    ) {
      section = "ignored";
      kind = "unspecified";
      activeRole = titleScope;
      continue;
    }
    if (
      isHeading &&
      (/^(?:합류여정|기타사항|채용절차|어떤방식으로채용|어떤기회가있나요|Benefits|Hiringprocess)/i.test(heading) ||
        closingHeading.test(heading))
    ) {
      section = "ignored";
      kind = "unspecified";
      activeRole = titleScope;
      continue;
    }
    if (isHeading && /^(?:회사소개|Aboutus|Aboutthecompany)$/i.test(heading)) {
      section = "neutral";
      kind = "unspecified";
      activeRole = titleScope;
      continue;
    }
    const preferredHere = preferredHeading.test(heading) || taggedPreferred.test(heading) || conversationalPreferred.test(heading);
    if (
      isHeading &&
      !preferredHere &&
      (qualificationHeading.test(heading) || taggedRequired.test(heading) || conversationalRequired.test(heading))
    ) {
      section = "qualifications";
      kind = "required";
      if (/공통|common/i.test(clean)) activeRole = titleScope;
      continue;
    }
    if (isHeading && preferredHere) {
      section = "qualifications";
      kind = "preferred";
      continue;
    }
    if (isHeading && (dutiesHeading.test(heading) || conversationalDuties.test(heading))) {
      section = "duties";
      inOverview = overviewHeading.test(heading);
      kind = "unspecified";
      activeRole = titleScope;
      continue;
    }
    if (section === "ignored") continue;
    if (clean && !isHeading && !inlineCondition) {
      if (inPrinciples) {
        // team principles: neither duties nor requirements
      } else if (section === "duties") {
        (inOverview ? overview : sections.duties).push(clean);
        if (listed && !inOverview) items.duties.push(clean);
      } else if (section === "qualifications") {
        (kind === "preferred" ? sections.preferred : sections.required).push(clean);
        if (listed) (kind === "preferred" ? items.preferred : items.required).push(clean);
      }
    }

    const explicit = rolesIn(clean, compilerTitle || compilerWork(clean));
    const isRoleHeader =
      /^(?:(?:senior|junior|staff)\s+)?(?:front[ -]?end|back[ -]?end|web|client|mobile|ios|android)\s+(?:engineer|developer)(?:\s*\([^)]*\))?$|^(?:프론트[ -]?엔드|백[ -]?엔드|웹|서버)\s*(?:개발자|엔지니어)$/i.test(
        clean,
      );
    if (isRoleHeader) {
      activeRole = explicit.length === 1 ? explicit[0] : undefined;
      if (/^(?:mobile|ios|android)\b/i.test(clean)) tracks.add("mobile");
      if (section !== "qualifications") {
        kind = "unspecified";
        section = "duties";
      }
    }
    const isDuty =
      section === "duties" &&
      /개발|설계|구현|build|develop|implement|design/i.test(clean) &&
      !collaboration.test(clean);
    if (explicit.length && (isRoleHeader || isDuty)) {
      for (const role of explicit) {
        // A dedicated title needs an explicit additional role track; an API
        // integration duty is not evidence of recruiting another profession.
        if (!isRoleHeader && titleRoles.length && !titleRoles.includes(role))
          continue;
        // A non-engineering title ("CS Manager", "Data Analyst", "Product
        // Owner") is not recruiting developers because its duties mention them.
        if (!isRoleHeader && !titleRoles.length && !openTitle) continue;
        tracks.add(role);
        roles.add(role);
        if (!evidence.some((item) => item.role === role && item.text === text))
          evidence.push({ role, text });
      }
    }
    // Section labels give strength, not proof that every number is tenure.
    // Outside qualifications, require an explicit applicant phrase as well.
    // Inside qualifications a stated duration is tenure even without the word
    // "경력" ("5년 이상 이커머스 환경에서 … 주도한 분"); elsewhere it needs a career word
    // and an applicant phrase. Contract lengths are never tenure.
    const tenure =
      duration.test(text) &&
      !narrativeDuration.test(text) &&
      !contractLength.test(text) &&
      (section === "qualifications"
        ? career.test(text) || /이상|at least|minimum|\+\s*years?|분$/i.test(text)
        : career.test(text) && applicant.test(text));
    const openLevel =
      /경력\s*무관|신입\s*(?:가능|지원)|no (?:prior )?experience required/i.test(
        text,
      );
    if (!(tenure || openLevel)) continue;
    // A collaboration line names a partner role, not this posting's role; it
    // only counts when it states this applicant's own tenure.
    const partnerLine = collaboration.test(text);
    if (partnerLine && !tenure) continue;
    // "신입 가능 (경력자 우대)" opens the role to new graduates; it is not a
    // preferred-experience requirement, so keep it unspecified and verbatim.
    const role = partnerLine
      ? activeRole
      : explicit.length === 1
        ? explicit[0]
        : explicit.length > 1
          ? undefined
          : activeRole;
    // "관련 경력 5년 이상, 보안 운영 경험 3년 이상 우대": each clause with its
    // own duration has its own kind; a trailing 우대 binds to its clause only.
    // A trailing 우대 binds to its own comma clause ("관련 경력 5년 이상, 보안
    //자격증 보유자 우대"): when some clauses are preferred and others not, each
    // dated clause is classified on its own. Plain comma lists stay one condition.
    // A 우대 inside parentheses names a preferred specialization ("(이커머스,
    // IT 분야 우대)"), not the clause's kind; only a bare "(우대)" marks it.
    const preferredClause = (clause: string) =>
      /우대|preferred|nice to have/i.test(clause.replace(/\((?!\s*(?:우대|preferred)\s*\))[^)]*\)|\[[^\]]*\]/gi, ""));
    const allParts = topLevelClauses(text);
    const mixed = allParts.length > 1 && allParts.some(preferredClause) && !allParts.every(preferredClause);
    const dated = allParts.filter((clause) => duration.test(clause));
    const clauses = mixed && dated.length ? dated : [text];
    for (const clause of clauses) {
      const explicitKind = openLevel && !tenure
        ? "unspecified"
        : preferredClause(clause)
          ? "preferred"
          : kind;
      experience.push({
        kind: explicitKind,
        text: mixed ? clause.replace(/^[•·\-*\s]+/, "").trim() : text,
        evidence: text,
        ...(role ? { role } : {}),
      });
    }
  }
  // Titles state tenure too, often stricter than a body line about one skill ("Analytics
  // Engineer (경력 5년 이상)" over "3년 이상 DW 설계 경험"), so the title counts beside the
  // body. Keep the original title and unspecified strength; a contract length is not career experience.
  if (/(?:경력\s*)?\d{1,2}\s*년\s*(?:이상|[~–-]\s*\d{1,2}\s*년)|\d{1,2}\+\s*years?\s+(?:of\s+)?experience/i.test(job.title)) {
    experience.push({kind:"unspecified",text:`제목에 명시: ${job.title}`,evidence:job.title,fromTitle:true,...(titleScope?{role:titleScope}:{})});
  }
  // Provider metadata has no required/preferred section context. Prefer source
  // sentences whenever available so “or equivalent” is never truncated away.
  if (!experience.length && job.experience?.trim()) {
    // Boards store an open upper bound as a large number ("경력 3~30년").
    const text = job.experience.trim().replace(/(\d{1,2})\s*~\s*([2-9]\d)\s*년/, "$1년 이상");
    experience.push({
      kind: "unspecified",
      text,
      evidence: text,
      ...(titleScope ? { role: titleScope } : {}),
    });
  }
  if (!sections.duties.length) sections.duties.push(...overview);
  return {
    sections,
    items,
    stack,
    conditions: [...statedTerms, ...conditions]
      .map((line, index) => ({ line, index }))
      .sort((a, b) => conditionRank(a.line) - conditionRank(b.line) || a.index - b.index)
      .map(({ line }) => line)
      .slice(0, MAX_CONDITIONS),
    roles: [...roles],
    scope:
      tracks.size > 1
        ? "combined"
        : tracks.size === 1
          ? "dedicated"
          : "unknown",
    evidence,
    experience,
  };
}
