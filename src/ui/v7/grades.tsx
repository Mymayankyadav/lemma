import type {SVGProps} from 'react';
import './grades.css';

/**
 * Release plan R1 · F22: one grade language. Each of the four grades is defined once (name, colour role, glyph, short
 * label) and used everywhere a grade appears: review buttons and progress, round complete, card history, practice and
 * charts. Colours: Again danger, Hard warning, Good success, Easy indigo. Glyphs: ↺, a half-filled circle, a filled
 * circle, a star — so a grade never depends on colour alone.
 */
export type GradeKey='again'|'hard'|'good'|'easy';
export const GRADE_KEYS:readonly GradeKey[]=['again','hard','good','easy'];
export const GRADES:Readonly<Record<GradeKey,{label:string;rating:1|2|3|4;colour:string}>>={
 again:{label:'Again',rating:1,colour:'var(--v7-role-status-danger)'},
 hard:{label:'Hard',rating:2,colour:'var(--v7-role-status-warning)'},
 good:{label:'Good',rating:3,colour:'var(--v7-role-status-success)'},
 easy:{label:'Easy',rating:4,colour:'var(--v7-role-selection-fg)'},
};
export const gradeOf=(rating:number):GradeKey=>GRADE_KEYS[Math.max(1,Math.min(4,Math.round(rating)))-1];

/** The grade glyph, 16 px by default, in the grade's colour. */
export function GradeGlyph({grade,size=16,...props}:{grade:GradeKey;size?:number}&SVGProps<SVGSVGElement>){
 const common={width:size,height:size,viewBox:'0 0 16 16','aria-hidden':true as const,className:'v7-grade-glyph',style:{color:GRADES[grade].colour},...props};
 if(grade==='again')return <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 6.5A5 5 0 1 1 4 11"/><path d="M3 3v3.5h3.5"/></svg>;
 if(grade==='hard')return <svg {...common}><circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.6"/><path d="M8 2.4a5.6 5.6 0 0 1 0 11.2Z" fill="currentColor"/></svg>;
 if(grade==='good')return <svg {...common}><circle cx="8" cy="8" r="6" fill="currentColor"/></svg>;
 return <svg {...common}><path d="M8 1.6l1.9 4 4.4.5-3.3 3 .9 4.3L8 11.2l-3.9 2.2.9-4.3-3.3-3 4.4-.5Z" fill="currentColor"/></svg>;
}
/** A grade badge: glyph and name, on the grade's subtle surface (never a status icon). */
export function GradeBadge({grade}:{grade:GradeKey}){
 return <span className="v7-grade-badge" data-grade={grade}><GradeGlyph grade={grade} size={14}/><span>{GRADES[grade].label}</span></span>;
}
