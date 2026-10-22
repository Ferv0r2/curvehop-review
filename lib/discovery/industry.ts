/**
 * Which workplaces count as IT·tech, by the pension file's six-digit industry
 * code (the NTS business-type code, not KSIC). Chosen from the codes present in
 * the 2026-09-23 file for registered Seoul/Bundang workplaces, conservatively:
 *
 * - TECH codes are accepted on the pension file alone.
 * - REVIEW codes are missing or mixed (999999 "BIZ_NO미존재사업장" holds
 *   우아한형제들·NHN·당근마켓·버킷플레이스; 730000 holds 루닛 next to
 *   universities; 659201 holds card companies next to foreign banks). A
 *   candidate whose workplaces are only REVIEW-coded is kept only when its
 *   KSIC (DART, or FSC's industry name) falls in a SCOPE_KSIC group.
 *
 * Every candidate carries a scope group (it, telecom, fintech, semiconductor)
 * so the groups can be filtered later. Everything else (traditional banks,
 * insurance, securities, retail, wholesale, media, other manufacturing) is
 * out, even when such a company also hires engineers.
 */
export const TECH_CODES: Readonly<Record<string, string>> = {
  "721000": "컴퓨터 시스템 통합 자문 및 구축 서비스업",
  "721001": "컴퓨터시설 관리업",
  "722000": "응용 소프트웨어 개발 및 공급업",
  "722001": "유선 온라인 게임 소프트웨어 개발 및 공급업",
  "722002": "모바일 게임 소프트웨어 개발 및 공급업",
  "722003": "기타 게임 소프트웨어 개발 및 공급업",
  "722004": "시스템 소프트웨어 개발 및 공급업",
  "722005": "컴퓨터 프로그래밍 서비스업",
  "723000": "자료 처리업",
  "723001": "호스팅 및 관련 서비스업",
  "724000": "데이터베이스 및 온라인 정보 제공업",
  "724002": "그 외 기타 정보 서비스업",
  "729000": "기타 정보 기술 및 컴퓨터 운영 관련 서비스업",
  "642004": "포털 및 기타 인터넷 정보 매개 서비스업",
  "525101": "전자상거래 소매업",
  "525102": "기타 통신 판매업",
  "525103": "전자상거래 소매 중개업",
  "730005": "전기ㆍ전자공학 연구개발업",
  "321002": "메모리용 전자집적회로 제조업",
  "321003": "비메모리용 및 기타 전자집적회로 제조업",
};

export const REVIEW_CODES: Readonly<Record<string, string>> = {
  "999999": "BIZ_NO미존재사업장 (업종 없음)",
  "000000": "해당없음",
  "730000": "기타 인문 및 사회과학 연구개발업",
  "749939": "그 외 기타 분류 안된 전문, 과학 및 기술 서비스업",
  "642001": "무선 및 위성 통신업",
  "642002": "통신 재판매업",
  "642003": "그 외 기타 전기 통신업",
  "515050": "컴퓨터 및 주변장치, 소프트웨어 도매업",
  "300100": "컴퓨터 제조업",
  "321000": "기타 반도체 소자 제조업",
  // 2026-10-08 scope decision: telecom, card·fintech, semiconductor·display. The pension codes for these are
  // old and mixed (banks, securities and card companies share 659201/659900/671900), so each needs DART's KSIC.
  "321001": "그 외 기타 전자 부품 제조업",
  "659201": "국내은행 (카드사·인터넷은행 포함)",
  "659900": "기타 금융 투자업",
  "659902": "그 외 기타 분류 안된 금융업",
  "659203": "그 외 기타 여신 금융업",
  "659206": "신용카드 및 할부 금융업",
  "671900": "그 외 기타 금융 지원 서비스업",
  "671201": "그 외 기타 금융 지원 서비스업",
  "749921": "그 외 기타 분류 안된 사업 지원 서비스업",
  "749937": "기타 사무 지원 서비스업",
  "523323": "통신기기 소매업",
};

export type Scope = "it" | "telecom" | "fintech" | "semiconductor";

/**
 * KSIC prefixes (DART `induty_code`) per scope group. A REVIEW-coded candidate
 * is kept only when its KSIC starts with one of these. Traditional banks
 * (64121 except INTERNET_BANKS), insurers (65), securities (6612), loss
 * adjusters and staffing are not in any group.
 */
export const SCOPE_KSIC: Readonly<Record<Scope, Readonly<Record<string, string>>>> = {
  it: { "582": "소프트웨어 개발 및 공급업", "620": "컴퓨터 프로그래밍, 시스템 통합 및 관리업", "631": "자료처리, 호스팅, 포털 및 기타 인터넷 정보매개 서비스업",
    "639": "기타 정보 서비스업", "4791": "전자상거래 및 통신 판매업", "7012": "공학 연구개발업" },
  telecom: { "612": "전기통신업 (61210 유선, 61220 무선, 61291 통신 재판매, 61299 그 외)" },
  fintech: { "64913": "신용카드업", "66199": "기타 금융 지원 서비스업 (전자지급·PG·핀테크)" },
  semiconductor: { "261": "반도체 제조업", "262": "전자부품 제조업 (표시장치 포함)", "29271": "반도체 제조용 기계 제조업" },
};
/** Internet-only banks are fintech although their KSIC (64121) is the same as a traditional bank's. */
export const INTERNET_BANKS = ["카카오뱅크", "토스뱅크", "케이뱅크"] as const;
const bankKey = (name: string) => name.normalize("NFKC").replace(/주식회사|㈜|\(\s*주\s*\)|\s/g, "");
export const isInternetBank = (name: string) => (INTERNET_BANKS as readonly string[]).includes(bankKey(name));

/** Kept for the older single-group check: the IT group's KSIC prefixes. */
export const DART_TECH_KSIC: Readonly<Record<string, string>> = SCOPE_KSIC.it;

export type IndustryTier = "tech" | "review" | null;
export function industryTier(code: string): IndustryTier {
  return TECH_CODES[code] ? "tech" : REVIEW_CODES[code] ? "review" : null;
}
/** Kept at the seed stage: TECH codes, REVIEW codes awaiting DART's industry, and the internet-only banks by name. */
export function isTechIndustry(code: string, name = ""): boolean {
  return industryTier(code) !== null || isInternetBank(name);
}

/** The scope group of a KSIC code (DART `induty_code`), or null. */
export function scopeFromKsic(code: string | null | undefined, corpName = ""): Scope | null {
  const value = String(code ?? "").trim();
  if (!/^\d{3,5}$/.test(value)) return null;
  if (value.startsWith("6412") && isInternetBank(corpName)) return "fintech";
  for (const [scope, prefixes] of Object.entries(SCOPE_KSIC) as [Scope, Record<string, string>][])
    if (Object.keys(prefixes).some(prefix => value.startsWith(prefix))) return scope;
  return null;
}
export function isDartTechKsic(code: string | null | undefined) { return scopeFromKsic(code) !== null; }

/** FSC's industry name (sicNm) when DART has no code: the same groups by name. */
export function scopeFromIndustryName(text: string | null | undefined): Scope | null {
  const value = String(text ?? "");
  if (/소프트웨어|컴퓨터 ?프로그래밍|시스템 ?통합|자료 ?처리|호스팅|포털|정보 ?서비스|전자상거래|데이터베이스/.test(value)) return "it";
  if (/전기 ?통신/.test(value)) return "telecom";
  if (/신용카드|전자 ?지급|지급 ?결제|기타 금융 ?지원/.test(value)) return "fintech";
  if (/반도체|전자 ?집적|전자 ?부품|표시 ?장치|디스플레이/.test(value)) return "semiconductor";
  return null;
}

/** The group of a candidate accepted on its pension code alone. */
export function scopeFromPension(codes: string[]): Scope {
  return codes.some(code => TECH_CODES[code]) && codes.filter(code => TECH_CODES[code]).every(code => code.startsWith("3210")) ? "semiconductor" : "it";
}
