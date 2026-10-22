import test from "node:test";
import assert from "node:assert/strict";
import { classifyRole } from "../lib/roles";
import { projectJob, roleLabels, type Job } from "../lib/jobs";

// Real titles from the 2026-10-04 snapshot.
const cases: [string, string][] = [
  ["Staff Front-end Engineer (Eats Web)", "frontend"],
  ["커머스 백엔드 개발자 (상품/주문/회원/파트너)", "backend"],
  ["Staff Back-end Engineer (Security Service Engineering)", "backend"],
  ["Staff Android Engineer (Rocket Pay)", "mobile"],
  ["Senior Staff Security Engineer, Mobile Security (Digital Trust)", "security"],
  ["Security Compliance Manager", "security"],
  ["Quality Assurance Engineer", "qa"],
  ["[SW] System SoC SW Test Engineer", "qa"],
  ["Sr. Staff, Technical Program Management (Coupang Intelligent Cloud)", "product"],
  ["Product Owner [정산·재무·회계시스템]", "product"],
  ["CPO (Cheif Product Officer)", "product"],
  ["[SW] NPU (DL) Compiler", "engineering"],
  ["[Art Dept.] Technical Art (5년 이상 / 계약직)", "design"],
  ["Strategic Talent Partner (HRBP) - Coupang Play", "hr"],
  ["[CPLB] 사내변호사", "legal"],
  ["[쿠팡] Senior Principal, Compliance (프라이버시 컴플라이언스 모니터링)", "legal"],
  ["[쿠팡] Financial Planning & Analysis (Central Functions)", "finance"],
  ["[쿠팡] 로켓배송 가구/수납 카테고리 직매입MD/브랜드매니저 채용 (경력)", "md"],
  ["Hotel Sales Manager", "sales"],
  ["Director, Sales Strategy & Planning | Rocket Growth", "sales"],
  ["그로스 마케터 (시니어)", "marketing"],
  ["[쿠팡] 비즈니스 분석가 (Business Analyst_Compliance Analytics)", "strategy"],
  ["CX Manager", "operations"],
  ["Interpreter & Translator (Chinese - Korean)", "operations"],
  ["Senior/Staff Applied Scientist (시니어/스태프 응용 과학자)", "data"],
  ["Director, Account Management (Coupang Eats Food S&B)", "sales"],
  ["[쿠팡] 로켓배송 상품기획 담당자 상시 채용(경력 7년 이상)", "md"],
  ["[쿠팡] 디지털 미디어 플래너 (대형광고주 담당)", "marketing"],
  ["Staff Product Design (Wow UX)", "design"],
  ["[쿠팡페이] 금융소비자보호 담당자(Consumer Protection Team)", "legal"],
  ["Director, Supply Chain Management (Global SCM)", "operations"],
  ["[HW] NPU Architect", "engineering"],
  ["[쿠팡로지스틱스서비스] Senior Payroll Specialist", "hr"],
  ["App Lead", "mobile"],
  ["Performance Marketer (Beauty PB)", "marketing"],
  ["[CPLB] 재고관리 담당자 채용 (Coupang Private Label Brands)", "operations"],
  ["Promotion Marketer [Sales Promotion]", "marketing"],
  ["Senior Threat Detection Engineer", "security"],
  ["[경력] Red Team Engineer", "security"],
  ["Staff, Detection Platform Engineer", "security"],
  ["Director, Logistics Security & Loss Prevention", "operations"],
  ["QA 엔지니어", "qa"],
  ["QA Manager", "qa"],
  ["[CPLB] 의류 QA채용 (계약직)", "operations"],
  ["Principal Strategic Sourcing Manager (IT Infrastructure)", "operations"],
  ["[HW] FPGA Platform Engineer", "engineering"],
  ["[R&D] Safety Manager (ISO 26262)", "engineering"],
  ["[쿠팡] Commerce Strategy (사내변호사)", "legal"],
  ["Software Engineer (Backend)", "backend"],
  ["[쿠팡풀필먼트서비스] Business Analyst (Fresh FC Fp&A)", "finance"],
  ["Principal, Risk (Security GRC)", "security"],
  ["Staff AI Engineer (Security)", "security"],
  ["DBA (Foundation Platform)", "infra"],
  ["Project Manager (AI 기업교육)", "product"],
  ["S&OP 담당자 (무신사로지스틱스)", "operations"],
  ["머천다이징 VMD (무신사 스탠다드)", "md"],
  ["Customer Success Manager - Quality - Korea", "sales"],
  ["Communication Team Leader", "marketing"],
  ["[커피챗] 핀다 크루와 이야기 나눠보세요 ☕️", "other"],
  ["Senior Product Designer (Rocket Growth)", "design"],
  ["Product Owner, Enterprise Solutions", "product"],
  ["Technical Program Manager (Infra)", "product"],
  ["Site Reliability Engineer", "infra"],
  ["Sr. Staff - AI Data Center Architect", "infra"],
  ["Associate General Counsel, Cloud Infrastructure & Technology", "legal"],
  ["머신러닝 research scientist (R&D)", "data"],
  ["Solution Architect (MLOps)", "data"],
  ["[KR] AI Sales Manager", "sales"],
  ["신사업 Business Developer", "sales"],
  ["Full-Stack Engineer", "engineering"],
  ["[HW] DDR Memory Subsystem SoC Engineer", "engineering"],
  ["Growth Marketer(3-7년)", "marketing"],
];

test("공고 제목으로 직군을 분류하고 겹치는 표현은 정해진 순서로 푼다", () => {
  for (const [title, role] of cases) assert.equal(classifyRole(title), role, title);
});

test("저장된 예전 직군 값과 무관하게 화면에서는 제목으로 다시 분류한다", () => {
  const stored = { title: "Site Reliability Engineer", role: "engineering", roleLabel: "엔지니어링", description: "", experience: null } as unknown as Job;
  const job = projectJob(stored);
  assert.equal(job.role, "infra");
  assert.equal(job.roleLabel, roleLabels.infra);
  assert.ok(job.insights?.roles.includes("infra"));
});

test("기존 직군 키는 유지된다(URL·쿠키 호환)", () => {
  for (const key of ["frontend", "backend", "engineering", "design", "other"]) assert.ok(Object.hasOwn(roleLabels, key));
});

test("기술 태그는 이 직무의 섹션에서만 뽑고, 섹션이 없으면 본문 전체를 쓴다", () => {
  const base = { id: "x", source: "greenhouse", sourceBoard: "acme", sourceJobId: "1", sourceUrl: "https://x", company: "Acme", initial: "A", color: "#fff", location: "seoul", locationLabel: "Seoul", experience: null, salary: null, tags: [], updatedAt: null, fetchedAt: "2026-10-05T00:00:00Z", role: "other", roleLabel: "" } as unknown as Job;
  const scoped = projectJob({ ...base, title: "[HW] SoC ASIC Design Engineer", description: "회사 소개\n우리 웹은 React로 만듭니다\nRequirements\n• Proficient in Tcl, Python, and Perl" });
  assert.deepEqual(scoped.tags, ["Python"]);
  const unstructured = projectJob({ ...base, title: "Engineer", description: "We use React and TypeScript." });
  assert.deepEqual(unstructured.tags, ["React", "TypeScript"]);
});

test("근무지 표기에서 회사 이름과 반복을 뺀다", async () => {
  const { tidyLocation } = await import("../lib/jobs");
  assert.equal(tidyLocation("㈜딥엑스 · 대한민국 경기도 성남시 판교역로241번길 20 · ㈜딥엑스", "딥엑스"), "대한민국 경기도 성남시 판교역로241번길 20");
  assert.equal(tidyLocation("역삼 · 서울특별시 강남구", "컬리"), "역삼 · 서울특별시 강남구");
  assert.equal(tidyLocation("㈜딥엑스", "딥엑스"), "㈜딥엑스");
});

test("목록에는 지역과 구까지만 보여준다", async () => {
  const { shortLocation } = await import("../lib/jobs");
  assert.equal(shortLocation("역삼 · 서울특별시 강남구 테헤란로 133"), "역삼 · 강남구");
  assert.equal(shortLocation("서울특별시 송파구 송파대로 55"), "송파구");
  assert.equal(shortLocation("Seoul, South Korea"), "Seoul, South Korea");
  assert.equal(shortLocation("판교"), "판교");
});
