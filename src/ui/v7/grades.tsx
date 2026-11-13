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

/** The grade glyph, 16 px by default, in the grade's colour. N156 (IC3): drawn on the icon set's 24-unit grid with its
 *  1.75 px line (it was a 16-unit grid at 1.6, so 2 px when shown at 20 px). */
export function GradeGlyph({grade,size=16,...props}:{grade:GradeKey;size?:number}&SVGProps<SVGSVGElement>){
 const common={width:size,height:size,viewBox:'0 0 24 24','aria-hidden':true as const,className:'v7-grade-glyph',style:{color:GRADES[grade].colour},...props};
 if(grade==='again')return <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M5.25 9.75A7.5 7.5 0 1 1 6 16.5"/><path d="M4.5 4.5v5.25h5.25"/></svg>;
 if(grade==='hard')return <svg {...common}><circle cx="12" cy="12" r="8.4" fill="none" stroke="currentColor" strokeWidth="1.75"/><path d="M12 3.6a8.4 8.4 0 0 1 0 16.8Z" fill="currentColor"/></svg>;
 if(grade==='good')return <svg {...common}><circle cx="12" cy="12" r="9" fill="currentColor"/></svg>;
 return <svg {...common}><path d="M12 2.4l2.85 6 6.6.75-4.95 4.5 1.35 6.45L12 16.8l-5.85 3.3 1.35-6.45-4.95-4.5 6.6-.75Z" fill="currentColor"/></svg>;
}
/** A grade badge: glyph and name, on the grade's subtle surface (never a status icon). */
export function GradeBadge({grade}:{grade:GradeKey}){
 return <span className="v7-grade-badge" data-grade={grade}><GradeGlyph grade={grade} size={14}/><span>{GRADES[grade].label}</span></span>;
}
