import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { buildDemoData, buildDemoPins, DEMO_DATE } from "../scripts/demo-data";
import { companies, companyForJob } from "../lib/companies";
import { companyListing, listedJobs } from "../lib/company-listing";
import { compareHeadcount, validateResearch } from "../lib/research";
import { queryJobs } from "../lib/jobs";
import { readingItems, nextReadings } from "../lib/reading";
import { assembleRelations, parseRelationsFile, validateRelations } from "../lib/relations";
import { questionView } from "../lib/question-view";

const { registry, research, snapshot } = buildDemoData();

test("authored demo data matches the reviewed snapshot byte-for-byte", () => {
  for (const [name, expected] of [["demo-companies.json", registry], ["company-research.json", research], ["jobs.json", snapshot], ["reading-pins.json", buildDemoPins(research)]] as const) {
    assert.equal(readFileSync(resolve("data", name), "utf8"), JSON.stringify(expected, null, 2) + "\n");
  }
});

test("all fictional companies meet the original structural validation and listing floor", () => {
  assert.deepEqual(validateResearch(research, new Date(`${DEMO_DATE}T12:00:00Z`)), []);
  assert.deepEqual(companies.map(c => c.id), registry.map(c => c.id));
  const listing = companyListing(research);
  assert.equal(listing.eligibleIds.size, 3, JSON.stringify(listing.rows));
  assert.equal(listedJobs(snapshot.jobs, listing.eligibleIds).length, 15);
  for (const job of snapshot.jobs) assert.equal(companyForJob(job)?.id, job.sourceBoard);
});

test("original reading navigation resolves authored related links for every story", () => {
  const readings = readingItems(research);
  assert.equal(readings.length, 12);
  for (const company of research.companies) {
    assert.equal(company.guides?.length, 4);
    for (const guide of company.guides ?? []) {
      const related = guide.publication?.relatedIds ?? [];
      assert.ok(related.length > 0, `${guide.id}: fixture must exercise related navigation`);
      assert.equal(new Set(related).size, related.length, `${guide.id}: duplicate link`);
      assert.ok(!related.includes(guide.id), `${guide.id}: self link`);
      for (const target of related) {
        assert.ok(readings.some(item => item.id === target && item.companyId === company.id));
      }
    }
  }
  for (const reading of readings) assert.ok(nextReadings(research, reading.id).length > 0, reading.id);
});

test("headcount comparison preserves comparable, incomparable and missing examples", () => {
  const [orbit, loom, harbor] = research.companies;
  const comparable = compareHeadcount(orbit.headcount);
  assert.equal(comparable.status, "comparable");
  if (comparable.status === "comparable") assert.equal(comparable.delta, 6);
  assert.equal(compareHeadcount(loom.headcount).status, "incomparable");
  assert.equal(compareHeadcount(harbor.headcount).status, "insufficient");
  assert.ok(snapshot.jobs.some(job => job.experience === null));
  assert.ok(snapshot.jobs.some(job => job.updatedAt === null && job.firstSeenAt === null));
  assert.ok(snapshot.jobs.every(job => job.salary === null));
  assert.ok(research.companies.every(company => company.publicDataIdentity === undefined));
});

test("original job search and role/location filters work with fictional identities", () => {
  assert.equal(queryJobs(snapshot.jobs, {}).total, 15);
  assert.equal(queryJobs(snapshot.jobs, { q: "오빗 스튜디오" }).total, 5);
  assert.equal(queryJobs(snapshot.jobs, { q: "루움 샘플" }).total, 5);
  assert.equal(queryJobs(snapshot.jobs, { location: "pangyo" }).total, 5);
  assert.equal(queryJobs(snapshot.jobs, { role: "frontend" }).total, 3);
  assert.deepEqual(queryJobs(snapshot.jobs, {q:"오빗 스튜디오",role:"backend",location:"seoul"}).items.map(j=>j.id), ["demo-orbit-job-2"]);
  assert.equal(queryJobs(snapshot.jobs, {q:"오빗 스튜디오",location:"pangyo"}).total,0);
  assert.equal(queryJobs(snapshot.jobs, { q: "존재하지않는검색결과" }).total, 0);
});

test("all fixture URLs use reserved example domains; public-data registries are empty", () => {
  for (const name of readdirSync("data").filter(name => name.endsWith(".json"))) {
    const text = readFileSync(resolve("data", name), "utf8");
    const urls = text.match(/https?:\/\/[^\s"<>]+/g) ?? [];
    for (const url of urls) assert.ok(new URL(url).hostname.endsWith(".example"), `${name}: ${url}`);
  }
  assert.deepEqual(JSON.parse(readFileSync("data/pension-identities.json", "utf8")), {});
  assert.deepEqual(JSON.parse(readFileSync("data/pension-roster-review.json", "utf8")), []);
  assert.deepEqual(JSON.parse(readFileSync("data/dart-identities.json", "utf8")).identities, {});
  const relations = JSON.parse(readFileSync("data/company-relations.json", "utf8"));
  const parsed = parseRelationsFile(relations);
  assert.deepEqual(parsed.issues, []);
  assert.deepEqual(validateRelations(assembleRelations(parsed.file, {legalEntities: [], workplaces: [], relations: []}), research), {fileIssues: [], issuesByCompany: {}, invalidCorrections: []});
});

test("one sourced cross-company bridge disappears when either cited source changes", () => {
  const linked = nextReadings(research, "demo-orbit-product").find(next => next.reading.id === "demo-loom-product");
  assert.equal(linked?.relationship, "compare");
  assert.ok(linked?.comparison?.problem);
  for (const companyId of ["demo-orbit", "demo-loom"]) {
    const revised = structuredClone(research);
    const evidence = revised.companies.find(company => company.id === companyId)!.evidence.find(source => source.id === `${companyId}-source-product`)!;
    evidence.excerpt += " 변경된 근거.";
    assert.ok(!nextReadings(revised, "demo-orbit-product").some(next => next.reading.id === "demo-loom-product"));
  }
});

test("company questions expose bounded fixture answers and invalidate edited sources", () => {
  const view = questionView(research, "demo-orbit", {jobs:snapshot.jobs});
  for (const id of ["company.identity", "team.culture", "hiring.process"]) {
    const question = view.questions.find(question => question.questionId === id)!;
    assert.equal(question.status, "partial", id);
    assert.ok(question.facets.some(facet => facet.claim && facet.guideId));
    assert.ok(question.readingIds.length);
  }
  assert.equal(view.questions.find(question => question.questionId === "employment.conditions")?.status, "not_assessed");
  const revised = structuredClone(research);
  revised.companies[0].evidence.find(source => source.id === "demo-orbit-source-product")!.excerpt += " 변경된 자료.";
  const product = questionView(revised, "demo-orbit").questions.find(question => question.questionId === "company.identity")!.facets.find(facet => facet.facetId === "identity.product")!;
  assert.equal(product.status, "not_assessed");
  assert.equal(product.claim, "");
});
