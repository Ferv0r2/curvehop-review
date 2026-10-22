import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// A small fault catalog, not a whole-program mutation score. Every mutation is
// applied to a disposable copy; syntax errors/timeouts never count as detection.
const cases = [
  ['cache-owner', 'lib/revision-cache.ts', 'if (entry === current) entry = undefined;', 'entry = undefined;', 'tests/revision-cache.test.ts'],
  ['cache-retry-bound', 'lib/revision-cache.ts', 'attempt < 3', 'attempt < 1', 'tests/revision-cache.test.ts'],
  ['research-day', 'lib/published-data.ts', 'new Date().toISOString().slice(0, 10)', '"fixed-day"', 'tests/published-data.test.ts'],
  ['research-local-day', 'lib/published-data.ts', 'new Date().toISOString().slice(0, 10)', "new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())", 'tests/published-data.test.ts'],
  ['explicit-all-roles', 'lib/preferences.ts', 'params.role === undefined', '!params.role', 'tests/preferences.test.ts'],
  ['jev-all-dimensions', 'lib/jev-shadow.ts', "decisionChecks.every(k => answers[k].choice === 'supported'", "decisionChecks.some(k => answers[k].choice === 'supported'", 'tests/jev-shadow.test.ts'],
  ['jev-confidence-boundary', 'lib/jev-shadow.ts', '>= JEV_CONFIDENCE', '> JEV_CONFIDENCE', 'tests/jev-shadow.test.ts'],
  ['jev-summary-authority', 'lib/jev-shadow.ts', "modelAccuracyClaim: 'not_established', publicationAuthority: false", "modelAccuracyClaim: 'not_established', publicationAuthority: true", 'tests/jev-shadow.test.ts'],
  ['jev-batch-limit', 'lib/jev-shadow-run.ts', 'bundle.cases.slice(0, options.limit)', 'bundle.cases', 'tests/jev-transport.test.ts'],
  ['jev-error-stop', 'lib/jev-shadow-run.ts', "if (row.outcome === 'error') break;", '// faulty: continue after transport failure', 'tests/jev-transport.test.ts'],
  ['jev-replay-binding', 'lib/jev-shadow-run.ts', 'row.caseHash !== caseHash(c)', 'false', 'tests/jev-transport.test.ts'],
  ['jev-preflight', 'lib/jev-shadow-run.ts', 'await options.beforeCall?.(c);', '// faulty: skip pre-call persistence', 'tests/jev-transport.test.ts'],
  ['probe-warm-assertion', 'tests/helpers/ssr-measure.mjs', 'if (!baseline) assert.deepEqual(warmCounts, expectedCounts[index], `Warm full-request file invocations: ${route}`);', '// faulty: never check observed warm reads', 'tests/instrumentation.test.mjs'],
];
const root = process.cwd();
const dir = mkdtempSync(join(tmpdir(), 'curvehop-test-sensitivity-'));
const results = [];
const env = { PATH: process.env.PATH, HOME: dir, TZ: 'Asia/Seoul', CI: 'true', NEXT_TELEMETRY_DISABLED: '1' };
function run(files) {
  return spawnSync(process.execPath, [join(root, 'node_modules/tsx/dist/cli.mjs'), '--test', '--test-reporter=tap', ...files],
    { cwd: dir, env, encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
}
try {
  for (const name of ['lib','components','tests','scripts','data','package.json','tsconfig.json']) cpSync(join(root,name),join(dir,name),{recursive:true});
  symlinkSync(resolve(root,'node_modules'),join(dir,'node_modules'),'dir');
  const baseline = run([...new Set(cases.map(c=>c[4]))]);
  if (baseline.status !== 0) throw new Error(`Unmodified tests must pass first.\n${baseline.stdout}\n${baseline.stderr}`);
  for (const [id, path, before, after, test] of cases) {
    const file = join(dir,path), source = readFileSync(file,'utf8');
    if (source.split(before).length !== 2) throw new Error(`Mutation anchor must match once: ${id}`);
    try {
      writeFileSync(file,source.replace(before,after));
      const result = run([test]);
      if (result.error || result.signal || (result.status !== 0 && (!/ERR_ASSERTION/.test(result.stdout) || !/# fail [1-9]/.test(result.stdout)))) {
        throw new Error(`Invalid experiment (not a test assertion): ${id}\n${result.stdout}\n${result.stderr}`);
      }
      const detected = result.status !== 0;
      results.push({id, test, detected});
      console.log(`${detected?'DETECTED':'SURVIVED'} ${id}`);
    } finally { writeFileSync(file,source); }
  }
  console.log(JSON.stringify({checked:results.length,detected:results.filter(r=>r.detected).length,results},null,2));
  if (results.some(r=>!r.detected)) process.exitCode = 1;
} finally { rmSync(dir,{recursive:true,force:true}); }
