"use client";

import { useEffect, useReducer, useRef, type ReactNode } from "react";
import { KIND_LABELS, type NodeKind } from "@/lib/product-graph";
import { LEAVE_DELAY_MS, activePoint, emptySelection, nextSelection } from "@/lib/graph-selection";

export type GraphHub = { id: string; label: string; count: number; kind: NodeKind };
type Point = { id: string; el: SVGElement; label: string; kind: NodeKind; detail: string; href: string | null };

/**
 * Highlighting for the server-drawn graph (DESIGN.md 제품 소개): pointing at or
 * focusing a point, or choosing a source, keeps that point, its neighbours and
 * their lines in full colour and fades the rest. The drawing is one tab stop;
 * arrow keys move between points, Enter opens a company, Enter or Space on a
 * source keeps its highlight, Esc clears. The selection survives the move from
 * the drawing to the info box (lib/graph-selection.ts), so its company link can
 * be reached. Without JavaScript the drawing, company links and the table work.
 */
export function GraphExplorer({ hubs, companies, legend, children }: { companies: { id: string; label: string }[]; hubs: GraphHub[]; legend: ReactNode; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const points = useRef<Point[]>([]);
  const neighbours = useRef(new Map<string, Set<string>>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selection, dispatch] = useReducer(nextSelection, emptySelection);
  const active = activePoint(selection);

  const hold = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  const releaseLater = () => { hold(); timer.current = setTimeout(() => dispatch({ type: "release" }), LEAVE_DELAY_MS); };
  /** The pointer left: keyboard focus on a point takes the selection back; focus in the panel keeps it; otherwise release after the delay. */
  const pointerLeft = () => {
    const focused = pointOf(document.activeElement);
    hold();
    if (focused) dispatch({ type: "point", id: focused.dataset.node!, via: "focus" });
    else if (!inside(panel, document.activeElement)) releaseLater();
  };
  useEffect(() => hold, []);

  useEffect(() => {
    const element = root.current!;
    points.current = [...element.querySelectorAll<SVGElement>("[data-node]")].map((el) => ({
      id: el.dataset.node!, el, label: el.dataset.label!, kind: el.dataset.kind as NodeKind, detail: el.dataset.detail!, href: el.dataset.href ?? null,
    }));
    const map = new Map<string, Set<string>>();
    for (const line of element.querySelectorAll<SVGLineElement>("[data-a]")) {
      const a = line.dataset.a!, b = line.dataset.b!;
      (map.get(a) ?? map.set(a, new Set()).get(a)!).add(b);
      (map.get(b) ?? map.set(b, new Set()).get(b)!).add(a);
    }
    neighbours.current = map;
  }, []);

  useEffect(() => {
    const element = root.current!;
    const lit = new Set(active ? [active, ...(neighbours.current.get(active) ?? [])] : []);
    element.toggleAttribute("data-focus", !!active);
    for (const point of points.current) {
      point.el.classList.toggle("is-lit", lit.has(point.id));
      point.el.classList.toggle("is-active", point.id === active);
      if (point.el.getAttribute("role") === "button") point.el.setAttribute("aria-pressed", String(point.id === selection.pinned));
    }
    for (const line of element.querySelectorAll<SVGLineElement>("[data-a]"))
      line.classList.toggle("is-lit", !!active && (line.dataset.a === active || line.dataset.b === active));
    for (const label of element.querySelectorAll<HTMLElement>("[data-for]"))
      label.classList.toggle("is-lit", lit.has(label.dataset.for!));
  }, [active, selection.pinned]);

  const pointOf = (target: EventTarget | null) => (target instanceof Element ? target.closest<SVGElement>("[data-node]") : null);
  const inside = (ref: { current: HTMLElement | null }, target: EventTarget | null) => target instanceof Node && !!ref.current?.contains(target);
  const move = (from: SVGElement, to: SVGElement | undefined) => {
    if (!to) return;
    from.setAttribute("tabindex", "-1");
    to.setAttribute("tabindex", "0");
    to.focus();
  };

  const info = active ? points.current.find((point) => point.id === active) : undefined;
  const linked = info ? points.current.filter((point) => neighbours.current.get(info.id)?.has(point.id)) : [];
  const hub = info && info.kind !== "company" && info.kind !== "subsidiary";
  const names = (list: Point[], limit: number) =>
    list.slice(0, limit).map((point) => point.label).join(" · ") + (list.length > limit ? ` 외 ${list.length - limit}곳` : "");

  return (
    <div className="graph-explorer" ref={root}>
      <div
        className="graph-stage"
        ref={stage}
        onPointerOver={(event) => { const point = pointOf(event.target); if (point) { hold(); dispatch({ type: "point", id: point.dataset.node!, via: "pointer" }); } }}
        onPointerLeave={pointerLeft}
        onFocus={(event) => { const point = pointOf(event.target); if (point) { hold(); dispatch({ type: "point", id: point.dataset.node!, via: "focus" }); } }}
        onBlur={(event) => { if (!pointOf(event.relatedTarget) && !inside(panel, event.relatedTarget)) dispatch({ type: "release" }); }}
        onClick={(event) => {
          const point = pointOf(event.target);
          if (point && !point.dataset.href && point.dataset.kind !== "subsidiary") dispatch({ type: "toggle", id: point.dataset.node! });
        }}
        onKeyDown={(event) => {
          const point = pointOf(event.target);
          if (!point) return;
          const order = points.current.map((item) => item.el);
          const at = order.indexOf(point);
          const next = { ArrowRight: at + 1, ArrowDown: at + 1, ArrowLeft: at - 1, ArrowUp: at - 1, Home: 0, End: order.length - 1 }[event.key];
          if (next !== undefined) { event.preventDefault(); move(point, order[next]); return; }
          if (event.key === "Escape") { hold(); dispatch({ type: "clear" }); return; }
          if ((event.key === "Enter" || event.key === " ") && !point.dataset.href && point.getAttribute("role") === "button") {
            event.preventDefault();
            dispatch({ type: "toggle", id: point.dataset.node! });
          }
        }}
      >
        {children}
      </div>
      <div
        className="graph-panel"
        ref={panel}
        onPointerEnter={hold}
        onPointerLeave={pointerLeft}
        onFocus={hold}
        onBlur={(event) => { if (!inside(panel, event.relatedTarget) && !inside(stage, event.relatedTarget)) dispatch({ type: "release" }); }}
        onKeyDown={(event) => { if (event.key === "Escape") { hold(); dispatch({ type: "clear" }); } }}
      >
        <label className="graph-company-select">
          <span>회사로 연결 살펴보기</span>
          <select value={info?.kind === "company" ? info.id : ""} onChange={event => { hold(); dispatch(event.target.value ? { type: "toggle", id: event.target.value } : { type: "clear" }); }}>
            <option value="">회사 선택</option>
            {companies.map(company => <option key={company.id} value={company.id}>{company.label}</option>)}
          </select>
        </label>
        {/* A focused point already speaks its name and detail, so the box only announces pointer and button choices. */}
        <div className="graph-info" aria-live={selection.via === "focus" ? "off" : "polite"}>
          {info ? (
            <>
              <p className="graph-info-kind">{KIND_LABELS[info.kind]}</p>
              <p className="graph-info-name">{info.label}</p>
              <p className="graph-info-detail">{info.detail}</p>
              {linked.length > 0 && (
                <p className="graph-info-links">
                  {hub ? `이어진 회사: ${names(linked, 5)}` : info.kind === "subsidiary" ? `이어진 회사: ${names(linked, 3)}` : `이어진 곳: ${names(linked, 8)}`}
                </p>
              )}
              {info.href && <a className="graph-info-link" href={info.href}>{info.label} 회사 화면 보기</a>}
            </>
          ) : (
            <p className="graph-info-hint">회사를 선택하거나 아래 자료를 고르면 연결을 살펴볼 수 있어요.</p>
          )}
        </div>
        {[
          { label: "회사 자료", kinds: ["official", "origin"] },
          { label: "공고를 가져오는 경로", kinds: ["system"] },
          { label: "업종 범위", kinds: ["scope"] },
        ].map(group => {
          const items = hubs.filter(item => group.kinds.includes(item.kind));
          return items.length > 0 && <div key={group.label} className="graph-hub-group" role="group" aria-label={group.label}>
            <p>{group.label}</p>
            <div className="graph-hubs">{items.map(item => (
              <button key={item.id} type="button" aria-pressed={selection.pinned === item.id} onClick={() => { hold(); dispatch({ type: "toggle", id: item.id }); }}>
                {item.label} <span>{`${item.count}곳`}</span>
              </button>
            ))}</div>
          </div>;
        })}
        <details className="graph-guide">
          <summary>그림 읽는 법</summary>
          {legend}
        </details>
      </div>
    </div>
  );
}
