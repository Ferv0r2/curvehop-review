import { jobLines, sectionHeading } from './job-insights';

export type JobDescriptionBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: {text: string; depth: number}[] };

/**
 * Collectors store an empty description only for a posting whose body is
 * images (lib/greeting.ts); every other source rejects a posting without text.
 */
export const hasTextBody = (description: string) => !!description.trim();
export const IMAGE_BODY_NOTE = '공고 본문이 이미지로 되어 있어요. 원문에서 확인하세요.';

/** Display structure only. Source strings are still rendered as escaped React text. */
export function parseJobDescription(description: string): JobDescriptionBlock[] {
  const blocks: JobDescriptionBlock[]=[];
  let paragraph: string[]=[];
  const flush=()=>{if(paragraph.length)blocks.push({kind:'paragraph',text:paragraph.join('\n')});paragraph=[];};
  // One-line descriptions (Workday) are split at bullets and sentence ends first.
  const lines=description.replace(/\r\n?/g,'\n').split('\n').flatMap(line=>line.length>300?['',...jobLines(line),'']:[line]);
  for(const line of lines) {
    const text=line.trim();
    if(!text){flush();continue;}
    const markdown=text.match(/^#{1,6}\s+(.+?)(?:\s+#+)?$/);
    const heading=markdown?.[1] ?? (/^\[[^\]]{1,80}(?:비전|Vision)\]$/i.test(text)?text.slice(1,-1):
      /^(?:우리 팀.*소개합니다\.|이런 경험.*\((?:필수|우대)요건\)|크래프톤의 도전에.*필요합니다\.|필요 서류를 확인해주세요!|근무지|고용형태|아래 안내 사항을 확인해주세요!|Please check the information below|자격\s*요건|우대\s*(?:요건|사항)|담당\s*업무|주요\s*업무)$/.test(text)?text:null);
    const section=heading??(sectionHeading(text)?text.replace(/^[•*#\-\s]+/,'').replace(/[:：]$/,''):null);
    if(section){flush();blocks.push({kind:'heading',text:section});continue;}
    const bullet=line.match(/^(\s*)[•*\-]\s+(.+)$/);
    if(bullet){
      flush();const last=blocks.at(-1);
      const item={text:bullet[2].trim(),depth:Math.min(8,Math.floor(bullet[1].replaceAll('\t','  ').length/2))};
      if(last?.kind==='list')last.items.push(item);else blocks.push({kind:'list',items:[item]});
    } else paragraph.push(text);
  }
  flush();return blocks;
}
