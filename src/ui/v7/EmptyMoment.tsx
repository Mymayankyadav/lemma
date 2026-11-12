import type {ReactNode} from 'react';
import {Link} from 'react-router';
import {Emblem} from './Emblem';
import {Illustration,type IllustrationName} from './Illustration';
import './empty-moment.css';

/**
 * Release plan R2 · F36 (simple version; illustrated states are A2): an empty state is a moment, not a sentence — a mark
 * (an emblem v2 glyph or a drawn mark), a serif one-liner, one sentence and at most one action that fits the context
 * (a filter-empty state offers "Clear filter", never a giant create button).
 */
export function EmptyMoment({art,mark,subject='Other',title,children,action}:{art?:IllustrationName;mark?:ReactNode;subject?:string;title:string;children?:ReactNode;
 action?:{label:string;onClick?:()=>void;to?:string}}){
 return <div className="v7-empty-moment" role="status">
  {/* A2: a moment with its own illustration (IL-01 … IL-08) shows it in place of the round mark. */}
  {art?<Illustration name={art} className="v7-empty-art"/>
   :<span className="v7-empty-mark" aria-hidden="true">{mark??<Emblem subject={subject} seed={'empty-'+title} size={56} tier="tile" animate={false}/>}</span>}
  <p className="v7-empty-title">{title}</p>
  {children&&<p className="v7-empty-body">{children}</p>}
  {action&&(action.to?<Link className="v7-button v7-secondary v7-small" to={action.to}><span>{action.label}</span></Link>
   :<button type="button" className="v7-button v7-secondary v7-small" onClick={action.onClick}><span>{action.label}</span></button>)}
 </div>;
}
