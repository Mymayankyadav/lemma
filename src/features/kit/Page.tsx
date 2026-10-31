import {CompassArt} from '../../ui/art/CompassArt';
import {CardFanArt} from '../../ui/art/CardFanArt';
import {PlugArt} from '../../ui/art/PlugArt';
import {PageStackArt} from '../../ui/art/PageStackArt';
import {DoneBurst} from '../../ui/art/DoneBurst';
import {Starfield} from '../../ui/art/Starfield';
import {EmptyState} from '../../ui/EmptyState';
import {LineArea} from '../../ui/charts/LineArea';
import {StackedBars} from '../../ui/charts/StackedBars';
import {HBars} from '../../ui/charts/HBars';
import {GroupedBars} from '../../ui/charts/GroupedBars';
import {Sparkline} from '../../ui/charts/Sparkline';
import {CalibrationBars} from '../../ui/charts/CalibrationBars';
import {useState} from 'react';
import {ArrowRight,BookOpen,Check as Tick,Lightbulb,Play,Plus,Settings,Sparkles} from 'lucide-react';
import {Screen} from '../../ui/Screen';
import {SectionHeading} from '../../ui/SectionHeading';
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
 return <section aria-label={title} className="flex flex-col gap-4"><SectionHeading>{title}</SectionHeading>{children}</section>;
}
export default function Page(){
 const [mode,setMode]=useState('study'),[switchOn,setSwitchOn]=useState(true),[checked,setChecked]=useState(true),[mixed,setMixed]=useState<boolean|'mixed'>('mixed'),[sheetOpen,setSheetOpen]=useState(false);
 const notify=useToast();
 return <Screen title="Component kit" back="/" className="pb-12">
 <p className="font-math text-answer italic text-ink-2">Amber on Obsidian · The study interface</p>
 <Section title="Surfaces">
  <Slab lamp><p className="text-label text-ink-3">Slab · soft sheen and lamp</p><h3 className="mt-3 text-title-s font-semibold">Compactness</h3><p className="mt-1 font-math text-ink-soft">Every open cover has a finite subcover.</p></Slab>
  <div className="grid grid-cols-2 gap-3"><Tile>Tile<br/><span className="text-label text-ink-3">Quiet depth</span></Tile><Glass className="rounded-slab p-4">Glass<br/><span className="text-label text-ink-3">Frosted surface</span></Glass></div>
  <Card stack><p className="mb-2 text-label text-ink-3">Card · stacked</p><MathText source={"If $K\\subseteq\\mathbb{R}^n$ is compact, what can be said about every open cover?"} variant="card"/></Card>
  <Card><span className="text-label text-ink-3">Card · single</span></Card>
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
  <div className="flex items-center justify-around"><SegmentBar total={4} done={1} current={2}/><ProgressRing value={0.75} label="Course progress"/><ProgressRing value={0} label="Not started"/></div>
  <div className="flex flex-wrap items-center gap-4">{statuses.map(status=><div key={status} className="flex flex-col items-center gap-2"><StatusNode status={status}/><span className="text-caption text-ink-3">{status}</span></div>)}</div>
  <div className="flex gap-3"><Glyph subject="∫" active/><Glyph subject="τ" hue="violet"/><Glyph subject="λ" hue="cyan" size={32}/><Glyph subject="∂" hue="rose" size={48}/></div>
 </Section>
 <Section title="Mathematical text">
  <MathText source={"Prove $\\int_0^1 x^2\\,dx=\\frac13$."} variant="card"/>
  <MathText source={"For $K\\subseteq\\mathbb{R}^n$, compactness is equivalent to **closed and bounded**."} variant="answer"/>
  <MathText source={"The key observation is $\\varepsilon>0$."} variant="body"/>
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
 <Section title="Illustrations and empty states">
  <div className="grid grid-cols-3 gap-2">
  <CompassArt size={105}/><CardFanArt size={105}/><PageStackArt size={105}/>
  <PlugArt connected size={105}/><PlugArt connected={false} size={105}/><DoneBurst size={105}/>
  </div>
  <div className="relative h-32 overflow-hidden rounded-slab bg-obsidian-deep"><Starfield/><span className="absolute bottom-3 left-3 text-label text-ink-2">Starfield</span></div>
  <div className="grid grid-cols-2 gap-3">
  {(['compass','deck','plug','inbox'] as const).map(art=><Tile key={art} className="min-h-[160px]"><EmptyState art={art} title={art==='deck'?'Nothing due':art==='plug'?'Offline':art==='inbox'?'All clear':'No projects'} body="A calm place to continue." className="gap-1 py-0 [&_svg]:h-20 [&_svg]:w-20"/></Tile>)}
  </div>
 </Section>
 <Section title="Analytical charts">
  <Slab><h3 className="mb-2 text-body-l font-semibold">Recall · 30 days</h3><LineArea data={[{label:'30d ago',value:0.84},{label:'',value:0.9},{label:'',value:0.89},{label:'',value:0.94},{label:'Today',value:0.92}]} target={0.9}/></Slab>
  <Slab><h3 className="mb-2 text-body-l font-semibold">Reviews by day</h3><StackedBars data={[{label:'M',again:2,hard:4,good:12,easy:3},{label:'T',again:1,hard:3,good:10,easy:8},{label:'W',again:3,hard:1,good:15,easy:5},{label:'T',again:0,hard:2,good:13,easy:9},{label:'F',again:2,hard:3,good:8,easy:2},{label:'S',again:1,hard:2,good:12,easy:6},{label:'S',again:1,hard:3,good:9,easy:5}]}/></Slab>
  <Slab><h3 className="mb-2 text-body-l font-semibold">When you said</h3><CalibrationBars data={[{confidence:'sure',total:20,right:19,rate:0.95},{confidence:'unsure',total:14,right:9,rate:9/14},{confidence:'guess',total:6,right:2,rate:1/3}]}/></Slab>
  <Slab><h3 className="mb-2 text-body-l font-semibold">Time by subject</h3><HBars data={[{label:'Analysis',glyph:'∫',value:560,display:'9h 20m'},{label:'Algebra',glyph:'λ',value:365,display:'6h 5m'},{label:'Topology',glyph:'τ',value:195,display:'3h 15m'}]}/></Slab>
  <Slab><h3 className="mb-2 text-body-l font-semibold">Checkpoints</h3><GroupedBars data={[{label:'W1',demonstrated:3,rechecked:2},{label:'W2',demonstrated:2,rechecked:5},{label:'W3',demonstrated:5,rechecked:3},{label:'Now',demonstrated:4,rechecked:6}]}/></Slab>
  <Slab><h3 className="mb-2 text-body-l font-semibold">Card interval history</h3><Sparkline data={[{value:1,rating:3},{value:4,rating:4},{value:10,rating:3},{value:26,rating:2},{value:54,rating:4}]}/></Slab>
 </Section>
 <Sheet open={sheetOpen} onClose={()=>setSheetOpen(false)} title="Checkpoint details"><div className="flex flex-col gap-5"><MathText source="Why does a finite subcover exist?" variant="card"/><Button onClick={()=>setSheetOpen(false)} icon={Lightbulb}>Got it</Button></div></Sheet>
 </Screen>;
}
