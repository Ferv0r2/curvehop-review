/**
 * Name keys for matching a pension workplace to a legal entity (DART, FSC).
 * A key only proposes candidates: every match still needs the business
 * number's first six digits to agree, so generous variants are safe.
 *
 * - name:     corporate markers, spaces and punctuation removed
 * - spelled:  short Latin runs spelled as Korean letter names (LG CNS ↔ 엘지씨엔에스, NHN KCP ↔ 엔에이치엔케이씨피, I&C ↔ 아이앤씨)
 * - alias:    brand words written either way (NAVER ↔ 네이버, SOOP ↔ 숲)
 * - division: a branch or division name reduced to its legal entity ("스마일게이트 캠퍼스 지점" → 스마일게이트,
 *             "롯데쇼핑(주)e커머스사업본부" → 롯데쇼핑, "두산 디지털이노베이션BU" → 두산); the match records that mapping
 * - english:  English legal names (DART corp_name_eng, FSC corpEnsnNm), in their own key space
 */
import { coreNameKey, nameKey, withoutBracketed } from "./seed";

export type Via = "name" | "spelled" | "alias" | "division" | "english";
export type NameVariant = { key: string; via: Via };

const LETTERS: Record<string, string> = {
  a: "에이", b: "비", c: "씨", d: "디", e: "이", f: "에프", g: "지", h: "에이치", i: "아이", j: "제이", k: "케이", l: "엘", m: "엠",
  n: "엔", o: "오", p: "피", q: "큐", r: "알", s: "에스", t: "티", u: "유", v: "브이", w: "더블유", x: "엑스", y: "와이", z: "지",
};
/** Brand words companies write in Latin in one register and in Hangul in the other. Explicit and short on purpose. */
export const BRAND_PAIRS: readonly (readonly [string, string])[] = [
  ["네이버", "naver"], ["숲", "soop"], ["카카오", "kakao"], ["라인", "line"], ["쿠팡", "coupang"], ["토스", "toss"], ["넥슨", "nexon"],
  ["크래프톤", "krafton"], ["넷마블", "netmarble"], ["웹젠", "webzen"], ["펄어비스", "pearlabyss"], ["컴투스", "com2us"], ["다날", "danal"],
  ["코웨이", "coway"], ["야놀자", "yanolja"], ["무신사", "musinsa"], ["티몬", "tmon"], ["위메프", "wemakeprice"], ["엔씨", "nc"],
];

const CORP_MARKERS = /주식회사|유한책임회사|유한회사|㈜|\(\s*주\s*\)|\(\s*유\s*\)|\(\s*사\s*\)|\(\s*재\s*\)|사단법인|재단법인/g;
// Markers inside a workplace name that are not part of the company's name.
const ROW_MARKERS = /\(\s*(?:[A-Za-z]|영업|영업소|본사|정규직|계약직|현채직|일용직|비정규직)\s*\)|\b(?:정규직|현채직|계약직|비정규직|일용직)\b|(?:정규직|현채직|계약직|비정규직|일용직)$/g;
// A trailing branch or division word: the workplace is part of the company before it.
const DIVISION = /(?:지점|지사|영업소|출장소|분사무소|사무소|사업본부|사업부문|사업부|본부|부문|BU|연구원|연구소|캠퍼스|센터|사업장|공장|정규직|현채직|계약직)$/i;

/** Latin runs of up to four letters spelled as Korean letter names; "&" as 앤. Spaces still separate runs here. */
export function spell(text: string): string | null {
  const source = text.normalize("NFKC").replace(CORP_MARKERS, " ").replace(/&/g, " 앤 ");
  if (!/(?:^|[^A-Za-z])[A-Za-z]{1,4}(?![A-Za-z])/.test(source)) return null;
  return nameKey(source.replace(/[A-Za-z]+/g, run => (run.length <= 4 ? [...run.toLowerCase()].map(c => LETTERS[c]).join("") : run)));
}

/** "Example Co., Ltd." → "example": an English legal name without company-form words. */
export function englishKey(text: string): string | null {
  const key = text.normalize("NFKC").toLowerCase()
    .replace(/\b(?:co|corp|corporation|inc|incorporated|ltd|limited|llc|company|korea|holdings?|group)\b\.?/g, " ")
    .replace(/[^a-z0-9]/g, "");
  return key.length >= 4 ? `en:${key}` : null;
}

/** The legal-entity part of a branch or division workplace name, or null when the name is not one. */
export function parentName(name: string): string | null {
  const text = name.normalize("NFKC").replace(ROW_MARKERS, " ").trim();
  // "롯데쇼핑(주)e커머스사업본부": a corporate marker in the middle, a division after it.
  const parts = text.split(CORP_MARKERS).map(part => part.trim()).filter(Boolean);
  if (parts.length >= 2 && parts.slice(1).every(part => DIVISION.test(part.replace(/\s+/g, "")))) return parts[0];
  const tokens = text.replace(CORP_MARKERS, " ").split(/\s+/).filter(Boolean);
  let keep = tokens.length;
  while (keep > 1 && DIVISION.test(tokens[keep - 1])) keep--; // one pass from the end, no re-slicing
  if (keep < tokens.length) return tokens.slice(0, keep).join(" ");
  // "엘지경영개발원AI연구원": one word ending in a division word, possibly after a Latin label.
  const single = tokens.join("");
  const m = single.match(DIVISION);
  if (tokens.length === 1 && m && single.length - m[0].length >= 2) {
    const rest = single.slice(0, -m[0].length).replace(/[A-Za-z0-9]+$/, "");
    if (rest.length >= 2) return rest;
  }
  return null;
}

function aliases(key: string): string[] {
  const out: string[] = [];
  for (const [ko, en] of BRAND_PAIRS) {
    if (key.includes(ko)) out.push(key.replace(ko, en));
    if (key.includes(en)) out.push(key.replace(en, ko));
  }
  return out;
}

/**
 * Every key a name is looked up or indexed by. `division: false` for names
 * that are already legal entities (DART, FSC rows), so an index never maps a
 * company to some other company's shortened name.
 */
/** Company names are short; anything longer is not a name and is cut before the (several) passes below. */
export const MAX_NAME = 300;
export function nameVariants(rawNames: string[], options: { division?: boolean; english?: string[] } = {}): NameVariant[] {
  const names = rawNames.map(name => name.slice(0, MAX_NAME));
  const out = new Map<string, Via>();
  const add = (key: string | null | undefined, via: Via) => { if (key && key.length >= 1 && !out.has(key)) out.set(key, via); };
  const keysOf = (name: string, via: Via) => {
    const cleaned = name.normalize("NFKC").replace(ROW_MARKERS, " ");
    for (const key of [nameKey(cleaned), coreNameKey(cleaned)]) if (key.length >= 2 || via !== "name") add(key, via);
    add(spell(cleaned), via === "name" ? "spelled" : via);
    add(spell(withoutBracketed(cleaned, " ", false)), via === "name" ? "spelled" : via);
    for (const key of [nameKey(cleaned), spell(cleaned)].filter((k): k is string => !!k)) for (const alias of aliases(key)) add(alias, via === "name" ? "alias" : via);
  };
  for (const name of names) keysOf(name, "name");
  if (options.division !== false)
    for (const name of names) { const parent = parentName(name); if (parent) keysOf(parent, "division"); }
  for (const name of options.english ?? []) add(englishKey(name.slice(0, MAX_NAME)), "english");
  return [...out].map(([key, via]) => ({ key, via }));
}

export const keySet = (names: string[], options?: Parameters<typeof nameVariants>[1]) => new Set(nameVariants(names, options).map(v => v.key));
