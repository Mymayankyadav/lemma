import {useState,type KeyboardEvent,type ReactNode} from 'react';
import {useNavigate} from 'react-router';
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

/** N28.1: stable navigation for seven settings destinations. Later panels
 * temporarily preserve the complete, existing settings controls. */
export const SETTINGS_SECTIONS = [
  {id:'account',label:'Account'},
  {id:'appearance',label:'Appearance'},
  {id:'study',label:'Study defaults'},
  {id:'reminders',label:'Reminders'},
  {id:'subjects',label:'Subjects'},
  {id:'connector',label:'Connector'},
  {id:'export',label:'Export'},
] as const;
export type SettingsSection = typeof SETTINGS_SECTIONS[number]['id'];

export function settingsTabDestination(current:SettingsSection,key:string):SettingsSection|null {
  const index=SETTINGS_SECTIONS.findIndex(section=>section.id===current);
  if(key==='Home')return SETTINGS_SECTIONS[0].id;
  if(key==='End')return SETTINGS_SECTIONS[SETTINGS_SECTIONS.length-1].id;
  if(key==='ArrowRight'||key==='ArrowDown')return SETTINGS_SECTIONS[(index+1)%SETTINGS_SECTIONS.length].id;
  if(key==='ArrowLeft'||key==='ArrowUp')return SETTINGS_SECTIONS[(index+SETTINGS_SECTIONS.length-1)%SETTINGS_SECTIONS.length].id;
  return null;
}
export function SettingsNavigation({selected,onSelect}:{
  selected:SettingsSection;
  onSelect:(section:SettingsSection)=>void;
}) {
  const keyDown=(event:KeyboardEvent<HTMLButtonElement>,current:SettingsSection)=>{
    const next=settingsTabDestination(current,event.key);
    if(next===null)return;
    event.preventDefault();
    onSelect(next);
    event.currentTarget.parentElement?.querySelector<HTMLButtonElement>('#v6-settings-tab-'+next)?.focus();
  };
  return <nav aria-label="Settings sections">
    <div role="tablist" aria-label="Settings sections" className="flex flex-wrap gap-2">
      {SETTINGS_SECTIONS.map(section=><button key={section.id} type="button"
        id={'v6-settings-tab-'+section.id} role="tab"
        aria-controls="v6-settings-panel" aria-selected={selected===section.id}
        tabIndex={selected===section.id?0:-1}
        onClick={()=>onSelect(section.id)}
        onKeyDown={event=>keyDown(event,section.id)}
        className={'min-h-11 rounded-ctl border px-3 py-2 text-label font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber '+
          (selected===section.id?'border-amber bg-amber-tint text-ink':'border-edge bg-[var(--paper)] text-ink-2 hover:bg-fill-1')}>
        {section.label}
      </button>)}
    </div>
  </nav>;
}
export default function V6Settings({legacy}: {legacy:ReactNode}) {
  const [selected,setSelected]=useState<SettingsSection>('account');
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
    </Slab>;
    if(selected==='appearance')return <Slab className="p-5">
      <EuclidAppearance ui={data?.ui} busy={busy} onChange={ui=>save({ui})}/>
    </Slab>;
    if(selected==='subjects')return <SubjectsPanel/>;
    if(selected==='connector')return <Slab className="space-y-4 p-5">
      <h2 className="text-title-s font-semibold">Connector</h2>
      <p className="text-label text-ink-2">{data?.connectorLastSeenAt?'Connected':'Not connected yet'}</p>
      {data?.connectorLastClient&&<p className="text-label text-ink-2">Last app: {data.connectorLastClient}</p>}
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
          aria-expanded={setup} className="min-h-11 text-label text-ink-2 underline">ChatGPT setup</button>
        {setup&&<ol className="list-decimal space-y-2 pl-6 text-label text-ink-2">
          <li>In ChatGPT Settings open Apps, then Advanced settings, and enable Developer mode.</li>
          <li>Create an app using this connector address and choose No authentication.</li>
          <li>In a new chat, enable Lemma from the + menu and confirm writes when prompted.</li>
        </ol>}
      </div>
      <Sheet open={rotating} onClose={()=>setRotating(false)} title="Make a new address?">
        <p className="mb-5 text-ink-2">The old address stops working in Claude and ChatGPT.</p>
        <div className="grid grid-cols-2 gap-3">
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
        </div>
      </Sheet>
    </Slab>;
    // N28.2 ports these controls into dedicated v6 sections. Until then, show
    // the actual existing Settings page so autosave, reminders, tuning and
    // export remain available rather than rendering fake or dead controls.
    return <div className="space-y-3">
      <p className="text-label text-ink-2">
        These settings retain their existing controls while the new sections are completed.
      </p>
      {legacy}
    </div>;
  };
  return <Screen title="Settings" back="/" className="pb-8">
    <SettingsNavigation selected={selected} onSelect={setSelected}/>
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
  </Screen>;
}
