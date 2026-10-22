import test from "node:test";
import assert from "node:assert/strict";
import { analyticsAction, analyticsContext, analyticsEnabled, analyticsPath, analyticsReferrer, createAnalyticsSession, readingProgress, refusedAnalytics } from "../lib/analytics";

test("analytics is production-host only and rejects missing or malformed IDs", () => {
  assert.ok(analyticsEnabled("G-ABC1234567", "curvehop.net"));
  for (const host of ["localhost", "127.0.0.1", "preview.vercel.app", "curvehop.net.evil.test"]) assert.equal(analyticsEnabled("G-ABC1234567", host), false);
  for (const id of [undefined, "", "G-x<script>", "UA-1234"]) assert.equal(analyticsEnabled(id, "curvehop.net"), false);
});
test("context and action payloads allow only contract fields, never query/text/URL", () => {
  assert.deepEqual(analyticsContext({ page_type: "reading", content_id: "kurly-guide", company_id: "kurly", topic: "culture", search: "private@example.com" } as never), { page_type: "reading", content_id: "kurly-guide", company_id: "kurly", topic: "culture" });
  assert.equal(analyticsContext({ page_type: "reading" }), null);
  assert.equal(analyticsContext({ page_type: "job", content_id: "private@example.com" }), null);
  assert.equal(analyticsContext({ page_type: "job", content_id: "good", topic: "private" } as never), null);
  assert.equal(analyticsPath({ page_type: "company", content_id: "kurly" }), "/companies/kurly");
  assert.equal(analyticsReferrer("https://google.com/search?q=private#secret"), "https://google.com");
  assert.equal(analyticsReferrer("javascript:alert(1)"), "");
  assert.equal(analyticsReferrer("garbage"), "");
  assert.deepEqual(analyticsAction({ name: "bookmark_change", job_id: "job-1", action: "add", email: "private@example.com" } as never), { job_id: "job-1", action: "add" });
  for (const input of [
    { name: "unknown" }, { name: "bookmark_change", job_id: "ok", action: "query" },
    { name: "official_job_open", job_id: "ok", placement: "unknown" }, { name: "source_open", placement: "https://secret" },
    { name: "content_select", destination_type: "reading", destination_id: "private@example.com", placement: "card", navigation_mode: "same_tab" },
  ]) assert.equal(analyticsAction(input as never), null);
});
test("measurement is on unless this browser refused the old consent card, however long ago", () => {
  assert.equal(refusedAnalytics(null), false);
  assert.equal(refusedAnalytics(JSON.stringify({ choice: "denied", at: 0 })), true);
  for (const legacy of [JSON.stringify({ choice: "granted", at: Date.now() }), "bad", "{}", "null"]) assert.equal(refusedAnalytics(legacy), false, legacy);
});
test("no pre-consent backlog, delayed readiness uses current page; withdrawal wins race", () => {
  const events: Array<{ name: string; params: Record<string, unknown> }> = [];
  const s = createAnalyticsSession((name, params) => events.push({ name, params }), "https://google.com/?q=secret");
  s.enter({}, { page_type: "company", content_id: "a", company_id: "a" });
  s.action({ name: "bookmark_change", job_id: "job-1", action: "add" });
  s.consent(true);
  s.enter({}, { page_type: "company", content_id: "b", company_id: "b" });
  s.consent(false); s.ready(true);
  assert.equal(events.length, 0);
  s.consent(true);
  assert.equal(events.length, 1);
  assert.equal(events[0].params.company_id, "b");
  assert.equal(events[0].params.page_location, "https://curvehop.net/companies/b");
  s.action({ name: "official_job_open", job_id: "job-1", placement: "top" });
  assert.equal(events.at(-1)?.params.page_location, "https://curvehop.net/companies/b");
  s.consent(false); s.action({ name: "bookmark_change", job_id: "job-1", action: "add" });
  assert.equal(events.length, 2);
  s.consent(true); assert.equal(events.length, 2);
});
test("entry ownership: strict replay one view, stale cleanup safe, return and BFCache new view", () => {
  const names: string[] = [];
  const s = createAnalyticsSession(name => names.push(name));
  s.consent(true); s.ready(true);
  const a = {}, b = {};
  const page = { page_type: "company", content_id: "a", company_id: "a" } as const;
  s.enter(a, page); s.leave(a); s.enter(a, page);
  assert.deepEqual(names, ["page_view"]);
  s.enter(b, { page_type: "jobs" }); s.leave(a);
  assert.equal(s.page()?.page_type, "jobs");
  s.leave(b); const returned = {}; s.enter(returned, page);
  assert.equal(names.length, 3);
  s.restore(returned); assert.equal(names.length, 4);
  s.clear(); s.action({ name: "source_open", placement: "reading_source" });
  assert.equal(names.length, 4);
});
test("results/engagement dedup and cross-company selection retain explicit meanings", () => {
  const events: Array<{ name: string; params: Record<string, unknown> }> = [];
  const s = createAnalyticsSession((name, params) => events.push({ name, params }));
  const token = {};
  s.enter(token, { page_type: "reading", content_id: "a-guide", company_id: "a" });
  s.results(token, "private-query", 0); s.engaged(token);
  s.consent(true); s.ready(true);
  s.results(token, "private-query", 0); s.results(token, "private-query", 0);
  s.results(token, "different-private-query", 2); s.results({}, "x", 0);
  s.results(token, "invalid", -1); s.engaged(token); s.engaged(token);
  s.action({ name: "content_select", destination_type: "reading", destination_id: "b-guide", destination_company_id: "b", placement: "bridge", navigation_mode: "new_tab" });
  assert.deepEqual(events.map(e => e.name), ["page_view", "results_view", "results_view", "reading_engaged", "content_select"]);
  assert.equal(events.at(-1)?.params.cross_company, true);
  assert.equal(JSON.stringify(events).includes("private-query"), false);
});
test("reading needs 30 visible seconds AND midpoint; hidden time and fast scroll do not qualify", () => {
  let p = readingProgress({ milliseconds: 0, midpoint: false }, 5000, true, true);
  assert.equal(p.engaged, false);
  p = readingProgress(p, 60000, false, true); assert.equal(p.milliseconds, 5000);
  p = readingProgress(p, 25000, true, false); assert.equal(p.engaged, true);
  assert.equal(readingProgress({ milliseconds: 0, midpoint: false }, 40000, true, false).engaged, false);
  assert.equal(readingProgress({ milliseconds: 0, midpoint: false }, -5000, true, true).milliseconds, 0);
});
