import { withoutContentChange } from "./reading-changes";
import { POSTING_SCOPED_FACETS, sampledFacetProblem, type PostingSample } from "./research-posting-sample";
import { createHash } from 'node:crypto';
import { boardCompanyForJob, companies } from './companies';
import { validQuestionJobs } from './question-inputs';
import type { Job } from './jobs';
import type { CompanyResearch } from './research';
import { researchQuestions, questionContractVersion, answerStatuses, researchStatuses, evidenceOutcomes, type QuestionContract } from './research-questions';

export type FacetScope = { entity: string | null; geography: string | null; role: string | null; jobId: string | null; referenceOn: string | null };
export type FacetAssessment = {
  facetId: string; status: typeof answerStatuses[number]; researchStatus: typeof researchStatuses[number];
  evidenceOutcome: typeof evidenceOutcomes[number]; topic: string | null; claim: string; limitation: string;
  evidenceIds: string[]; scope: FacetScope;
  guideId?: string | null; publicCaveat?: string;
  pay?: { currency: 'KRW' | 'USD' | 'EUR'; period: 'year' | 'month' | 'hour'; min: number; max: number; component: 'base' | 'total' } | null;
};
export type QuestionAssessment = { version: 1; contractHash: string; questions: {questionId: string; facets: FacetAssessment[]}[] };
export type StoredAssessment = { contract: QuestionAssessment; draftHash: string; recordedAt: string; bindings: Record<string, string>; jobs?: Job[]; jobsHash?: string; boundJobsHash?: string };
type Answer = {topic: string; state: string; fact: string; analysis: string; evidenceIds: string[]};
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const contractHash = () => hash({version:questionContractVersion,questions:researchQuestions});
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).sort().join(',') === keys.sort().join(',');
const text = (v: unknown, limit = 500): v is string => typeof v === 'string' && v.length <= limit;
function fail(reason: string): never {throw new Error('QUESTION_CONTRACT: '+reason);}
export function emptyAssessment(): QuestionAssessment {
  return {version:1,contractHash:contractHash(),questions:researchQuestions.map(q=>({questionId:q.id,facets:q.facets.map(f=>({facetId:f.id,status:'not_assessed',researchStatus:'not_recorded',evidenceOutcome:'not_checked',topic:null,claim:'',limitation:'해당 질문의 답변 범위를 아직 검토하지 않았어요.',evidenceIds:[],scope:{entity:null,geography:null,role:null,jobId:null,referenceOn:null}}))}))};
}
/** Reject malformed or inconsistent claims. Conformance never supplies a semantic verdict. */
/**
 * `postingMismatches`, when given, collects the facet IDs whose posting scope fails validateJobFacet instead of
 * throwing; every other check still runs on those facets (demotePostingMismatches).
 */
export function validateAssessment(input: unknown, company: CompanyResearch, answers?: Answer[], checkRecords = true, jobs?: Job[], sample?: PostingSample, postingMismatches?: string[]): asserts input is QuestionAssessment {
  if (!record(input) || !exact(input,['version','contractHash','questions']) || input.version!==1 || input.contractHash!==contractHash() || !Array.isArray(input.questions) || input.questions.length!==researchQuestions.length) fail('version/hash/questions');
  const sources = new Map(company.evidence.map(e=>[e.id,e]));
  const seen = new Set<string>();
  for (const raw of input.questions as unknown[]) {
    if (!record(raw) || !exact(raw,['questionId','facets']) || typeof raw.questionId!=='string' || seen.has(raw.questionId)) fail('question ID');
    const q=researchQuestions.find(q=>q.id===raw.questionId);if(!q || !Array.isArray(raw.facets) || raw.facets.length!==q.facets.length) fail('question facets');
    seen.add(raw.questionId as string); const facets=new Set<string>();
    for(const f of raw.facets as unknown[]) {
      if(!record(f)||!exact(f,['facetId','status','researchStatus','evidenceOutcome','topic','claim','limitation','evidenceIds','scope',...(Object.hasOwn(f,'pay')?['pay']:[]),...(Object.hasOwn(f,'guideId')?['guideId']:[]),...(Object.hasOwn(f,'publicCaveat')?['publicCaveat']:[])]) || typeof f.facetId!=='string' || !q.facets.some(x=>x.id===f.facetId) || facets.has(f.facetId)) fail('facet ID');
      facets.add(f.facetId as string);
      // IDs are validated above. Never put rejected model values into diagnostics.
      const fieldFailure: (field: string, expected: string) => never = (field, expected) => fail(`question=${q.id} facet=${f.facetId} field=${field} expected=${expected}`);
      if(!(answerStatuses as readonly unknown[]).includes(f.status)) fieldFailure('status',`one of ${answerStatuses.join(', ')}`);
      if(!(researchStatuses as readonly unknown[]).includes(f.researchStatus)) fieldFailure('researchStatus',`one of ${researchStatuses.join(', ')}`);
      if(!(evidenceOutcomes as readonly unknown[]).includes(f.evidenceOutcome)) fieldFailure('evidenceOutcome',`one of ${evidenceOutcomes.join(', ')}`);
      if(!text(f.claim)) fieldFailure('claim','string with length <= 500 UTF-16 code units');
      if(!text(f.limitation)||!f.limitation.trim()) fieldFailure('limitation','nonblank string with length <= 500 UTF-16 code units');
      if(!(f.topic===null || typeof f.topic==='string' && q.pipelineTopics.includes(f.topic))) fieldFailure('topic',`null or one of ${q.pipelineTopics.join(', ')}`);
      if(!Array.isArray(f.evidenceIds)||f.evidenceIds.length>12||new Set(f.evidenceIds).size!==f.evidenceIds.length||!f.evidenceIds.every(id=>typeof id==='string'&&sources.has(id))) fail('evidence reference');
      if(!record(f.scope)||!exact(f.scope,['entity','geography','role','jobId','referenceOn'])||!Object.values(f.scope).every(v=>v===null||text(v,160)&&!!v.trim())) fail('scope');
      const date=f.scope.referenceOn;
      if(date!==null && (typeof date!=='string'||!/^\d{4}-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(Date.parse(date)).toISOString().slice(0,date.length)!==date)) fail('reference date');
      const answered=f.status==='sufficient'||f.status==='partial';
      if(Object.hasOwn(f,'guideId') && !(f.guideId===null || text(f.guideId,160)&&f.guideId.trim())) fieldFailure('guideId','null or nonblank string with length <= 160 UTF-16 code units');
      if(Object.hasOwn(f,'publicCaveat') && (!text(f.publicCaveat) || f.publicCaveat!==''&&!f.publicCaveat.trim())) fieldFailure('publicCaveat','string with length <= 500 UTF-16 code units; empty when the claim already carries its material qualifications');
      if(answered && Object.hasOwn(f,'guideId') && checkRecords) {
        const guide=company.guides?.find(g=>g.id===f.guideId);
        const passages=guide ? [{text:guide.answer,evidenceIds:guide.evidenceIds},...(guide.sections??[])] : [];
        if(!passages.some(p=>p.text.includes(f.claim as string)&&(f.evidenceIds as string[]).every(id=>p.evidenceIds.includes(id)))) fail('stored claim must belong to its current guide passage');
      }
      if(answered && (!f.claim.trim()||!f.topic||!f.evidenceIds.length||f.evidenceIds.some(id=>sources.get(id as string)?.access!=='page')||!['found','verified_absence'].includes(String(f.evidenceOutcome)))) fail('answer requires page evidence');
      if(!answered && f.claim.trim()) fail('unanswered facet must not assert a claim');
      if(f.status==='sufficient' && (f.researchStatus!=='completed'||!f.scope.entity)) fail('sufficient requires completed research and entity scope');
      if (f.pay !== undefined && f.pay !== null && (!record(f.pay) || !exact(f.pay,['currency','period','min','max','component']) || !['KRW','USD','EUR'].includes(String(f.pay.currency)) || !['year','month','hour'].includes(String(f.pay.period)) || !['base','total'].includes(String(f.pay.component)) || typeof f.pay.min !== 'number' || typeof f.pay.max !== 'number' || !Number.isFinite(f.pay.min) || !Number.isFinite(f.pay.max) || f.pay.min < 0 || f.pay.min > f.pay.max)) fail('pay structure');
      if(f.status==='sufficient' && POSTING_SCOPED_FACETS.includes(String(f.facetId)) && (!f.scope.jobId||!f.scope.role||!f.scope.geography||!f.scope.referenceOn)) fail('job-bound facet requires posting, role, geography and actual reference date');
      if (answered && f.scope.jobId && checkRecords) {
        if (!postingMismatches) validateJobFacet(f as unknown as FacetAssessment, company, jobs ?? []);
        else try { validateJobFacet(f as unknown as FacetAssessment, company, jobs ?? []); } catch (error) {
          if (!String((error as Error).message).startsWith('QUESTION_CONTRACT: ')) throw error;
          postingMismatches.push(f.facetId as string);
        }
      }
      // R0-8: a run shown a posting sample cannot conclude absence for all postings, nor cite a posting it was not shown.
      const sampled = sampledFacetProblem(f as { facetId: unknown; evidenceOutcome: unknown; scope: { jobId: unknown } }, sample);
      if (sampled) fail(`question=${q.id} facet=${f.facetId} field=scope.jobId expected=one shown posting (${sampled})`);
      if(f.evidenceOutcome==='inaccessible' && answered || f.evidenceOutcome==='conflicting' && f.status!=='conflicting' || f.status==='conflicting' && f.evidenceOutcome!=='conflicting') fail('evidence/answer mismatch');
      if (answers && (!['completed','blocked'].includes(String(f.researchStatus)) || f.status === 'not_assessed' || f.evidenceOutcome === 'not_checked')) fail('new research must record a concrete outcome for every facet');
      if (!answers && answered && checkRecords && !Object.hasOwn(f,'guideId')) {
        const guide=company.guides?.find(g=>g.id===`${company.id}-pipeline-${f.topic}`);
        if(!guide || ![guide.answer,...(guide.sections??[]).map(s=>s.text)].some(s=>s.includes(f.claim as string)) || !(f.evidenceIds as string[]).every(id=>guide.evidenceIds.includes(id))) fail('stored claim must belong to its current guide');
      }
      if(answers && f.topic!==null && !Object.hasOwn(f,'guideId')) {
        const answer=answers.find(a=>a.topic===f.topic);
        if(answered && (!answer || answer.state==='unavailable'||!(answer.fact+'\n'+answer.analysis).includes(f.claim as string)||!(f.evidenceIds as string[]).every(id=>answer.evidenceIds.includes(id)))) fail('claim must belong to cited answer');
      }
    }
  }
}
/** Explicit null has no guide; only omitted guideId uses the legacy topic fallback. */
export function facetGuideId(companyId:string, facet:Pick<FacetAssessment,'topic'|'guideId'>):string|null {
  return Object.hasOwn(facet,'guideId') ? facet.guideId ?? null : facet.topic ? `${companyId}-pipeline-${facet.topic}` : null;
}
/** Binding tracks the exact records carrying this claim; changed evidence/text invalidates the assessment. */
export function facetBinding(company: CompanyResearch, facet: FacetAssessment, jobs:Job[] = company.questionAssessment?.jobs ?? []) {
  if(Object.hasOwn(facet,'guideId')) return hash({facet,job:facet.scope.jobId ? jobs.find(j=>j.id===facet.scope.jobId)??null : null,guide:withoutContentChange(company.guides?.find(g=>g.id===facetGuideId(company.id,facet))??null),evidence:facet.evidenceIds.map(id=>company.evidence.find(e=>e.id===id)??null)});
  if(!facet.topic) return hash({facet});
  const id=`${company.id}-pipeline-${facet.topic}`;
  return hash({facet,job:facet.scope.jobId ? jobs.find(j=>j.id===facet.scope.jobId)??null : null,fact:company.facts.find(f=>f.id===id+'-fact')??null,guide:withoutContentChange(company.guides?.find(g=>g.id===id)??null),evidence:facet.evidenceIds.map(id=>company.evidence.find(e=>e.id===id)??null)});
}
export function bindAssessment(contract: QuestionAssessment, company: CompanyResearch, draftHash: string, recordedAt: string, jobs: Job[] = []): StoredAssessment {
  validateAssessment(contract,company,undefined,true,jobs);
  const jobIds = new Set(contract.questions.flatMap(q => q.facets.flatMap(f => f.scope.jobId ? [f.scope.jobId] : [])));
  const boundJobs=structuredClone(jobs.filter(j=>jobIds.has(j.id)));
  return {jobsHash: hash(jobs), boundJobsHash: hash(boundJobs), jobs: boundJobs, contract:structuredClone(contract),draftHash,recordedAt,bindings:Object.fromEntries(contract.questions.flatMap(q=>q.facets.map(f=>[f.facetId,facetBinding(company,f,boundJobs)])))};
}
export function assessmentForCompany(company: CompanyResearch): QuestionAssessment {
  const stored=company.questionAssessment;
  if(!stored || !validQuestionJobs(stored.jobs) || stored.boundJobsHash!==hash(stored.jobs)) return emptyAssessment();
  try {validateAssessment(stored.contract,company,undefined,false);} catch {return emptyAssessment();}
  const result=structuredClone(stored.contract);
  for(const q of result.questions)for(const f of q.facets) if(stored.bindings[f.facetId]!==facetBinding(company,f)) {
    f.status='not_assessed';f.claim='';f.evidenceIds=[];f.limitation='자료가 바뀌어 이전 설명의 범위를 다시 확인해야 해요.';
  }
  return result;
}
export function questionStatus(facets: FacetAssessment[]): FacetAssessment['status'] {
  if(facets.some(f=>f.status==='conflicting'))return 'conflicting';
  if(facets.every(f=>f.status==='sufficient'))return 'sufficient';
  if(facets.some(f=>f.status==='partial'||f.status==='sufficient'))return 'partial';
  if(facets.every(f=>f.status==='not_assessed'))return 'not_assessed';
  return 'insufficient';
}
const str={type:'string'}, nullable={type:['string','null']};
// The API's strict mode rejects a const/enum node without type (invalid_json_schema), so every value node names it.
const strEnum=(values:readonly string[])=>({type:'string',enum:values}), strConst=(value:string)=>({type:'string',const:value});
const obj=(properties:Record<string,unknown>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
// One branch per question and per facet, so a facet's topic can only be null or its own question's
// pipelineTopics (validateAssessment). A flat topic enum let one bad label void a whole research run.
/**
 * The values a facet may take. A new research run gets only concrete outcomes (validateAssessment rejects
 * not_assessed, a researchStatus other than completed/blocked and not_checked there): offering them in the output
 * schema let one honest "not researched" facet void the whole run (2026-10-14 greeting-teamsparta, comparison facets).
 */
type FacetValues={status:readonly string[];researchStatus:readonly string[];evidenceOutcome:readonly string[]};
const ALL_FACET_VALUES:FacetValues={status:answerStatuses,researchStatus:researchStatuses,evidenceOutcome:evidenceOutcomes};
export const NEW_RESEARCH_FACET_VALUES:FacetValues={status:answerStatuses.filter(v=>v!=='not_assessed'),researchStatus:['completed','blocked'],evidenceOutcome:evidenceOutcomes.filter(v=>v!=='not_checked')};
const facetSchema=(q:QuestionContract,facetId:string,values:FacetValues=ALL_FACET_VALUES)=>obj({facetId:strConst(facetId),status:strEnum(values.status),researchStatus:strEnum(values.researchStatus),evidenceOutcome:strEnum(values.evidenceOutcome),topic:{type:['string','null'],enum:[null,...q.pipelineTopics]},claim:str,limitation:str,evidenceIds:{type:'array',items:str},scope:obj({entity:nullable,geography:nullable,role:nullable,jobId:nullable,referenceOn:nullable}),pay:{anyOf:[obj({currency:strEnum(['KRW','USD','EUR']),period:strEnum(['year','month','hour']),min:{type:'number'},max:{type:'number'},component:strEnum(['base','total'])}),{type:'null'}]}});
const assessmentSchema=(values:FacetValues)=>obj({version:{type:'integer',const:1},contractHash:strConst(contractHash()),questions:{type:'array',items:{anyOf:researchQuestions.map(q=>obj({questionId:strConst(q.id),facets:{type:'array',items:{anyOf:q.facets.map(f=>facetSchema(q,f.id,values))}}}))}}});
/** Every facet value: the schema runs before 2026-10-14 were given (byte-stable; lib/reading-connection-health.ts and pinned hashes). */
export const questionAssessmentSchema=assessmentSchema(ALL_FACET_VALUES);
/** Concrete outcomes only: retained for prior web research and the stored-material mode. */
export const newResearchAssessmentSchema=assessmentSchema(NEW_RESEARCH_FACET_VALUES);
/** Generation-only constraints; prior schemas and the runtime acceptance policy stay unchanged. */
export const scopedResearchAssessmentSchema=structuredClone(newResearchAssessmentSchema);
for(const question of (scopedResearchAssessmentSchema.properties.questions as {items:{anyOf:{properties:{facets:{items:{anyOf:ReturnType<typeof facetSchema>[]}}}}[]}}).items.anyOf) {
  question.properties.facets.items.anyOf=question.properties.facets.items.anyOf.flatMap(facet=>{
    const id=(facet.properties.facetId as {const:string}).const;
    if(!POSTING_SCOPED_FACETS.includes(id))return [facet];
    return [
      obj({...facet.properties,status:strConst('sufficient'),researchStatus:strConst('completed'),scope:obj({entity:str,geography:str,role:str,jobId:str,referenceOn:str})}),
      obj({...facet.properties,status:strEnum(NEW_RESEARCH_FACET_VALUES.status.filter(status=>status!=='sufficient'))}),
    ];
  });
}
/** Stored material review requires the exact guide and public caveat; legacy schemas stay byte-stable. */
export const storedAssessmentSchema=structuredClone(newResearchAssessmentSchema);
for(const question of (storedAssessmentSchema.properties.questions as {items:{anyOf:{properties:{facets:{items:{anyOf:{properties:Record<string,unknown>;required:string[]}[]}}}}[]}}).items.anyOf) {
  for(const facet of question.properties.facets.items.anyOf) {
    facet.properties.guideId=nullable;facet.properties.publicCaveat=str;facet.required.push('guideId','publicCaveat');
  }
}
/**
 * Drafting-only rule (lib/research-pipeline.ts researchPrompt). The review prompt embeds
 * questionContractPrompt and saved reviews are replayed by its hash, so that text stays byte-stable.
 */
export const FACET_TOPIC_RULE = "A facet's topic is null or one of its own question's pipelineTopics, never another question's topic.";
/** Drafting-only, like FACET_TOPIC_RULE: what to record for a facet the run could not research. */
export const FACET_OUTCOME_RULE = "Every facet records a concrete outcome: researchStatus completed or blocked, never not_assessed or not_checked. A facet you could not research (for example no sources for a comparison counterpart) is status insufficient, researchStatus completed or blocked, evidenceOutcome not_found_in_scope or inaccessible, with an empty claim and its limitation.";
export const POSTING_SCOPE_RULE = `For ${POSTING_SCOPED_FACETS.join(', ')}, sufficient requires all five scope fields including a real source-stated reference date. If the original posting does not state that date, use partial (when page evidence supports the claim) or insufficient, with referenceOn:null. Never invent a date or substitute fetchedAt/checkedOn to satisfy the schema. This is a limitation of the evidence, not permission to fill a missing value.`;
export function questionContractPrompt() {
  return `QUESTION_CONTRACT_V1\n${JSON.stringify({version:1,contractHash:contractHash(),questions:researchQuestions})}\nReturn questionContract for all nine questions and every facet. The six answers are article containers, never nine-question completion. Each partial/sufficient facet claim must be an exact passage in its topic fact or analysis and cite a subset of that answer's page evidence. For job-bound sufficient facets use the exact registered legal employer name, geography=collected posting location code (seoul/pangyo/remote/global), role=posting role code, and exact jobId. Pay sufficiency requires pay {currency,period,min,max,component} matching an explicit numeric posting salary; negotiable/company averages cannot qualify. All other facets set pay:null. Keep entity, geography, role, actual reference date and exact jobId explicit; null when unknown. Retrieval dates are not reference dates. No posting identity means job-specific facets cannot be sufficient. Completed research is not sufficient evidence. Missing/inaccessible/conflicting facets have empty claim. Record the actual research/evidence outcome and limitation. verified_absence requires explicit source proof of absence in that scope. Independent review decides whether claimed sufficiency is warranted; never fabricate details to fill this contract.`;
}

/** Draft scaffold records an explicit gap; callers must replace the limitation with their actual search result. */
export function gapAssessment(): QuestionAssessment {
  const result=emptyAssessment();
  for(const q of result.questions)for(const f of q.facets)Object.assign(f,{status:'insufficient',researchStatus:'completed',evidenceOutcome:'not_found_in_scope',limitation:'조사 범위에서 이 항목을 뒷받침할 자료를 찾지 못했어요.'});
  return result;
}

/** Structured rejection checks use the archived original posting, never a model-written surrogate. */
/**
 * A legal name without its company-form marker: 주식회사/(주)/㈜, 유한회사/(유), whitespace and NFKC width. "주식회사 당근마켓",
 * "(주)당근마켓" and "당근마켓" name the same registered entity; "당근서비스" does not (2026-10-15 user decision: spelling is
 * not a mismatch, a different entity is).
 */
export const legalCore = (name: string) => name.normalize('NFKC').replace(/\s+/g,'').replace(/^(?:주식회사|\(주\)|유한회사|\(유\))+|(?:주식회사|\(주\)|유한회사|\(유\))+$/g,'');
// A new spelling counts only as a whole name: it ends at the text end, punctuation, or one unambiguous particle
// (컬리는, 컬리의, 컬리에서), or a line break; spaces followed by more letters may continue the name ("컬리 서비스") and do not count.
// 이/가 are left out: they also start names. It starts after the text start, punctuation or a line break, never after a word.
const ENTITY_FORMS = '(?:주식회사|\\(주\\)|유한회사|\\(유\\))';
const NAME_END = '(?=(?:은|는|을|를|의|에서|에|와|과|으로|로|도)(?![\\p{L}\\p{N}])|$|[^\\p{L}\\p{N}\\s]|\\s*[\\r\\n]|[^\\S\\r\\n]+(?:$|[^\\p{L}\\p{N}\\s]))';
const NAME_START = '(?<![\\p{L}\\p{N}][^\\S\\r\\n]*)';
/**
 * The posting text names the registered entity. The registered name itself, whitespace-insensitive, as before
 * 2026-10-15 (kept so every saved candidate replays byte for byte; it also accepts a longer name that starts with
 * it, e.g. "주식회사 컬리 서비스" — a known gap, docs/research-question-contract.md). Since then also any other spelling of
 * its company-form marker, as a whole name only: "(주)컬리." counts, "㈜컬리서비스" and "(주)컬리 서비스" do not. A bare
 * brand mention never counts unless it is the registered name itself (a name without a form marker).
 */
export function mentionsLegalEntity(text: string, legal: string) {
  const core = legalCore(legal), compact = (s: string) => s.normalize('NFKC').replace(/\s+/g,'');
  if (!core) return false;
  if (compact(text).includes(compact(legal))) return true;
  const body = [...core].map(ch => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');
  const pattern = `${ENTITY_FORMS}\\s*${body}${NAME_END}|${NAME_START}${body}\\s*${ENTITY_FORMS}${NAME_END}`;
  return new RegExp(pattern, 'u').test(text.normalize('NFKC'));
}

export function validateJobFacet(f: FacetAssessment, company: CompanyResearch, jobs: Job[]) {
  // The board's company, as when the run froze its postings: a shared board's split (lib/posting-company.ts) keeps
  // other companies' postings out of new runs' jobs context and never voids a saved assessment.
  const job=jobs.find(j=>j.id===f.scope.jobId && boardCompanyForJob(j)?.id===company.id);
  const legal=companies.find(c=>c.id===company.id)?.legalName ?? company.facts.find(f=>f.id===`${company.id}-legal-name`)?.text;
  const refs=company.evidence.filter(e=>f.evidenceIds.includes(e.id));
  if(!job || (f.scope.entity!==null && (!legal || legalCore(f.scope.entity)!==legalCore(legal))) || (f.scope.geography!==null && f.scope.geography!==job.location) || (f.scope.role!==null && f.scope.role!==job.role) || !refs.some(e=>e.url.replace(/\/$/,'')===job.sourceUrl.replace(/\/$/,''))) fail('posting employer/geography/role/source mismatch');
  if(f.scope.referenceOn && (f.scope.referenceOn>job.fetchedAt.slice(0,10) || refs.every(e=>f.scope.referenceOn!>e.checkedOn))) fail('posting reference date exceeds observation');
  if(f.scope.referenceOn && !job.updatedAt?.startsWith(f.scope.referenceOn) && !refs.some(e=>e.excerpt.includes(f.scope.referenceOn!))) fail('posting reference date not stated');
  if(f.status!=='sufficient')return;
  if(!legal || !mentionsLegalEntity(job.description, legal) || !f.scope.referenceOn) fail('posting employer or reference date not stated');
  if(f.facetId==='conditions.pay') {
    const pay=f.pay,salary=job.salary;
    if(!pay || !salary || /협의|미정|negotiable/i.test(salary)) fail('pay requires explicit posting salary');
    const segments=salary.normalize('NFKC').split(/[;\n]/).map(part=>part.trim());
    const matched=segments.some(segment=>{
      // Only an explicit component + period + currency + one fixed amount/range is machine-verifiable.
      // More complicated compensation prose remains useful as a partial answer after source review.
      const m=/^(기본급|총보상|base|total)\s*(연봉|월급|시급|annual|monthly|hourly)\s*(KRW|USD|EUR)\s*([0-9][0-9,]*(?:\.[0-9]+)?)(?:\s*[~–-]\s*([0-9][0-9,]*(?:\.[0-9]+)?))?\s*(만원|원)?$/i.exec(segment);
      if(!m)return false;
      const component=/^(기본급|base)$/i.test(m[1])?'base':'total';
      const period=/^(연봉|annual)$/i.test(m[2])?'year':/^(월급|monthly)$/i.test(m[2])?'month':'hour';
      const currency=m[3].toUpperCase();if(m[6]&&currency!=='KRW')return false;
      const factor=m[6]==='만원'?10000:1;
      const min=Number(m[4].replaceAll(',',''))*factor,max=Number((m[5]??m[4]).replaceAll(',',''))*factor;
      return component===pay.component&&period===pay.period&&currency===pay.currency&&min===pay.min&&max===pay.max;
    });
    if(!matched)fail('pay currency/period/range/component mismatch');
  }
}

const DEMOTED_POSTING_LIMITATION = '공고의 고용 법인·지역·직무·출처나 기준일이 이 회사의 공고와 맞지 않아 답으로 쓰지 않았어요.';
/**
 * New research only (candidateFromDraft): validates the drafted assessment, and an answered posting-bound facet whose
 * posting scope fails validateJobFacet becomes an unanswered facet instead of voiding the run (2026-10-15
 * greeting-daangnservice: one facet scoped to "당근서비스" on a board registered as 주식회사 당근마켓 discarded the whole
 * draft). Every other check runs on the drafted facet first, so a malformed facet is still rejected; the demoted
 * assessment is then validated strictly. The claim is dropped, never rewritten; the evidence stays cited so the
 * limitation is traceable. The input is not mutated. Stored assessments are validated strictly elsewhere.
 */
export function demotePostingMismatches(input: unknown, company: CompanyResearch, answers: Answer[] | undefined, jobs: Job[], sample?: PostingSample): {contract: QuestionAssessment; demoted: string[]} {
  const demoted: string[] = [];
  validateAssessment(input, company, answers, true, jobs, sample, demoted);
  if (!demoted.length) return {contract: input, demoted};
  const contract: QuestionAssessment = {...input, questions: input.questions.map(q => ({...q, facets: q.facets.map(f => {
    if (!demoted.includes(f.facetId)) return f;
    const kept = f.limitation.trim();
    const limitation = `${kept ? kept.slice(0, 500 - DEMOTED_POSTING_LIMITATION.length - 1) + ' ' : ''}${DEMOTED_POSTING_LIMITATION}`;
    const {publicCaveat: _caveat, ...rest} = f;
    return {...rest, status: 'insufficient' as const, evidenceOutcome: 'found' as const, claim: '', limitation, ...(Object.hasOwn(f, 'pay') ? {pay: null} : {})};
  })}))};
  validateAssessment(contract, company, answers, true, jobs, sample);
  return {contract, demoted};
}
