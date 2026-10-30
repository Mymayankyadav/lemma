import type { HTMLAttributes,CSSProperties } from 'react';
import {ThemeLabButton} from './ThemeLab';
import {useLocation} from 'react-router';
import {Construction} from './backgrounds/euclid/Construction';
import type {Figure} from './backgrounds/euclid/draw';
const constructionFor=(path:string):Figure|undefined=>{
 if(path==='/')return 'i1';
 if(path==='/projects'||/^\/p\/[^/]+$/.test(path))return 'i10';
 if(path.includes('/cp/')||path.startsWith('/s/'))return 'iii1';
 if(path.startsWith('/proposals'))return 'i2';
 if(path==='/review')return 'i9';
 if(path==='/insights')return 'ii11';
 if(path==='/cards'||path.startsWith('/cards/'))return 'i46';
 if(path==='/settings'||path==='/sign-in')return 'i47';
 return undefined;
};
export interface GroundProps extends HTMLAttributes<HTMLDivElement> {lamp?:'tl'|'tr'|'center'|'none';deep?:boolean}
const positions={tl:'8% -6%',tr:'108% -6%',center:'50% 20%',none:'50% 50%'};
export function Ground({lamp='tl',deep=false,className='',style,...props}:GroundProps){
 const path=useLocation().pathname,figure=constructionFor(path);
 return <><div aria-hidden="true" {...props} className={`ground pointer-events-none fixed inset-0 z-0 ${className}`}
 style={{...({'--lamp-position':positions[lamp]} as CSSProperties),...(deep?{backgroundColor:'var(--obsidian-deep)'}:{}),...style}}/>{figure&&<Construction figure={figure} visitKey={path}/>}{!path.startsWith('/review/')&&<ThemeLabButton/>}</>;
}
export default Ground;
