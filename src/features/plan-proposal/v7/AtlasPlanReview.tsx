import '../../../ui/v7/atlas-values.css';
import {validateTemplate,type PlanTemplate} from '../../../../supabase/functions/_shared/adaptive/template';
import type {Conversion} from '../../../../supabase/functions/_shared/adaptive/convert';
export function AtlasPlanReview({template,conversion}:{template?:PlanTemplate;conversion?:Conversion}){
 // Whenever a proposal carries a template or a conversion its review is shown, with the flag on or off: the Owner never approves what is hidden.
 const plan=conversion??template;if(!plan)return null;const errors=validateTemplate(plan);
 return <section className="v7-atlas-panel" aria-label={conversion?'Course conversion':'Course template'}><h2>{conversion?'Course conversion':'Course template'}</h2>
  {errors.length>0&&<div role="alert" className="v7-atlas-error"><strong>Fix before approval</strong><ul>{errors.map(e=><li key={e}>{e}</li>)}</ul></div>}
  {conversion&&<><div className="v7-atlas-scroll"><table><thead><tr><th>Old checkpoint</th><th>New checkpoint</th><th>Reason</th></tr></thead><tbody>{Object.entries(conversion.map).map(([id,m])=><tr key={id}><th>{id}</th><td>{m.skipped?'Skipped':m.id}</td><td>{m.reason??'Preserved'}</td></tr>)}</tbody></table></div><p>{['keep','revise','suspend','new'].map(action=>action+' '+conversion.cards.filter(c=>c.action===action).length).join(' · ')}</p></>}
  {plan.checkpoints.map(cp=><details key={cp.id}><summary>{cp.title} · {cp.tier} · {cp.estimate} min</summary>{cp.prepare&&<><h3>Prepare</h3><p>{cp.prepare.text}</p></>}<h3>Teach</h3><ul>{cp.teach.map((t,i)=><li key={i}>{t}</li>)}</ul><h3>Practice</h3><ul>{cp.practice.map((x,i)=><li key={i}>{x.text}</li>)}</ul><h3>Criterion</h3><p>Uncued novel holdout · revealed at the attempt</p>{cp.stretch&&<><h3>Stretch</h3><p>{cp.stretch.text}</p></>}<h3>Close</h3><ul>{cp.close.questions.map((x,i)=><li key={i}>{x}</li>)}</ul><h3>Card plan</h3><ul>{cp.card_plan.map((c,i)=><li key={i}>{c.concept_id} · {c.kind} · {c.facet}</li>)}</ul></details>)}
 </section>;
}
