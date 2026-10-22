import { validQuestionJobs } from './question-inputs';
import { createHash } from 'node:crypto';
import type { Job } from './jobs';
import type { CompanyResearch, Evidence, ResearchFact, Issue } from './research';
import { bindAssessment, validateAssessment, type QuestionAssessment, type StoredAssessment } from './question-assessment';

export type KnowledgeRevision = {
  id: string; kind: 'revision'; recordedAt: string; replacedByDraftHash: string;
  facts: ResearchFact[]; guides: NonNullable<CompanyResearch['guides']>; evidence: Evidence[];
  questionAssessment?: StoredAssessment;
};
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const hash=/^[a-f0-9]{64}$/;
/** An update archives what was actually replaced. Unavailable answers leave previous records in place. */
export function attachQuestionKnowledge(before: CompanyResearch, after: CompanyResearch, contract: QuestionAssessment, draftHash: string, now: Date, jobs: Job[] = []) {
  const oldFacts=before.facts.filter(f=>before.pipeline?.factIds.includes(f.id) && JSON.stringify(f)!==JSON.stringify(after.facts.find(n=>n.id===f.id)));
  const boundGuideIds=new Set(before.questionAssessment?.contract.questions.flatMap(q=>q.facets.flatMap(f=>typeof f.guideId==='string'?[f.guideId]:[]))??[]);
  const oldGuides=(before.guides??[]).filter(g=>(before.pipeline?.guideIds.includes(g.id)||boundGuideIds.has(g.id)) && JSON.stringify(g)!==JSON.stringify(after.guides?.find(n=>n.id===g.id)));
  const assessmentChanged = before.questionAssessment && JSON.stringify(before.questionAssessment.contract) !== JSON.stringify(contract);
  if(oldFacts.length||oldGuides.length||assessmentChanged) {
    const refs=new Set([...oldFacts,...oldGuides].flatMap(r=>[...r.evidenceIds,...('sections' in r?r.sections?.flatMap(s=>s.evidenceIds)??[]:[])]));
    // Previous assessments may refer to unchanged records: archive their original bound context as well.
    // Explicit guides can depend on non-pipeline facts or copy their normalized prose. Preserve
    // the bounded company fact context so currentKnowledge applies identical corrections in history.
    // Omitted-field assessments keep the original pipeline-only revision bytes.
    const facts=before.questionAssessment ? (boundGuideIds.size ? before.facts : before.facts.filter(f=>before.pipeline?.factIds.includes(f.id))) : oldFacts;
    const guides=before.questionAssessment ? (before.guides??[]).filter(g=>(before.pipeline?.guideIds.includes(g.id)||boundGuideIds.has(g.id))) : oldGuides;
    for(const r of [...facts,...guides])for(const id of r.evidenceIds)refs.add(id);
    // Only new explicit guide bindings add unchanged section references: legacy revision bytes stay stable.
    for(const g of guides)if(boundGuideIds.has(g.id))for(const section of g.sections??[])for(const id of section.evidenceIds)refs.add(id);
    for(const q of before.questionAssessment?.contract.questions??[])for(const f of q.facets)for(const id of f.evidenceIds)refs.add(id);
    const revision={kind:'revision' as const,recordedAt:now.toISOString(),replacedByDraftHash:draftHash,facts:structuredClone(facts),guides:structuredClone(guides),evidence:structuredClone(before.evidence.filter(e=>refs.has(e.id))),...(before.questionAssessment?{questionAssessment:structuredClone(before.questionAssessment)}:{})};
    const id=digest(revision),history=after.knowledgeRevisions??=[];
    if(!history.some(r=>r.id===id)) {
      if(history.length>=200)throw new Error('KNOWLEDGE_HISTORY_CAPACITY: 200 revisions reached; preserve history and increase storage capacity before retrying. No records were deleted.');
      history.push({id,...revision});
    }
  }
  after.questionAssessment=bindAssessment(contract,after,draftHash,now.toISOString(),jobs);
}
/** Optional extension validator. Prior packs and old replay bytes remain unchanged. */
export function validateQuestionKnowledge(company: CompanyResearch): Issue[] {
  const issues:Issue[]=[];
  const issue=(path:string)=>issues.push({path,message:'질문 계약·해시·지식 이력의 참조를 확인하세요.'});
  const stored=(value:StoredAssessment,c:CompanyResearch,path:string)=>{
    try {
      if(!value||!hash.test(value.draftHash)||!Number.isFinite(Date.parse(value.recordedAt))||!value.bindings||typeof value.bindings!=='object')throw new Error();
      if(!validQuestionJobs(value.jobs) || !hash.test(value.jobsHash ?? '') || value.boundJobsHash !== digest(value.jobs))throw new Error();
      validateAssessment(value.contract,c,undefined,false);
      const ids=value.contract.questions.flatMap(q=>q.facets.map(f=>f.facetId));
      if(Object.keys(value.bindings).length!==ids.length||ids.some(id=>!hash.test(value.bindings[id])))throw new Error();
    } catch {issue(path);}
  };
  if(company.questionAssessment!==undefined)stored(company.questionAssessment,company,'questionAssessment');
  if(company.knowledgeRevisions!==undefined) {
    if(!Array.isArray(company.knowledgeRevisions)||company.knowledgeRevisions.length>200){issue('knowledgeRevisions');return issues;}
    const ids=new Set<string>();
    for(const [i,r] of company.knowledgeRevisions.entries()) {
      const path=`knowledgeRevisions[${i}]`;
      try {
        const {id,...body}=r;
        if(r.kind!=='revision'||!hash.test(id)||ids.has(id)||digest(body)!==id||!hash.test(r.replacedByDraftHash)||!Number.isFinite(Date.parse(r.recordedAt))||![r.facts,r.guides,r.evidence].every(Array.isArray))throw new Error();
        ids.add(id);
        const refs=new Set(r.evidence.map(e=>e.id));
        if([...r.facts,...r.guides].some(x=>!x.id||!Array.isArray(x.evidenceIds)||x.evidenceIds.some(id=>!refs.has(id))))throw new Error();
        if(r.questionAssessment)stored(r.questionAssessment,{...company,facts:r.facts,guides:r.guides,evidence:r.evidence},path+'.questionAssessment');
      } catch {issue(path);}
    }
  }
  return issues;
}
