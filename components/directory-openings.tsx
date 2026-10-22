import Link from "@/components/navigation-link";
import { RelDate } from "@/components/rel-date";
import { lastHiringCheck } from "@/components/research-view";
import { roleCounts } from "@/lib/company-stats";
import type { Hiring } from "@/lib/research";

/** The directory previews current own-company openings; retained records stay on the detail page. */
export function DirectoryOpenings({ hiring, name, from, otherCompanies = [] }: {
  hiring: Hiring;
  name: string;
  from: string;
  otherCompanies?: { company: string; confirmed: boolean }[];
}) {
  const current = hiring.status === "ok";
  const roles = current ? roleCounts(hiring.jobs) : [];
  const last = lastHiringCheck(hiring);
  const confirmed = otherCompanies.filter(group => group.confirmed).map(group => group.company);
  const empty = otherCompanies.length
    ? confirmed.length === otherCompanies.length
      ? `${confirmed.slice(0, 2).join("·")}${confirmed.length > 2 ? " 등" : ""} 공고는 회사별로 따로 볼 수 있어요.`
      : "채용 회사 확인이 필요한 공고가 있어요."
    : "이 목록에 표시할 서울·판교 공고가 없어요.";
  const label = current
    ? hiring.currentCount! > 0 ? `서울·판교 공고 ${hiring.currentCount}건` : empty
    : hiring.status === "unconnected" ? "회사 이야기부터 살펴보세요."
      : "현재 모집 여부를 확인하지 못했어요.";
  return <div className="directory-openings">
    <p className={`directory-hiring-label${current && hiring.currentCount! > 0 ? " has-openings" : ""}`}>{label}</p>
    {!current && hiring.jobs.length > 0 && <p className="directory-hiring-note">
      이전에 확인한 공고 {hiring.jobs.length}건{last && <> · 마지막 확인 <RelDate value={last} /></>}
    </p>}
    {roles.length > 0 && <p className="directory-roles">
      {roles.slice(0, 3).map(role => `${role.label} ${role.count}건`).join(" · ")}
      {roles.length > 3 && ` · 외 ${roles.length - 3}개 직군`}
    </p>}
    {current && hiring.jobs.length > 0 && <ul className="directory-job-preview" aria-label={`${name} 공고 일부`}>
      {hiring.jobs.slice(0, 2).map(job => <li key={job.id}>
        <Link href={`/jobs/${job.id}?${new URLSearchParams({ from })}`}>{job.title}</Link>
      </li>)}
    </ul>}
  </div>;
}
