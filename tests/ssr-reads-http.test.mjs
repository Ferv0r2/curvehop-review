import test from 'node:test';
import assert from 'node:assert/strict';
import { isolatedRuntime } from './helpers/isolated-runtime.mjs';
import { loadData, measureCounts, routes } from './helpers/ssr-measure.mjs';

// Same production readers and RSC dispatcher; only the input companies are fictional.
test('public revisions refresh across HTTP requests while preferences remain request-scoped', { timeout: 120000 }, async () => {
  const { files, data } = await loadData();
  const runtime = await isolatedRuntime(files, { probe: true, publicAssets: true });
  try {
    await measureCounts(runtime);
    const snapshot = JSON.parse(files['data/jobs.json']);
    const job = snapshot.jobs.find(j => `/jobs/${j.id}` === routes[1]);
    assert.ok(job, 'the representative fixture must exist');
    const revisionEventStart = (await runtime.events()).length;
    job.title = 'SSR revision marker';
    await runtime.write('data/jobs.json', JSON.stringify(snapshot));
    const changed = await runtime.get(routes[1]);
    assert.equal(changed.status, 200);
    assert.ok((await runtime.events()).slice(revisionEventStart).some(e=>e.file==='jobs.json' && ['open','readFile'].includes(e.method)), 'probe must still observe forced reads after warm measurements');
    assert.match(changed.html, /<h1[^>]*>SSR revision marker<\/h1>/);
    assert.ok(changed.html.includes(`<title>${job.company} · SSR revision marker`));
    const api = await runtime.get('/api/jobs?q=SSR%20revision%20marker');
    assert.match(api.headers.get('cache-control'), /no-store/);
    assert.equal(JSON.parse(api.text).items[0].id, job.id);
    await runtime.write('data/jobs.json', files['data/jobs.json']);
    assert.equal(JSON.parse((await runtime.get('/api/jobs?q=SSR%20revision%20marker')).text).total, 0);

    await runtime.write('data/jobs.json', '{');
    assert.equal((await runtime.get('/jobs')).status, 500);
    await runtime.write('data/jobs.json', files['data/jobs.json']);
    assert.equal((await runtime.get('/jobs')).status, 200, 'rejected promise must not poison subsequent requests');

    await Promise.all(['frontend', 'backend'].map(async role => {
      const headers = { Cookie: `nextstep-preferences-v1=${JSON.stringify({ role, years: 3 })}` };
      const [page, response] = await Promise.all([runtime.get('/jobs', { headers }), runtime.get('/api/jobs', { headers })]);
      assert.equal(page.status, 200);
      assert.ok(page.html.includes(`${role === 'frontend' ? '프론트엔드' : '백엔드'} 공고를 보고 있어요`));
      const result = JSON.parse(response.text);
      assert.equal(response.status, 200);
      assert.equal(result.filters.role, role);
      assert.ok(result.items.length > 0, 'a zero-result response cannot prove preference isolation');
      assert.ok(result.items.every(j => j.role === role));
      const all = await runtime.get('/api/jobs?role=', { headers });
      assert.equal(all.status,200);
      const allResult = JSON.parse(all.text);
      assert.equal(allResult.filters.role, '');
      assert.ok(allResult.items.some(j=>j.role==='frontend') && allResult.items.some(j=>j.role==='backend'), 'explicit all must return both roles, not just a cleared filter label');
    }));

    const pack = JSON.parse(files['data/company-research.json']);
    const guide = pack.companies.flatMap(c => c.guides).find(g => `/read/${g.id}` === routes[2]);
    assert.ok(guide);
    guide.question = '저장된 답변이 바뀌면 다음 요청도 새 내용을 읽을까요?';
    await runtime.write('data/company-research.json', JSON.stringify(pack));
    assert.ok((await runtime.get(routes[2])).html.includes(guide.question));
    await runtime.write('data/company-research.json', '{');
    assert.ok((await runtime.get(routes[2])).html.includes('자료 확인이 필요해요'));
    await runtime.write('data/company-research.json', files['data/company-research.json']);
    const restored = await runtime.get(routes[2]);
    assert.equal(restored.status, 200);
    const originalGuide = JSON.parse(files['data/company-research.json']).companies.flatMap(c=>c.guides).find(g=>g.id===guide.id);
    assert.ok(restored.html.includes(originalGuide.question), 'recovery must restore real content, not just remove the marker');
    assert.ok(!restored.html.includes('자료 확인이 필요해요'));
    assert.ok(!restored.html.includes(guide.question));

    for (const route of ['/companies', '/discover', '/saved', '/about', '/companies/demo-orbit']) {
      const page = await runtime.get(route);
      assert.equal(page.status, 200, route);
      assert.ok(page.html.includes('채용 검토용 공개판'), route);
      assert.ok(!page.text.includes('googletagmanager.com/gtag/js'), 'review edition never loads analytics');
    }
    for (const route of ['/jobs/not-a-job', '/companies/not-a-company', '/read/not-a-story']) assert.equal((await runtime.get(route)).status, 404);
  } finally { await runtime.stop(); }
  assert.deepEqual((await loadData()).data, data, 'HTTP tests must not mutate checkout fixtures');
});
