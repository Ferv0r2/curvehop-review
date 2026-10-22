import test from 'node:test';
import assert from 'node:assert/strict';
import { companyAge } from '../lib/company-age';
import { relativeAge } from '../lib/relative-date';
const now = new Date('2026-10-08T00:00:00Z');
test('지난 햇수에 1을 더하고 월일과 법인 범위를 지어내지 않는다', () => {
  assert.equal(companyAge('2020년', now), '7년차');
  assert.equal(companyAge('2026년 10월 1일', now), '1년차');
  assert.equal(companyAge('2007년 · 글로벌 모회사', now), '20년차');
  // Calendar-year counting read 8년차 here, a year more than the 6년 전 beside it (QA 2026-10-11 P3-10).
  assert.equal(companyAge('2019년 11월 1일', now), '7년차');
  assert.equal(companyAge('2018년 5월 (한국 법인)', now), '9년차');
  for (const value of ['미확인', '내년', '2027년', '2026년 11월', '2010년 설립 · 2020년 분사']) assert.equal(companyAge(value, now), null);
});
test('연도 변경은 한국 시간으로 계산한다', () => {
  assert.equal(companyAge('2020년', new Date('2026-12-31T14:59:59Z')), '7년차');
  assert.equal(companyAge('2020년', new Date('2026-12-31T15:00:00Z')), '8년차');
});
test('머리말의 연차와 사실 목록의 나이가 서로 맞는다(컬리 2014년 12월 31일)', () => {
  const today = new Date('2026-10-11T03:00:00Z');
  assert.equal(relativeAge('2014-12-31', today), '11년 전');
  assert.equal(companyAge('2014년 12월 31일', today), '12년차');
  assert.equal(companyAge('2014년 12월', today), '12년차');
  assert.equal(relativeAge('2014', today), '12년 전');
  assert.equal(companyAge('2014년', today), '13년차');
});
