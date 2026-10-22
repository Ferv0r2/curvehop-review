import type { Job } from './jobs';
import type { ResearchPack } from './research';
import { readingItems } from './reading';
import { questionBoundJobs, type questionView } from './question-view';
import { facetGuideId, type FacetAssessment } from './question-assessment';

type View = ReturnType<typeof questionView>;

const hasAnswer = (f: View['questions'][number]['facets'][number]) =>
  f.claim.trim() && (f.status === 'partial' || f.status === 'sufficient');

const roleQuestionLabels: Record<string, string> = {
  'role.work': '업무와 요구 경험',
  'employment.conditions': '보상과 근무 조건',
  'hiring.process': '전형과 준비할 것',
};
export type ScopedAnswerGroup = { key: string; scope: FacetAssessment['scope']; answers: { label: string; facet: FacetAssessment }[] };

/** Display exact reviewed claims, never infer roles by splitting article prose. */
export function readingScopedAnswers(view: View, readingId: string): ScopedAnswerGroup[] {
  const groups = new Map<string, ScopedAnswerGroup>();
  for (const question of view.questions) {
    const label = roleQuestionLabels[question.questionId];
    if (!label) continue;
    for (const facet of question.facets) {
      if (!hasAnswer(facet) || typeof facet.publicCaveat !== "string" || facetGuideId(view.companyId, facet) !== readingId) continue;
      const s = facet.scope;
      const key = JSON.stringify([s.entity, s.geography, s.role, s.jobId, s.referenceOn]);
      const group = groups.get(key) ?? { key, scope: s, answers: [] };
      group.answers.push({ label, facet });
      groups.set(key, group);
    }
  }
  return [...groups.values()];
}

/** Structural coverage, not a new quality score or permission to publish. */
export function questionAnswerCoverage(view: View) {
  return {
    answeredQuestionIds: view.questions.filter(q => q.facets.some(hasAnswer)).map(q => q.questionId),
    materialOnlyQuestionIds: view.questions.filter(q => !q.facets.some(hasAnswer) && q.readingIds.length).map(q => q.questionId),
  };
}

/** Public material only; assessment inventory and operational reasons stay in questionView. */
export function questionPresentation(view: View, pack: ResearchPack, jobs: Job[]) {
  const readings = new Map(readingItems(pack).filter(r => r.companyId === view.companyId).map(r => [r.id, r]));
  const questions = view.questions.flatMap(question => {
    const claims = question.facets.filter(hasAnswer);
    // Topic membership is a research candidate, never proof that a story answers this question.
    // Unassessed stories remain in the page's existing reading cards, once under their own title.
    if (!claims.length) return [];
    const ids = new Set(claims.flatMap(f => {
      const id = facetGuideId(view.companyId, f);
      return id ? [id] : [];
    }));
    return [{ question, claims,
      readings: [...ids].flatMap(id => readings.has(id) ? [readings.get(id)!] : []),
      jobs: questionBoundJobs({ facets: claims }, jobs),
    }];
  });
  const history = view.history.map(revision => ({
    ...revision,
    facts: revision.facts.filter(f => !revision.invalidatedFactIds.includes(f.id) && !revision.guides.some(g => `${g.id}-fact` === f.id)),
    guides: revision.guides.filter(g => !revision.invalidatedGuideIds.includes(g.id)),
  })).filter(revision => revision.facts.length || revision.guides.length);
  return { questions, history, hasContent: questions.length > 0 || history.length > 0 };
}
