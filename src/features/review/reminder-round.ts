import {useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router';
import {isFlagOn} from '../../flags';
import {getApi} from '../../data';
import {fetchNotificationReviewItems,enabledNotificationReviewLink} from '../../data/notify';
import {boundedReminderItems} from './reminder-queue';
import {useReviewSession} from '../review-run/store';
import type {Settings} from '../../data/types';

const filter={decks:[],sessionId:null,conceptSlug:null,includeNew:true,newOnly:false};

/** Consume a reminder link once; a malformed link never starts a round. */
export function useReminderRound(settings:Settings|undefined){
 const navigate=useNavigate();
 const attempted=useRef(false);
 const [error,setError]=useState<string|null>(null);
 const [loading,setLoading]=useState(false);
 useEffect(()=>{
  if(attempted.current||!settings)return;
  const link=enabledNotificationReviewLink(window.location.href,isFlagOn('notificationsPush'));
  if(!link)return;
  attempted.current=true;
  // Strip the one-time link before starting the asynchronous read.
  navigate('/review',{replace:true});
  setLoading(true);
  let cancelled=false;
  void (async()=>{
   try{
    const api=getApi();
    const items=api.mode==='live'
     ?await fetchNotificationReviewItems(link.count)
     :boundedReminderItems(await api.getReviewItems(filter),link.count);
    if(cancelled)return;
    if(!items.length){setError('No cards are due for this reminder.');return}
    useReviewSession.getState().initialize(items,settings,filter);
    navigate('/review/run?reminder=1');
   }catch{
    if(!cancelled)setError('Could not load reminder cards. Try again from your reminder.');
   }finally{if(!cancelled)setLoading(false)}
  })();
  return ()=>{cancelled=true};
 },[settings,navigate]);
 return {loading,error};
}
