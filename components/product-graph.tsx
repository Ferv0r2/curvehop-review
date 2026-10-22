import type { CSSProperties } from "react";
import {
  KIND_LABELS, labelText, placeLabels, type GraphEdge, type GraphLabel, type GraphLayout, type LabelSide, type PositionedNode,
} from "@/lib/product-graph";
import { GraphExplorer, type GraphHub } from "@/components/graph-explorer";

/**
 * The /about knowledge graph (DESIGN.md 제품 소개). The server draws the SVG
 * from a precomputed layout; GraphExplorer only adds highlighting. Labels are
 * HTML over the SVG so their text stays at the type scale when the drawing
 * scales: hubs everywhere, the larger companies from 681px.
 */
/** Phone column at 360px (328px wide graph) and the narrowest wide graph (681px, capped at 760). */
const COMPACT_SCALE = 328 / 760;
const WIDE_SCALE = 0.82;
const WIDE_COMPANY_LABELS = 16;

const pct = (value: number, of: number) => `${Math.round((value / of) * 10000) / 100}%`;

function labelPosition(node: PositionedNode, side: LabelSide, layout: GraphLayout) {
  const { width: w, height: h } = layout;
  switch (side) {
    case "right": return { left: `calc(${pct(node.x + node.r, w)} + 4px)`, top: pct(node.y, h), transform: "translateY(-50%)" };
    case "left": return { left: `calc(${pct(node.x - node.r, w)} - 4px)`, top: pct(node.y, h), transform: "translate(-100%, -50%)" };
    case "top": return { left: pct(node.x, w), top: `calc(${pct(node.y - node.r, h)} - 4px)`, transform: "translate(-50%, -100%)" };
    case "bottom": return { left: pct(node.x, w), top: `calc(${pct(node.y + node.r, h)} + 4px)`, transform: "translateX(-50%)" };
  }
}

/** Which labels show at each width, and where. */
export function graphLabels(layout: GraphLayout) {
  const hubs = layout.nodes.filter((node) => node.kind !== "company" && node.kind !== "subsidiary").map((node) => node.id);
  const companies = layout.nodes.filter((node) => node.kind === "company").slice(0, WIDE_COMPANY_LABELS).map((node) => node.id);
  const compact = new Map(placeLabels(layout, hubs, COMPACT_SCALE).map((label) => [label.id, label]));
  const wide = new Map(placeLabels(layout, [...hubs, ...companies], WIDE_SCALE).map((label) => [label.id, label]));
  return { compact, wide };
}

function Shape({ node }: { node: PositionedNode }) {
  const { x, y, r } = node;
  switch (node.kind) {
    case "official": return <rect className="graph-shape" x={x - r} y={y - r} width={2 * r} height={2 * r} rx={4} />;
    case "system": {
      const d = r * 1.25, at = (value: number) => Math.round(value * 10) / 10;
      return <path className="graph-shape" d={`M${at(x)} ${at(y - d)}L${at(x + d)} ${at(y)}L${at(x)} ${at(y + d)}L${at(x - d)} ${at(y)}Z`} />;
    }
    default: return <circle className="graph-shape" cx={x} cy={y} r={r} />;
  }
}

function Node({ node, first }: { node: PositionedNode; first: boolean }) {
  const name = `${node.label}, ${KIND_LABELS[node.kind]}. ${node.detail}`;
  const common = {
    className: `graph-node is-${node.kind}${node.kind === "company" ? (node.research ? " is-research" : " is-postings") : ""}`,
    "data-node": node.id, "data-kind": node.kind, "data-label": node.label, "data-detail": node.detail,
    // One tab stop for the whole drawing; arrow keys move between points (GraphExplorer).
    tabIndex: first ? 0 : -1,
  };
  if (node.href) return <a {...common} href={node.href} data-href={node.href} aria-label={`${name} 회사 화면으로 이동`}><Shape node={node} /></a>;
  if (node.kind === "subsidiary") return <g {...common} role="img" aria-label={name}><Shape node={node} /></g>;
  return <g {...common} role="button" aria-pressed="false" aria-label={name}><Shape node={node} /></g>;
}

export function ProductGraph({ layout, titleId, descId }: { layout: GraphLayout; titleId: string; descId: string }) {
  const { compact, wide } = graphLabels(layout);
  const byId = new Map(layout.nodes.map((node) => [node.id, node]));
  const labelled = layout.nodes.filter((node) => compact.has(node.id) || wide.has(node.id));
  const hubs: GraphHub[] = layout.nodes.filter((node) => node.kind !== "company" && node.kind !== "subsidiary")
    .map((node) => ({ id: node.id, label: node.label, count: node.count ?? 0, kind: node.kind }));
  const style = (label: GraphLabel | undefined, prefix: "c" | "w") => {
    if (!label) return {};
    const at = labelPosition(byId.get(label.id)!, label.side, layout);
    return { [`--${prefix}l`]: at.left, [`--${prefix}t`]: at.top, [`--${prefix}m`]: at.transform };
  };
  return (
    <GraphExplorer companies={layout.nodes.filter(node => node.kind === "company").map(node => ({ id: node.id, label: node.label }))} hubs={hubs} legend={<GraphLegend />}>
      <div className="graph-canvas" style={{ aspectRatio: `${layout.width} / ${layout.height}` }}>
        <svg viewBox={`0 0 ${layout.width} ${layout.height}`} role="group" aria-labelledby={titleId} aria-describedby={descId} className="graph-svg">
          <g className="graph-edges" aria-hidden="true">
            {layout.edges.map((edge: GraphEdge) => {
              const a = byId.get(edge.from)!, b = byId.get(edge.to)!;
              return <line key={`${edge.from}|${edge.to}`} className={`graph-edge is-${edge.kind}`} data-a={edge.from} data-b={edge.to} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
            })}
          </g>
          <g className="graph-nodes">
            {layout.nodes.map((node, i) => <Node key={node.id} node={node} first={i === 0} />)}
          </g>
        </svg>
        <div className="graph-labels" aria-hidden="true">
          {labelled.map((node) => (
            <span key={node.id} data-for={node.id} data-compact={compact.has(node.id) ? "" : undefined} data-wide={wide.has(node.id) ? "" : undefined}
              className={`graph-label is-${node.kind}`} style={{ ...style(compact.get(node.id), "c"), ...style(wide.get(node.id), "w") } as CSSProperties}>
              {node.kind === "company" ? labelText(node) : <>{node.label} <span className="graph-label-count">{node.count}</span></>}
            </span>
          ))}
        </div>
      </div>
    </GraphExplorer>
  );
}

/** Shapes for the legend, the same drawing as the graph at a fixed size. */
function Swatch({ kind, research }: { kind: PositionedNode["kind"]; research?: boolean }) {
  const node = { id: "", kind, label: "", count: 0, research: !!research, href: null, detail: "", x: 10, y: 10,
    r: kind === "subsidiary" ? 3 : kind === "company" ? 6 : kind === "system" ? 6.5 : 7.5 } as PositionedNode;
  return (
    <svg className={`graph-swatch is-${kind}${kind === "company" ? (research ? " is-research" : " is-postings") : ""}`} viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
      <Shape node={node} />
    </svg>
  );
}

export function GraphLegend() {
  return (
    <ul className="graph-legend" aria-label="그림 읽는 법">
      <li><Swatch kind="official" /><span><strong>공공 자료</strong> 국민연금공단 · 금융감독원 DART</span></li>
      <li><Swatch kind="system" /><span><strong>공고 수집 경로</strong> 자료 유형과 구분해요</span></li>
      <li><Swatch kind="origin" /><span><strong>회사 자료</strong> 공식 소개 · 팀 이야기 · 기사</span></li>
      <li><Swatch kind="scope" /><span><strong>업종 범위</strong> 자동으로 등록한 회사의 업종</span></li>
      <li><Swatch kind="company" research /><span><strong>회사</strong> 회사 자료가 있는 곳</span></li>
      <li><Swatch kind="company" /><span><strong>회사</strong> 공고만 있는 곳</span></li>
      <li><Swatch kind="subsidiary" /><span><strong>종속기업</strong> 공시에 지분 변화가 실린 곳</span></li>
      <li className="graph-legend-note">회사 점은 서울·판교 공고가 많을수록 커요.</li>
    </ul>
  );
}

/** The same graph as text: one row per company, with every point it is linked to. */
export function GraphTable({ layout }: { layout: GraphLayout }) {
  const byId = new Map(layout.nodes.map((node) => [node.id, node]));
  const links = new Map<string, string[]>();
  const systems = new Map<string, string[]>();
  const subsidiaries = new Map<string, number>();
  const collected = new Set<string>();
  for (const edge of layout.edges) {
    if (edge.kind === "subsidiary") subsidiaries.set(edge.to, (subsidiaries.get(edge.to) ?? 0) + 1);
    else {
      const target = edge.kind === "system" ? systems : links;
      target.set(edge.from, [...(target.get(edge.from) ?? []), byId.get(edge.to)!.label]);
    }
    if (edge.kind === "system") collected.add(edge.from);
  }
  const companies = layout.nodes.filter((node) => node.kind === "company");
  return (
    <details className="graph-table">
      <summary>회사별 연결을 표로 보기 <span>{`${companies.length}곳`}</span></summary>
      <div className="graph-table-scroll">
        <table>
          <thead><tr><th scope="col">회사</th><th scope="col">서울·판교 공고</th><th scope="col">회사 자료·관계</th><th scope="col">공고 수집 경로</th></tr></thead>
          <tbody>
            {companies.map((node) => {
              const count = subsidiaries.get(node.id);
              const linked = [...(links.get(node.id) ?? []), ...(count ? [`종속기업 ${count}곳`] : [])];
              return (
                <tr key={node.id}>
                  <th scope="row"><a href={node.href!}>{node.label}</a></th>
                  <td>{!collected.has(node.id) ? "가져오지 않음" : node.count === null ? "미확인" : `${node.count.toLocaleString("ko-KR")}건`}</td>
                  <td>{linked.length ? linked.join(" · ") : "없음"}</td>
                  <td>{systems.get(node.id)?.join(" · ") ?? "연결 전"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}
