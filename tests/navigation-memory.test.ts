import test from "node:test";
import assert from "node:assert/strict";
import { navigationRoute, parseNavigationMemory } from "../lib/navigation-memory";

test("읽던 질문의 출발 맥락과 앵커는 같은 읽기 위치로 찾되 검색 조건은 분리한다", () => {
  assert.equal(navigationRoute('/read/channel-culture-guide?from=%2Fdiscover#reading-sources'), '/read/channel-culture-guide');
  assert.notEqual(navigationRoute('/discover?topic=culture'), navigationRoute('/discover?topic=work'));
  assert.notEqual(navigationRoute('/jobs?q=컬리&page=2'), navigationRoute('/jobs?q=컬리'));
  assert.equal(navigationRoute('/jobs?q=컬리&page=1&role=frontend'), navigationRoute('/jobs?role=frontend&q=컬리'));
});
test("명시적 전체 직군과 관심 직군은 다른 위치이며 기본값과 같은 명시 직군은 연결된다", () => {
  assert.equal(navigationRoute('/companies/kurly', 'frontend'), navigationRoute('/companies/kurly?role=frontend#guides', 'frontend'));
  assert.notEqual(navigationRoute('/companies/kurly', 'frontend'), navigationRoute('/companies/kurly?role=', 'frontend'));
});
test("목록 복귀는 같은 규모 조건을 연결하고 저장한 규모와 명시적 해제는 분리한다", () => {
  for (const path of ["/jobs", "/csr", "/companies"]) {
    assert.equal(navigationRoute(path), navigationRoute(`${path}?size=`));
    assert.equal(navigationRoute(path, "", ["50-299"]), navigationRoute(`${path}?size=50-299`, "", ["50-299"]));
    assert.notEqual(navigationRoute(path, "", ["50-299"]), navigationRoute(`${path}?size=`, "", ["50-299"]));
    assert.equal(navigationRoute(`${path}?size=under-50&size=50-299`), navigationRoute(`${path}?size=50-299&size=under-50`));
  }
  assert.equal(navigationRoute("/jobs"), navigationRoute("/jobs?role=&size="));
});
test("손상된 탭 기록과 잘못된 좌표는 버리고 방문 기록 수를 제한한다", () => {
  for (const value of [null, 'broken', '{}', '{"entries":[null]}']) assert.deepEqual(parseNavigationMemory(value), { entries: [] });
  const entry = { id: 'a', url: '/discover', route: '/discover', x: 0, y: 100, details: { facts: true }, savedAt: 1 };
  assert.equal(parseNavigationMemory(JSON.stringify({ entries: Array(60).fill(entry) })).entries.length, 40);
  assert.equal(parseNavigationMemory(JSON.stringify({ entries: [{ ...entry, y: -1 }] })).entries.length, 0);
});
