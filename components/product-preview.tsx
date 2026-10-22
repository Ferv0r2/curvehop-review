import type { ReactNode } from "react";
import { FactTimeMeta } from "@/components/fact-time";
import { HeadcountBars } from "@/components/headcount-timeline";
import { RelDate } from "@/components/rel-date";
import { HiringStatus } from "@/components/research-view";
import type { AboutMockup } from "@/lib/about-mockup";
import { absoluteDate } from "@/lib/relative-date";

const NO_LINKS: ReadonlyMap<string, string> = new Map();

/** One question, one relevant part of the product. DOM order stays copy first
 * even when desktop alternates the illustration. Every example is labelled. */
function Scene({ id, number, label, title, description, takeaway, children, reverse = false }: {
  id: string; number: string; label: string; title: string; description: string;
  takeaway: string; children: ReactNode; reverse?: boolean;
}) {
  return (
    <section className={`about-section story-scene${reverse ? " is-reverse" : ""}${id === "about-preview" ? " about-preview" : ""}`} aria-labelledby={id}>
      <div className="about-inner story-layout">
        <header className="story-copy" data-reveal="">
          <p className="story-step"><span>{number}</span>{label}</p>
          <h2 id={id}>{title}</h2>
          <p className="story-description">{description}</p>
          <p className="story-takeaway">{takeaway}</p>
        </header>
        <div className="story-visual" data-reveal="">{children}</div>
      </div>
    </section>
  );
}

function Frame({ mockup, title, children, chart = false }: {
  mockup: AboutMockup; title: string; children: ReactNode; chart?: boolean;
}) {
  return (
    <figure className={chart ? "preview-frame" : "story-frame"}>
      <div className="story-frame-bar"><span>{title}</span><span className="preview-example">시연용 예시 데이터</span></div>
      <figcaption className="visually-hidden">{mockup.identity.name} 이름을 사용한 시연 화면이에요. 숫자·공고·이야기는 실제 회사 정보가 아닌 예시예요.</figcaption>
      {children}
    </figure>
  );
}

function Company({ mockup }: { mockup: AboutMockup }) {
  return (
    <div className="story-company">
      <img className="story-owner-logo" src="/brand/fervorlab-symbol.png" alt="" width={56} height={56} decoding="async" />
      <div><p className="preview-company-name">{mockup.identity.name}</p><p className="preview-company-meta">{mockup.basics.find(field => field.label === "주요 산업·도메인")?.value}</p></div>
    </div>
  );
}

/** Four SSR scenes share the hero's operator-branded demonstration data; real service counts and
 * the real company graph follow separately. No fabricated fit or activity data. */
export function ProductPreviewSection({ mockup }: { mockup: AboutMockup }) {
  const { basics, timeline, facts, hiring, jobs, story } = mockup;
  const latest = timeline.months.findLast(month => month.value !== null);
  const chronologicalFacts = [...facts].sort((a, b) => (b.time.sortKey ?? "").localeCompare(a.time.sortKey ?? ""));
  return (
    <div className="about-story">
      <div className="about-inner story-intro" data-reveal="">
        <p>공고를 열고 나면, 진짜 궁금해지는 것들.</p>
        <nav aria-label="제품 미리보기 순서">
          <a href="#about-company">회사</a><a href="#about-preview">변화</a><a href="#about-team">팀·채용</a><a href="#about-discovery">발견</a>
        </nav>
      </div>
      <Scene id="about-company" number="01" label="회사를 이해하기" title="어떤 회사인지부터 알아보세요."
        description="무엇을 만드는 회사인지, 언제 시작했고 어느 정도 규모인지. 흩어진 기본 정보를 한곳에서 살펴봐요."
        takeaway="공고를 읽기 전에, 회사의 윤곽부터.">
        <Frame mockup={mockup} title="회사 한눈에">
          <div className="story-frame-body">
            <Company mockup={mockup} />
            <p className="story-business">{story.business}</p>
            <dl className="story-basics">
              {basics.map(field => <div key={field.label}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}
              <div><dt>국민연금 가입자</dt><dd>{latest ? `${latest.value!.toLocaleString("ko-KR")}명` : "값 없음"}{latest && <><small>기준 {absoluteDate(latest.month)}</small><small>전체 직원 수와 다를 수 있어요.</small></>}</dd></div>
              <div><dt>공식 채용 공고</dt><dd>{hiring.currentCount === null ? "미확인" : `${hiring.currentCount}건`}<small>서울·판교 공고 예시</small></dd></div>
            </dl>
            <p className="story-source-note">회사 소개 · 국민연금공단 · 공식 채용 페이지를 모아 보는 예시예요.</p>
          </div>
        </Frame>
      </Scene>
      <Scene id="about-preview" number="02" label="변화를 살펴보기" title="최근에는 무엇이 달라졌나요?"
        description="한 시점의 숫자에 머무르지 않아요. 인원 추이와 회사가 공개한 사업 변화를 시점·출처와 함께 읽어요."
        takeaway="숫자의 변화와 그 시기의 이야기를 함께." reverse>
        <Frame mockup={mockup} title={`${mockup.identity.name} · 최근 변화`} chart>
          <div className={`preview-body${latest ? "" : " no-headcount"}`}>
            {latest && <div className="preview-block preview-headcount">
              <h3 className="preview-label">국민연금 가입자</h3>
              <p className="preview-value">{latest.value!.toLocaleString("ko-KR")}명 <span>기준 <time dateTime={latest.month}>{absoluteDate(latest.month)}</time></span></p>
              <HeadcountBars timeline={timeline} markers={false} />
              <div className="visually-hidden"><table><caption>예시 회사 {mockup.identity.name}의 국민연금 가입자 월별 값</caption><thead><tr><th scope="col">기준월</th><th scope="col">가입자</th></tr></thead><tbody>
                {timeline.months.map(month => <tr key={month.month}><th scope="row"><time dateTime={month.month}>{absoluteDate(month.month)}</time></th><td>{month.value === null ? "값 없음" : `${month.value}명`}</td></tr>)}
              </tbody></table></div>
              <p className="research-caption">국민연금공단 · 같은 사업장 가입자 · {absoluteDate(timeline.first)}~{absoluteDate(timeline.last)} · 전체 직원·입퇴사자 수와 다를 수 있어요.</p>
            </div>}
            <div className="preview-block preview-evidence">
              <h3 className="preview-label">그 시기의 회사 이야기</h3>
              <ul className="preview-facts">{chronologicalFacts.map(({ fact, time, sources }) => <li key={fact.id}>
                <p className="preview-fact-meta"><FactTimeMeta fact={fact} time={time} rendered={NO_LINKS} /></p>
                <p className="preview-fact-text">{fact.text}</p>
                <p className="preview-fact-source">{sources.map(source => <span key={source.id}><span className="preview-fact-publisher">{source.publisher}</span> · {source.publishedOn ? <>게시 <RelDate value={source.publishedOn} /></> : "게시일 미확인"}</span>)}</p>
              </li>)}</ul>
            </div>
          </div>
        </Frame>
      </Scene>
      <Scene id="about-team" number="03" label="팀과 모집 조건 살펴보기" title="어떤 사람을 찾고 있을까요?"
        description="회사가 밝힌 방향과 팀이 소개한 일하는 방식, 공고의 모집 조건을 함께 살펴봐요. 각각 어디에서 나온 이야기인지 구분해요."
        takeaway="회사가 말하는 가치와 실제 모집 조건을 나란히.">
        <Frame mockup={mockup} title={`${mockup.identity.name} · 팀과 채용`}>
          <div className="story-frame-body">
            <p className="story-mini-label">팀이 소개한 일하는 방식</p>
            <blockquote className="story-principle">{story.team.principle}</blockquote>
            <p className="story-source-note">{story.team.context}</p>
            <div className="story-job-head"><h3 className="preview-label">공고에 적힌 조건</h3><HiringStatus hiring={hiring} /></div>
            <ul className="research-jobs">{jobs.map(job => <li key={job.title}>
              <span className="preview-job-title">{job.title}</span>
              <span className="research-job-meta"><span className="meta-list"><strong className="meta-unit research-job-experience">{job.experience}</strong><span className="meta-unit">{job.role}</span><span className="meta-unit">{job.place}</span></span></span>
            </li>)}</ul>
          </div>
        </Frame>
      </Scene>
      <Scene id="about-discovery" number="04" label="다음 회사 발견하기" title="읽던 이야기에서, 다음 회사로."
        description="정산 시스템을 바꾼 이유가 궁금했다면, 같은 문제를 푼 팀과 그 일을 맡는 직무까지 이어 읽어요."
        takeaway="한 회사에서 시작해, 내가 궁금한 방향으로." reverse>
        <Frame mockup={mockup} title="질문을 따라 이어 읽기">
          <div className="story-frame-body">
            <div className="story-reading-origin"><span className="story-mini-label">지금 읽은 이야기 · {mockup.identity.name}</span><strong>결제·정산 시스템을 왜 바꿨을까요?</strong></div>
            <ol className="story-connections">{story.connections.map((item, index) => <li key={item.company}>
              <span className="story-connection-dot" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <div><p className="story-mini-label">{item.company}</p><h3>{item.question}</h3><p className="story-connection-reason">{item.reason}</p></div>
            </li>)}</ol>
            <p className="story-source-note">궁금한 주제로 이어지는 읽을거리의 예시예요.</p>
          </div>
        </Frame>
      </Scene>
      <div className="about-inner story-enter" data-reveal=""><p>이제, 궁금했던 회사에 대입해 보세요.</p><a className="about-button is-primary" href="/companies">실제 회사 둘러보기</a></div>
    </div>
  );
}
