import { resolveRegistryRelations } from "./relations-store";
import type { ResearchPack } from './research';
import { readingItems, type Reading } from './reading';
import { readingConnectionState, type ReadingConnection } from './reading-connections';
export type QuestionReading = {reading:Reading;edge:ReadingConnection};
export type JourneyOptions={knowledgeReady:boolean;allowedCompanyIds?:ReadonlySet<string>};
/** Server-only derived navigation. Stored links have passed the existing publication
 * boundary; hashes invalidate that decision when either passage or evidence changes. */
export function questionNextReadings(pack:ResearchPack,fromId:string,options:JourneyOptions):QuestionReading[]{
 if(!options.knowledgeReady)return [];
 const readings=new Map(readingItems(pack).map(reading=>[reading.id,reading]));
 const from=readings.get(fromId);if(!from)return [];
 const owner=pack.companies.find(c=>c.id===from.companyId);
 const result:QuestionReading[]=[],targets=new Set<string>(),questions=new Set<string>();
 for(const edge of [...(owner?.readingConnections?.edges??[])].sort((a,b)=>a.id.localeCompare(b.id))){
  const p=edge.proposal;
  if(p.from.guideId!==fromId || readingConnectionState(pack,from.companyId,edge)!=='current')continue;
  const reading=readings.get(p.to.guideId),question=p.question.normalize('NFKC').replace(/\s+/g,'').toLowerCase();
  if(!reading || reading.id===fromId || (options.allowedCompanyIds&&!options.allowedCompanyIds.has(reading.companyId)) || targets.has(reading.id)||questions.has(question))continue;
  targets.add(reading.id);questions.add(question);result.push({reading,edge});if(result.length===3)break;
 }
 return result;
}
/** URL carries identity only. Prose and placement always resolve from current data. */
export function questionConnectionArrival(pack:ResearchPack,targetId:string,id:unknown,options:JourneyOptions):QuestionReading|undefined{
 if(typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id)||!options.knowledgeReady)return;
 for(const company of pack.companies){
  const edge=company.readingConnections?.edges.find(e=>e.id===id&&e.proposal.to.guideId===targetId);
  if(edge)return questionNextReadings(pack,edge.proposal.from.guideId,options).find(item=>item.edge.id===id);
 }
}

/** Missing/invalid correction input cannot certify a current reading edge. */
/** `now` defaults to the wall clock; measurement scripts pass their fixed asOf. */
export function readingKnowledgeReady(pack:ResearchPack,input:import('./relations-store').WikiRelationsRead|undefined,now?:Date):boolean {
 if(!input || input.status!=="ok" || input.missing)return false;
 const resolved=resolveRegistryRelations(input.file,pack,now);
 return !resolved.fileIssues.length && !resolved.invalidCorrections.length;
}
