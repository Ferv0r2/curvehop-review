import type { Role } from "./jobs";

/*
 * Role from a posting title only. Titles are what the employer chose to name
 * the role; descriptions mention many roles in passing. First match wins, so
 * the order resolves overlaps:
 *   "Product Designer" → design (before product), "AI Product Manager" →
 *   product (before data), "Backend Engineer, Data Platform" → backend,
 *   "Data Center Engineer" → infra (before data), "Security Engineer" →
 *   security (before generic engineering).
 */
// Business titles that mention a technical domain ("AI Sales Manager",
// "Counsel, Cloud Infrastructure") are not technical roles.
const business =
  /counsel|attorney|lawyer|변호사|법무|\blegal\b|\bsales\b|영업|marketer|marketing|마케팅|\bhr(?:bp)?\b|recruit|리크루터|채용\s*담당|재무|회계|\bfinance\b|accounting|\bmd\b|머천다이저|business develop|사업\s*개발/i;
const technical = /engineer|developer|엔지니어|개발자|\bsde\b|product (?:owner|manager)|프로덕트|designer|디자이너|chief product/i;
// A compiler has its own front and back ends ("Legato compiler 설계 및 개발 (frontend &
// backend)"); in compiler work they never name web frontend/backend roles.
// A bare "IR" is too often something else ("IR 플랫폼", investor relations) to count alone.
export const compilerWork = (text: string) => /compiler|컴파일러|\bllvm\b|\bmlir\b|intermediate representation/i.test(text);
export const webRole = (role: Role) => role === "frontend" || role === "backend";

const rules: [Role, RegExp][] = [
  ["frontend", /front[ -]?end|프론트[ -]?엔드|\bweb (?:engineer|developer)\b|웹\s*(?:개발자|엔지니어)|퍼블리셔/i],
  ["backend", /back[ -]?end|백[ -]?엔드|서버\s*(?:개발|엔지니어)|\bserver (?:engineer|developer)\b/i],
  ["security", /security|보안|정보\s*보호|개인\s*정보\s*보호|\bciso\b|privacy|threat|red team|\biam\b|detection|침해|취약점|모의\s*해킹/i],
  ["mobile", /\b(?:ios|android|mobile|flutter|react native|app)\b|모바일|안드로이드/i],
  [
    "qa",
    /^qa\s*(?:manager|lead)\b|\bqa\s*엔지니어|\bsdet\b|\bsqa\b|quality assurance engineer|(?:software|\bsw\b|s\/w)[^,()]*\b(?:qa|quality|test)\b|\bqa\s*engineer|test (?:engineer|automation)|테스트\s*(?:엔지니어|자동화)/i,
  ],
  // Chip and hardware design is engineering, not product design or platform infra.
  ["engineering", /\bfpga\b|\basic\b|\bsoc\b|\brtl\b|hardware engineer|하드웨어|반도체/i],
  ["design", /\bdesigner\b|design (?:manager|director|lead)|product design|media design|\bux\b|art director|아트\s*디렉터|디자이너|디자인|technical art/i],
  [
    "product",
    /product (?:manager|owner|lead|director|management|officer)|\b(?:pm|po|cpo)\b|프로덕트\s*(?:매니저|오너|리드)|서비스\s*기획|기획자|(?:technical )?program manag(?:er|ement)|프로그램\s*매니저|project manag(?:er|ement)|프로젝트\s*(?:매니저|관리)|커리큘럼\s*기획/i,
  ],
  [
    "infra",
    /devops|devsecops|\bsre\b|site reliability|infrastructure|\binfra\b|platform engineer|cloud (?:engineer|architect)|network engineer|\bdba\b|database administrator|data\s*center|데브옵스|인프라|클라우드\s*(?:엔지니어|아키텍트)|데이터\s*센터/i,
  ],
  [
    "data",
    /\bdata (?:engineer|scientist|analyst|analytics|science|platform)\b|machine learning|\bml(?:ops)?\b|\bai\s*(?:engineer|research|researcher|scientist|developer|model)|(?:applied|research|data) scientist|\bllm\b|deep learning|computer vision|research (?:scientist|engineer)|데이터|머신\s*러닝|딥\s*러닝|인공\s*지능|ai\s*(?:엔지니어|연구|모델)/i,
  ],
  ["engineering", /engineer|developer|\bsde\b|software|compiler|firmware|architect|technology development|technician|테크니션|tech lead|integration manager|functional safety|iso\s*26262|^\[(?:sw|hw)\]|엔지니어|개발자|개발\s/i],
];

// Non-technical roles, tried only when no technical rule applies. Order
// resolves overlaps: "브랜드매니저 (직매입MD)" → md before marketing,
// "HRBP" → hr, "Sales Strategy" → sales before strategy, audit → finance,
// "Employment Counsel" → legal before hr.
const businessRules: [Role, RegExp][] = [
  ["legal", /counsel|attorney|lawyer|변호사|법무|\blegal\b|compliance|컴플라이언스|내부\s*통제|규제\s*대응|소비자\s*보호|consumer protection|\baml\b|자금\s*세탁|이상\s*거래|민원|investigation|내부\s*조사|사업법|개인\s*정보|대외\s*기관|\brisk\b|리스크/i],
  ["hr", /\bhr(?:bp|m|is)?\b|compensation|\bc&b\b|보상|payroll|급여|employee relations?|노무|인사|채용\s*(?:담당|팀|매니저)|recruit|리크루터|헤드헌터|talent (?:partner|acquisition)|l&d|learning\s*&\s*development/i],
  ["finance", /재무|회계|세무|\bfinance\b|financial|fp&a|accounting|audit|감사|\bir\b|treasury|\btax\b|정산/i],
  ["md", /\bmd\b|\bamd\b|머천다이저|merchandis|buying|바잉|직매입|상품\s*기획|\bvmd\b|머천다이징|\bbm\b|\bpb\b|e-?commerce manager|카테고리\s*매니저|category (?:manager|growth)|브랜드\s*매니저/i],
  ["sales", /sales|영업|세일즈|commercial|사업\s*담당|해외\s*사업|business manager|\[bd\]|파트너\s*영입|customer success|account (?:manager|executive|partner|management)|key account|business develop|사업\s*개발|\bsdr\b|partnership|제휴|파트너십/i],
  ["marketing", /marketing|marketer|public relations|마케팅|마케터|\bcmo\b|\bbrand|브랜드|campaign|캠페인|growth|(?<!로켓)그로스|\bpr\b|홍보|content|콘텐츠|에디터|editor|writer|media planner|미디어\s*플래너|채널\s*플래너|retail media|광고|communication|커뮤니케이션|esports|photographer|포토그래퍼|retoucher|리터처|\bcrm\b/i],
  ["strategy", /strateg|전략|analyst|분석가|consultant|컨설턴트|ceo staff|product expert|business analys|사업\s*기획|경영\s*(?:기획|관리)|\bbi\b|consult/i],
  [
    "operations",
    /operation|오퍼레이션|운영|품질|quality|\bqa\b|검수|\bfc\b|포장|설비|logistics|s&op|general affairs|automation|행정|\bops\b|\bcx\b|\bcs\b|고객|support|물류|fulfillment|풀필먼트|inventory|supply chain|\bscm\b|재고|공급|운송|밀크런|구매|procurement|sourcing|소싱|배송|딜리버리|delivery|입점|가맹|safety|안전|assistant|어시스턴트|비서|admin|총무|통번역|interpreter|translator|간호사|coordinator|specialist/i,
  ],
];
const businessRole = (title: string): Role =>
  businessRules.find(([, pattern]) => pattern.test(title))?.[0] ?? "other";

function classifyText(title: string): Role {
  if (/business develop|사업\s*개발/i.test(title)) return "sales";
  // Physical security and purchasing are operations even when they name a
  // security or technical domain ("Strategic Sourcing (IT Infrastructure)").
  if (/loss prevention|physical security|물류\s*보안|경비/i.test(title)) return "operations";
  if (/sourcing|procurement|구매/i.test(title) && !technical.test(title)) return "operations";
  if (business.test(title) && !technical.test(title)) return businessRole(title);
  const compiler = compilerWork(title);
  return rules.find(([role, pattern]) => pattern.test(title) && !(compiler && webRole(role)))?.[0] ?? businessRole(title);
}

// Bracketed parts usually name the team or brand ("Performance Marketer
// (Beauty PB)", "재고관리 담당자 (Private Label Brands)"), not the job. Classify
// the bare title first; consult the brackets only when the bare title is too
// generic ("Software Engineer (Backend)", "[HW] NPU Architect").
const bare = (title: string) =>
  title.replace(/\[[^\]]*\]|\([^)]*\)|【[^】]*】/g, " ").replace(/\s+/g, " ").trim();
const generic = new Set<Role>(["engineering", "other"]);
const specific = new Set<Role>(["frontend", "backend", "mobile", "qa", "design", "product", "infra"]);

export function classifyRole(title: string): Role {
  // A few bracketed facts decide the job outright.
  if (/iso\s*26262|functional safety|\basil\b/i.test(title)) return "engineering";
  if (/사내\s*변호사|변호사|counsel|attorney/i.test(title)) return "legal";
  const core = bare(title);
  // A bracket that names a function, not a team, still decides the job
  // ("Business Analyst (FP&A)" → finance, "AI Engineer (Security)" → security).
  // A specific technical title keeps its role ("Back-end Engineer (Security
  // Service)", "Product Owner [정산·재무·회계시스템]").
  const role = classifyText(core || title);
  const brackets = title.match(/\[[^\]]*\]|\([^)]*\)/g)?.join(" ") ?? "";
  if (!specific.has(role)) {
    if (/security|보안|\bgrc\b/i.test(brackets) && !/loss prevention/i.test(title)) return "security";
    if (/fp&a|재무|회계|treasury/i.test(brackets)) return "finance";
  }
  if (!generic.has(role) || core === title) return role;
  const full = classifyText(title);
  return generic.has(full) && role === "engineering" ? role : full;
}
