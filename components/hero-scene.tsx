import type { CSSProperties } from "react";
import { absoluteDate } from "@/lib/relative-date";
import type { AboutMockup } from "@/lib/about-mockup";

/**
 * The /about hero visual (DESIGN.md 제품 소개 랜딩 예외): a posting card under a
 * glass lens, and inside the lens the company layer the posting does not show —
 * the company's pension count, its monthly bars and source chips. The company
 * uses the operator name with demonstration data from lib/about-mockup.ts, labelled on the card and
 * in the accessible text. The service's real counts stay out of the drawing
 * (they live in the numbers band), so the example never mixes with real data
 * (design-review FINDING-003). The glass objects are image assets
 * (public/about), the text is HTML.
 *
 * The drawing is hidden from assistive technology (no links or focus stops);
 * one sentence outside it says what it shows and that it is an example.
 */
export function HeroScene({ mockup }: { mockup: AboutMockup }) {
  const { identity, timeline } = mockup;
  const job = mockup.jobs[0];
  const bars = timeline.months.slice(-12);
  const latest = bars.findLast((month) => month.value !== null);
  const first = bars.find((month) => month.value !== null);
  const max = Math.max(1, ...bars.map((month) => month.value ?? 0));
  const summary = latest && first
    ? `시연용 예시 데이터: ${identity.name} 이름을 사용한 가상 공고와 수치예요. 실제 회사 정보가 아니에요. 예시 공고 ‘${job.title}’ 위에 같은 회사의 국민연금 가입자 추이(${absoluteDate(first.month)} ${first.value!.toLocaleString("ko-KR")}명 → ${absoluteDate(latest.month)} ${latest.value!.toLocaleString("ko-KR")}명)를 렌즈로 보여줘요.`
    : `시연용 예시 데이터: ${identity.name} 이름을 사용한 가상 공고와 수치예요. 실제 회사 정보가 아니에요. 예시 공고 위에 렌즈를 얹은 그림이에요.`;
  return (
    <>
    <p className="visually-hidden">{summary}</p>
    <div className="hero-scene" aria-hidden="true">
      <div className="hero-posting">
        <div className="hero-posting-card">
          <p className="hero-posting-tags"><span className="hero-posting-tag">채용 공고</span><span className="about-example-tag">시연용 예시 데이터</span></p>
          <p className="hero-posting-company">{identity.name}</p>
          <p className="hero-posting-title">{job.title}</p>
          <p className="hero-posting-meta">{[job.experience, job.role, job.place].join(" · ")}</p>
          <span className="hero-posting-lines"><i /><i /><i /><i /></span>
        </div>
      </div>
      <div className="hero-lens">
        <div className="hero-lens-view">
          <div className="hero-lens-content">
            <img className="hero-lens-building" src="/about/building.webp" width={512} height={512} alt="" decoding="async" />
            {latest && (
              <>
                <div className="hero-lens-text">
                  <p className="hero-lens-name">{identity.name}</p>
                  <p className="hero-lens-label">국민연금 가입자</p>
                  <p className="hero-lens-value">{latest.value!.toLocaleString("ko-KR")}명</p>
                </div>
                <span className="hero-lens-bars">
                  {bars.map((month) => (
                    <i key={month.month} className={month === latest ? "is-last" : undefined}
                      style={{ "--ratio": (month.value ?? 0) / max } as CSSProperties} />
                  ))}
                </span>
                <span className="hero-lens-chips">
                  {mockup.dart && <span>DART 공시</span>}
                  <span>출처 {mockup.sources.toLocaleString("ko-KR")}</span>
                </span>
              </>
            )}
          </div>
        </div>
        <img className="hero-lens-glass" src="/about/lens.webp" width={960} height={960} alt="" decoding="async" fetchPriority="high" />
      </div>
    </div>
    </>
  );
}
