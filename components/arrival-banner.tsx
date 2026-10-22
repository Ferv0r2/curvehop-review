import { dayLabel } from "@/lib/new-arrivals";
import { CompanyMark } from "@/components/company-mark";
import { newCompaniesHref, newJobsHref } from "@/components/new-arrivals";

type ArrivalDay = { day: string; today: boolean; count: number };

export type ArrivalBannerData = {
  companies?: ArrivalDay & {
    logos?: { companyId: string; name: string; color: string }[];
  };
  jobs?: ArrivalDay;
};

/** Each kind has its own reference day; links keep the displayed count's scope. */
export function ArrivalBanner({ data }: { data: ArrivalBannerData | null }) {
  const companies = data?.companies && data.companies.count > 0 ? data.companies : null;
  const jobs = data?.jobs && data.jobs.count > 0 ? data.jobs : null;
  if (!companies && !jobs) return null;

  return (
    <section className="arrival-banner" aria-label="새로 만나는 회사와 공고">
      {companies && (
        <a className="arrival-banner-tile arrival-banner-companies" href={newCompaniesHref(companies.day)}>
          <div className="arrival-banner-meta">
            <time dateTime={companies.day}>{companies.today ? "오늘" : dayLabel(companies.day)}</time>
            <span>새로 만나는 회사</span>
          </div>
          <h2 className="arrival-banner-title">
            <strong>{companies.count.toLocaleString("ko-KR")}</strong><span>곳의 새로운 발견</span>
          </h2>
          <p className="arrival-banner-description">새롭게 만난 회사의 사업과 팀을 알아봐요.</p>
          <div className="arrival-banner-footer">
            <span className="arrival-banner-action">회사 둘러보기</span>
            {!!companies.logos?.length && (
              <span className="arrival-banner-marks" aria-hidden="true">
                {companies.logos.slice(0, 3).map((company) => (
                  <CompanyMark key={company.companyId} {...company} className="arrival-banner-mark" />
                ))}
              </span>
            )}
          </div>
        </a>
      )}
      {jobs && (
        <a className="arrival-banner-tile arrival-banner-jobs" href={newJobsHref(jobs.day)}>
          <div className="arrival-banner-meta">
            <time dateTime={jobs.day}>{jobs.today ? "오늘" : dayLabel(jobs.day)}</time>
            <span>새로 확인한 공고</span>
          </div>
          <h2 className="arrival-banner-title">
            <strong>{jobs.count.toLocaleString("ko-KR")}</strong><span>건의 채용 공고</span>
          </h2>
          <p className="arrival-banner-description">Curvehop에서 처음 확인한 공고예요. 실제 게시일과 다를 수 있어요.</p>
          <div className="arrival-banner-footer">
            <span className="arrival-banner-action">공고 살펴보기</span>
          </div>
        </a>
      )}
    </section>
  );
}
