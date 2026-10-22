import { publicResearchCaveat } from "@/lib/research-public-copy";
import Link from 'next/link';
import type {QuestionReading} from '@/lib/reading-journey';
import {CompanyMark,keepDates} from './reading-view';

export function QuestionReadingCard({item,from,origin}:{item:QuestionReading;from:string;origin:string}){
 const {reading,edge}=item,p=edge.proposal;
 return <Link className="question-reading" href={`/read/${reading.id}?${new URLSearchParams({from,origin,edge:edge.id})}`} scroll={true}
   data-analytics="content_select" data-destination-type="reading" data-destination-id={reading.id} data-destination-company-id={reading.companyId} data-placement={p.from.sectionId ? "bridge" : "card"}>
  <span className="question-reading-company"><CompanyMark companyId={reading.companyId} name={reading.companyName} color={reading.companyColor}/><span>{reading.companyName}</span></span>
  <h3>{p.question}</h3>
  <p className="question-reading-answer">{keepDates(p.answerSummary)}</p>
  <p className="question-reading-limit">{keepDates(publicResearchCaveat(p.limitation))}</p>
  <span className="question-reading-action">이 질문 이어 읽기</span>
 </Link>;
}

export function ReadingArrival({item}:{item:QuestionReading}){
 const p=item.edge.proposal;
 return <aside className="reading-arrival" aria-label="이어 온 질문">
  <p className="reading-arrival-label">이어 온 질문</p>
  <h2>{p.question}</h2>
  <p>{keepDates(p.answerSummary)}</p>
  <p className="question-reading-limit">{keepDates(publicResearchCaveat(p.limitation))}</p>
  {p.to.sectionId && <a href={`#story-${p.to.sectionId}`}>이 질문을 다룬 부분 보기</a>}
 </aside>;
}
