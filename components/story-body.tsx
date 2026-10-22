import { QuestionReadingCard } from "./reading-question-link";
import type { QuestionReading } from "@/lib/reading-journey";
import { StoryContents } from "@/components/story-contents";
import { Fragment } from "react";
import type { Reading } from "@/lib/reading";
import { ComparisonBridge, type StoryBridge } from "@/components/comparison-bridge";
import { RelDate } from "./rel-date";
import { dotDates } from "@/lib/relative-date";
export type { StoryBridge } from "@/components/comparison-bridge";

const viewpoints = {
  "company-statement": "회사가 밝힌 방향",
  "team-account": "팀이 기록한 사례",
  context: "자료를 바탕으로 한 해석",
};
export function StoryBody({ reading, bridge, connections = [], from, origin }: {
  reading: Reading; bridge?: StoryBridge; connections?: QuestionReading[]; from: string; origin: string;
}) {
  if (!reading.sections?.length) return null;
  return <div className="story-body">
    <StoryContents sections={reading.sections.map(({ id, title }) => ({ id, title }))} placement="inline" />
    {reading.sections.map((s,i)=><Fragment key={s.id}>
      <section className="story-section" id={`story-${s.id}`}>
        <p className="story-viewpoint">{viewpoints[s.kind]}</p>
        <h2>{s.title}</h2>
        <p className="story-paragraph">{dotDates(s.text)}</p>
        <div className="story-citations" aria-label={`${s.title}의 참고 자료`}>
          {s.evidenceIds.map(id=>{
            const e=reading.evidence.find(e=>e.id===id)!;
            return <span className="story-citation" key={id}><a href={`#reading-source-${id}`} aria-label={`${e.publisher} 자료로 이동`}>{e.publisher}</a> · {e.publishedOn ? <>게시 <RelDate value={e.publishedOn} /></> : "게시일 미확인"}</span>;
          })}
        </div>
      </section>
      {connections.filter(item=>item.edge.proposal.from.sectionId===s.id).map(item=><div className="story-question-connection" key={item.edge.id}>
        <h2>이어서 살펴볼 질문</h2>
        <QuestionReadingCard item={item} from={from} origin={origin}/>
      </div>)}
      {/* Historical editorial renderer retained for archived comparison tests;
          the live route only supplies reviewed source-section connections. */}
      {i===1 && bridge && <ComparisonBridge current={reading} bridge={bridge} from={from} origin={origin} placement="inline"/>}
    </Fragment>)}
  </div>;
}
