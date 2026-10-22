import Link from "@/components/navigation-link";
import { readingItems } from "@/lib/reading";
import { projectJob, queryJobs, roleLabels, type Role } from "@/lib/jobs";
import type { Hiring, ResearchPack } from "@/lib/research";
import type { Preferences } from "@/lib/preferences";
import { ExperienceContext } from "./experience-context";
import { DatedLimitation } from "./reading-view";
import { dotDates } from "@/lib/relative-date";
import { requiredFloor } from "@/lib/experience-brief";
import type { Job } from "@/lib/jobs";

/**
 * Postings by the least experience they ask for: the highest lower bound
 * among required conditions, or the board's stated experience when no
 * required condition has one. Preferred conditions are not counted.
 */
function tenureBands(jobs: Job[]): [string, number][] {
  const bands: [string, (n: number) => boolean][] = [
    ["신입·1년", (n) => n <= 1],
    ["2~3년", (n) => n >= 2 && n <= 3],
    ["4~6년", (n) => n >= 4 && n <= 6],
    ["7~9년", (n) => n >= 7 && n <= 9],
    ["10년 이상", (n) => n >= 10],
  ];
  const counts = new Map<string, number>();
  for (const job of jobs) {
    const { floor, upperOnly, equivalent, degreeAlternative } = requiredFloor(job.insights!);
    const label = floor !== null ? bands.find(([, fits]) => fits(floor))![0] : degreeAlternative ? "학위 또는 경력" : equivalent ? "연차 또는 동등 실력" : upperOnly ? "상한만 적힘" : "경력 기간 미확인";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...bands.map(([label]) => label), "학위 또는 경력", "연차 또는 동등 실력", "상한만 적힘", "경력 기간 미확인"].filter((label) => counts.has(label)).map((label) => [label, counts.get(label)!]);
}

export function TalentSummary({ pack, companyId, hiring, preferences, role }: {
  pack?: ResearchPack; companyId: string; hiring: Hiring; preferences: Preferences; role: string;
}) {
  const culture = pack ? readingItems(pack).find(r => r.companyId === companyId && r.topic === "culture") : undefined;
  if (!culture) return <section className="talent-summary" id="talent-summary" aria-labelledby="talent-heading">
    <div className="talent-heading"><h2 id="talent-heading">공고에서 보는 모집 조건</h2></div>
    <ExperienceDistribution hiring={hiring} preferences={preferences} role={role} />
    {queryJobs(hiring.jobs, { role }).total === 0 && <p className="research-caption">저장된 공고에서 해당 직무의 경력 조건을 찾지 못했어요. 현재 미채용을 뜻하지 않아요.</p>}
  </section>;
  return <section className="talent-summary" id="talent-summary" aria-labelledby="talent-heading">
    <div className="talent-heading"><p className="reading-kicker">인재상과 팀</p><h2 id="talent-heading">그래서, 어떤 사람을 원하나요?</h2></div>
    <div className="talent-direction" id={`guide-${culture.id}`}>
      <p>{dotDates(culture.answer)}</p>
      <DatedLimitation reading={culture} className="research-caption" />
      <Link href={`/read/${culture.id}?${new URLSearchParams({ from: `/companies/${companyId}?role=${role}#talent-summary` })}`}>인재상과 팀 이야기 읽기</Link>
    </div>
  </section>;
}

export function ExperienceDistribution({ hiring, preferences, role }: {
  hiring: Hiring; preferences: Preferences; role: string;
}) {
  const selected = queryJobs(hiring.jobs, { role });
  if (!selected.total) return null;
  return <section className="talent-requirements" aria-labelledby="experience-distribution-heading">
    <h3 id="experience-distribution-heading">공고의 최소 요구 경력</h3>
    <ExperienceContext preferences={preferences} />
    <p className="research-caption">{role ? `${roleLabels[role as keyof typeof roleLabels]} ` : ""}공고 {selected.total}개 기준 · 우대 조건 제외{hiring.status !== "ok" ? " · 현재 모집 여부 미확인" : ""}</p>
    <ul className="experience-distribution" aria-label="공고 수 기준 최소 요구 경력 분포">
      {tenureBands(hiring.jobs.map(projectJob).filter((j) => !role || j.insights!.roles.includes(role as Role))).map(([label, count]) => {
        const unspecified = ["학위 또는 경력", "연차 또는 동등 실력", "상한만 적힘", "경력 기간 미확인"].includes(label);
        return <li key={label} className={unspecified ? "experience-unspecified" : undefined}>
          <span className="experience-band-label">{label}</span>
          <span className="experience-bar-track" aria-hidden="true"><span className="experience-bar-fill" style={{ width: `${count / selected.total * 100}%` }} /></span>
          <strong>{count}<span>개</span></strong>
        </li>;
      })}
    </ul>
  </section>;
}
