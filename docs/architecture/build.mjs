// Curvehop 아키텍처 시안 생성기. `node build.mjs` → architecture.html
// 좌표는 SVG viewBox 기준 px. 사실 근거는 페이지 하단 '이 그림의 범위와 확인 근거'와 docs/architecture.md를 따른다.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// 공개 저장소의 docs/architecture/에서 실행하면 ROOT가 저장소 루트다. 그 밖(로컬 초안)에서는 경로 존재 검사를 건너뛴다.
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const IN_REPO = existsSync(join(ROOT, "SOURCE_MANIFEST.json"));

const C = {
  ink: "#172033", muted: "#596579", faint: "#8a94a6", line: "#e7e7f0", surface: "#f7f7fb",
  primary: "#4f50cc", accent: "#6263f1", ok: "#24523d", warn: "#93472b",
  night: "#1b2438", primaryTint: "#eeeefc", primaryLine: "#c9c9f3",
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const ICONS = {
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  collect: '<path d="M12 3.5v11"/><path d="M7.5 10.5 12 15l4.5-4.5"/><path d="M4.5 19.5h15"/>',
  archive: '<rect x="3.5" y="4.5" width="17" height="4.5" rx="1"/><path d="M5 9v10.5h14V9"/><path d="M10 13h4"/>',
  searchDoc: '<path d="M13 3.5H6.5v17H11"/><path d="M13 3.5l5 5V11"/><path d="M13 3.5v5h5"/><circle cx="16" cy="16" r="3"/><path d="m18.2 18.2 2.3 2.3"/>',
  checkDoc: '<path d="M14 3.5H6.5v17h11V7z"/><path d="M14 3.5V7h3.5"/><path d="m9 13.5 2 2 4-4"/>',
  gauge: '<path d="M4 16a8 8 0 0 1 16 0"/><path d="M12 16l3.5-4.5"/><path d="M4 19.5h16"/>',
  shield: '<path d="M12 3 19 6v5.5c0 4.6-3 7.8-7 9.5-4-1.7-7-4.9-7-9.5V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  pr: '<circle cx="6" cy="5.5" r="2"/><circle cx="6" cy="18.5" r="2"/><circle cx="18" cy="18.5" r="2"/><path d="M6 7.5v9"/><path d="M18 16.5V10a3 3 0 0 0-3-3h-4"/><path d="m13 4.5-2.5 2.5 2.5 2.5"/>',
  merge: '<circle cx="6" cy="5.5" r="2"/><circle cx="6" cy="18.5" r="2"/><circle cx="18" cy="12" r="2"/><path d="M6 7.5v9"/><path d="M6 7.5c0 3 3 4.5 10 4.5"/>',
  code: '<path d="m8.5 7-5 5 5 5"/><path d="m15.5 7 5 5-5 5"/><path d="m13.5 4.5-3 15"/>',
  layers: '<path d="M12 3.5 21 8l-9 4.5L3 8z"/><path d="m3 12 9 4.5 9-4.5"/><path d="m3 16 9 4.5 9-4.5"/>',
  bolt: '<path d="M13.5 3 5 13.5h6.5L10.5 21 19 10.5h-6.5z"/>',
  browser: '<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M3 9h18"/><path d="M6.5 6.75h.01M9 6.75h.01"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m15.5 15.5 4.5 4.5"/>',
  chart: '<path d="M5 20v-7"/><path d="M12 20V5"/><path d="M19 20v-10"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3.5 4v4.5H8"/><path d="M12 8v4l3 2"/>',
  log: '<rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  building: '<path d="M4 20.5V6l8-2.5v17"/><path d="M12 9h8v11.5"/><path d="M3 20.5h18"/><path d="M7.5 8.5h1.5M7.5 12h1.5M7.5 15.5h1.5M15.5 12.5h1.5M15.5 16h1.5"/>',
  gov: '<path d="M3 9 12 4l9 5"/><path d="M5.5 10v7.5M10 10v7.5M14 10v7.5M18.5 10v7.5"/><path d="M3.5 20.5h17"/>',
  news: '<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M7.5 8.5h9M7.5 12h9M7.5 15.5h5"/>',
  book: '<path d="M4.5 19.5v-14a2 2 0 0 1 2-2h13v14h-13a2 2 0 0 0-2 2 2 2 0 0 0 2 2h13v-4"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/>',
  git: '<circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="9" r="2"/><path d="M6 8v8"/><path d="M18 11c0 4-6 3-11.2 5.6"/>',
  cloud: '<path d="M7 18.5h10.5a4 4 0 0 0 .4-8 6 6 0 0 0-11.6 1.6A3.3 3.3 0 0 0 7 18.5z"/>',
  doc: '<path d="M14 3.5H6.5v17h11V7z"/><path d="M14 3.5V7h3.5"/><path d="M9.5 12h5M9.5 15.5h5"/>',
};

const symbols = Object.entries(ICONS)
  .map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 24 24">${v}</symbol>`)
  .join("");

const icon = (name, x, y, size, color) =>
  `<use href="#i-${name}" x="${x}" y="${y}" width="${size}" height="${size}" class="ico" style="color:${color}"/>`;

// 타일 종류: 누가 결정하는가(스크립트·모델·관문·권한 없음)와 경계 밖(외부·사용자)을 나눈다.
const TILE = {
  script: { fill: C.ink, stroke: C.ink, glyph: "#fff" },
  model: { fill: C.accent, stroke: C.accent, glyph: "#fff" },
  gate: { fill: C.ok, stroke: C.ok, glyph: "#fff" },
  advisory: { fill: "#fff", stroke: C.warn, glyph: C.warn, dash: "4 3" },
  derived: { fill: "#fff", stroke: C.faint, glyph: C.muted, dash: "4 3" },
  external: { fill: "#fff", stroke: "#c5cad6", glyph: "#7b8597" },
  user: { fill: "#fff", stroke: C.ink, glyph: C.ink },
  ops: { fill: "#fff", stroke: "#c5cad6", glyph: C.muted },
};

function node({ x, y, icon: name, title, sub, kind = "script", monoSub = false, cls = "", titleColor }) {
  const t = TILE[kind];
  const tc = titleColor ?? (kind === "external" || kind === "ops" ? C.muted : C.ink);
  return `<g class="node ${cls}">
    <rect x="${x}" y="${y}" width="44" height="44" rx="11" fill="${t.fill}" stroke="${t.stroke}" stroke-width="1.5"${t.dash ? ` stroke-dasharray="${t.dash}"` : ""}/>
    ${icon(name, x + 10, y + 10, 24, t.glyph)}
    <text x="${x + 56}" y="${y + 19}" class="t-title" fill="${tc}">${esc(title)}</text>
    ${sub ? `<text x="${x + 56}" y="${y + 38}" class="${monoSub ? "t-mono" : "t-sub"}">${esc(sub)}</text>` : ""}
  </g>`;
}

const EDGE = {
  data: { stroke: C.ink, width: 2, marker: "a-ink" },
  req: { stroke: C.primary, width: 2.75, marker: "a-primary" },
  req2: { stroke: C.primary, width: 1.75, marker: "a-primary" },
  aux: { stroke: C.faint, width: 1.5, dash: "5 4", marker: "a-faint" },
  noauth: { stroke: C.warn, width: 1.5, dash: "4 3", marker: "a-warn" },
  green: { stroke: C.ok, width: 2, marker: "a-ok" },
};

// flow: 움직임이 허용된 환경에서 선 위로 점이 흐른다. 배치는 느리게(slow), 요청은 빠르게(fast).
function edge(d, kind = "data", { head = true, cls = "", flow } = {}) {
  const e = EDGE[kind];
  const line = `<path d="${d}" fill="none" stroke="${e.stroke}" stroke-width="${e.width}"${e.dash ? ` stroke-dasharray="${e.dash}"` : ""} stroke-linecap="round" stroke-linejoin="round"${head ? ` marker-end="url(#${e.marker})"` : ""}/>`;
  const dots = flow ? `<path d="${d}" class="flow flow-${flow}" fill="none" stroke="#fff" stroke-width="${e.width - 0.5}" stroke-linecap="round"/>` : "";
  return `<g class="edge ${cls}">${line}${dots}</g>`;
}

const markers = Object.entries({ "a-ink": C.ink, "a-primary": C.primary, "a-faint": C.faint, "a-warn": C.warn, "a-ok": C.ok })
  .map(([id, color]) => `<marker id="${id}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1.2 9 5 1 8.8z" fill="${color}"/></marker>`)
  .join("");

// 설계 판단 번호. 그림 안의 위치를 아래 판단 목록과 같은 번호로 잇는다.
function callout(n, x, y) {
  return `<a href="#d${n}" class="callout c${n}" aria-label="판단 ${n}로 이동">
    <circle cx="${x}" cy="${y}" r="13" fill="${C.primary}" stroke="#fff" stroke-width="2.5"/>
    <text x="${x}" y="${y + 4.5}" text-anchor="middle" class="t-callout">${n}</text>
  </a>`;
}

function zone({ x, y, w, h, fill, stroke, badge, badgeFill, label, right, dash }) {
  return `<g class="zone">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="${fill}" stroke="${stroke}" stroke-width="1.25"${dash ? ` stroke-dasharray="${dash}"` : ""}/>
    <path d="M${x} ${y + 38}V${y + 16}a16 16 0 0 1 16-16H${x + 38}V${y + 38}z" fill="${badgeFill}"/>
    ${icon(badge, x + 9, y + 9, 20, "#fff")}
    <text x="${x + 50}" y="${y + 25}" class="t-zone">${esc(label)}</text>
    ${right ? `<text x="${x + w - 16}" y="${y + 25}" text-anchor="end" class="t-mono">${esc(right)}</text>` : ""}
  </g>`;
}

const defs = `<defs>${symbols}${markers}</defs>`;

// ───────────────────────── 그림 1: 전체 구조 ─────────────────────────
const W1 = 1620, H1 = 964;
const fig1 = `<svg class="fig fig1" viewBox="0 0 ${W1} ${H1}" role="img" aria-labelledby="fig1-title fig1-desc">
<title id="fig1-title">Curvehop 전체 구조</title>
<desc id="fig1-desc">외부 원천을 미니PC가 정해진 시각에 수집·조사·검토하고, 발행 관문을 통과한 자료만 GitHub data PR로 main에 머지된다. main은 Cloudflare Workers Builds가 검증해 배포하고, 사용자 요청은 Worker 안에서 배포된 자료만 읽고 끝난다.</desc>
${defs}

<!-- 두 개의 시계 -->
<g class="ribbon">
  <rect x="24" y="16" width="822" height="40" rx="10" fill="${C.night}"/>
  <text x="44" y="42" class="t-ribbon" fill="#fff"><tspan font-weight="700">느린 쪽 · 비공개 배치</tspan><tspan fill="#aeb6cb">  —  공고는 6시간마다, 조사·검토는 하루 한 번</tspan></text>
  <rect x="862" y="16" width="230" height="40" rx="10" fill="#e6f0ea" stroke="${C.ok}" stroke-width="1.25"/>
  <text x="977" y="42" text-anchor="middle" class="t-ribbon" fill="${C.ok}" font-weight="700">발행 = main 머지</text>
  <rect x="1108" y="16" width="488" height="40" rx="10" fill="${C.primaryTint}" stroke="${C.primaryLine}" stroke-width="1.25"/>
  <text x="1128" y="42" class="t-ribbon" fill="${C.primary}"><tspan font-weight="700">빠른 쪽 · 공개 런타임</tspan><tspan fill="${C.muted}">  —  요청마다, 배포된 자료만 읽는다</tspan></text>
</g>

<!-- 외부 원천 -->
<text x="24" y="101" class="t-zone" fill="${C.muted}">외부 원천</text>
<g class="ext">
${node({ x: 24, y: 246, icon: "building", title: "회사 채용 사이트", sub: "공식 ATS 4종", kind: "external" })}
${node({ x: 24, y: 336, icon: "gov", title: "공공 데이터", sub: "국민연금·DART·국세청", kind: "external" })}
${node({ x: 24, y: 426, icon: "news", title: "기사·인터뷰·영상", sub: "조사 중 웹 탐색", kind: "external" })}
</g>

<!-- 미니PC -->
${zone({ x: 244, y: 76, w: 602, h: 660, fill: "#f3f4f9", stroke: "#c8cde0", badge: "lock", badgeFill: C.night, label: "미니PC · 비공개 운영", right: "crontab → scripts/worker.ts" })}
${node({ x: 266, y: 124, icon: "clock", title: "cron (KST)", sub: "jobs 6h · research 10:00 · publish 11:30", monoSub: true })}
${edge("M288 170V196", "data")}
<rect x="262" y="202" width="418" height="452" rx="12" fill="none" stroke="${C.faint}" stroke-width="1.25" stroke-dasharray="6 4"/>
<text x="278" y="226" class="t-mono">worker.ts run jobs · research · publish</text>

<g class="hl hl2">
${node({ x: 280, y: 246, icon: "collect", title: "정형 수집", sub: "공고·공공 자료" })}
${node({ x: 480, y: 246, icon: "archive", title: "원본·실행 기록", sub: "보류·실패도 보관" })}
</g>
${edge("M440 268H474", "data", { cls: "hl hl2", flow: "slow" })}
<g class="hl hl2">
${node({ x: 280, y: 426, icon: "searchDoc", title: "조사 후보", sub: "Codex · 읽기 전용", kind: "model" })}
${node({ x: 480, y: 426, icon: "checkDoc", title: "원문 검토", sub: "별도 호출로 대조", kind: "model" })}
${node({ x: 480, y: 566, icon: "gauge", title: "JEV 병행 평가", sub: "외부 API · 기록만", kind: "advisory", titleColor: C.warn })}
</g>
<g class="hl hl2">
${edge("M444 448H474", "data", { flow: "slow" })}
${edge("M502 294V420", "aux")}
<text x="514" y="352" class="t-sub">보관한 원문을</text>
<text x="514" y="369" class="t-sub">검토에 함께 제공</text>
${edge("M502 474V560", "noauth")}
<text x="514" y="524" class="t-sub" fill="${C.warn}">주장 표본 하루 3건</text>
<path d="M652 588H686" stroke="${C.warn}" stroke-width="1.5" stroke-dasharray="4 3" fill="none"/>
<path d="M688 578V598" stroke="${C.warn}" stroke-width="2.5" stroke-linecap="round"/>
</g>

${node({ x: 280, y: 566, icon: "book", title: "위키·근거 색인", sub: "같은 자료의 파생본", kind: "derived" })}
${edge("M764 610V634H302V616", "aux")}

<!-- 외부 → 수집·조사 -->
${edge("M222 268H274", "data", { flow: "slow" })}
<path d="M222 358H238V268" fill="none" stroke="${C.ink}" stroke-width="2" stroke-linejoin="round"/>
<circle cx="238" cy="268" r="3.5" fill="${C.ink}"/>
${edge("M222 448H274", "data", { flow: "slow" })}

<!-- 발행 관문 -->
<g class="hl hl2">
  <rect x="696" y="236" width="136" height="374" rx="14" fill="${C.ok}"/>
  ${icon("shield", 748, 252, 32, "#fff")}
  <text x="764" y="308" text-anchor="middle" class="t-gate">발행 관문</text>
  <text x="764" y="340" text-anchor="middle" class="t-gate-sub">깨진 문자·형식</text>
  <text x="764" y="362" text-anchor="middle" class="t-gate-sub">공고 30% 급감 차단</text>
  <text x="764" y="384" text-anchor="middle" class="t-gate-sub">정상 출처 80% 이상</text>
  <text x="764" y="406" text-anchor="middle" class="t-gate-sub">인용·영수증 재계산</text>
  <text x="764" y="428" text-anchor="middle" class="t-gate-sub">채용 플랫폼 근거 금지</text>
  <path d="M716 458H812" stroke="#ffffff" stroke-opacity=".22"/>
  <text x="764" y="482" text-anchor="middle" class="t-gate-sub" font-weight="700" fill="#fff">검사가 실패하면</text>
  <text x="764" y="504" text-anchor="middle" class="t-gate-sub">공고·리서치: PR 보류</text>
  <text x="764" y="524" text-anchor="middle" class="t-gate-sub">관계·출처: 그 파일만 제외</text>
  <text x="764" y="546" text-anchor="middle" class="t-gate-sub">보류 기록은 남긴다</text>
  <text x="764" y="594" text-anchor="middle" class="t-gate-mono">lib/data-gate.ts</text>
</g>
${edge("M640 268H690", "data", { cls: "hl hl2", flow: "slow" })}
${edge("M640 448H690", "data", { cls: "hl hl2", flow: "slow" })}

<!-- GitHub -->
${zone({ x: 862, y: 76, w: 230, h: 660, fill: "#f6f7f9", stroke: "#cfd3dc", badge: "git", badgeFill: C.ink, label: "GitHub · 비공개 저장소" })}
<g class="hl hl3">
${node({ x: 882, y: 336, icon: "pr", title: "data PR", sub: "data 파일 4개만" })}
${node({ x: 882, y: 462, icon: "merge", title: "main", sub: "코드 + data/*.json" })}
</g>
${node({ x: 882, y: 604, icon: "code", title: "코드 PR", sub: "감리·테스트 통과", cls: "hl hl3" })}
${edge("M832 358H876", "green", { cls: "hl hl2 hl3", flow: "slow" })}
${edge("M904 384V456", "data", { cls: "hl hl3", flow: "slow" })}
<g class="hl hl3">
<text x="918" y="406" class="t-sub">GitGuardian·CF 검증</text>
<text x="918" y="424" class="t-sub">검증한 head 그대로</text>
<text x="918" y="442" class="t-mono">--match-head-commit</text>
</g>
${edge("M904 602V512", "data", { cls: "hl hl3" })}

<!-- Cloudflare -->
${zone({ x: 1108, y: 76, w: 266, h: 660, fill: "#f7f7fb", stroke: "#d6d6e8", badge: "cloud", badgeFill: C.ink, label: "Cloudflare Workers" })}
${edge("M1074 484H1096V172H1120", "data", { cls: "hl hl3 hl5", flow: "slow" })}
<g class="hl hl5">
${node({ x: 1126, y: 150, icon: "layers", title: "Workers Builds", sub: "main 커밋마다" })}
<path d="M1148 202V316" stroke="${C.line}" stroke-width="2"/>
${[["OpenNext 빌드", C.ink], ["workerd·Chromium 검증", C.ink], ["버전 업로드 → 배포", C.ink], ["release SHA·자료 해시 대조", C.ink], ["실패 → rollback·후속 보류", C.warn]]
  .map(([t, col], i) => `<circle cx="1148" cy="${214 + i * 24}" r="4" fill="#fff" stroke="${col}" stroke-width="1.75"/><text x="1162" y="${218 + i * 24}" class="t-step" fill="${col}">${esc(t)}</text>`)
  .join("")}
</g>
<g class="hl hl5">
${edge("M1148 326V408", "data", { flow: "slow" })}
<text x="1160" y="374" class="t-sub">통과한 버전만</text>
</g>

<!-- 요청 경로 영역 -->
<g class="hl hl1">
<rect x="1116" y="396" width="490" height="318" rx="18" fill="${C.primary}" fill-opacity="0.045" stroke="${C.primary}" stroke-width="1.5" stroke-dasharray="6 5"/>
<text x="1160" y="684" class="t-region" fill="${C.primary}">요청은 이 안에서 끝난다</text>
<text x="1160" y="702" class="t-sub">처리 중 모델·수집·Git 호출 없음 · 자료는 배포에 포함</text>
</g>

<rect class="keep" x="1124" y="414" width="236" height="236" rx="12" fill="#fff" stroke="${C.ink}" stroke-width="1.5"/>
  ${node({ x: 1138, y: 428, icon: "bolt", title: "Next.js on Worker", sub: "App Router · SSR", cls: "hl hl1 hl4 hl5" })}
  <g class="hl hl1 hl4">
  <rect x="1138" y="486" width="208" height="30" rx="8" fill="${C.primaryTint}" stroke="${C.primaryLine}"/>
  <text x="1150" y="506" class="t-chip">번들된 JSON 스냅샷</text>
  <rect x="1138" y="522" width="208" height="30" rx="8" fill="${C.primaryTint}" stroke="${C.primaryLine}"/>
  <text x="1150" y="542" class="t-chip">revisionCache · 공개 자료</text>
  </g>
  <g class="hl hl4">
  <rect x="1138" y="558" width="208" height="30" rx="8" fill="#fff" stroke="#d3d6e2"/>
  <text x="1150" y="578" class="t-chip">React cache · 렌더 1회</text>
  <rect x="1138" y="594" width="208" height="30" rx="8" fill="#fff" stroke="${C.warn}" stroke-dasharray="4 3"/>
  <text x="1150" y="614" class="t-chip">쿠키 조건 · 요청 1회</text>
  </g>

<!-- 사용자 -->
<text x="1420" y="101" class="t-zone" fill="${C.muted}">사용자</text>
${node({ x: 1420, y: 300, icon: "chart", title: "GA4 제품 계측", sub: "사용자 행동만", kind: "ops" })}
<g class="hl hl1 hl4">
${node({ x: 1420, y: 440, icon: "browser", title: "구직자 브라우저", sub: "북마크: localStorage", kind: "user" })}
</g>
<g class="hl hl1">
${node({ x: 1420, y: 560, icon: "search", title: "검색·AI 검색", sub: "같은 HTML을 읽음", kind: "user" })}
${edge("M1414 452H1368", "req", { flow: "fast" })}
${edge("M1366 474H1412", "req", { flow: "fast" })}
${edge("M1414 582H1368", "req2", { flow: "fast" })}
</g>
<g class="hl hl1">
<text x="1390" y="444" text-anchor="middle" class="t-edge" fill="${C.primary}">요청</text>
<text x="1390" y="493" text-anchor="middle" class="t-edge" fill="${C.primary}">HTML</text>
</g>
${edge("M1442 436V350", "aux")}

<!-- 관측 · 보관 -->
<path d="M24 752H1596" stroke="${C.line}" stroke-width="1.5"/>
<text x="24" y="778" class="t-zone" fill="${C.muted}">관측 · 보관 <tspan font-weight="500" fill="${C.faint}">— 요청 경로 밖</tspan></text>
${edge("M288 736V784", "aux")}
${edge("M568 736V784", "aux", { cls: "hl hl3" })}
${edge("M1138 650V784", "aux")}
${node({ x: 266, y: 790, icon: "bell", title: "운영 알림 · Discord", sub: "health · watchdog 매시", kind: "ops" })}
${node({ x: 546, y: 790, icon: "history", title: "비공개 이력 저장소", sub: "원본·실행 기록 백업", kind: "ops", cls: "hl hl3" })}
${node({ x: 1116, y: 790, icon: "log", title: "Workers 로그", sub: "Cloudflare observability", kind: "ops" })}

<!-- 공개 범위 -->
<path d="M24 882V892H1092V882" fill="none" stroke="${C.faint}" stroke-width="1.5"/>
<text x="24" y="918" class="t-scope"><tspan font-weight="700" fill="${C.ink}">비공개 운영</tspan><tspan fill="${C.muted}">  ·  공개 검토판에서 제외: worker 실행 진입점, 조사 프롬프트, 수집 원문, 실행 기록, 운영 설정</tspan></text>
<path d="M1108 882V892H1596V882" fill="none" stroke="${C.primary}" stroke-width="1.5"/>
<text x="1108" y="918" class="t-scope"><tspan font-weight="700" fill="${C.primary}">공개 검토판에서 실행</tspan></text>
<text x="1108" y="940" class="t-sub">파란 점선 안의 Next.js 앱 코드 · 로컬은 Node · 가상 회사 3곳</text>

${callout(1, 1116, 396)}
${callout(2, 832, 236)}
${callout(3, 882, 462)}
${callout(4, 1360, 556)}
${callout(5, 1126, 150)}
</svg>`;

// ───────────────────────── 그림 2a: 상태의 공유 범위 ─────────────────────────
function reqBox(x, label, cond, result) {
  return `<g>
    <rect x="${x}" y="244" width="304" height="236" rx="12" fill="#fff" stroke="${C.warn}" stroke-width="1.5" stroke-dasharray="5 4"/>
    ${icon("lock", x + 16, 258, 20, C.warn)}
    <text x="${x + 44}" y="274" class="t-title">${esc(label)}</text>
    <text x="${x + 288}" y="274" text-anchor="end" class="t-sub" fill="${C.warn}">다른 요청과 공유 안 함</text>
    <text x="${x + 16}" y="306" class="t-sub">쿠키 조건</text>
    <rect x="${x + 16}" y="314" width="272" height="32" rx="8" fill="#fbf4f0" stroke="#e6cdc1"/>
    <text x="${x + 30}" y="335" class="t-chip">${esc(cond)}</text>
    <text x="${x + 16}" y="374" class="t-sub">React cache — 한 렌더 안에서 같은 읽기는 1번</text>
    <rect x="${x + 16}" y="396" width="272" height="64" rx="10" fill="${C.ink}"/>
    <text x="${x + 32}" y="424" class="t-title" fill="#fff">${esc(result)}</text>
    <text x="${x + 32}" y="444" class="t-sub" fill="#c3c9d8">HTML · RSC로 응답</text>
  </g>`;
}

const fig2a = `<svg class="fig fig2" viewBox="0 0 720 520" role="img" aria-labelledby="fig2a-title">
<title id="fig2a-title">요청별 상태와 공유 자료의 범위</title>
${defs}
<rect x="8" y="8" width="704" height="504" rx="18" fill="${C.primaryTint}" stroke="${C.primaryLine}"/>
<text x="28" y="38" class="t-title">배포 1회</text>
<text x="96" y="38" class="t-sub">번들된 JSON 스냅샷 · 운영에서는 새 배포 때 교체</text>
<rect x="24" y="56" width="672" height="440" rx="14" fill="#f8f8fe" stroke="${C.primaryLine}"/>
<text x="44" y="86" class="t-title">Worker isolate</text>
<text x="160" y="86" class="t-sub">revisionCache — 같은 revision의 공개 자료만 공유</text>
<rect x="44" y="104" width="632" height="52" rx="10" fill="#fff" stroke="${C.primary}" stroke-width="1.5"/>
${icon("doc", 58, 118, 24, C.primary)}
<text x="92" y="135" class="t-title">회사 · 공고 · 리서치</text>
<text x="660" y="135" text-anchor="end" class="t-sub">revision r2 · 모든 요청이 같은 객체를 읽는다</text>
${edge("M196 158V236", "req")}
${edge("M524 158V236", "req")}
<text x="208" y="204" class="t-sub">읽기만</text>
<text x="536" y="204" class="t-sub">읽기만</text>
${reqBox(44, "요청 A", "프론트엔드 · 경력 3년", "A에게 맞춘 공고 목록")}
${reqBox(372, "요청 B", "백엔드 · 신입", "B에게 맞춘 공고 목록")}
</svg>`;

// ───────────────────────── 그림 2b: 늦게 끝난 이전 읽기 ─────────────────────────
const lanes = [["자료", 70], ["읽기 A", 170], ["읽기 B", 290], ["캐시 항목", 390]];
const fig2b = `<svg class="fig fig2" viewBox="0 0 720 520" role="img" aria-labelledby="fig2b-title">
<title id="fig2b-title">늦게 끝난 이전 revision 읽기를 버리는 순서</title>
${defs}
${lanes.map(([l, y]) => `<text x="16" y="${y + 5}" class="t-title">${l}</text><path d="M110 ${y}H704" stroke="${C.line}" stroke-width="1.5"/>`).join("")}
<rect x="120" y="55" width="230" height="30" rx="6" fill="${C.line}"/>
<text x="134" y="75" class="t-chip">r1</text>
<rect x="350" y="55" width="354" height="30" rx="6" fill="${C.primaryTint}" stroke="${C.primaryLine}"/>
<text x="364" y="75" class="t-chip" fill="${C.primary}">r2</text>
<text x="350" y="44" text-anchor="middle" class="t-sub">자료 갱신</text>
<path d="M350 50V90" stroke="${C.ink}" stroke-width="1.5"/>

<rect x="140" y="155" width="316" height="30" rx="6" fill="#fff" stroke="${C.faint}" stroke-width="1.5"/>
<text x="152" y="175" class="t-chip">r1에서 읽기 시작 · 느리게 끝남</text>
<circle cx="476" cy="170" r="13" fill="${C.warn}"/>
<path d="M471 165l10 10M481 165l-10 10" stroke="#fff" stroke-width="2.25" stroke-linecap="round"/>
<rect x="500" y="155" width="150" height="30" rx="6" fill="${C.primaryTint}" stroke="${C.primary}" stroke-width="1.25"/>
<text x="512" y="175" class="t-chip" fill="${C.primary}">B의 r2 항목 반환</text>
<text x="476" y="214" text-anchor="middle" class="t-sub" fill="${C.warn}">끝난 뒤 revision 재확인: r1 ≠ r2</text>
<text x="476" y="232" text-anchor="middle" class="t-sub" fill="${C.warn}">r1은 반환하지도, 캐시에 넣지도 않는다</text>

<rect x="368" y="275" width="74" height="30" rx="6" fill="${C.primaryTint}" stroke="${C.primary}" stroke-width="1.25"/>
<text x="380" y="295" class="t-chip" fill="${C.primary}">r2 읽기</text>
${edge("M432 307V372", "req")}
<text x="420" y="346" text-anchor="end" class="t-sub">설치</text>

<rect x="432" y="375" width="272" height="30" rx="6" fill="${C.primaryTint}" stroke="${C.primary}" stroke-width="1.25"/>
<text x="444" y="395" class="t-chip" fill="${C.primary}">r2 항목 유지</text>
<path d="M476 244V362" stroke="${C.warn}" stroke-width="1.5" stroke-dasharray="4 3" fill="none"/>
<path d="M466 364H486" stroke="${C.warn}" stroke-width="2.5" stroke-linecap="round"/>
<text x="490" y="340" class="t-sub" fill="${C.warn}">덮어쓰기 차단</text>

${edge("M110 456H700", "aux")}
<text x="700" y="478" text-anchor="end" class="t-sub">시간</text>
<text x="16" y="506" class="t-sub">계속 바뀌면 3번 시도 후 오류 · 오류가 나면 자기가 만든 항목만 지운다 · isolate 하나의 범위</text>
</svg>`;

// ───────────────────────── 판단 목록 ─────────────────────────
const DECISIONS = [
  {
    head: "요청 경로에 모델과 수집을 두지 않는다",
    why: "구직자가 읽는 속도와 화면의 정확도가 수집 실패나 모델 지연에 흔들리지 않아야 한다.",
    pick: "미니PC가 정해진 시각에 수집·조사·검토를 끝내 두고, Worker는 배포에 포함된 JSON만 읽는다. KV·R2·D1 같은 저장소 바인딩도 두지 않았다.",
    cost: "원문이 바뀌어도 다음 수집 → 발행 → 배포를 거쳐야 화면에 반영된다.",
    code: ["lib/store.ts", "ops:wrangler.jsonc", "tests/ssr-reads-http.test.mjs"],
  },
  {
    head: "모델의 정상 종료는 발행 승인이 아니다",
    why: "그럴듯한 문장이 근거 없이 사실로 공개되는 일을 막는다.",
    pick: "조사 후보와 원문 검토를 서로 다른 Codex 호출(읽기 전용, 하루 12회 상한)로 나누고, 공개 여부는 스크립트가 형식·인용·반영 영수증을 다시 계산해 정한다. JEV는 판정만 기록한다.",
    cost: "호출과 지연이 늘고, 근거가 모자란 주제는 보류로 쌓인다. JEV의 0.75는 정확도가 아니다.",
    code: ["ops:lib/data-gate.ts", "ops:lib/research-publication.ts", "lib/jev-shadow.ts", "ops:tests/data-gate.test.ts", "tests/jev-shadow.test.ts"],
  },
  {
    head: "데이터베이스 대신 Git의 JSON 파일",
    why: "자료와 코드를 같은 커밋으로 묶어 비교하고, 되돌리고, 배포된 내용을 확인한다.",
    pick: "미니PC가 자동 머지할 수 있는 파일은 공고·리서치·관계·등록 출처 4개뿐이고, data PR은 검증한 head 그대로만 머지한다. 나머지 data JSON은 코드 PR로만 바뀐다. 원본과 실행 기록은 비공개 이력 저장소에 따로 백업한다.",
    cost: "자료가 늘면 번들과 빌드가 커지고, 쓰기는 미니PC 한 곳에서만 한다. 자료 갱신이 곧 배포다. (2026-10-22 공고 1,647건)",
    code: ["ops:lib/deployment-data.ts", "ops:lib/worker.ts", "ops:scripts/cloudflare.mjs"],
  },
  {
    head: "공유 캐시에는 공개 자료만 넣는다",
    why: "다른 사람의 직무·경력 조건이 내 목록에 섞이거나, 늦게 끝난 이전 읽기가 새 자료를 덮지 않게 한다.",
    pick: "revisionCache는 같은 revision의 공개 자료만 공유하고, 읽기 전후와 대기 뒤에 revision을 다시 확인한다. 쿠키 조건과 필터 결과는 요청마다 조합하고 북마크는 브라우저에 둔다.",
    cost: "요청마다 조합 비용이 든다. isolate 단위 캐시라서 분산 일관성은 보장하지 않는다.",
    code: ["lib/revision-cache.ts", "lib/render-data.ts", "lib/preference-store.ts", "tests/revision-cache.test.ts"],
  },
  {
    head: "배포 성공은 실서비스가 그 커밋을 내보내는지로 판정한다",
    why: "빌드가 통과해도 사용자 화면이 정상이라는 보장은 없다.",
    pick: "workerd·Chromium 검증을 거쳐 업로드하고, 실서비스 /api/release의 git SHA·자료 해시를 기대값과 대조한다. 실패하면 rollback하고 다음 배포를 보류한다.",
    cost: "배포 시간과 스크립트 복잡도가 늘어난다. GA 실제 수신과 유입은 따로 관측한다.",
    code: ["ops:scripts/cloudflare-builds.mjs", "ops:scripts/cloudflare.mjs", "ops:app/api/release/route.ts", "ops:tests/analytics-deployment.test.ts"],
  },
];

// "ops:" 접두어는 운영 저장소에만 있는 경로다. 저장소 안에서 빌드하면 실제 존재 여부와 표시가 같아야 한다.
function chip(spec) {
  const ops = spec.startsWith("ops:");
  const path = ops ? spec.slice(4) : spec;
  if (IN_REPO && existsSync(join(ROOT, path)) === ops) throw new Error(`경로 표시가 저장소와 다름: ${spec}`);
  if (ops) return `<code class="ops" title="운영 저장소에만 있음">${esc(path)}</code>`;
  return IN_REPO ? `<a class="code" href="../../${esc(path)}"><code>${esc(path)}</code></a>` : `<code>${esc(path)}</code>`;
}
const chips = (list) => list.map(chip).join("");

const decisions = DECISIONS.map((d, i) => `
  <li class="dec" id="d${i + 1}" data-d="${i + 1}" tabindex="0">
    <span class="dec-n">${i + 1}</span>
    <div class="dec-body">
      <h3>${esc(d.head)}</h3>
      <dl>
        <div><dt>의도</dt><dd>${esc(d.why)}</dd></div>
        <div><dt>판단</dt><dd>${esc(d.pick)}</dd></div>
        <div><dt>감수한 비용</dt><dd>${esc(d.cost)}</dd></div>
      </dl>
      <p class="dec-code">${d.code.map(chip).join("")}</p>
    </div>
  </li>`).join("");

// 판단 n에 올리면 그림 1의 최상위 요소 중 hl{n}이 아닌 것을 흐리게 한다. 경계 상자·띠는 남긴다.
const hlRules = [1, 2, 3, 4, 5]
  .map((n) => `body:has(.dec[data-d="${n}"]:is(:hover,:focus-visible)) .fig1 > :not(defs,title,desc,.zone,.keep,.ribbon,.hl${n},.c${n}){opacity:.16}`)
  .join("\n");

// 글꼴: 저장소 안에서는 웹과 같은 Curvehop UI 분할 글꼴을 쓰고, 초안 폴더에서는 복사본을 쓴다. 없으면 시스템 글꼴.
const repoFontCss = join(ROOT, "app/fonts/suit-subsets.css");
const fontLink = IN_REPO && existsSync(repoFontCss)
  ? `<style>${readFileSync(repoFontCss, "utf8").replaceAll('url("/fonts/', 'url("../../public/fonts/')}</style>`
  : existsSync(join(HERE, "fonts/curvehop-ui.css")) ? '<link rel="stylesheet" href="fonts/curvehop-ui.css">' : "";

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Curvehop 아키텍처</title>
${fontLink}
<style>
:root{--ink:${C.ink};--muted:${C.muted};--faint:${C.faint};--line:${C.line};--surface:${C.surface};--primary:${C.primary};--ok:${C.ok};--warn:${C.warn};
--font:"Curvehop UI","SUIT Variable","Pretendard Variable",Pretendard,system-ui,-apple-system,sans-serif;--mono:"SF Mono",ui-monospace,Menlo,Consolas,monospace;
--text-display:32px;--text-title:22px;--text-heading:18px;--text-body:16px;--text-small:14px;--text-caption:12px}
*{box-sizing:border-box}
html{background:var(--surface)}
body{margin:0;background:var(--surface);color:var(--ink);font-family:var(--font);font-size:var(--text-body);line-height:1.65;word-break:keep-all;overflow-wrap:break-word;-webkit-font-smoothing:antialiased}
.page{max-width:1680px;margin:0 auto;padding:40px 32px 64px}
header.top{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:40px;align-items:end;margin-bottom:28px}
.brand{display:flex;align-items:center;gap:10px;font-size:var(--text-small);font-weight:700;color:var(--primary);letter-spacing:.02em;margin-bottom:14px}
.brand svg{width:28px;height:28px}
h1{font-size:var(--text-display);line-height:1.3;letter-spacing:-.025em;margin:0 0 14px}
.lead{font-size:var(--text-body);color:var(--muted);margin:0;max-width:62ch}
.facts{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:0;padding:0;list-style:none}
.facts li{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px 18px}
.facts b{display:block;font-size:var(--text-display);line-height:1.1;color:var(--primary);letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.facts span{display:block;font-size:var(--text-small);color:var(--muted);margin-top:8px;line-height:1.45}
.card{background:#fff;border:1px solid var(--line);border-radius:20px;padding:28px;margin-bottom:24px}
.kicker{font:600 var(--text-caption)/1 var(--mono);color:var(--primary);letter-spacing:.08em;margin-bottom:10px}
h2{font-size:var(--text-title);letter-spacing:-.02em;line-height:1.35;margin:0 0 6px}
.sub{font-size:var(--text-small);color:var(--muted);margin:0 0 20px;max-width:90ch}
.fig-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
.fig{display:block;width:100%;height:auto}
.fig text{font-family:var(--font);letter-spacing:-.01em}
.ico{fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.t-title{font-size:14px;font-weight:700}
.t-sub{font-size:12px;fill:${C.muted}}
.fig .t-mono,.t-mono{font-family:var(--mono);font-size:12px;fill:${C.muted};letter-spacing:0}
.t-zone{font-size:14px;font-weight:700;fill:${C.ink}}
.t-ribbon{font-size:14px}
.t-gate{font-size:16px;font-weight:700;fill:#fff}
.t-gate-sub{font-size:12px;fill:#d3e5da}
.fig .t-gate-mono{font-family:var(--mono);font-size:12px;fill:#b6d1c1;letter-spacing:0}
.t-step{font-size:12px}
.t-chip{font-size:12px;font-weight:600;fill:${C.ink}}
.t-edge{font-size:12px;font-weight:700}
.t-region{font-size:14px;font-weight:700}
.t-scope{font-size:14px}
.t-callout{font-size:12px;font-weight:700;fill:#fff;font-family:var(--font)}
.callout{cursor:pointer}
.flow{display:none}
@media (prefers-reduced-motion:no-preference){.flow{display:inline;stroke-dasharray:1 17}.flow-slow{animation:flow 2.6s linear infinite}.flow-fast{animation:flow .7s linear infinite}@keyframes flow{to{stroke-dashoffset:-18}}}
.fig1 .hl,.fig1 .node{transition:opacity .18s ease}
.legend{display:flex;flex-wrap:wrap;gap:10px 22px;margin:18px 0 0;padding:16px 0 0;border-top:1px solid var(--line);font-size:var(--text-small);color:var(--muted);list-style:none}
.legend li{display:flex;align-items:center;gap:8px}
.sw{width:16px;height:16px;border-radius:5px;flex:none}
.ln{width:30px;height:0;border-top:2px solid;flex:none}
.decs{list-style:none;margin:0;padding:0;display:grid;gap:0}
.dec{display:grid;grid-template-columns:44px minmax(0,1fr);gap:16px;padding:20px 12px;border-top:1px solid var(--line);border-radius:12px;outline:none;transition:background .15s ease}
.dec:first-child{border-top:0}
.dec:hover,.dec:focus-visible,.dec:target{background:#f5f5fe}
.dec-n{width:32px;height:32px;border-radius:50%;background:var(--primary);color:#fff;font-weight:700;font-size:var(--text-small);display:grid;place-items:center;margin-top:2px}
.dec h3{font-size:var(--text-heading);margin:0 0 10px;letter-spacing:-.015em;line-height:1.4}
.dec dl{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;margin:0}
.dec dt{font-size:var(--text-caption);font-weight:700;color:var(--faint);margin-bottom:4px;letter-spacing:.02em}
.dec dd{margin:0;font-size:var(--text-small);color:var(--ink);line-height:1.6}
.dec div:nth-child(3) dt{color:var(--warn)}
.dec-code{display:flex;flex-wrap:wrap;gap:6px;margin:14px 0 0}
code{font-family:var(--mono);font-size:var(--text-caption);background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:2px 7px;color:var(--muted)}
code.ops{background:#fff;border-style:dashed;color:var(--faint)}
a.code{display:inline-flex;text-decoration:none}a.code code{color:var(--primary);border-color:${C.primaryLine}}a.code:hover code{background:${C.primaryTint}}
.pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:28px}
.pair h3{font-size:var(--text-heading);margin:0 0 4px;letter-spacing:-.015em}
.pair p{font-size:var(--text-small);color:var(--muted);margin:0 0 14px}
.pair figure{margin:0}
.pair figcaption{margin-top:12px;display:flex;flex-wrap:wrap;gap:6px}
.hint{font-size:var(--text-caption);color:var(--faint);margin:0 0 4px}
.swipe{display:none;font-size:var(--text-caption);color:var(--faint);margin:0 0 8px}
.scope{font-size:var(--text-small);color:var(--muted)}
.scope summary{cursor:pointer;color:var(--ink);font-weight:600}
.scope ul{margin:10px 0 0;padding-left:20px}
.scope li{margin:4px 0}
.meta{font-size:var(--text-caption);color:var(--faint);margin-top:8px}
@media (max-width:1100px){header.top{grid-template-columns:1fr;gap:24px}.pair{grid-template-columns:1fr}.dec dl{grid-template-columns:1fr;gap:12px}}
@media (max-width:760px){.page{padding:24px 16px 48px}.card{padding:20px 16px;border-radius:16px}.facts{grid-template-columns:1fr;gap:8px}.facts li{display:flex;align-items:center;gap:16px;padding:12px 16px}.facts span{margin:0}.swipe{display:block}.fig1{min-width:1080px}.dec{grid-template-columns:1fr;padding:18px 4px}h1{font-size:28px}}
@media print{html,body{background:#fff}.card{border:0;padding:0;break-inside:avoid}.fig-scroll{overflow:visible}@page{size:A3 landscape;margin:12mm}}
${hlRules}
</style>
</head>
<body>
<main class="page">
<header class="top">
  <div>
    <div class="brand"><svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="17" fill="#6263F1"/><path d="M13 46V33C13 18 34 18 34 33V38C34 52 52 47 52 33V18" stroke="#fff" stroke-width="8" stroke-linecap="round" fill="none"/></svg>Curvehop · 아키텍처</div>
    <h1>조사는 미리 끝내고, 요청에는<br>검증된 스냅샷만 내보낸다</h1>
    <p class="lead">Curvehop은 공고 한 건에서 그 회사의 사업·조직·지원 조건까지 이어 읽게 하는 서비스다. 자료를 모으고 해석하는 일은 느리고 불확실하다. 그래서 그 일을 비공개 배치로 밀어내고, 발행 관문을 통과한 자료만 main을 거쳐 공개 런타임에 싣는다.</p>
  </div>
  <ul class="facts" aria-label="구조 요약">
    <li><b>0</b><span>요청 처리 중 부르는 모델·수집기·Git</span></li>
    <li><b>0</b><span>발행을 결정하는 모델 호출. 공개 여부는 스크립트가 정한다</span></li>
    <li><b>4</b><span>미니PC가 자동 머지할 수 있는 data 파일. 나머지는 코드 PR로만 바뀐다</span></li>
  </ul>
</header>

<section class="card" id="overview" aria-labelledby="overview-h">
  <div class="kicker">01 · SYSTEM</div>
  <h2 id="overview-h">자료는 왼쪽에서 오른쪽으로 한 방향, 요청은 오른쪽 상자 안에서 끝난다</h2>
  <p class="sub">느린 일(수집·조사·검토)과 빠른 일(페이지 응답) 사이에는 main 머지 하나만 있다. 번호를 누르면 그 위치의 설계 판단으로 이동한다.</p>
  <p class="swipe">옆으로 밀어 전체 구성도를 볼 수 있다.</p>
  <div class="fig-scroll">${fig1}</div>
  <ul class="legend" aria-label="범례">
    <li><span class="sw" style="background:${C.ink}"></span>스크립트 실행</li>
    <li><span class="sw" style="background:${C.accent}"></span>모델 호출</li>
    <li><span class="sw" style="background:${C.ok}"></span>발행 관문</li>
    <li><span class="sw" style="border:1.5px dashed ${C.warn}"></span>발행 권한 없는 평가</li>
    <li><span class="sw" style="border:1.5px dashed ${C.faint}"></span>파생본</li>
    <li><span class="ln" style="border-color:${C.ink}"></span>자료 흐름</li>
    <li><span class="ln" style="border-color:${C.primary};border-top-width:3px"></span>요청 · 응답</li>
    <li><span class="ln" style="border-color:${C.faint};border-top-style:dashed"></span>보조 · 관측</li>
  </ul>
</section>

<section class="card" id="decisions" aria-labelledby="decisions-h">
  <div class="kicker">02 · DECISIONS</div>
  <h2 id="decisions-h">다섯 가지 판단 — 의도, 선택, 감수한 비용, 확인할 코드</h2>
  <p class="hint">항목에 마우스를 올리면 위 구성도에서 해당 부분만 남는다. 점선 테두리 경로는 운영 저장소에만 있다.</p>
  <ol class="decs">${decisions}
  </ol>
</section>

<section class="card" id="request" aria-labelledby="request-h">
  <div class="kicker">03 · REQUEST</div>
  <h2 id="request-h">같은 회사 자료를 읽어도, 두 사람의 조건은 섞이지 않는다</h2>
  <p class="sub">판단 4를 펼친 그림이다. 공유하는 것은 불변 스냅샷과 그 revision의 공개 자료뿐이고, 사람마다 다른 값은 요청 안에서 만들고 버린다.</p>
  <div class="pair">
    <figure>
      <h3>무엇을 공유하는가</h3>
      <p>바깥 상자일수록 오래 살고 많은 요청이 함께 쓴다. 주황 점선 안의 값은 그 요청에서만 쓰인다.</p>
      ${fig2a}
      <figcaption>${chips(["lib/published-data.ts", "lib/render-data.ts", "lib/preference-store.ts", "tests/ssr-reads-http.test.mjs"])}</figcaption>
    </figure>
    <figure>
      <h3>늦게 끝난 이전 읽기를 버린다</h3>
      <p>읽기 A가 r1을 읽는 동안 revision이 r2로 바뀌었다(로컬 파일 교체, 리서치의 날짜 경계). A는 늦게 끝나도 r1을 돌려주거나 캐시에 넣지 않고, B가 넣은 r2 항목을 추가 읽기 없이 돌려준다.</p>
      ${fig2b}
      <figcaption>${chips(["lib/revision-cache.ts", "tests/revision-cache.test.ts"])}</figcaption>
    </figure>
  </div>
</section>

<section class="card scope" aria-labelledby="scope-h">
  <details>
    <summary id="scope-h">이 그림의 범위와 확인 근거</summary>
    <p>아래 경로는 모두 운영 저장소 기준이며, 공개 검토판에는 없는 파일이 포함된다.</p>
    <ul>
      <li>운영 소스 <code>ecbbdf8</code>(2026-10-22) 기준. 공개 검토판은 고정 소스 <code>d0e5519</code>와 가상 자료를 쓰며, 운영 main과 같다고 주장하지 않는다.</li>
      <li>스케줄은 <code>scripts/minipc/install-cron</code>: jobs 6시간마다(:17), research 10:00, publish 11:30, discover 일요일 13:30, watchdog 매시 :47.</li>
      <li>모델 호출은 <code>codex exec --sandbox read-only</code>(조사·검토 각 1회, 하루 12회 상한 <code>lib/model-call-budget.ts</code>). JEV는 별도 외부 평가 API이며 <code>publicationAuthority: false</code>.</li>
      <li>data PR 머지 조건: GitGuardian, 정확한 head의 Cloudflare verify, 검증 뒤 main 불변, 중지 파일 없음(<code>lib/worker.ts</code>).</li>
      <li>Worker는 <code>data/*.json</code>을 번들 모듈로 읽고 <code>/data/*</code>는 404로 검사한다. KV·R2·D1·Durable Object·Queue 바인딩은 없다.</li>
      <li>그리지 않은 것: 남아 있는 <code>vercel.json</code>(종료됨), 대기 상태의 Actions 배포 job, 회사 발굴(discover)의 세부 증명 경로.</li>
      <li>위키는 미니PC가 같은 자료로 만드는 파생본이며 웹(<code>app/</code>)은 <code>lib/wiki.ts</code>를 읽지 않는다.</li>
    </ul>
  </details>
  <p class="meta">원본 <code>build.mjs</code> → <code>architecture.html</code> · 이미지는 같은 HTML의 headless 캡처</p>
</section>
</main>
</body>
</html>
`;

writeFileSync(new URL("./architecture.html", import.meta.url), html);
console.log("architecture.html", Buffer.byteLength(html), "bytes");
