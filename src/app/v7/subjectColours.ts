import {useEffect,useSyncExternalStore} from 'react';
import {useSettings,useSubjects} from '../../data/hooks';
import type {UiPreferences} from '../../data/types';
import {subjects as kitSubjects,type Subject} from '../../ui/v7/Subject';
import {chosenSubjectsVersion,setChosenSubjects,subscribeChosenSubjects} from '../../features/atlas/v7/model';

/** Settings › Subjects stores the owner's choice as ui.subjectColours = {subjectId: kit subject}. */
export function chosenColours(ui:UiPreferences|null|undefined):Record<string,Subject>{
 const raw=ui?.subjectColours;
 if(!raw||typeof raw!=='object')return {};
 return Object.fromEntries(Object.entries(raw as Record<string,unknown>).filter((entry):entry is [string,Subject]=>(kitSubjects as readonly string[]).includes(entry[1] as string)));
}
/** The example workspace cannot store preferences, so a colour chosen there lasts for the session. */
const sessionColours:Record<string,Subject>={};
export const effectiveColours=(ui:UiPreferences|null|undefined)=>({...chosenColours(ui),...sessionColours});
export function chooseForSession(id:string,subject:Subject,ui:UiPreferences|null|undefined,rows:readonly {id:string;name:string}[]){
 sessionColours[id]=subject;setChosenSubjects(colourMap(ui,rows));
}
export function colourMap(ui:UiPreferences|null|undefined,rows:readonly {id:string;name:string}[]|undefined):Map<string,Subject>{
 const picked=effectiveColours(ui),out=new Map<string,Subject>();
 for(const row of rows??[])if(picked[row.id])out.set(row.name,picked[row.id]);
 return out;
}
/** Keeps the colour registry in step with settings; returns a version that changes when a colour changes. */
export function useSubjectColours():number{
 const settings=useSettings(),list=useSubjects();
 useEffect(()=>{if(settings.data&&list.data)setChosenSubjects(colourMap(settings.data.ui,list.data));},[settings.data,list.data]);
 return useSyncExternalStore(subscribeChosenSubjects,chosenSubjectsVersion,chosenSubjectsVersion);
}
