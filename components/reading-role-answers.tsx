import { roleLabels } from "@/lib/jobs";
import type { Reading } from "@/lib/reading";
import type { ScopedAnswerGroup } from "@/lib/question-presentation";
import { dotDates } from "@/lib/relative-date";
import { publicResearchCaveat } from "@/lib/research-public-copy";
import { RelDate } from "./rel-date";

export function ReadingRoleAnswers({ groups, reading }: { groups: ScopedAnswerGroup[]; reading: Reading }) {
  const sources = new Map(reading.evidence.map(e => [e.id, e]));
  const visible = groups.map(group => ({ ...group, answers: group.answers.filter(a =>
    typeof a.facet.publicCaveat === "string" && a.facet.evidenceIds.length && a.facet.evidenceIds.every(id => sources.has(id)),
  ) })).filter(group => group.answers.length);
  if (!visible.length) return null;
  return <section className="reading-role-answers" aria-label="직무별로 살펴보기">
    <h2>직무별로 살펴보기</h2>
    {visible.map(group => {
      const s = group.scope;
      const role = s.role && Object.hasOwn(roleLabels, s.role) ? roleLabels[s.role as keyof typeof roleLabels] : s.role;
      // These are the reviewed posting snapshot's titles, not a claim of current recruitment.
      const posting = reading.company.questionAssessment?.jobs?.find(job => job.id === s.jobId);
      const entity = s.entity === reading.companyId ? reading.companyName : s.entity && !/^(?:le-|org-|workplace-)/.test(s.entity) ? s.entity : null;
      const geography = ({ seoul: "서울", pangyo: "판교", global: "글로벌", remote: "원격", domestic: "국내" } as Record<string, string>)[s.geography ?? ""] ?? s.geography;
      const scopeLabel = [entity, geography, posting ? role : null].filter(Boolean).join(" · ");
      return <div className="reading-role-group" key={group.key}>
        <h3>{posting?.title ?? role ?? "직무를 특정하지 않은 내용"}</h3>
        <p className="reading-role-scope">{scopeLabel}
          {s.referenceOn && <>{scopeLabel && " · "}자료 기준 <RelDate value={s.referenceOn} /></>}
        </p>
        <dl>{group.answers.map(({ label, facet }) => <div key={facet.facetId}>
          <dt>{label}</dt>
          <dd><p>{dotDates(facet.claim)}</p>
            {facet.publicCaveat && <p className="reading-role-scope">{dotDates(publicResearchCaveat(facet.publicCaveat))}</p>}
            <p className="reading-role-sources">{facet.evidenceIds.map(id => <a key={id} href={`#reading-source-${id}`} aria-label={`${sources.get(id)!.title} 자료로 이동`}>{sources.get(id)!.publisher}</a>)}</p>
          </dd>
        </div>)}</dl>
      </div>;
    })}
  </section>;
}
