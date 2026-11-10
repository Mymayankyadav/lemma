import {useState,type KeyboardEvent,type ReactNode} from 'react';
import {useNavigate,useSearchParams} from 'react-router';
import {Copy,Eye,EyeOff,RefreshCw} from 'lucide-react';
import type {UiPreferences} from '../../../data/types';
import {useRotateConnectorSecret,useSettings,useSignOut,useUpdateSettings} from '../../../data/hooks';
import {getMode} from '../../../data/mode';
import {Button} from '../../../ui/Button';
import {Screen} from '../../../ui/Screen';
import {Slab} from '../../../ui/Slab';
import {Sheet} from '../../../ui/Sheet';
import {useToast} from '../../../ui/Toast';
import {EuclidAppearance} from '../EuclidAppearance';
import {SubjectsPanel} from '../SubjectsPanel';
import {ConnectorAddress} from '../ConnectorAddress';
import StudyDefaults from './StudyDefaults';
import Activities from './Activities';
import Planning from './Planning';
import Focus from './Focus';
import Reminders from './Reminders';
import ExportSettings from './Export';
import DeleteAccount from './DeleteAccount';

/** N28.1 navigation; N28.2.1 adds the dedicated Study defaults panel. */
export const SETTINGS_SECTIONS = [
  {id:'account',label:'Account'},
  {id:'appearance',label:'Appearance'},
  {id:'study',label:'Study defaults'},
  {id:'reminders',label:'Reminders'},
  {id:'subjects',label:'Subjects'},
  {id:'connector',label:'Connector'},
  {id:'export',label:'Export'},
] as const;
const ACTIVITY_SECTION={id:'activities',label:'Activities'} as const;
const V6_SETTINGS_SECTIONS=[
 ...SETTINGS_SECTIONS.slice(0,3),ACTIVITY_SECTION,
 {id:'focus',label:'Focus'},{id:'planning',label:'Planning'},
 ...SETTINGS_SECTIONS.slice(3),{id:'tutor',label:'Teaching style'},
] as const;
/** N117 (mockup `10__Page`): Settings opens on four grouped rows; each opens a section page. */
/** N121 F9: a group page shows only its own sections. */
export const SETTINGS_GROUPS=[
  {id:'appearance',title:'Appearance',description:'Day, Night and reading comfort',first:'appearance',sections:['appearance']},
  {id:'tutor',title:'Tutor',description:'Connection, prompts and teaching style',first:'connector',sections:['connector','tutor']},
  {id:'study',title:'Study & review',description:'Planning, sessions and memory preferences',first:'study',sections:['study','activities','focus','planning','reminders']},
  {id:'data',title:'Data & account',description:'Subjects, shortcuts, backup and sign out',first:'account',sections:['account','subjects','export']},
] as const;
export type SettingsSection = typeof SETTINGS_SECTIONS[number]['id']|'activities'|'focus'|'planning'|'tutor';
export function settingsGroupOf(section:string){return SETTINGS_GROUPS.find(group=>(group.sections as readonly string[]).includes(section))??null;}

export function settingsTabDestination(current:SettingsSection,key:string,
 sections:readonly {id:SettingsSection}[]=SETTINGS_SECTIONS):SettingsSection|null {
  const index=sections.findIndex(section=>section.id===current);
  if(key==='Home')return sections[0].id;
  if(key==='End')return sections[sections.length-1].id;
  if(key==='ArrowRight'||key==='ArrowDown')return sections[(index+1)%sections.length].id;
  if(key==='ArrowLeft'||key==='ArrowUp')return sections[(index+sections.length-1)%sections.length].id;
  return null;
}
export function SettingsNavigation({selected,onSelect,only}:{
  selected:SettingsSection;
  onSelect:(section:SettingsSection)=>void;
  only?:readonly string[];
}) {
  const shown=V6_SETTINGS_SECTIONS.filter(section=>!only||only.includes(section.id));
  const keyDown=(event:KeyboardEvent<HTMLButtonElement>,current:SettingsSection)=>{
    const next=settingsTabDestination(current,event.key,shown);
    if(next===null)return;
    event.preventDefault();
    onSelect(next);
    event.currentTarget.parentElement?.querySelector<HTMLButtonElement>('#v6-settings-tab-'+next)?.focus();
  };
  return <nav aria-label="Settings sections">
    <div role="tablist" aria-label="Settings sections" className="flex flex-wrap gap-2">
      {shown.map(section=><button key={section.id} type="button"
        id={'v6-settings-tab-'+section.id} role="tab"
        aria-controls="v6-settings-panel" aria-selected={selected===section.id}
        tabIndex={selected===section.id?0:-1}
        onClick={()=>onSelect(section.id)}
        onKeyDown={event=>keyDown(event,section.id)}
        className={'min-h-11 rounded-ctl border px-3 py-2 text-label font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber '+
          (selected===section.id?'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]':'border-[var(--control-edge)] bg-[var(--paper)] text-ink-2 hover:bg-[var(--paper-2)]')}>
        {section.label}
      </button>)}
    </div>
  </nav>;
}
export default function V6Settings({legacy}: {legacy:ReactNode}) {
  // N121 F9: the group and section live in the URL (?group=…&section=…), so deep links work
  // and the header Back returns to the index; opening Settings from navigation shows the index.
  const [params,setParams]=useSearchParams();
  const requested=params.get('section');
  const group=SETTINGS_GROUPS.find(item=>item.id===params.get('group'))??(requested?settingsGroupOf(requested):null);
  const selected:SettingsSection=(group&&requested&&(group.sections as readonly string[]).includes(requested)?requested:group?.first??'account') as SettingsSection;
  const setSelected=(section:SettingsSection)=>{
    const owner=settingsGroupOf(section)??group;
    const next=new URLSearchParams(params);
    if(owner)next.set('group',owner.id);
    next.set('section',section);
    setParams(next,{replace:true});
  };
  const openGroup=(item:typeof SETTINGS_GROUPS[number])=>{
    const next=new URLSearchParams(params);
    next.set('group',item.id);next.set('section',item.first);
    setParams(next);
  };
  const [revealed,setRevealed]=useState(false);
  const [rotating,setRotating]=useState(false);
  const [setup,setSetup]=useState(false);
  const settings=useSettings();
  const update=useUpdateSettings();
  const rotate=useRotateConnectorSecret();
  const signOut=useSignOut();
  const navigate=useNavigate();
  const toast=useToast();
  const data=settings.data;
  const busy=update.isPending;

  const save=async(patch:{ui:Partial<UiPreferences>})=>{
    try {
      await update.mutateAsync(patch);
      toast('Saved',{tone:'success'});
      return true;
    } catch {
      toast("Couldn't save settings.",{tone:'danger'});
      return false;
    }
  };
  const copy=async()=>{
    if(!data)return;
    try {
      await navigator.clipboard.writeText(data.connectorUrl);
      toast('Copied');
    } catch {
      toast("Couldn't copy. Try again.",{tone:'danger'});
    }
  };
  const content=()=>{
    if(selected==='account')return <Slab className="space-y-4 p-5">
      <h2 className="text-title-s font-semibold">Account</h2>
      <p className="text-body text-ink-2">{getMode()==='demo'?'Demo data':'Your study record'}</p>
      <p className="text-label text-ink-3">Your account controls and data remain private to your study record.</p>
      <button type="button" data-sign-out="true" disabled={signOut.isPending}
        className="min-h-11 text-body font-semibold text-[var(--danger)] underline-offset-4 hover:underline"
        onClick={async()=>{
          try {
            await signOut.mutateAsync();
            if(getMode()!=='demo')void navigate('/sign-in');
          } catch {
            toast("Couldn't sign out.",{tone:'danger'});
          }
        }}>Sign out</button>
      <DeleteAccount onExport={()=>setSelected('export')}/>
    </Slab>;
    if(selected==='appearance')return <Slab className="p-5">
      <EuclidAppearance ui={data?.ui} busy={busy} onChange={ui=>save({ui})}/>
    </Slab>;
    if(selected==='study')return <StudyDefaults settings={data!} part="study"/>;
    if(selected==='tutor')return <StudyDefaults settings={data!} part="tutor"/>;
    if(selected==='activities')return <Activities/>;
    if(selected==='focus')return <Focus settings={data!}/>;
    if(selected==='planning')return <Planning settings={data!}/>;
    if(selected==='subjects')return <SubjectsPanel/>;
    if(selected==='connector')return <Slab className="space-y-4 p-5">
      <h2 className="text-title-s font-semibold">Connector</h2>
      <p className="text-label text-ink-2">{data?.connectorLastSeenAt?'Connected':'Not connected yet'}</p>
      {data?.connectorLastClient&&<p className="text-label text-ink-2">Last app: {data.connectorLastClient==='claude'?'Claude':data.connectorLastClient==='chatgpt'?'ChatGPT':'Your tutor app'}</p>}
      <div className="flex min-w-0 items-center gap-1 rounded-ctl bg-well p-2">
        <ConnectorAddress value={revealed?data?.connectorUrl??'':data?.connectorUrl.replace(/\/[^/]+$/,'/••••••')??''}/>
        <button type="button" aria-label={revealed?'Hide connector address':'Show connector address'}
          onClick={()=>setRevealed(value=>!value)}
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-ctl border border-edge">
          {revealed?<EyeOff size={18}/>:<Eye size={18}/>}
        </button>
        <button type="button" aria-label="Copy connector address"
          onClick={()=>void copy()}
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-ctl border border-edge">
          <Copy size={18}/>
        </button>
      </div>
      <button type="button" onClick={()=>setRotating(true)}
        className="min-h-11 rounded-ctl border border-edge px-4 text-label font-semibold">
        Make a new address
      </button>
      <div className="border-t border-edge pt-4">
        <p className="text-label font-semibold">Apps</p>
        <button type="button" onClick={()=>setSetup(value=>!value)}
          aria-expanded={setup} className="min-h-11 text-label text-ink-2 underline">{data?.connectorLastClient==='claude'?'Set up ChatGPT too':'ChatGPT setup'}</button>
        {setup&&<ol className="list-decimal space-y-2 pl-6 text-label text-ink-2">
          <li>In ChatGPT Settings open Apps, then Advanced settings, and enable Developer mode.</li>
          <li>Create an app using this connector address and choose No authentication.</li>
          <li>In a new chat, enable Lemma from the + menu and confirm writes when prompted.</li>
        </ol>}
      </div>
      <Sheet open={rotating} onClose={()=>setRotating(false)} title="Make a new address?" footer={<>
          <Button variant="ghost" onClick={()=>setRotating(false)}>Cancel</Button>
          <Button disabled={rotate.isPending} icon={RefreshCw} onClick={async()=>{
            try {
              await rotate.mutateAsync();
              setRevealed(false);
              setRotating(false);
              toast('New address created');
            } catch {
              toast("Couldn't create a new address.",{tone:'danger'});
            }
          }}>Make new</Button>
        </>}>
        <p className="mb-5 text-ink-2">The old address stops working in Claude and ChatGPT.</p>
      </Sheet>
    </Slab>;
    if(selected==='reminders')return <>
      <Reminders prefs={data?.notify} timeZone={data?.timeZone??'UTC'}/>
      {/* Preserve the N28.1 legacy controls only for an unconfigured account.
          The dedicated Reminders panel always appears first and edits prefs. */}
      {data?.notify==null&&<details className="mt-3 rounded-ctl border border-edge p-3 text-label">
        <summary className="min-h-11 cursor-pointer font-semibold">Other existing settings</summary>
        {legacy}
      </details>}
    </>;
    if(selected==='export')return <ExportSettings/>;
    return null;
  };
  if(!group)return <Screen title="Settings" back="/" className="pb-8 !gap-0">
    <nav aria-label="Settings groups" className="flex flex-col">
      {SETTINGS_GROUPS.map(item=><button key={item.id} type="button" className="lemma-settings-link"
        aria-label={item.title} aria-describedby={'v6-settings-group-'+item.id}
        onClick={()=>openGroup(item)}>
        <strong>{item.title}</strong>
        <span id={'v6-settings-group-'+item.id}>{item.description}</span>
        <span aria-hidden="true">›</span>
      </button>)}
    </nav>
    <p className="notebook-example-note">Lemma · {getMode()==='demo'?'Example workspace':'Your study record'}</p>
  </Screen>;
  return <Screen title="Settings" back="/" className="pb-8">
    <div className="lemma-settings-page">
      <h2>{group.title}</h2>
      {group.sections.length>1&&<SettingsNavigation selected={selected} onSelect={setSelected} only={group.sections}/>}
    {settings.isLoading?<div role="status" className="rounded-slab border border-edge p-5 text-ink-2">
      Loading settings…
    </div>:
    settings.isError||!data?<div role="alert" className="space-y-3 rounded-slab border border-edge p-5">
      <p>Settings could not be loaded.</p>
      <Button variant="ghost" onClick={()=>void settings.refetch()}>Try again</Button>
    </div>:
    <section role="tabpanel" id="v6-settings-panel"
      aria-labelledby={'v6-settings-tab-'+selected} className="min-w-0">
      {content()}
    </section>}
    </div>
  </Screen>;
}
