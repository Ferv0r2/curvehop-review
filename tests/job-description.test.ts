import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { hasTextBody, parseJobDescription } from '../lib/job-description';
import { extractJobLinks, htmlToText } from '../lib/greenhouse';
import { ImageBodyNote, JobDescription } from '../components/job-description';
test('an image-only body (empty description) points to the original instead of an empty posting',()=>{
 assert.equal(hasTextBody(''),false);
 assert.equal(hasTextBody('  '),false);
 assert.equal(hasTextBody(' \n\t'),false);
 assert.equal(hasTextBody('React'),true);
 const html=renderToStaticMarkup(createElement(ImageBodyNote,{sourceUrl:'https://example.career.greetinghr.com/ko/o/42'}));
 assert.match(html,/^<p class="research-caption">공고 본문이 이미지로 되어 있어요\. 원문에서 확인하세요\./);
 // Not the header's "공식 공고 열기" label: the same page already has that button.
 assert.match(html,/<a href="https:\/\/example\.career\.greetinghr\.com\/ko\/o\/42" target="_blank" rel="noopener noreferrer">원문 보기 ↗<\/a>/);
 assert.doesNotMatch(html,/공식 공고 열기/);
 assert.doesNotMatch(html,/<img|style=/);
});
test('HTML headings and nested lists retain structure as safe text',()=>{
 const text=htmlToText('<h3>담당 업무</h3><ul><li>모델 개발<ul><li>실험 설계</li><li>오류 분석</li></ul></li><li>평가</li></ul>');
 const blocks=parseJobDescription(text);
 assert.equal(blocks[0].kind,'heading');
 const list=blocks.find(b=>b.kind==='list'); assert.ok(list && list.kind==='list');
 assert.deepEqual(list.items.map(i=>[i.text,i.depth]),[['모델 개발',0],['실험 설계',1],['오류 분석',1],['평가',0]]);
});
test('legacy paragraphs, bullets and explicit markdown headings render without inventing headings',()=>{
 const blocks=parseJobDescription('회사 소개입니다.\n두 번째 줄입니다.\n\n우리 팀과 함께할 미션을 소개합니다.\n\n• 모델 개발\n\n• 품질 평가\n\n## 자격 요건\n관련 경험\n\n<script>alert(1)</script>');
 assert.equal(blocks[0].kind,'paragraph');
 assert.ok(blocks.some(b=>b.kind==='heading'&&b.text==='자격 요건'));
 assert.ok(blocks.some(b=>b.kind==='list'&&b.items.length===2));
 assert.ok(blocks.some(b=>b.kind==='paragraph'&&b.text.includes('<script>')));
});


test('encoded Greenhouse attachment links are decoded and unsafe schemes remain excluded',()=>{
 const links=extractJobLinks('&lt;a href=&quot;https://krafton.com/ko/about/vision/&quot;&gt;비전&lt;/a&gt;&lt;a href=&quot;javascript:alert(1)&quot;&gt;bad&lt;/a&gt;','https://job-boards.greenhouse.io/krafton/jobs/1');
 assert.deepEqual(links,[{text:'비전',url:'https://krafton.com/ko/about/vision/'}]);
});

test('posting markup is escaped in rendered HTML, including hostile paragraphs and bullets',()=>{
 const html=renderToStaticMarkup(createElement(JobDescription,{text:'소개 <script>alert(1)</script>\n\n## 담당 업무\n- <img src=x onerror=alert(1)>\n- React & TypeScript'}));
 assert.doesNotMatch(html,/<script\b|<img\b/);
 assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
 assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.match(html,/React &amp; TypeScript/);
});
