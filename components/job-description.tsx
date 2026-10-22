import { IMAGE_BODY_NOTE, parseJobDescription } from '../lib/job-description';
import { isConditionsHeading, sectionHeading } from '../lib/job-insights';
type Item={text:string;children:Item[]};
function List({items}:{items:Item[]}) {
 return <ul>{items.map((item,i)=><li key={i}>{item.text}{!!item.children.length&&<List items={item.children}/>}</li>)}</ul>;
}
export function JobDescription({text}:{text:string}) {
 // The first heading of each kind is a jump target for the digest's "더 보기".
 const anchored=new Set<string>();
 return <div className="job-description">{parseJobDescription(text).map((block,i)=>{
  if(block.kind==='heading'){
   const kind=sectionHeading(block.text)??(isConditionsHeading(block.text)?'conditions':null);
   const id=kind&&!anchored.has(kind)?(anchored.add(kind),`jd-${kind}`):undefined;
   return <h3 key={i} id={id}>{block.text}</h3>;
  }
  if(block.kind==='paragraph')return <p key={i}>{block.text}</p>;
  const roots:Item[]=[],stack:{depth:number;item:Item}[]=[];
  for(const value of block.items){
   while(stack.length&&stack.at(-1)!.depth>=value.depth)stack.pop();
   const item:Item={text:value.text,children:[]};
   (stack.at(-1)?.item.children??roots).push(item);stack.push({depth:value.depth,item});
  }
  return <List key={i} items={roots}/>;
 })}</div>;
}
/** A posting whose body is only images: the images are not shown here, so point to the original. */
export function ImageBodyNote({sourceUrl}:{sourceUrl:string}) {
 return <p className="research-caption">{IMAGE_BODY_NOTE}{' '}<a href={sourceUrl} target="_blank" rel="noopener noreferrer">원문 보기 ↗</a></p>;
}
