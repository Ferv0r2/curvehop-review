"use client";
import { useActionState, useEffect, useRef, type FocusEvent, type KeyboardEvent, type SyntheticEvent } from "react";
import { usePathname } from "next/navigation";
import { roleLabels } from "@/lib/jobs";
import { experienceLabel, type Preferences } from "@/lib/preferences";
import { savePreferences } from "@/app/actions/preferences";
import { SIZE_BANDS, sizesLabel } from "@/lib/company-size-bands";

export function PreferenceBar({ preferences }: { preferences: Preferences }) {
  const [state, action, pending] = useActionState(savePreferences, { error: "" });
  const returnTo = useRef<HTMLInputElement>(null);
  const active = !!preferences.role || preferences.years !== null || preferences.sizes.length > 0;
  const label = [
    preferences.role ? roleLabels[preferences.role] : "전체 직무",
    preferences.years !== null ? `${experienceLabel(preferences.years)} 기준 비교` : "경력 미설정",
    ...(preferences.sizes.length ? [sizesLabel(preferences.sizes)] : []),
  ].join(" · ");
  const details = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();
  // A non-modal panel over the page: it closes on navigation and on a click
  // outside it, so it never keeps covering what the reader moved on to.
  useEffect(() => { if (details.current) details.current.open = false; }, [pathname]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      const node = details.current;
      if (node?.open && !node.contains(event.target as Node)) node.open = false;
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  // Tabbing out of the panel closes it (focus has already moved on).
  const left = (event: FocusEvent<HTMLDetailsElement>) => {
    const next = event.relatedTarget as Node | null;
    if (event.currentTarget.open && next && !event.currentTarget.contains(next)) event.currentTarget.open = false;
  };
  // Opening moves focus into the panel; closing (Escape or the chip) returns it to the chip.
  const toggled = (event: SyntheticEvent<HTMLDetailsElement>) => {
    const node = event.currentTarget;
    const summary = node.querySelector("summary");
    if (node.open) node.querySelector<HTMLElement>(".preference-panel select")?.focus();
    else if (node.contains(document.activeElement)) summary?.focus();
  };
  const escape = (event: KeyboardEvent<HTMLDetailsElement>) => {
    if (event.key !== "Escape" || !event.currentTarget.open) return;
    event.currentTarget.open = false;
    event.currentTarget.querySelector("summary")?.focus();
  };
  return <details ref={details} className="preference-bar" key={JSON.stringify(preferences)} onToggle={toggled} onKeyDown={escape} onBlur={left}>
    <summary aria-label={active ? `내 탐색 기준: ${label}. 변경` : "직무·경력·회사 규모 기준 설정"} title={active ? label : undefined}><span className="preference-value">{active ? label : "직무·경력"}</span><span className="preference-short" aria-hidden="true">{active ? "내 탐색 기준" : "직무·경력"}</span></summary>
    <div className="preference-panel" role="region" aria-labelledby="preference-heading">
    <div className="preference-panel-heading">
      <h2 id="preference-heading">직무·경력·회사 규모</h2>
      <button type="button" className="preference-close" aria-label="탐색 기준 설정 닫기" onClick={() => { if (details.current) { details.current.open = false; details.current.querySelector("summary")?.focus(); } }}><span aria-hidden="true">×</span></button>
    </div>
    <p className="preference-intro">관심 직무와 회사 규모로 공고·회사를 모아보고, 내 경력과 비교해요.</p>
    <form action={action} onSubmit={() => { if (returnTo.current) returnTo.current.value = window.location.pathname + window.location.search + window.location.hash; }}>
      <input type="hidden" name="returnTo" defaultValue="/discover" ref={returnTo} />
      <div className="preference-fields">
        <label>관심 직무<select name="role" defaultValue={preferences.role}><option value="">전체 직무</option>{Object.entries(roleLabels).map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>
        <label>해당 직무 경력<select name="years" defaultValue={preferences.years ?? ""} aria-describedby="preference-years-help"><option value="">선택 안 함</option>{Array.from({ length: 31 }, (_, n) => <option key={n} value={n}>{experienceLabel(n)}</option>)}</select></label>
      </div>
      <p className="preference-help" id="preference-years-help">경력은 비교용이에요. 연차가 맞지 않거나 적혀 있지 않은 공고도 보여드려요.</p>
      <fieldset className="preference-sizes" aria-describedby="preference-sizes-help">
        <legend>회사 규모</legend>
        {SIZE_BANDS.map((band) => <label key={band.id}><input type="checkbox" name="size" value={band.id} defaultChecked={preferences.sizes.includes(band.id)} />{band.label}</label>)}
      </fieldset>
      <p className="preference-help" id="preference-sizes-help">같은 사업장 국민연금 가입자 수 기준이에요. 고르지 않으면 모든 규모를 보여주고, 규모 자료가 없는 회사는 목록에서 따로 알려드려요.</p>
      <div className="preference-actions"><button className="button preference-reset" name="intent" value="reset" disabled={pending}>초기화</button><button className="button primary" name="intent" value="save" disabled={pending}>{pending ? "적용 중…" : "적용하기"}</button></div>
      <p className="preference-storage">이 브라우저에 90일간 저장돼요.</p>
      {state.error && <p role="alert">{state.error}</p>}
    </form>
    </div>
  </details>;
}
