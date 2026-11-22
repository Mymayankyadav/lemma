import {tutorAnswerParts} from '../../../supabase/functions/_shared/tutor-answer';
import {IMAGE_ONLY_ANSWER,type TutorAttachment} from '../../data/tutor/attachment-types';
import {MathText} from '../../ui/MathText';
import {TutorImage} from './TutorInk';

export function answerParts(question:string,attachments:readonly TutorAttachment[]=[]) {
  const parts=tutorAnswerParts(question,attachments.map(image=>image.id));
  // Turns composed before inline references placed their images after the text.
  if(!parts.some(part=>part.type==='image')) {
    if(question===IMAGE_ONLY_ANSWER&&attachments.length)parts.length=0;
    parts.push(...attachments.map(image=>({type:'image' as const,id:image.id})));
  }
  return parts;
}

export function answerImageLabels(question:string,attachments:readonly TutorAttachment[]=[]) {
  const labels=new Map<string,string>(),counts={drawing:0,photo:0};
  for(const part of answerParts(question,attachments))if(part.type==='image'&&!labels.has(part.id)) {
    const image=attachments.find(image=>image.id===part.id)!;
    labels.set(part.id,(image.kind==='drawing'?'Drawing ':'Photo ')+ ++counts[image.kind]);
  }
  return labels;
}

export function tutorAnswerText(question:string,attachments:readonly TutorAttachment[]=[]) {
  const labels=answerImageLabels(question,attachments);
  return answerParts(question,attachments).map(part=>part.type==='text'?part.text:'['+labels.get(part.id)+' attached here]').join('');
}

export function TutorAnswer({question,attachments=[],owner}:{question:string;attachments?:readonly TutorAttachment[];owner:string}) {
  const labels=answerImageLabels(question,attachments);
  return <div className="tutor-ordered-answer" aria-label="Your saved answer">
    {answerParts(question,attachments).map((part,index)=>part.type==='text'
      ?<MathText key={index} source={part.text}/>
      :<TutorImage key={index} owner={owner} attachment={attachments.find(image=>image.id===part.id)!} label={labels.get(part.id)}/>)}
  </div>;
}
