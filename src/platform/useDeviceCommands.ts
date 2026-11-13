import {useEffect} from 'react';
import {useNavigate} from 'react-router';
import {getApi} from '../data';
import {getDeviceCommandApi} from '../data/device-commands';
import {getStudyApi} from '../data/study';
import {announceFocusChange} from '../app/v7/focus';
import {isNative} from './native';
import {deviceKey,startDeviceCommandRunner} from './deviceCommands';

/** N160 (area 28): lets chat open a screen or drive the timer on this device. One call in V7Shell. */
export function useDeviceCommands():void{
 const navigate=useNavigate();
 useEffect(()=>{
  const api=getDeviceCommandApi();
  if(api.mode==='demo')return;
  const lemma=getApi();
  return startDeviceCommandRunner(api,{
   navigate:to=>navigate(to),study:getStudyApi(),changed:announceFocusChange,
   locate:{
    path:async id=>{const hit=(await lemma.listProjects()).find(p=>p.id===id);return hit?'/p/'+hit.slug:null},
    checkpoint:async id=>{
     for(const project of await lemma.listProjects()){
      const detail=await lemma.getProject(project.slug);
      const cp=detail.checkpoints.find(c=>c.id===id);
      if(cp)return '/p/'+project.slug+'/cp/'+cp.code;
     }
     return null;
    }},
  },{key:deviceKey(),label:isNative()?'Android app':'Web browser',platform:isNative()?'android':'web'});
 },[navigate]);
}
