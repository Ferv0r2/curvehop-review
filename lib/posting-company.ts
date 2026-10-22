import { sourceKey } from "./sources";
import type { Provider } from "./jobs";

/**
 * Career boards that carry other companies' postings: a group's shared board registered under one
 * of its companies. A posting there belongs to the board's company only when its title does not
 * name another company. Reviewed 2026-10-11 against each posting's own title label and company
 * introduction (QA P1: KIS정보통신 showed NICE group postings, 이스트시큐리티 showed ESTgames').
 *
 * - `others`: title labels that name another company, mapped to the name shown for it: a leading
 *   `[label]`, or a trailing `(label, …)` whose first part is one of these (letter case aside). A label
 *   stays here only when the posting's introduction presents a separate company ("쿠팡의 계열사",
 *   "쿠팡 주식회사에서 분사한 쿠팡페이", its own company introduction) or the label is plainly another
 *   company's name. A brand or service of the board's company (캐시워크, 텀블벅, 쿠팡플레이) is its own.
 * - `intros`: a company introduction a posting opens with, mapped to the company it introduces. Some
 *   affiliate postings carry no label ("Staff Backend Engineer (Rocket Pay)") but open with their
 *   company's own introduction ("회사 소개 쿠팡페이의 핀테크 사업은…"). Matched in the description's first
 *   characters with whitespace ignored, so a later mention never counts.
 * - `group`: labels naming the group itself, for postings that assign the employer later ("합격 단계에서
 *   위버스마인드 또는 위버스브레인에 배치"). Unconfirmed: neither the board company's nor one other company's.
 * - `ownOnly`: for a board where the company is one of many, the labels that are its own. A posting
 *   with none of them and no `others` label is unconfirmed: not counted as the company's, and never
 *   called another company's either (its label may be "경력" as easily as a new group company).
 *
 * Postings that are not the company's own are not its count, roles, experience or research
 * evidence, and not listed (the listing shows postings of companies the site covers). The company
 * page lists them apart (lib/research.ts boardOtherJobs).
 */
export type SharedBoard = {
  sourceKey: string;
  others: Readonly<Record<string, string>>;
  intros?: Readonly<Record<string, string>>;
  group?: readonly string[];
  ownOnly?: readonly string[];
};

export const sharedBoards: readonly SharedBoard[] = [
  {
    sourceKey: "greeting:nice",
    ownOnly: ["KIS정보통신", "KIS"],
    others: {
      "NICE정보통신": "NICE정보통신", "NICE디앤에스": "NICE디앤에스", "NICE인베스팅": "NICE인베스팅",
      "NICE평가정보": "NICE평가정보", "NICE디앤비": "NICE디앤비", "NICE피앤아이": "NICE피앤아이",
    },
  },
  {
    sourceKey: "greeting:estfamily",
    ownOnly: ["ESTsecurity", "이스트시큐리티"],
    others: { "ESTgames": "이스트게임즈", "ESTsoft": "이스트소프트", "엑스포넨셜자산운용": "엑스포넨셜자산운용" },
  },
  {
    sourceKey: "greenhouse:coupang",
    others: {
      "쿠팡로지스틱스서비스": "쿠팡로지스틱스서비스", "CLS": "쿠팡로지스틱스서비스",
      "쿠팡풀필먼트서비스": "쿠팡풀필먼트서비스",
      "쿠팡페이": "쿠팡페이", "Coupang Pay": "쿠팡페이", "Coupang Pay Tech": "쿠팡페이",
      "쿠팡이츠서비스": "쿠팡이츠서비스", "Coupang Eats Service": "쿠팡이츠서비스", "CES": "쿠팡이츠서비스",
      "쿠팡파이낸셜": "쿠팡파이낸셜", "Coupang Financial": "쿠팡파이낸셜", "CFN": "쿠팡파이낸셜",
    },
    intros: {
      "쿠팡페이의 핀테크 사업은": "쿠팡페이",
      // The English 쿠팡페이 introduction: "…financial services for both our consumers and sellers, … Coupang Pay focuses on…".
      "The fintech business of Coupang is reimagining financial services": "쿠팡페이",
      "쿠팡이츠서비스(Coupang Eats Services)는": "쿠팡이츠서비스",
      "CLS(Coupang Logistics Services)는": "쿠팡로지스틱스서비스", "Coupang Logistics Services(이하 CLS)는": "쿠팡로지스틱스서비스",
      "Coupang Logistics Service(이하 CLS)는": "쿠팡로지스틱스서비스", "CLS는 국토교통부로 지정받은 택배 운송 사업자": "쿠팡로지스틱스서비스",
      "CFS(Coupang Fulfillment Services)는": "쿠팡풀필먼트서비스", "Coupang Fulfillment Services(이하 CFS)는": "쿠팡풀필먼트서비스",
      "쿠팡파이낸셜(CFN)은": "쿠팡파이낸셜",
    },
  },
  {
    // 당근서비스's own board (its page shows 당근서비스's business number), registered as 당근마켓 through
    // 당근마켓's careers page (2026-10-15 user decision: shared-board handling, no retirement). All twelve
    // postings reviewed then name 당근서비스 only in their Greeting workplace ("당근서비스 · 서울특별시 구로구
    // 디지털로 300") and team introductions ("당근서비스 구성원"), with no title label: unconfirmed, never
    // counted as 당근마켓's. Only a title labelled [당근마켓] is 당근마켓's ("당근" is both companies' brand).
    sourceKey: "greeting:daangnservice",
    ownOnly: ["당근마켓"],
    others: { "당근서비스": "당근서비스" },
  },
  {
    sourceKey: "greeting:weavers",
    others: { "위버스브레인": "위버스브레인", "더블유컴즈": "더블유컴즈" },
    group: ["Weavers Group"],
  },
];

/** The shown name for a posting whose company is unconfirmed on an `ownOnly` board. */
export const UNCONFIRMED_COMPANY = "회사 확인 전";

/** A title's leading square-bracket labels: "[경력][NICE정보통신] 백엔드" → ["경력", "NICE정보통신"]. */
export function titleLabels(title: string): string[] {
  const labels: string[] = [];
  let rest = title;
  for (let match; (match = /^\s*[[【]([^\]】]{1,40})[\]】]/.exec(rest)); rest = rest.slice(match[0].length)) {
    const label = match[1].trim();
    if (label) labels.push(label);
  }
  return labels;
}

/** A title's trailing parenthesis, first comma part: "Backend Engineer (Coupang pay, Fintech)" → "Coupang pay". */
export function trailingLabel(title: string): string | null {
  const match = /[(（]([^()（）]{1,60})[)）]\s*$/.exec(title);
  const label = match?.[1].split(",")[0].trim();
  return label || null;
}

export type PostingCompany = { kind: "own" } | { kind: "other"; company: string } | { kind: "unconfirmed"; labels: string[] };

/** How far into a description a company introduction may start ("English will follow Korean text 회사 소개 …"). */
const INTRO_WINDOW = 600;
const compact = (text: string) => text.replace(/[\s\u200b]+/g, "");

/** Whose posting this is, by its board, the labels its title carries and the introduction it opens with. */
export function postingCompanyOnBoard(key: string, title: string, description = ""): PostingCompany {
  const board = sharedBoards.find(b => b.sourceKey === key);
  if (!board) return { kind: "own" };
  const labels = titleLabels(title), trailing = trailingLabel(title);
  const named = (label: string) => Object.entries(board.others).find(([key]) => key.toLowerCase() === label.toLowerCase())?.[1];
  // A trailing parenthesis names a company only when it is exactly a reviewed label ("(Coupang Pay)"), never a team.
  const other = [...labels, ...(trailing ? [trailing] : [])].map(named).find(name => name !== undefined);
  if (other !== undefined) return { kind: "other", company: other };
  if (labels.some(label => board.group?.includes(label))) return { kind: "unconfirmed", labels };
  const opening = board.intros && compact(description.slice(0, INTRO_WINDOW));
  const introduced = opening && Object.entries(board.intros!).find(([intro]) => opening.includes(compact(intro)))?.[1];
  if (introduced) return { kind: "other", company: introduced };
  if (board.ownOnly && !labels.some(label => board.ownOnly!.includes(label))) return { kind: "unconfirmed", labels };
  return { kind: "own" };
}
type PostingFields = { source: Provider; sourceBoard: string; title: string; description: string };
export const postingCompanyOf = (job: PostingFields) =>
  // Snapshot rows are validated loosely: a missing body is no introduction, never a crash.
  postingCompanyOnBoard(sourceKey({ provider: job.source, board: job.sourceBoard }), job.title, typeof job.description === "string" ? job.description : "");

/** Not the board company's own posting: another company's or unconfirmed. Never counted as the company's. */
export const notOwnPosting = (job: PostingFields) => postingCompanyOf(job).kind !== "own";

/** The company name to show for a posting that is not the board company's own; null for its own. */
export function postingCompanyLabel(job: PostingFields): string | null {
  const company = postingCompanyOf(job);
  return company.kind === "other" ? company.company : company.kind === "unconfirmed" ? UNCONFIRMED_COMPANY : null;
}

/** Whether a source key is a shared board: its trend counts every company's postings on it. */
export const isSharedBoard = (key: string) => sharedBoards.some(b => b.sourceKey === key);
