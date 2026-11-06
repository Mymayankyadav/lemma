import {useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router';
import {isFlagOn} from '../../flags';
import {getApi} from '../../data';
import {fetchNotificationReviewItems,enabledNotificationReviewLink} from '../../data/notify';
import {boundedReminderItems} from './reminder-queue';
import {useReviewSession} from '../review-run/store';
import type {Settings,ReviewItem} from '../../data/types';

const filter={decks:[],sessionId:null,conceptSlug:null,includeNew:true,newOnly:false};

interface ReminderRead {
 promise:Promise<ReviewItem[]>;
 settings:Settings;
}

/** Consume a reminder link once, including across React StrictMode effect replay. */
export function useReminderRound(settings:Settings|undefined){
 const navigate=useNavigate();
 // Keep the one owner-scoped read across StrictMode setup/cleanup/setup.
 // A cleanup only detaches its subscriber; it must not abandon the request.
 const readRef=useRef<ReminderRead|null>(null);
 const completed=useRef(false);
 const settingsRef=useRef(settings);
 settingsRef.current=settings;
 const settingsReady=settings!==undefined;
 const [error,setError]=useState<string|null>(null);
 const [loading,setLoading]=useState(false);
 useEffect(()=>{
  if(!settingsReady||completed.current)return;
  let read=readRef.current;
  if(!read){
   const link=enabledNotificationReviewLink(window.location.href,isFlagOn('notificationsPush'));
   if(!link)return;
   const initialSettings=settingsRef.current!;
   const promise=(async()=>{
    const api=getApi();
    return api.mode==='live'
     ?await fetchNotificationReviewItems(link.count)
     :boundedReminderItems(await api.getReviewItems(filter),link.count);
   })();
   read={promise,settings:initialSettings};
   readRef.current=read;
   // Strip the one-time link before starting the asynchronous read.
   navigate('/review',{replace:true});
   setLoading(true);
  }
  const activeRead=read;
  let subscribed=true;
  void activeRead.promise.then(items=>{
   if(!subscribed||completed.current)return;
   completed.current=true;
   if(!items.length){setError('No cards are due for this reminder.');return}
   // Override only the in-memory round quota, never persisted settings.
   useReviewSession.getState().initialize(items,
    {...activeRead.settings,reviewsPerDay:50,newPerDay:50},filter);
   navigate('/review/run?reminder=1');
  }).catch(()=>{
   if(!subscribed||completed.current)return;
   completed.current=true;
   setError('Could not load reminder cards. Try again from your reminder.');
  }).finally(()=>{if(subscribed)setLoading(false)});
  return ()=>{subscribed=false};
 },[settingsReady,navigate]);
 return {loading,error};
}
