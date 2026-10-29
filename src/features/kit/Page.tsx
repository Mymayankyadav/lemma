import {useState} from 'react';
import {ArrowRight,BookOpen,Check as Tick,Lightbulb,Play,Plus,Settings,Sparkles} from 'lucide-react';
import {Screen} from '../../ui/Screen';
import {Slab} from '../../ui/Slab';
import {Tile} from '../../ui/Tile';
import {Card} from '../../ui/Card';
import {Glass} from '../../ui/Glass';
import {Button} from '../../ui/Button';
import {IconButton} from '../../ui/IconButton';
import {Orb} from '../../ui/Orb';
import {Chip} from '../../ui/Chip';
import {Segmented} from '../../ui/Segmented';
import {Switch} from '../../ui/Switch';
import {Check} from '../../ui/Check';
import {Rail} from '../../ui/Rail';
import {SegmentBar} from '../../ui/SegmentBar';
import {StepRing} from '../../ui/StepRing';
import {ProgressRing} from '../../ui/ProgressRing';
import {StatusNode} from '../../ui/StatusNode';
import {Glyph} from '../../ui/Glyph';
import {MathText} from '../../ui/MathText';
import {Sheet} from '../../ui/Sheet';
import {Skeleton} from '../../ui/Skeleton';
import {KeyHints} from '../../ui/KeyHints';
import {useToast} from '../../ui/Toast';
const statuses=['done','revisit','now','next','locked','proposed'] as const;
const keys=[{key:'Space',label:'Reveal'},{key:'1',label:'Again'},{key:'4',label:'Easy'}];
function Section({title,children}:{title:string;children:React.ReactNode}){
 return <section aria-label={title} className="flex flex-col gap-4"><h2 className="text-[19px] font-semibold">{title}</h2>{children}</section>;
}
export default function Page(){
 const [mode,setMode]=useState('study'),[switchOn,setSwitchOn]=useState(true),[checked,setChecked]=useState(true),[mixed,setMixed]=useState<boolean|'mixed'>('mixed'),[sheetOpen,setSheetOpen]=useState(false);
 const notify=useToast();
 return <Screen title="Component kit" back="/" className="pb-12">
 <p className="font-math text-[17px] italic text-ink-2">Amber on Obsidian · The study interface</p>
 <Section title="Surfaces">
  <Slab lamp><p className="text-[12px] text-ink-3">Slab · soft sheen and lamp</p><h3 className="mt-3 text-[24px] font-semibold">Compactness</h3><p className="mt-1 font-math text-ink-soft">Every open cover has a finite subcover.</p></Slab>
  <div className="grid grid-cols-2 gap-3"><Tile>Tile<br/><span className="text-[12px] text-ink-3">Quiet depth</span></Tile><Glass className="rounded-slab p-4">Glass<br/><span className="text-[12px] text-ink-3">Frosted surface</span></Glass></div>
  <Card stack><p className="mb-2 text-[12px] text-ink-3">Card · stacked</p><MathText source="If $K\\subseteq\\mathbb{R}^n$ is compact, what can be said about every open cover?" variant="card"/></Card>
  <Card><span className="text-[12px] text-ink-3">Card · single</span></Card>
 </Section>
 <Section title="Buttons and controls">
  <div className="flex flex-wrap gap-3"><Button size="m" icon={Play} onClick={()=>notify('Ready to study',{tone:'success'})}>Start</Button><Button variant="ghost">Secondary</Button><Button variant="danger">Reject</Button><Button variant="text" icon={ArrowRight}>Details</Button></div>
  <div className="flex flex-wrap items-center gap-3"><Button loading>Saving</Button><Button disabled>Disabled</Button><IconButton icon={Settings} label="Settings" to="/settings"/><IconButton icon={Sparkles} label="Notifications" badge="dot" tone="amber"/><IconButton icon={BookOpen} label="Reading" tone="plain"/></div>
  <div className="flex items-center gap-5"><Orb icon={Play} label="Start studying" size={76} onClick={()=>notify('Study session started')}/><Orb icon={Tick} label="Approve" size={64} halo={false}/></div>
  <div className="flex flex-wrap gap-2">{(['quiet','amber','success','danger'] as const).map(t=><Chip key={t} tone={t}>{t}</Chip>)}<Chip tone="amber" selected icon={Plus}>Selected</Chip></div>
  <Segmented value={mode} onChange={setMode} tone="raised" options={[{value:'study',label:'Study',count:4},{value:'review',label:'Review',count:23}]}/>
  <Segmented value={mode} onChange={setMode} tone="amber" options={[{value:'study',label:'Study'},{value:'review',label:'Review'}]}/>
  <Switch label="Mix decks" checked={switchOn} onChange={setSwitchOn}/>
  <Switch label="Off switch" checked={false} onChange={()=>{}}/>
  <div className="flex gap-4"><Check label="Include Algebra" checked={checked} onChange={setChecked}/><Check label="Mixed" checked={mixed} onChange={setMixed}/></div>
 </Section>
 <Section title="Progress and learning state">
  <Rail value={0.67} sheen label="Project progress"/><Rail value={0.18} label="Short progress"/><Rail value={0} label="Empty progress"/>
  <SegmentBar total={8} done={3} current={4}/>
  <div className="flex items-center justify-around"><StepRing steps={4} current={2} spark/><ProgressRing value={0.75} label="Course progress"/><ProgressRing value={0} label="Not started"/></div>
  <div className="flex flex-wrap items-center gap-4">{statuses.map(status=><div key={status} className="flex flex-col items-center gap-2"><StatusNode status={status}/><span className="text-[11px] text-ink-3">{status}</span></div>)}</div>
  <div className="flex gap-3"><Glyph subject="∫" active/><Glyph subject="τ" hue="violet"/><Glyph subject="λ" hue="cyan" size={32}/><Glyph subject="∂" hue="rose" size={48}/></div>
 </Section>
 <Section title="Mathematical text">
  <MathText source="Prove $\\int_0^1 x^2\\,dx=\\frac13$." variant="card"/>
  <MathText source="For $K\\subseteq\\mathbb{R}^n$, compactness is equivalent to **closed and bounded**." variant="answer"/>
  <MathText source="The key observation is $\\varepsilon>0$." variant="body"/>
  <MathText source="A set is {{c1::compact}} if every open cover has a finite subcover." cloze={{ord:1,revealed:false}}/>
  <MathText source="A set is {{c1::compact}} if every open cover has a finite subcover." cloze={{ord:1,revealed:true}}/>
 </Section>
 <Section title="Layers, feedback and loading">
  <Button variant="ghost" onClick={()=>setSheetOpen(true)}>Open bottom sheet</Button>
  <Button variant="ghost" onClick={()=>notify('Prompt copied',{action:{label:'Undo',onClick:()=>notify('Undone')}})}>Show toast with action</Button>
  <Button variant="ghost" onClick={()=>notify('Could not save',{tone:'danger'})}>Danger toast</Button>
  <div className="flex flex-col gap-2"><Skeleton w="80%" h={18}/><Skeleton w="55%" h={18}/></div>
  <KeyHints items={keys}/>
 </Section>
 <Sheet open={sheetOpen} onClose={()=>setSheetOpen(false)} title="Checkpoint details"><div className="flex flex-col gap-5"><MathText source="Why does a finite subcover exist?" variant="card"/><Button onClick={()=>setSheetOpen(false)} icon={Lightbulb}>Got it</Button></div></Sheet>
 </Screen>;
}
