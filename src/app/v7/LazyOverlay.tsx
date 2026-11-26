import {Component,createContext,lazy,Suspense,useContext,useLayoutEffect,useMemo,useState,type ComponentType,type ReactNode} from 'react';
import {Button,Sheet,Skeleton} from '../../ui/v7/components';

export type OverlayFrameProps={
 title:ReactNode;eyebrow?:string;footer?:ReactNode;children?:ReactNode;dirty?:boolean;onBack?:()=>void;
};
const FrameContext=createContext<((frame:Omit<OverlayFrameProps,'children'>)=>void)|null>(null);

/** A loaded step supplies content and controls to the already-open dialog. */
export function OverlayFrame({children,...frame}:OverlayFrameProps){
 const setFrame=useContext(FrameContext);
 useLayoutEffect(()=>{setFrame?.(frame);});
 return <>{children}</>;
}

class BodyBoundary extends Component<{children:ReactNode;fallback:ReactNode},{failed:boolean}> {
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 render(){return this.state.failed?this.props.fallback:this.props.children;}
}

export default function LazyOverlay<P extends object>({title,onClose,source,bodyProps,full,hideTitle,className,returnTarget}:{
 title:string;onClose:()=>void;source:{read:()=>Promise<{default:ComponentType<P>}>};bodyProps:P;
 full?:boolean;hideTitle?:boolean;className?:string;returnTarget?:()=>HTMLElement|null;
}){
 const [frame,setFrame]=useState<Omit<OverlayFrameProps,'children'>>({title});
 const [version,setVersion]=useState(0);
 const [Body,setBody]=useState(()=>lazy(source.read));
 // Frame updates refresh header/footer props without rendering the loaded editor again.
 const body=useMemo(()=> <FrameContext.Provider value={setFrame}><Body {...bodyProps}/></FrameContext.Provider>,[Body,bodyProps]);
 const retry=()=>{setFrame({title});setBody(lazy(source.read));setVersion(value=>value+1);};
 return <Sheet open title={frame.title} eyebrow={frame.eyebrow} onClose={onClose} footer={frame.footer}
  dirty={frame.dirty} onBack={frame.onBack} returnTarget={returnTarget} full={full} hideTitle={hideTitle} className={className}>
  <BodyBoundary key={version} fallback={<div role="alert" className="v7-alert">
   <span>Couldn’t open {title}.</span><Button onClick={retry}>Retry</Button>
  </div>}>
   <Suspense fallback={<div className="v7-overlay-pending" aria-label={'Opening '+title} aria-busy="true"><Skeleton surface="sheet"/></div>}>
    {body}
   </Suspense>
  </BodyBoundary>
 </Sheet>;
}
