import { questionNextReadings, readingKnowledgeReady } from "./reading-journey";
import { companyListing } from "./company-listing";
import type { InputState, QuestionRun } from "./question-inputs";
import type { Job } from './jobs';
import { companyJobs } from './companies';
import { readingItems } from './reading';
import type { ResearchPack } from './research';
import { researchQuestions } from './research-questions';
import { assessmentForCompany, facetGuideId, contractHash, questionStatus, validateJobFacet, type FacetAssessment } from './question-assessment';
import { currentKnowledge, resolveCurrentKnowledge } from './current-knowledge';
import type { WikiRelationsRead } from './relations-store';

export type QuestionViewOptions = {jobs?:Job[];jobInput?:InputState<Job>;runs?:InputState<QuestionRun>;relations?:WikiRelationsRead};
/**
 * The postings a question block links: only current postings one of the question's facets bound as its
 * evidence (scope.jobId) while that binding still holds; a voided facet is not_assessed. A question with
 * none links no posting: the company's whole job list stays in its page's '서울·판교 채용 공고' section.
 */
export function questionBoundJobs<T extends {id:string}>(question:{facets:Pick<FacetAssessment,'status'|'scope'>[]},jobs:readonly T[]):T[] {
  const bound=new Set(question.facets.flatMap(f=>f.scope.jobId&&f.status!=='not_assessed'?[f.scope.jobId]:[]));
  return jobs.filter(job=>bound.has(job.id));
}
/** Query projection: records are candidates until exact bound facet review supplies an assessment. */
export function questionView(raw:ResearchPack,companyId:string,options:QuestionViewOptions={}) {
  const resolved=options.relations?resolveCurrentKnowledge(raw,options.relations):null;
  const pack=resolved?.pack??raw,company=pack.companies.find(c=>c.id===companyId);
  if(!company)throw new Error('UNKNOWN_COMPANY: '+companyId);
  const assessment=assessmentForCompany(company),articles=readingItems(pack).filter(r=>r.companyId===companyId);
  const jobInput=options.jobInput ?? (options.jobs ? {status:"ok" as const,items:options.jobs} : {status:"not_provided" as const,items:[]});
  const runInput=options.runs ?? {status:"not_provided" as const,items:[]};
  const jobs=companyJobs(jobInput.items,companyId);
  const journeyOptions={knowledgeReady:readingKnowledgeReady(raw,options.relations),allowedCompanyIds:companyListing(pack).eligibleIds};
  const pending=new Set(resolved?.pendingGuideIds??[]);
  const questions=researchQuestions.map(q=>{
    const facets=assessment.questions.find(a=>a.questionId===q.id)!.facets;
    for(const f of facets) {
      if(pending.has(facetGuideId(companyId,f)??'')) {f.status='not_assessed';f.claim='';f.limitation='관련 자료가 정정되어 설명을 다시 확인해야 해요.';}
      if(f.scope.jobId && ['partial','sufficient'].includes(f.status)) {
        try { validateJobFacet(f, company, company.questionAssessment?.jobs ?? []); }
        catch { f.status='not_assessed';f.claim='';f.limitation='공고에 명시된 법인·직무·근무 조건을 같은 자료로 확인하지 못했어요.'; }
      }
    }
    const readingIds=articles.filter(r=>q.readingTopics.includes(r.topic)||q.pipelineTopics.some(t=>r.id===`${companyId}-pipeline-${t}`)).map(r=>r.id);
    readingIds.push(...facets.flatMap(f=>['partial','sufficient'].includes(f.status)&&articles.some(r=>r.id===facetGuideId(companyId,f))?[facetGuideId(companyId,f)!]:[]));
    const alternatives=q.id==='company.alternatives'?articles.flatMap(r=>questionNextReadings(pack,r.id,journeyOptions).filter(n=>n.edge.proposal.relation==="comparison"&&n.reading.companyId!==companyId).map(n=>({from:r.id,to:n.reading.id,companyId:n.reading.companyId}))):[];
    if(q.id==='company.alternatives')readingIds.push(...alternatives.map(a=>a.from));
    // Candidate material (inventory, evaluation): every current posting may inform these questions. Not what the
    // question block links: that is questionBoundJobs.
    const jobIds=['role.work','employment.conditions','hiring.process','company.direction'].includes(q.id)?jobs.map(j=>j.id):[];
    const factIds=company.facts.filter(f=>q.pipelineTopics.some(t=>f.id===`${companyId}-pipeline-${t}-fact`)||q.id==='company.identity'&&['founded','domain','legal-name'].some(s=>f.id===`${companyId}-${s}`)||['company.history','company.changes'].includes(q.id)&&['milestone','funding'].includes(f.kind)).map(f=>f.id);
    return {questionId:q.id,question:q.question,status:questionStatus(facets),facets,readingIds:[...new Set(readingIds)],jobIds,factIds,relationIds:options.relations?.status==='ok'?(resolved?.corrections.get(companyId) as {rows?:{id:string}[]}|undefined)?.rows?.map(r=>r.id)??[]:[],alternatives};
  });
  const history=(company.knowledgeRevisions??[]).map(revision=>{
    const archived={...company,facts:revision.facts,guides:revision.guides,evidence:revision.evidence};
    const current=currentKnowledge({version:1,companies:[archived]},resolved?.corrections??new Map());
    const visible=current.pack.companies[0];
    return {...revision,invalidatedFactIds:revision.facts.filter(f=>!visible.facts.some(x=>x.id===f.id)).map(f=>f.id),invalidatedGuideIds:current.suppressedGuideIds};
  });
  return {companyId,contractHash:contractHash(),questions,history,inputs:{jobs:{status:jobInput.status,count:jobs.length},runs:{status:runInput.status},relations:{status:options.relations?.status ?? "not_provided"}},runs:runInput.items.filter(r=>r.companyId===companyId),provenance:company.questionAssessment?{draftHash:company.questionAssessment.draftHash,recordedAt:company.questionAssessment.recordedAt}:null};
}
