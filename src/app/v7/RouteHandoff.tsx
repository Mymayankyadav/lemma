import {Component,type ReactNode} from 'react';
import {Outlet,useLocation} from 'react-router';
import {useSurfaceBeta} from '../surfaceBeta';
import {V7_DETAIL_SCREENS,v7ScreenFor} from '../v7Kit';
import {durations} from '../../ui/v7/motion';
import {motionReduced} from '../../ui/v7/effects';
import {isImmersiveWorkspace} from './routeKinds';

type Kind='workspace'|'rail'|'page';
type ScrollPosition=[Element,number,number];
type Snapshot={visual:HTMLElement;positions:ScrollPosition[];cap:number};
type Props={children:ReactNode;path:string;beta:boolean};
const scrollable='textarea,.overflow-auto,.overflow-y-auto,.overflow-x-auto,[class*="-scroll"],[class*="-thread"],.v7-library-list,.v7-dock';
const stateful=scrollable+',canvas';
const liveAttributes=['id','autofocus','form','data-testid','data-surface-role','data-loading-surface','data-layer-active'];
const liveSelectors=liveAttributes.map(attribute=>'['+attribute+']').join(',');

function copyVisual(source:HTMLElement,bounds:DOMRect,positions:ScrollPosition[]){
 const copy=source.cloneNode(true) as HTMLElement;
 Object.assign(copy.style,{
  position:'absolute',inset:'auto',left:bounds.left+'px',top:bounds.top+'px',
  width:bounds.width+'px',height:bounds.height+'px',maxWidth:'none',margin:'0',
 });
 for(const element of [copy,...copy.querySelectorAll(liveSelectors)]){
  for(const attribute of liveAttributes)element.removeAttribute(attribute);
 }
 copy.querySelectorAll('input[type="radio"][name]').forEach(element=>element.removeAttribute('name'));
 const originalElements=[source,...source.querySelectorAll(stateful)];
 const copiedElements=[copy,...copy.querySelectorAll(stateful)];
 copiedElements.forEach((element,index)=>{
  const original=originalElements[index];
  if(original.matches(scrollable)){
   const {scrollLeft,scrollTop}=original;
   if(scrollLeft||scrollTop)positions.push([element,scrollLeft,scrollTop]);
  }
  if(original instanceof HTMLCanvasElement&&original.width&&original.height&&element instanceof HTMLCanvasElement){
   element.getContext('2d')?.drawImage(original,0,0);
  }
 });
 copy.querySelectorAll('dialog,[popover],iframe,object,embed').forEach(element=>element.remove());
 return copy;
}

/** The committed screen owns focus immediately. A short inert copy carries its predecessor's exit. */
class RouteVisual extends Component<Props,unknown,Snapshot|null>{
 private clear=()=>{};

 getSnapshotBeforeUpdate(previous:Props):Snapshot|null{
  if(!this.props.beta||previous.path===this.props.path||motionReduced())return null;
  const screen=v7ScreenFor(this.props.path);
  if(!screen)return null;
  const root=document.getElementById('root');
  const shell=root?.querySelector<HTMLElement>('.v7-shell');
  const oldPage=shell?.querySelector<HTMLElement>(':scope > :is(main,.v7-library-split)')??root?.querySelector<HTMLElement>('.local-pad-page');
  const rail=V7_DETAIL_SCREENS.has(screen)?shell?.querySelector<HTMLElement>(':scope > .v7-dock'):null;
  // The bottom dock stays anchored to the phone; only the wide rail fades with the old page.
  const railBounds=rail?.getBoundingClientRect();
  const wideRail=railBounds&&railBounds.height>=window.innerHeight/2;
  const kind:Kind|null=isImmersiveWorkspace(previous.path)?'workspace':wideRail?'rail':isImmersiveWorkspace(this.props.path)?'page':null;
  const source=kind==='rail'?rail:oldPage;
  if(!kind||!source||getComputedStyle(source).visibility==='hidden')return null;
  const bounds=(kind==='rail'?railBounds:undefined)??source.getBoundingClientRect();
  if(!bounds.width||!bounds.height)return null;

  const visual=document.createElement('div');
  visual.className='v7-route-departure';
  visual.dataset.routeDeparture=kind;
  visual.inert=true;
  visual.setAttribute('aria-hidden','true');
  visual.style.backgroundImage=getComputedStyle(document.body).backgroundImage;
  const plane=document.createElement('div');
  if(shell){
   plane.className='v7-shell';
   plane.dataset.immersive=shell.dataset.immersive;
   plane.dataset.session=shell.dataset.session;
  }
  const positions:ScrollPosition[]=[];
  if(kind==='rail'&&oldPage)plane.append(copyVisual(oldPage,oldPage.getBoundingClientRect(),positions));
  plane.append(copyVisual(source,bounds,positions));
  visual.append(plane);
  return {visual,positions,cap:kind==='page'?durations.base+durations.instant:durations.dismissMax};
 }

 componentDidUpdate(previous:Props,_state:unknown,snapshot:Snapshot|null){
  if(previous.path!==this.props.path||!this.props.beta)this.clear();
  if(!snapshot||motionReduced())return;
  if(snapshot.visual.dataset.routeDeparture==='rail'&&document.querySelector('#root .v7-shell > .v7-dock'))return;
  const {visual,positions,cap}=snapshot;
  document.body.append(visual);
  for(const [element,left,top] of positions){element.scrollLeft=left;element.scrollTop=top;}
  const timer=window.setTimeout(finish,cap*1000);
  function finish(){window.clearTimeout(timer);visual.remove();}
  this.clear=finish;
  for(const name of ['animationend','animationcancel'])visual.addEventListener(name,event=>{
   if(event.target===visual)finish();
  });
 }

 componentWillUnmount(){this.clear();}
 render(){return this.props.children;}
}

export default function RouteHandoff(){
 const {pathname}=useLocation(),beta=useSurfaceBeta();
 return <RouteVisual path={pathname} beta={beta}><Outlet/></RouteVisual>;
}
