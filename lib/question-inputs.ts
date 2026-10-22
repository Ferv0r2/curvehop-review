import { access, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { readSnapshot } from './store';
import { providers, roleLabels, type Job } from './jobs';
export type InputState<T> = {status:'not_provided'|'missing'|'invalid';items:[];reason?:string}|{status:'ok';items:T[]};
export type QuestionRun = {runId:string;companyId:string;draftHash:string|null;status:string;startedAt:string;task?:'research'|'connections';reviewStatus?:string;sourceFetch?:{recordedBodies:number;failed:number};failure?:{stage:string;cause:string}};
export function validQuestionJobs(input:unknown): input is Job[] {
 return Array.isArray(input) && input.length <= 5000 && input.every(j => j && typeof j === 'object' &&
  ['id','sourceBoard','sourceUrl','company','title','description','roleLabel','locationLabel','fetchedAt'].every(k=>typeof j[k]==='string') &&
  providers.includes(j.source) && Object.hasOwn(roleLabels,j.role) && ['seoul','pangyo','remote','global'].includes(j.location) &&
  Number.isFinite(Date.parse(j.fetchedAt)) && (j.updatedAt===null || typeof j.updatedAt==='string' && Number.isFinite(Date.parse(j.updatedAt))) &&
  (j.salary===null || typeof j.salary==='string') && (j.experience===null || typeof j.experience==='string'));
}
/** Missing, malformed and a successful empty snapshot are intentionally different. */
export async function readQuestionJobs(path:string):Promise<InputState<Job>> {
 try {
  await access(path);const snapshot=await readSnapshot(path);
  if(!validQuestionJobs(snapshot.jobs))throw new Error('JOB_SCHEMA');
  return {status:'ok',items:snapshot.jobs};
 } catch(error){return (error as NodeJS.ErrnoException).code==='ENOENT'?{status:'missing',items:[]}:{status:'invalid',items:[],reason:'공고 입력을 읽거나 검증하지 못했습니다.'};}
}
export async function readQuestionRuns(path:string):Promise<InputState<QuestionRun>> {
 let opened=false;
 try {
  const names=await readdir(path);opened=true;
  const ids=names.filter(id=>/^\d{17}-[a-f0-9]{8}$/.test(id)).sort();
  if(ids.length>20000)throw new Error('RUN_LIMIT');
  const items:QuestionRun[]=[];
  for(const runId of ids) {
   const dir=join(path,runId),m=JSON.parse(await readFile(join(dir,'manifest.json'),'utf8'));
   if(m.id!==runId||typeof m.companyId!=='string'||typeof m.status!=='string'||!Number.isFinite(Date.parse(m.startedAt)))throw new Error('RUN_SCHEMA');
   let draft:string|null=null;try{draft=await readFile(join(dir,'draft.json'),'utf8');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
   if(m.task!==undefined&&!['research','connections'].includes(m.task))throw Error('RUN_TASK');
   let audit:any;try{audit=JSON.parse(await readFile(join(dir,'automatic-review.json'),'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
   const fetches=audit?.sourceFetch;
   const records=fetches&&typeof fetches==='object'&&!Array.isArray(fetches)?Object.values(fetches) as {status?:number;sha256?:string;error?:string}[]:null;
   const sourceFetch=records?{recordedBodies:records.filter(r=>r&&Number(r.status)>=200&&Number(r.status)<300&&!r.error&&/^[a-f0-9]{64}$/.test(r.sha256??'')).length,failed:records.filter(r=>r&&(r.error||Number(r.status)<200||Number(r.status)>=300)).length}:undefined;
   const failure=m.failure&&typeof m.failure.stage==='string'&&/^[a-z-]{1,40}$/.test(m.failure.stage)&&typeof m.failure.cause==='string'&&/^[A-Z_]{1,80}$/.test(m.failure.cause)?{stage:m.failure.stage,cause:m.failure.cause}:undefined;
   items.push({task:m.task??'research',...(failure?{failure}:{}),...(['running','approved','held','failed'].includes(audit?.status)?{reviewStatus:audit.status}:{}),...(sourceFetch?{sourceFetch}:{}),runId,companyId:m.companyId,status:m.status,startedAt:m.startedAt,draftHash:draft===null?null:createHash('sha256').update(draft).digest('hex')});
  }
  return {status:'ok',items};
 } catch(error){return !opened&&(error as NodeJS.ErrnoException).code==='ENOENT'?{status:'missing',items:[]}:{status:'invalid',items:[],reason:'조사 실행 이력을 읽거나 검증하지 못했습니다.'};}
}
