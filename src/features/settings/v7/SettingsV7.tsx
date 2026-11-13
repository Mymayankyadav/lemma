import {lazy,Suspense,useState,type ReactNode} from 'react';
import {MEANING_ICON} from '../../../ui/v7/meanings';
import {setHapticsEnabled} from '../../../ui/v7/haptics';
import {applyReduceEffects} from '../../../ui/v7/effects';
import {Link,useNavigate,useSearchParams} from 'react-router';
import {Bell,CalendarClock,ChevronRight,Copy,Database,Eye,EyeOff,LogOut,MessageCircle,Palette,RefreshCw,Shapes} from 'lucide-react';
import {useRotateConnectorSecret,useSettings,useSignOut,useSubjects,useUpdateSettings,useUpdateSubject} from '../../../data/hooks';
import type {Settings,Subject as DataSubject,UiPreferences} from '../../../data/types';
import {getMode} from '../../../data/mode';
import {applyAppearance,readAppearance} from '../../../styles/appearance';
import {DetailHeader,HubHeader} from '../../../app/v7/V7Shell';
import {chooseForSession,chosenColours,effectiveColours} from '../../../app/v7/subjectColours';
import {Button,Field,Sheet,Skeleton,Switch} from '../../../ui/v7/components';
import {SubjectMark,subjectClass,subjects as kitSubjects,type Subject} from '../../../ui/v7/Subject';
import {Emblem} from '../../../ui/v7/Emblem';
import {formatDuration} from '../../../lib/format';
import {useToast} from '../../../ui/Toast';
import {kitSubject} from '../../atlas/v7/model';
import {ConnectorAddress} from '../ConnectorAddress';
import StudyDefaults from '../v6/StudyDefaults';
import Activities from '../v6/Activities';
import Focus from '../v6/Focus';
import {PlanningLists,ReminderLists,StudyLists} from './SettingsLists';
import {DataAccount} from './DataAccount';
import './settings.css';
import {isNative} from '../../../platform/native';
import {useMinWidth} from '../../../app/v7/useMinWidth';
import {isFlagOn} from '../../../flags';
import {PAPERS,SKIES,choosePaper,chooseSky,readPaper,readSky,type Paper,type Sky} from '../../../ui/v7/paper';
// AW3: the app's version and updates, only inside the Android app.
const PhoneAbout=lazy(()=>import('./PhoneSettings').then(module=>({default:module.PhoneAbout})));

type Mode='auto'|'day'|'night';
type Section='appearance'|'tutor'|'study'|'planning'|'reminders'|'subjects'|'data';
const sectionTitle:Record<Section,string>={appearance:'Appearance',tutor:'Tutor',study:'Study and review',planning:'Planning',reminders:'Reminders',subjects:'Subjects',data:'Data and account'};
/** Old `?section=` links keep working: each v6 section id opens the v7 page that now holds it. */
const legacySection:Record<string,Section>={appearance:'appearance',connector:'tutor',tutor:'tutor',study:'study',activities:'study',focus:'study',planning:'planning',reminders:'reminders',subjects:'subjects',account:'data',export:'data'};
export const sectionOf=(value:string|null):Section|null=>value?legacySection[value]??((value in sectionTitle)?value as Section:null):null;
const modeWord:Record<Mode,string>={auto:'Auto',day:'Day',night:'Night'};

/** One line per index row with the current value (PLAN §6.14 "Done when"). */
export function settingsSummary(section:Section,settings:Settings|undefined,subjectCount:number,mode:Mode,systemNight:boolean):string{
 if(!settings)return '';
 switch(section){
  case 'appearance':return mode==='auto'?(systemNight?'Night':'Day')+' · follows the system':modeWord[mode];
  case 'tutor':return (settings.connectorUrl?'Connected':'Not connected')+' · '+(settings.preferredChat==='chatgpt'?'ChatGPT':'Claude');
  case 'study':return 'Target recall '+Math.round(settings.desiredRetention*100)+'% · '+settings.newPerDay+' new cards a day';
  case 'planning':{const p=settings.planning;return p?'Daily minimum '+formatDuration(p.daily_minimum_minutes)+' · day ends '+p.window_end:'Daily minimum and working hours';}
  case 'reminders':return settings.notify?.enabled?'On · '+(settings.notify.mode==='daily'?'daily':settings.notify.mode==='weekly'?'weekly':'as they happen')+(settings.notify.studyTime?' at '+settings.notify.studyTime:''):'Off';
  case 'subjects':return subjectCount+(subjectCount===1?' subject':' subjects');
  case 'data':return getMode()==='demo'?'Example workspace':'Export, sign out or delete';
 }
}
const icons:Record<Section,typeof Palette>={appearance:Palette,tutor:MessageCircle,study:MEANING_ICON.study,planning:CalendarClock,reminders:Bell,subjects:Shapes,data:Database};
const groups:Section[][]=[['appearance','tutor'],['study','planning','reminders'],['subjects','data']];

function ThemeCard({mode,selected,onSelect}:{mode:Mode;selected:boolean;onSelect:()=>void}){
 return <button type="button" role="radio" aria-checked={selected} className="v7-theme-card" onClick={onSelect}>
  <span className="v7-theme-preview" data-preview={mode} aria-hidden="true"><i/><i/><i/></span>
  <strong>{modeWord[mode]}</strong><small>{mode==='auto'?'Follows your device':mode==='day'?'Light paper':'Dark sky'}</small>
 </button>;
}
/** N157 · U4 S14 (flag v7Paper): one paper by day and one sky by night, kept on this device. */
function PaperChoice(){
 const [paper,setPaper]=useState<Paper>(readPaper),[sky,setSky]=useState<Sky>(readSky);
 const word=(value:string)=>value[0].toUpperCase()+value.slice(1);
 return <div className="v7-settings-card">
  <p className="v7-set-label">Paper</p>
  <div className="v7-tk-picker" role="radiogroup" aria-label="Paper by day">{PAPERS.map(item=><button key={item} type="button" role="radio" aria-checked={paper===item} className="v7-filter-chip" onClick={()=>{setPaper(item);choosePaper(item);}}>{word(item)}</button>)}</div>
  <p className="v7-set-label">Sky</p>
  <div className="v7-tk-picker" role="radiogroup" aria-label="Sky by night">{SKIES.map(item=><button key={item} type="button" role="radio" aria-checked={sky===item} className="v7-filter-chip" onClick={()=>{setSky(item);chooseSky(item);}}>{word(item)}</button>)}</div>
  <p className="v7-meta">Drawn at 7% ink, under your text. Off when Reduce effects is on.</p>
 </div>;
}
function Appearance({settings}:{settings:Settings}){
 const update=useUpdateSettings(),notify=useToast();
 const [mode,setMode]=useState<Mode>(()=>(settings.ui?.mode as Mode|undefined)??readAppearance().mode);
 const ui=settings.ui??{};
 async function save(patch:Partial<UiPreferences>){
  if(getMode()==='demo')return true;
  try{await update.mutateAsync({ui:{...ui,...patch}});return true;}catch{notify('Could not save settings.',{tone:'danger'});return false;}
 }
 async function choose(next:Mode){
  const previous=mode;setMode(next);applyAppearance({mode:next});
  if(!await save({mode:next})){setMode(previous);applyAppearance({mode:previous});}
 }
 const initial=(key:string,fallback:boolean)=>typeof ui[key]==='boolean'?ui[key] as boolean:fallback;
 const [flags,setFlags]=useState(()=>({reduceEffects:initial('reduceEffects',false),haptics:initial('haptics',true),chime:initial('chime',false),sounds:initial('sounds',false)}));
 const flag=(key:keyof typeof flags)=>flags[key];
 async function toggle(key:keyof typeof flags,value:boolean){
  setFlags(old=>({...old,[key]:value}));
  if(key==='reduceEffects')applyReduceEffects(value);
  if(key==='haptics')setHapticsEnabled(value);
  if(!await save({[key]:value})){setFlags(old=>({...old,[key]:!value}));if(key==='reduceEffects')applyReduceEffects(!value);if(key==='haptics')setHapticsEnabled(!value);}
 }
 return <div className="v7-settings-body">
  <div className="v7-theme-cards" role="radiogroup" aria-label="Theme">{(['auto','day','night'] as Mode[]).map(item=><ThemeCard key={item} mode={item} selected={mode===item} onSelect={()=>{void choose(item);}}/>)}</div>
  <div className="v7-settings-card">
   <Switch label="Reduce effects" checked={flag('reduceEffects')} onChange={value=>{void toggle('reduceEffects',value);}}/>
   <p className="v7-meta">No movement, blur or glow.</p>
   <Switch label="Haptics" checked={flag('haptics')} onChange={value=>{void toggle('haptics',value);}}/>
   <Switch label="Phase chime" checked={flag('chime')} onChange={value=>{void toggle('chime',value);}}/>
   <Switch label="Sounds" checked={flag('sounds')} onChange={value=>{void toggle('sounds',value);}}/>
   <p className="v7-meta">A pencil tick when you grade, a page turn when a round ends, a low chime when you close the day.</p>
  </div>
  {isFlagOn('v7Paper')&&<PaperChoice/>}
 </div>;
}
function SubjectSheet({subject,taken,current,onClose}:{subject:DataSubject;taken:Map<Subject,string>;current:Subject;onClose:()=>void}){
 const settings=useSettings(),update=useUpdateSettings(),edit=useUpdateSubject(),notify=useToast(),list=useSubjects();
 const [colour,setColour]=useState<Subject>(current),[glyph,setGlyph]=useState(subject.glyph),[busy,setBusy]=useState(false);
 async function save(){
  setBusy(true);
  try{
   if(glyph.trim()&&glyph.trim()!==subject.glyph)await edit.mutateAsync({id:subject.id,patch:{name:subject.name,glyph:glyph.trim()}});
   if(colour!==current){
    if(getMode()==='demo')chooseForSession(subject.id,colour,settings.data?.ui,list.data??[]);
    else await update.mutateAsync({ui:{...(settings.data?.ui??{}),subjectColours:{...chosenColours(settings.data?.ui),[subject.id]:colour}}});
   }
   notify('Subject saved',{tone:'success'});onClose();
  }catch{notify('Could not save the subject.',{tone:'danger'});}finally{setBusy(false);}
 }
 return <Sheet open onClose={onClose} title={subject.name} footer={<Button variant="primary" loading={busy} onClick={()=>{void save();}}>Save</Button>}>
  <div className={'v7-subject-preview '+subjectClass(colour)} aria-label="Preview"><Emblem subject={colour} seed={'subject-'+subject.id} size={96} animate={false}/><span className="v7-tag"><SubjectMark subject={colour}/><span>{subject.name}</span></span></div>
  <fieldset className="v7-subject-colours"><legend>Colour and emblem</legend>
   {kitSubjects.map(item=>{const owner=taken.get(item);const other=owner&&owner!==subject.id;
    return <button key={item} type="button" role="radio" aria-checked={colour===item} className={'v7-subject-swatch '+subjectClass(item)} onClick={()=>setColour(item)}
     aria-label={item+(other?' · taken':'')}><SubjectMark subject={item}/><span>{item}</span>{other&&<small>Taken</small>}</button>;})}
  </fieldset>
  <Field label="Glyph" value={glyph} maxLength={4} onChange={event=>setGlyph(event.target.value)}/>
 </Sheet>;
}
function Subjects({settings}:{settings:Settings}){
 const list=useSubjects(),[open,setOpen]=useState<DataSubject|null>(null);
 const picked=effectiveColours(settings.ui);
 const colourOf=(row:DataSubject)=>picked[row.id]??kitSubject(row.name);
 const taken=new Map<Subject,string>((list.data??[]).map(row=>[colourOf(row),row.id] as const));
 if(list.isPending)return <Skeleton/>;
 return <div className="v7-settings-body"><ul className="v7-settings-card v7-subject-rows">{(list.data??[]).map(row=><li key={row.id}>
  <button type="button" className={'v7-settings-row '+subjectClass(colourOf(row))} onClick={()=>setOpen(row)}>
   <span className="v7-subject-dot" aria-hidden="true"><SubjectMark subject={colourOf(row)}/></span>
   <span><strong>{row.name}</strong><small>{colourOf(row)+' · '+row.glyph}</small></span><ChevronRight aria-hidden="true"/></button></li>)}</ul>
  {open&&<SubjectSheet subject={open} taken={taken} current={colourOf(open)} onClose={()=>setOpen(null)}/>}
 </div>;
}
function Tutor({settings}:{settings:Settings}){
 const rotate=useRotateConnectorSecret(),notify=useToast(),[revealed,setRevealed]=useState(false);
 return <div className="v7-settings-body">
  <div className="v7-settings-card">
   <p className="v7-eyebrow">Connector address</p>
   <ConnectorAddress value={revealed?settings.connectorUrl:settings.connectorUrl.replace(/\/[^/]+$/,'/••••••')}/>
   <div className="v7-connector-actions">
    <Button small onClick={()=>setRevealed(value=>!value)}>{revealed?<EyeOff aria-hidden="true"/>:<Eye aria-hidden="true"/>}{revealed?'Hide':'Show'}</Button>
    <Button small onClick={()=>{void navigator.clipboard?.writeText(settings.connectorUrl).then(()=>notify('Copied',{tone:'success'})).catch(()=>notify('Could not copy',{tone:'danger'}));}}><Copy aria-hidden="true"/>Copy</Button>
    <Button small loading={rotate.isPending} onClick={()=>{void rotate.mutateAsync().then(()=>notify('New address created; reconnect your tutor',{tone:'success'})).catch(()=>notify('Could not rotate the address',{tone:'danger'}));}}><RefreshCw aria-hidden="true"/>New address</Button>
   </div>
  </div>
  <Legacy><StudyDefaults settings={settings} part="tutor"/></Legacy>
 </div>;
}
/** The existing section forms, on v7 surfaces, until each is rebuilt with v7 fields. */
function Legacy({children}:{children:ReactNode}){return <div className="v7-settings-card v7-settings-legacy">{children}</div>;}

/** PLAN §6.14 Settings: grouped index rows with the current value; Appearance and Subjects rebuilt; the other sections keep
 *  their forms on v7 pages with their `?section=` links. */
export default function SettingsV7(){
 const [params]=useSearchParams(),navigate=useNavigate(),settings=useSettings(),subjects=useSubjects(),signOut=useSignOut();
 const section=sectionOf(params.get('section'));
 const mode=((settings.data?.ui?.mode as Mode|undefined)??readAppearance().mode);
 const systemNight=typeof matchMedia!=='undefined'&&matchMedia('(prefers-color-scheme: dark)').matches;
 // N157 · U1: from 840 px the index stays on the left and the section opens on the right (the first one when none is chosen).
 const split=useMinWidth(840);
 const data=settings.data;
 const index=(current:Section|null)=><>
  {settings.isPending&&<Skeleton/>}
  {settings.isError&&<div role="alert" className="v7-progress-error"><p>Erratum: your settings didn’t load. Try again.</p><Button onClick={()=>{void settings.refetch();}}>Retry</Button></div>}
  {settings.data&&groups.map((group,index)=><ul key={index} className="v7-settings-card">{group.map(item=>{const Icon=icons[item];return <li key={item}>
   <Link className="v7-settings-row" to={'/settings?section='+item} aria-current={item===current?'page':undefined}><span className="v7-settings-icon" aria-hidden="true"><Icon/></span>
    <span><strong>{sectionTitle[item]}</strong><small>{settingsSummary(item,settings.data,subjects.data?.length??0,mode,systemNight)}</small></span><ChevronRight aria-hidden="true"/></Link></li>;})}</ul>)}
 </>;
 const content=(section:Section)=>!data?<Skeleton/>:<>
  {section==='appearance'&&<Appearance settings={data}/>}
  {section==='subjects'&&<Subjects settings={data}/>}
  {section==='tutor'&&<Tutor settings={data}/>}
  {section==='study'&&(params.get('advanced')==='1'
   ?<div className="v7-settings-body"><h2 className="v7-subhead">Advanced</h2><Legacy><StudyDefaults settings={data} part="study"/></Legacy><Legacy><Focus settings={data}/></Legacy><Legacy><Activities/></Legacy></div>
   :<StudyLists settings={data} onAdvanced={()=>navigate('/settings?section=study&advanced=1')}/>)}
  {section==='planning'&&<PlanningLists settings={data}/>}
  {section==='reminders'&&<ReminderLists settings={data}/>}
  {section==='data'&&<>
   <DataAccount demo={getMode()==='demo'} signingOut={signOut.isPending} onSignOut={()=>{void signOut.mutateAsync().then(()=>navigate('/sign-in'));}}/>
   {isNative()&&<div className="v7-settings-body"><Suspense fallback={null}><PhoneAbout/></Suspense></div>}
  </>}
 </>;
 if(split){
  const shown=section??groups[0][0];
  return <main id="main-content" className="v7-page v7-settings" data-split="" aria-label="Settings">
   <HubHeader title="Settings"/>
   <div className="v7-settings-split">
    <nav className="v7-settings-index" aria-label="Settings sections">{index(shown)}</nav>
    <section className="v7-settings-pane" aria-labelledby="v7-settings-pane-title">
     <h2 id="v7-settings-pane-title" className="v7-settings-pane-title">{sectionTitle[shown]}</h2>
     {content(shown)}
    </section>
   </div>
  </main>;
 }
 if(!section)return <main id="main-content" className="v7-page v7-settings" aria-label="Settings">
  <HubHeader title="Settings"/>
  {index(null)}
 </main>;
 return <main id="main-content" className="v7-page v7-settings" aria-label={sectionTitle[section]}>
  <DetailHeader title={sectionTitle[section]} back="/settings"/>
  <h1 className="v7-learn-title">{sectionTitle[section]}</h1>
  {content(section)}
 </main>;
}
