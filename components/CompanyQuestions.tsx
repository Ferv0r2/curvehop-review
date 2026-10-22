import Link from "@/components/navigation-link";
import type { Job } from "@/lib/jobs";
import { roleLabels } from "@/lib/jobs";
import { companies } from "@/lib/companies";
import type { ResearchPack } from "@/lib/research";
import { type questionView } from "@/lib/question-view";
import { questionPresentation } from "@/lib/question-presentation";
import { Citations } from "@/components/research-view";
import { RestorableDetails } from "@/components/restorable-details";
import { RelDate } from "@/components/rel-date";
import { dotDates } from "@/lib/relative-date";
import { publicResearchCaveat } from "@/lib/research-public-copy";
import styles from "./CompanyQuestions.module.css";

type Props = { view: ReturnType<typeof questionView>; pack: ResearchPack; jobs: Job[] };
const anchor = (id: string) => `question-${id.replaceAll(".", "-")}`;

/** A shared question index, with material links kept distinct from reviewed answers. */
export function CompanyQuestions({ view, pack, jobs }: Props) {
  const company = pack.companies.find(c => c.id === view.companyId)!;
  const identity = companies.find(c => c.id === view.companyId)!;
  const scopeLabel = (entity: string | null) => entity === company.id ? identity.legalName ?? identity.name : entity && /^(?:le-|org-|workplace-)/.test(entity) ? null : entity;
  const roleLabel = (role: string | null) => role && Object.hasOwn(roleLabels, role) ? roleLabels[role as keyof typeof roleLabels] : role;
  const presentation = questionPresentation(view, pack, jobs);
  if (!presentation.hasContent) return null;
  return <section className={styles.section} id="company-questions" aria-labelledby="company-questions-heading">
    <RestorableDetails className={styles.overview}>
      <summary><h2 id="company-questions-heading">회사 알아보기</h2></summary>
    {presentation.questions.map(({ question: q, claims, readings: linkedReadings, jobs: linkedJobs }) => {
      return <RestorableDetails className={styles.question} key={q.questionId} id={anchor(q.questionId)} open={claims.length > 0}>
        <summary>{q.question}</summary>
        <div className={styles.body}>
          {claims.map(f => <div key={f.facetId}>
            <p>{dotDates(f.claim!)}</p>
            {(f.publicCaveat ?? f.limitation) && <p className={styles.note}>{dotDates(publicResearchCaveat(f.publicCaveat ?? f.limitation))}</p>}
            <p className={styles.meta}>{[scopeLabel(f.scope.entity), (({seoul:"서울",pangyo:"판교",global:"글로벌",remote:"원격",domestic:"국내"} as Record<string,string>)[f.scope.geography ?? ""] ?? f.scope.geography), roleLabel(f.scope.role)].filter(Boolean).join(" · ")}
              {f.scope.referenceOn && <> · 기준 <RelDate value={f.scope.referenceOn} /></>}
            </p>
            <Citations company={company} ids={f.evidenceIds} />
          </div>)}
          {linkedReadings.length > 0 && <ul className={styles.links}>{linkedReadings.map(r => <li key={r.id}><Link href={`/read/${r.id}?${new URLSearchParams({ from: `/companies/${view.companyId}#${anchor(q.questionId)}` })}`}>{r.question}</Link></li>)}</ul>}
          {linkedJobs.length > 0 && <>
            <p className={styles.meta}>공고마다 업무와 조건이 달라요.</p>
            <ul className={styles.links}>{linkedJobs.map(job => <li key={job.id}><Link href={`/jobs/${job.id}?${new URLSearchParams({ from: `/companies/${view.companyId}#${anchor(q.questionId)}` })}`}>{job.title} · {job.locationLabel}</Link></li>)}</ul>
          </>}
        </div>
      </RestorableDetails>;
    })}
    {presentation.history.length > 0 && <RestorableDetails className={styles.question}>
      <summary>이전 기록 보기</summary>
      <div className={styles.body}>
        <p className={styles.note}>이후 설명으로 갱신된 자료예요. 현재 상황을 뜻하지 않으며, 원문과 당시 범위를 함께 살펴보세요.</p>
        {presentation.history.slice().reverse().map(revision => <div key={revision.id} className={styles.history}>
          <p className={styles.meta}>갱신 전 기록 · <RelDate value={revision.recordedAt} /></p>
          {(revision.invalidatedFactIds.length > 0 || revision.invalidatedGuideIds.length > 0) && <p className={styles.note}>정정된 설명이 포함되어 있어요. 철회된 내용은 현재 설명이나 과거 사실로 표시하지 않아요.</p>}
          {revision.facts.filter(f => !revision.invalidatedFactIds.includes(f.id) && !revision.guides.some(g => `${g.id}-fact` === f.id)).map(f => <div key={f.id}>
            <p>{dotDates(f.text)}</p>
            {f.referenceOn && <p className={styles.meta}>당시 기준 <RelDate value={f.referenceOn} /></p>}
            <ul className={styles.links}>{f.evidenceIds.flatMap(id => {
              const source = revision.evidence.find(e => e.id === id);
              return source ? [<li key={id}><a href={source.url}>{source.publisher}</a> · {source.publishedOn ? <RelDate value={source.publishedOn} /> : "게시일 미확인"}</li>] : [];
            })}</ul>
          </div>)}
          {revision.guides.filter(g => !revision.invalidatedGuideIds.includes(g.id)).map(g => <div key={g.id}><h3>{g.question}</h3><p>{dotDates(g.answer)}</p><p className={styles.note}>{dotDates(publicResearchCaveat(g.limitation))}</p>
            <ul className={styles.links}>{g.evidenceIds.flatMap(id => {
              const source = revision.evidence.find(e => e.id === id);
              return source ? [<li key={id}><a href={source.url}>{source.publisher}</a> · {source.publishedOn ? <RelDate value={source.publishedOn} /> : "게시일 미확인"}</li>] : [];
            })}</ul>
          </div>)}
        </div>)}
      </div>
    </RestorableDetails>}
    </RestorableDetails>
  </section>;
}
