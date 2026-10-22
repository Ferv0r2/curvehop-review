import test from "node:test";
import assert from "node:assert/strict";
import { decodePreferences, preferenceReturn, withPreferredRole, withPreferredSize } from "../lib/preferences";
import { parseFilters } from "../lib/jobs";

test("설정 없음·손상·과거 타입을 안전하게 처리하고 신입 0년을 보존한다", () => {
  for (const raw of [undefined, "broken", "null", "[]", '{"role":"__proto__","years":-1}']) assert.deepEqual(decodePreferences(raw), { role: "", years: null, sizes: [] });
  assert.deepEqual(decodePreferences('{"role":"frontend","years":0}'), { role: "frontend", years: 0, sizes: [] }, "규모가 없던 이전 쿠키도 그대로 읽는다");
  for (const years of [31, 2.5, "3"]) assert.equal(decodePreferences(JSON.stringify({ years })).years, null);
});
test("명시한 전체 직무와 검색 필터가 브라우저 기본값보다 우선한다", () => {
  const p = { role: "frontend" as const, years: 3, sizes: [] };
  assert.equal(withPreferredRole({ q: "컬리" }, p).role, "frontend");
  assert.deepEqual(withPreferredRole({ role: "", q: "컬리" }, p), { role: "", q: "컬리" });
  assert.equal(withPreferredRole({ role: "backend" }, p).role, "backend");
});
test("기준 초기화는 이전 직무·페이지를 제거하고 검색·주제·복귀 문맥은 유지한다", () => {
  assert.equal(preferenceReturn("/jobs?q=Kurly&role=backend&page=3&location=seoul"), "/jobs?q=Kurly&location=seoul");
  assert.equal(preferenceReturn("/companies?q=컬리&size=under-50&size="), `/companies?q=${encodeURIComponent("컬리")}`, "이전 규모 선택도 새 기준에 자리를 내준다");
  assert.equal(preferenceReturn("/companies/kurly?role=frontend#company-jobs"), "/companies/kurly#company-jobs");
  assert.equal(preferenceReturn("/read/channel-culture-guide?from=%2Fdiscover%3Ftopic%3Dculture"), "/read/channel-culture-guide?from=%2Fdiscover%3Ftopic%3Dculture");
  for (const unsafe of ["https://evil.test", "//evil.test", "/\\evil.test", "/api/jobs", "/discover\n", null]) assert.equal(preferenceReturn(unsafe), "/discover");
});


test("기준 변경 후 읽던 질문으로 돌아가도 이전 직군 필터가 되살아나지 않는다", () => {
  const path = `/read/channel-culture-guide?${new URLSearchParams({ origin: "/companies/kurly?role=backend#guides" })}`;
  const result = new URL(preferenceReturn(path), "https://local.test");
  assert.equal(result.searchParams.get("origin"), "/companies/kurly#guides");
});

test("회사 규모는 알려진 구간만 구간 순서로 저장하고, 규모 자료 없음은 저장 기준이 아니다", () => {
  assert.deepEqual(decodePreferences(JSON.stringify({ sizes: ["1000-plus", "under-50", "under-50", "unknown", "huge", 3] })).sizes, ["under-50", "1000-plus"]);
  assert.deepEqual(decodePreferences(JSON.stringify({ sizes: "under-50" })).sizes, [], "배열이 아니면 무시한다");
});
test("URL의 규모가 저장 기준보다 우선하고 size= 하나는 모든 규모를 뜻한다", () => {
  const p = { role: "" as const, years: null, sizes: ["50-299" as const] };
  assert.deepEqual(parseFilters(withPreferredSize({}, p)).size, ["50-299"]);
  assert.deepEqual(parseFilters(withPreferredSize({ size: "" }, p)).size, []);
  assert.deepEqual(parseFilters(withPreferredSize({ size: ["unknown", "300-999"] }, p)).size, ["300-999", "unknown"]);
});
