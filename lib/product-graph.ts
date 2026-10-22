/**
 * The knowledge graph on /about (DESIGN.md 제품 소개). Every node and edge is a
 * record the site already publishes; nothing is inferred:
 *
 * - company ↔ 국민연금공단: the research holds monthly pension-subscriber observations.
 * - company ↔ 금융감독원 DART: the research cites a DART filing (dart.fss.or.kr).
 * - company ↔ 채용 시스템: a registered source of the company (그리팅·Greenhouse·Lever·Workday).
 * - company ↔ 업종 범위: the scope a discovered source carries (DART·금융위 업종 코드).
 *   Companies reviewed in code carry no scope, so they have no such edge.
 * - 종속기업 → company: a subsidiary row the company page shows (DART filing).
 *
 * The layout is a seeded force-directed layout (Fruchterman–Reingold with
 * collision) computed in TypeScript, so the same input gives the same
 * coordinates. Nothing here touches the network, the file system or the clock.
 */
import type { Provider } from "./jobs";
import { EVIDENCE_ORIGINS, EVIDENCE_ORIGIN_LABELS, type EvidenceOrigin } from "./evidence-origin";

export type Scope = "it" | "telecom" | "fintech" | "semiconductor";
export type OfficialSource = "pension" | "dart";
export type NodeKind = "official" | "origin" | "system" | "scope" | "company" | "subsidiary";

/** One registered company, reduced to what the graph draws. */
export type GraphCompany = {
  id: string;
  name: string;
  /** In-scope (Seoul·Pangyo) postings the site shows for the company; null when the postings could not be read. */
  postings: number | null;
  systems: readonly Provider[];
  scope: Scope | null;
  pension: boolean;
  dart: boolean;
  research: boolean;
  /** Categories of page evidence actually referenced by the current service. */
  origins?: readonly EvidenceOrigin[];
  /** Subsidiary rows the company page shows, with the filing that lists them. */
  subsidiaries: readonly { name: string; filing: string }[];
};

export type GraphNode = {
  /** `official:pension`, `system:greeting`, `scope:it`, `company:<company id>`, `subsidiary:<company id>:<n>`. Never a registry identifier. */
  id: string;
  kind: NodeKind;
  label: string;
  /** Companies: in-scope postings (null: unread). Hubs: connected companies. Subsidiaries: 0. */
  count: number | null;
  research: boolean;
  href: string | null;
  /** One plain sentence for the info line. */
  detail: string;
};
export type GraphEdge = { from: string; to: string; kind: Exclude<NodeKind, "company"> };
export type ProductGraph = { nodes: GraphNode[]; edges: GraphEdge[] };

export const OFFICIAL_LABELS: Readonly<Record<OfficialSource, string>> = { pension: "국민연금공단", dart: "금융감독원 DART" };
export const SYSTEM_LABELS: Readonly<Record<Provider, string>> = { greeting: "그리팅", greenhouse: "Greenhouse", lever: "Lever", workday: "Workday" };
export const SCOPE_LABELS: Readonly<Record<Scope, string>> = { it: "IT", telecom: "통신", fintech: "핀테크", semiconductor: "반도체" };
export const KIND_LABELS: Readonly<Record<NodeKind, string>> = {
  official: "공공 자료", origin: "참고 자료 유형", system: "공고 수집 경로", scope: "업종 범위", company: "회사", subsidiary: "종속기업",
};

const OFFICIAL_ORDER: readonly OfficialSource[] = ["pension", "dart"];
const SYSTEM_ORDER: readonly Provider[] = ["greeting", "greenhouse", "lever", "workday"];
const SCOPE_ORDER: readonly Scope[] = ["it", "telecom", "fintech", "semiconductor"];
/** Code-point order: ids are ASCII, and locale collation must not move a node. */
const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function hubDetail(kind: NodeKind, key: string, count: number) {
  if (kind === "official") return key === "pension" ? `회사 ${count}곳의 월별 국민연금 가입자 기록이에요.` : `회사 ${count}곳의 공시·재무 근거예요.`;
  if (kind === "system") return `회사 ${count}곳의 공고를 이 채용 시스템에서 가져와요.`;
  if (kind === "origin") return `회사 ${count}곳의 설명에서 ${EVIDENCE_ORIGIN_LABELS[key as EvidenceOrigin]}를 참고했어요.`;
  return `자동으로 등록한 회사 ${count}곳의 업종 범위예요.`;
}

function companyDetail(company: GraphCompany) {
  const postings = !company.systems.length ? "공고를 가져오는 채용 시스템이 없어요"
    : company.postings === null ? "서울·판교 공고 미확인" : `서울·판교 공고 ${company.postings.toLocaleString("ko-KR")}건`;
  return `${postings} · ${company.research ? "회사 자료 있음" : "공고만 있음"}`;
}

/** Nodes in reading order (hubs, companies by postings, subsidiaries) and edges in the same order. Input order never matters. */
export function buildProductGraph(input: readonly GraphCompany[]): ProductGraph {
  const companies = [...input].sort(byId);
  const degree = new Map<string, number>();
  const hubEdges: GraphEdge[] = [];
  const subsidiaryNodes: GraphNode[] = [];
  const subsidiaryEdges: GraphEdge[] = [];
  for (const company of companies) {
    const from = `company:${company.id}`;
    const link = (to: string, kind: GraphEdge["kind"]) => {
      hubEdges.push({ from, to, kind });
      degree.set(to, (degree.get(to) ?? 0) + 1);
    };
    if (company.pension) link("official:pension", "official");
    if (company.dart) link("official:dart", "official");
    for (const origin of EVIDENCE_ORIGINS) if (origin !== "public-record" && company.origins?.includes(origin)) link(`origin:${origin}`, "origin");
    for (const system of SYSTEM_ORDER) if (company.systems.includes(system)) link(`system:${system}`, "system");
    if (company.scope) link(`scope:${company.scope}`, "scope");
    company.subsidiaries.forEach((subsidiary, index) => {
      const id = `subsidiary:${company.id}:${index}`;
      subsidiaryNodes.push({ id, kind: "subsidiary", label: subsidiary.name, count: 0, research: false, href: null,
        detail: `${company.name} ${subsidiary.filing}에 지분 변화가 실린 종속기업이에요.` });
      subsidiaryEdges.push({ from: id, to: from, kind: "subsidiary" });
    });
  }
  const hubs: GraphNode[] = [];
  const hub = (kind: NodeKind, key: string, label: string) => {
    const id = `${kind}:${key}`, count = degree.get(id) ?? 0;
    if (count) hubs.push({ id, kind, label, count, research: false, href: null, detail: hubDetail(kind, key, count) });
  };
  for (const key of OFFICIAL_ORDER) hub("official", key, OFFICIAL_LABELS[key]);
  for (const key of EVIDENCE_ORIGINS) if (key !== "public-record") hub("origin", key, EVIDENCE_ORIGIN_LABELS[key]);
  for (const key of SYSTEM_ORDER) hub("system", key, SYSTEM_LABELS[key]);
  for (const key of SCOPE_ORDER) hub("scope", key, SCOPE_LABELS[key]);
  const companyNodes: GraphNode[] = companies
    .map((company) => ({ id: `company:${company.id}`, kind: "company" as const, label: company.name, count: company.postings,
      research: company.research, href: `/companies/${encodeURIComponent(company.id)}`, detail: companyDetail(company) }))
    .sort((a, b) => (b.count ?? -1) - (a.count ?? -1) || byId(a, b));
  return { nodes: [...hubs, ...companyNodes, ...subsidiaryNodes], edges: [...hubEdges, ...subsidiaryEdges] };
}

export type PositionedNode = GraphNode & { x: number; y: number; r: number };
export type GraphLayout = { width: number; height: number; nodes: PositionedNode[]; edges: GraphEdge[] };
export type LayoutOptions = { width?: number; height?: number; iterations?: number; seed?: number };

export const GRAPH_WIDTH = 760;
export const GRAPH_HEIGHT = 640;
const PADDING = 20;
const GAP = 2.5;

/** Radius in viewBox units: hubs by connected companies, companies by postings (larger with more; unread postings draw the smallest dot). */
export function nodeRadius(node: GraphNode, maxHub: number, maxPostings: number) {
  const share = (value: number | null, max: number) => (max > 0 && value ? Math.sqrt(value / max) : 0);
  switch (node.kind) {
    case "official": return 15;
    case "origin": return 14;
    case "system": return 9 + 9 * share(node.count, maxHub);
    case "scope": return 8 + 7 * share(node.count, maxHub);
    case "company": return 3.5 + 9.5 * share(node.count, maxPostings);
    case "subsidiary": return 2.5;
  }
}

/** FNV-1a: a node's own seed, so a new node does not reshuffle where the others start. */
function hash(text: string, seed: number) {
  let h = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h;
}
/** mulberry32: a small seeded PRNG with a fixed sequence. */
export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Where a hub starts (the force step then moves it): official sources left,
 * the system with the most companies in the middle and the other systems
 * along the bottom, scopes right. `rank` is the hub's place by companies.
 */
function anchor(node: GraphNode, rank: number, of: number, width: number, height: number): [number, number] {
  const spread = (i: number, n: number, span: number) => (n <= 1 ? 0 : (i / (n - 1) - 0.5) * span);
  if (node.kind === "official") return [width * 0.22, height * 0.45 + spread(rank, of, height * 0.3)];
  if (node.kind === "origin") return [width * 0.5 + spread(rank, of, width * 0.45), height * 0.2];
  if (node.kind === "system") return rank === 0 ? [width * 0.52, height * 0.4] : [width * 0.5 + spread(rank - 1, of - 1, width * 0.5), height * 0.85];
  return [width * 0.8, height * 0.65 + spread(rank, of, height * 0.3)];
}

const round = (value: number) => Math.round(value * 10) / 10;

/**
 * Seeded force-directed layout: the velocity model d3-force uses, written out
 * here (no dependency). Many-body repulsion (1/d²), edge springs with a rest
 * length per edge kind, a pull to the centre and collision, cooled over a fixed
 * number of ticks. Hubs start at fixed anchors, companies near the middle of
 * their hubs with jitter from a hash of their own id, subsidiaries next to
 * their company. The result is fitted into the box and rounded to 0.1, so the
 * same graph always yields the same coordinates.
 */
export function layoutProductGraph(graph: ProductGraph, options: LayoutOptions = {}): GraphLayout {
  const width = options.width ?? GRAPH_WIDTH, height = options.height ?? GRAPH_HEIGHT;
  const iterations = options.iterations ?? 320, seed = options.seed ?? 20261009;
  const nodes = graph.nodes, n = nodes.length;
  const index = new Map(nodes.map((node, i) => [node.id, i]));
  const edges = graph.edges.filter((edge) => index.has(edge.from) && index.has(edge.to));
  const maxHub = Math.max(0, ...nodes.filter((node) => node.kind === "system" || node.kind === "scope").map((node) => node.count ?? 0));
  const maxPostings = Math.max(0, ...nodes.filter((node) => node.kind === "company").map((node) => node.count ?? 0));
  const r = nodes.map((node) => nodeRadius(node, maxHub, maxPostings));
  const isHub = (kind: NodeKind) => kind === "official" || kind === "origin" || kind === "system" || kind === "scope";
  const x = new Float64Array(n), y = new Float64Array(n), vx = new Float64Array(n), vy = new Float64Array(n);
  const degree = new Float64Array(n);
  const neighbours: number[][] = nodes.map(() => []);
  for (const edge of edges) {
    const a = index.get(edge.from)!, b = index.get(edge.to)!;
    neighbours[a].push(b);
    neighbours[b].push(a);
    degree[a]++;
    degree[b]++;
  }
  // Hubs push harder, more with more companies, so two sources with the same companies do not sit on top of each other.
  const charge = nodes.map((node, i) => (isHub(node.kind) ? 150 + 10 * degree[i] : node.kind === "subsidiary" ? 8 : 45));
  const groups = new Map<NodeKind, GraphNode[]>();
  for (const node of nodes) groups.set(node.kind, [...(groups.get(node.kind) ?? []), node]);
  // Hubs first, then companies (they read hub positions), then subsidiaries (they read companies).
  for (const kind of ["official", "origin", "system", "scope", "company", "subsidiary"] as const) {
    for (const node of groups.get(kind) ?? []) {
      const i = index.get(node.id)!;
      if (isHub(kind)) {
        const peers = groups.get(kind)!.toSorted((a, b) => (b.count ?? 0) - (a.count ?? 0) || byId(a, b));
        [x[i], y[i]] = anchor(node, peers.indexOf(node), peers.length, width, height);
        continue;
      }
      const random = seededRandom(hash(node.id, seed));
      const jitter = (span: number) => (random() - 0.5) * span;
      const from = kind === "subsidiary" ? neighbours[i] : neighbours[i].filter((j) => isHub(nodes[j].kind));
      const span = kind === "subsidiary" ? 20 : 80;
      x[i] = (from.length ? from.reduce((sum, j) => sum + x[j], 0) / from.length : width / 2) + jitter(span);
      y[i] = (from.length ? from.reduce((sum, j) => sum + y[j], 0) / from.length : height / 2) + jitter(span);
    }
  }

  // Rest length per edge kind; a spring moves the end with fewer links more (d3's bias).
  const springs = edges.map((edge) => {
    const a = index.get(edge.from)!, b = index.get(edge.to)!;
    const rest = edge.kind === "subsidiary" ? 16 : edge.kind === "scope" ? 60 : edge.kind === "official" ? 110 : 80;
    return { a, b, rest, strength: 1 / Math.min(degree[a], degree[b]), bias: degree[a] / (degree[a] + degree[b]) };
  });
  const cx = width / 2, cy = height / 2;
  let alpha = 1;
  const decay = 1 - Math.pow(0.001, 1 / iterations);
  for (let tick = 0; tick < iterations; tick++) {
    alpha += (0 - alpha) * decay;
    for (const { a, b, rest, strength, bias } of springs) {
      let ex = x[b] + vx[b] - x[a] - vx[a], ey = y[b] + vy[b] - y[a] - vy[a];
      const d = Math.sqrt(ex * ex + ey * ey) || 0.01;
      const pull = ((d - rest) / d) * alpha * strength;
      ex *= pull;
      ey *= pull;
      vx[b] -= ex * bias; vy[b] -= ey * bias;
      vx[a] += ex * (1 - bias); vy[a] += ey * (1 - bias);
    }
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let ex = x[j] - x[i], ey = y[j] - y[i];
        let d2 = ex * ex + ey * ey;
        if (d2 < 1) { ex = 0.7; ey = 0.7; d2 = 1; }
        // Far nodes barely interact: the cloud stays together instead of flinging leaves out.
        if (d2 > 160000) continue;
        const push = alpha / d2;
        vx[i] -= ex * charge[j] * push; vy[i] -= ey * charge[j] * push;
        vx[j] += ex * charge[i] * push; vy[j] += ey * charge[i] * push;
      }
    }
    // A wider box pulls less sideways, so the cloud fills the box rather than a circle.
    for (let i = 0; i < n; i++) {
      vx[i] += (cx - x[i]) * 0.05 * alpha * (height / width);
      vy[i] += (cy - y[i]) * 0.05 * alpha;
      vx[i] *= 0.6;
      vy[i] *= 0.6;
      x[i] += vx[i];
      y[i] += vy[i];
    }
    separate(x, y, r);
  }

  // Fit: scale the cloud into the box (radii stay), then settle overlaps inside it.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, x[i] - r[i]); maxX = Math.max(maxX, x[i] + r[i]);
    minY = Math.min(minY, y[i] - r[i]); maxY = Math.max(maxY, y[i] + r[i]);
  }
  const scale = Math.min((width - 2 * PADDING) / Math.max(maxX - minX, 1), (height - 2 * PADDING) / Math.max(maxY - minY, 1));
  const midX = (minX + maxX) / 2, midY = (minY + maxY) / 2;
  for (let i = 0; i < n; i++) {
    x[i] = cx + (x[i] - midX) * scale;
    y[i] = cy + (y[i] - midY) * scale;
  }
  for (let pass = 0; pass < 80; pass++) {
    const moved = separate(x, y, r);
    for (let i = 0; i < n; i++) {
      x[i] = Math.min(width - PADDING - r[i], Math.max(PADDING + r[i], x[i]));
      y[i] = Math.min(height - PADDING - r[i], Math.max(PADDING + r[i], y[i]));
    }
    if (!moved) break;
  }
  return {
    width, height, edges,
    nodes: nodes.map((node, i) => ({ ...node, x: round(x[i]), y: round(y[i]), r: round(r[i]) })),
  };
}

/** One collision pass: overlapping circles move apart, the smaller one more. Returns whether anything moved. */
function separate(x: Float64Array, y: Float64Array, r: readonly number[]) {
  let moved = false;
  for (let i = 0; i < x.length; i++) {
    for (let j = i + 1; j < x.length; j++) {
      let ex = x[j] - x[i], ey = y[j] - y[i];
      const min = r[i] + r[j] + GAP;
      let d2 = ex * ex + ey * ey;
      if (d2 >= min * min) continue;
      if (d2 < 0.0001) { ex = 0.01; ey = 0.005; d2 = 0.000125; }
      moved = true;
      const d = Math.sqrt(d2);
      const overlap = (min - d) / d;
      const share = (r[j] * r[j]) / (r[i] * r[i] + r[j] * r[j]);
      x[i] -= ex * overlap * share; y[i] -= ey * overlap * share;
      x[j] += ex * overlap * (1 - share); y[j] += ey * overlap * (1 - share);
    }
  }
  return moved;
}

export type LabelSide = "right" | "left" | "top" | "bottom";
export type GraphLabel = { id: string; side: LabelSide };
type Box = { left: number; top: number; right: number; bottom: number };

/** Approximate rendered width in px of a label in SUIT at `px` size (a hangul syllable is about one em). */
export function labelWidth(text: string, px: number) {
  let em = 0;
  for (const char of text) {
    if (/[ㄱ-ㆎ가-힣]/.test(char)) em += 0.96;
    else if (/[A-Z]/.test(char)) em += 0.68;
    else if (/[a-z]/.test(char)) em += 0.55;
    else if (/[0-9]/.test(char)) em += 0.6;
    else if (char === " ") em += 0.28;
    else em += 0.4;
  }
  return em * px;
}

/** The text a label shows: hubs add their count. */
export const labelText = (node: GraphNode) => (node.kind === "company" || node.kind === "subsidiary" ? node.label : `${node.label} ${node.count}`);

/**
 * Greedy label placement in screen px for a graph drawn `scale` px per unit:
 * each label in priority order takes the first side (right, left, top,
 * bottom) where it stays inside the box and clear of placed labels and of the
 * larger nodes; a label that fits nowhere is left out at that size.
 */
export function placeLabels(layout: GraphLayout, ids: readonly string[], scale: number, px = 12): GraphLabel[] {
  const byId = new Map(layout.nodes.map((node) => [node.id, node]));
  const height = px * 1.5 + 4, offset = 4;
  const placed: Box[] = [];
  // Points drawn 5px or larger at this scale are obstacles; smaller dots may sit under a label.
  const obstacles: Box[] = layout.nodes.filter((node) => node.r * scale >= 5).map((node) => ({
    left: (node.x - node.r) * scale, right: (node.x + node.r) * scale, top: (node.y - node.r) * scale, bottom: (node.y + node.r) * scale,
  }));
  const hits = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const result: GraphLabel[] = [];
  for (const id of ids) {
    const node = byId.get(id);
    if (!node) continue;
    const width = labelWidth(labelText(node), px) + 8;
    const cx = node.x * scale, cy = node.y * scale, rr = node.r * scale + offset;
    const own: Box = { left: cx - node.r * scale, right: cx + node.r * scale, top: cy - node.r * scale, bottom: cy + node.r * scale };
    const boxes: [LabelSide, Box][] = [
      ["right", { left: cx + rr, right: cx + rr + width, top: cy - height / 2, bottom: cy + height / 2 }],
      ["left", { left: cx - rr - width, right: cx - rr, top: cy - height / 2, bottom: cy + height / 2 }],
      ["top", { left: cx - width / 2, right: cx + width / 2, top: cy - rr - height, bottom: cy - rr }],
      ["bottom", { left: cx - width / 2, right: cx + width / 2, top: cy + rr, bottom: cy + rr + height }],
    ];
    const fit = boxes.find(([, box]) =>
      box.left >= 0 && box.top >= 0 && box.right <= layout.width * scale && box.bottom <= layout.height * scale &&
      !placed.some((other) => hits(box, other)) && !obstacles.some((other) => !sameBox(other, own) && hits(box, other)));
    if (!fit) continue;
    placed.push(fit[1]);
    result.push({ id, side: fit[0] });
  }
  return result;
}
const sameBox = (a: Box, b: Box) => a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom;
