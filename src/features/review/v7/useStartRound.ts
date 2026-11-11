import {useState} from 'react';
import {useNavigate} from 'react-router';
import {getMode} from '../../../data/mode';
import type {QueueFilter,ReviewItem} from '../../../data/types';
import {useSettings} from '../../../data/hooks';
import {useReviewSession} from '../../review-run/store';
import {currentSettingsVersion,startRun} from '../../review-run/v6/adapter';

const allFilter:QueueFilter={decks:[],sessionId:null,conceptSlug:null,includeNew:true,newOnly:false};
/** Starts a durable run for a batch; the same hand-off as the v6 hub, shared by the hub and "Review 10 more". */
export function useStartRound(){
 const navigate=useNavigate(),settings=useSettings();
 const [busy,setBusy]=useState(false),[issue,setIssue]=useState<string|null>(null);
 async function start(batch:readonly ReviewItem[],selectedDeckIds:readonly string[]):Promise<void>{
  if(!settings.data||!batch.length||busy)return;
  // Live-mode fixtures with non-UUID card ids keep the established local queue (see ReviewV6).
  if(getMode()==='live'&&batch.some(card=>!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(card.cardId))){
   useReviewSession.getState().initialize([...batch],settings.data,allFilter);
   navigate('/review/run');
   return;
  }
  setBusy(true);setIssue(null);
  try{
   const run=await startRun({
    selectedDeckIds:[...selectedDeckIds],filters:{sessionId:null,conceptSlug:null,includeNew:true,newOnly:false},
    cardBudget:Math.min(2000,batch.length),minuteBudget:Math.min(1440,batch.length),
    schedulerVersion:'fsrs-v6',settingsVersion:await currentSettingsVersion(),
   },[...batch]);
   navigate('/review/run?run='+encodeURIComponent(run.id));
  }catch(error){setIssue(error instanceof Error?error.message:'Could not start review run');}
  finally{setBusy(false);}
 }
 return {start,busy,issue};
}
