import type { CompanyResearch, ResearchPack } from './research';
import { visibleRelationsForCompany } from './relations';
import { resolveRegistryRelations, type WikiRelationsRead } from './relations-store';

export type Suppression = {suppressedFactIds:string[];pendingFactIds:string[]};
export function knowledgeCorrections(pack:ResearchPack,relations:WikiRelationsRead,now=new Date()):Map<string,Suppression> {
  const result=new Map<string,Suppression>();
  if(relations.status!=='ok')return result;
  const context=resolveRegistryRelations(relations.file,pack,now);
  if(context.fileIssues.length)return result;
  for(const c of pack.companies)result.set(c.id,visibleRelationsForCompany(context.pack,context,c.id));
  return result;
}
const normalize=(s:string)=>s.normalize('NFKC').replace(/\s+/g,'');
/** Pure derived view; never validates relations against a pack from which their targets were removed. */
export function currentKnowledge(pack:ResearchPack,corrections:Map<string,Suppression>) {
  const suppressedGuideIds:string[]=[],pendingGuideIds:string[]=[];
  const projected:ResearchPack={...pack,companies:pack.companies.map(company=>{
    const correction=corrections.get(company.id);if(!correction?.suppressedFactIds.length && !correction?.pendingFactIds.length)return company;
    const suppressed=new Set(correction.suppressedFactIds),pending=new Set(correction.pendingFactIds);
    const removed=company.facts.filter(f=>suppressed.has(f.id));
    const refs=new Set(company.facts.filter(f=>suppressed.has(f.id)||pending.has(f.id)).flatMap(f=>f.evidenceIds));
    const guides=company.guides?.filter(g=>{
      const prose=[g.answer,...(g.sections??[]).map(s=>s.text),g.publication?.preview??''].map(normalize);
      const dependent=g.dependsOnFactIds?.some(id=>suppressed.has(id))||suppressed.has(g.id+'-fact')||removed.some(f=>normalize(f.text).length>=8 && prose.some(s=>s.includes(normalize(f.text))));
      if(dependent){suppressedGuideIds.push(g.id);return false;}
      if([...g.evidenceIds,...(g.sections??[]).flatMap(s=>s.evidenceIds)].some(id=>refs.has(id)))pendingGuideIds.push(g.id);
      return true;
    }).map(g=>pendingGuideIds.includes(g.id)?{...g,limitation:`관련 자료에 정정된 내용이 있어 이 설명의 범위를 다시 확인해야 해요. ${g.limitation}`} : g);
    const result:CompanyResearch={...company,facts:company.facts.filter(f=>!suppressed.has(f.id)),...(guides?{guides}: {})};
    return result;
  })};
  return {pack:projected,suppressedGuideIds,pendingGuideIds};
}
export function resolveCurrentKnowledge(pack:ResearchPack,relations:WikiRelationsRead,now=new Date()) {
  const corrections=knowledgeCorrections(pack,relations,now);
  return {...currentKnowledge(pack,corrections),corrections};
}
