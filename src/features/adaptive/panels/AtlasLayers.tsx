import {Link} from 'react-router';
import {GitFork,Milestone,Network} from 'lucide-react';
import {Chip,Sheet,Switch} from '../../../ui/v7/components';
import {Disclosure} from '../../../ui/v7/Disclosure';
import {KINDS} from '../../../../supabase/functions/_shared/adaptive/kc';
import type {AtlasReadModel} from '../../../../supabase/functions/_shared/adaptive/atlas';
import type {AtlasFilter} from '../../atlas/v7/filters';
import type {ReactNode} from 'react';

export type AtlasLayer = 'map' | 'themes' | 'bridges';

function approvedBridges(model?: AtlasReadModel) {
  if (!model) return [];
  const pairs = new Set(model.links.filter(link => link.status === 'approved' &&
    (link.kind === 'analogous' || link.kind === 'instance_of')).map(link => link.from_id + '/' + link.to_id));
  return model.bridges.filter(bridge => pairs.delete(bridge.from + '/' + bridge.to));
}

export function AtlasLayers({open,onClose,view,onView,filter,onFilter,kind,onKind,stale,onStale,model,legend}: {
  open:boolean;onClose:()=>void;view:AtlasLayer;onView:(view:AtlasLayer)=>void;
  filter:AtlasFilter;onFilter:(filter:AtlasFilter)=>void;kind:string;onKind:(kind:string)=>void;
  stale:boolean;onStale:(stale:boolean)=>void;model?:AtlasReadModel;legend:ReactNode;
}) {
  const layers = [
    {value:'map',label:'Constellations',icon:Network,enabled:true},
    {value:'themes',label:'Themes',icon:Milestone,enabled:!!model?.themes.length},
    {value:'bridges',label:'Bridges',icon:GitFork,enabled:approvedBridges(model).length>0},
  ] as const;
  return <Sheet open={open} onClose={onClose} title="Layers">
    <div className="v7-atlas-layer-options">
      <p className="v7-eyebrow">Map type</p>
      <div className="v7-atlas-layer-tiles">{layers.filter(layer=>layer.enabled).map(({value,label,icon:Icon})=>
        <button key={value} type="button" aria-pressed={view===value} onClick={()=>{onView(value);onClose();}}><Icon aria-hidden="true"/>{label}</button>)}</div>
      <p className="v7-eyebrow">Show</p>
      <div className="v7-atlas-row">{(['all','uncertain','gaps','certified'] as const).map(value=>
        <Chip key={value} selected={filter===value} onClick={()=>onFilter(value)}>{value[0].toUpperCase()+value.slice(1)}</Chip>)}</div>
      <p className="v7-eyebrow">Kind</p>
      <div className="v7-atlas-row">{['any',...KINDS].map(value=>
        <Chip key={value} selected={kind===value} onClick={()=>onKind(value)}>{value[0].toUpperCase()+value.slice(1)}</Chip>)}</div>
      <Switch label="Only stale concepts" checked={stale} onChange={onStale}/>
      <section aria-label="Key"><h3 className="v7-eyebrow">Key</h3>{legend}</section>
    </div>
  </Sheet>;
}

export function AtlasLayerContent({view,model}: {view:Exclude<AtlasLayer,'map'>;model?:AtlasReadModel}) {
  const label = (id: string) => model?.model.facts.concepts.find(concept=>concept.id===id)?.name ?? 'Concept';
  return <section className="v7-atlas-list" aria-label={view==='themes'?'Themes':'Bridges'}>
    {view==='themes'
      ? model?.themes.map(theme=><Disclosure key={theme.id} label={theme.name}>
          <ul>{theme.instances.map(id=><li key={id}><Link to={'/atlas?id='+encodeURIComponent(id)}>{label(id)}</Link></li>)}</ul>
        </Disclosure>)
      : approvedBridges(model).map(bridge=>
          <div key={bridge.from+'/'+bridge.to} className="v7-atlas-bridge" data-dashed={bridge.strength.dashed} data-thick={bridge.strength.thick}>
            <Disclosure label={<>{label(bridge.from)} ↔ {label(bridge.to)} <small>{bridge.strength.u} uses · {bridge.strength.o} opportunities</small></>}>
              <p>{bridge.strength.dashed ? 'No opportunities yet.'
                : `${label(bridge.from)} was used successfully without a prompt in ${bridge.strength.u} of ${bridge.strength.o} opportunities.`}</p>
            </Disclosure>
          </div>)}
  </section>;
}
