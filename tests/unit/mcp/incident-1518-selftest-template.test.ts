import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,expect,it} from 'vitest';
import {selftestPlanTemplate} from '../../../supabase/functions/mcp/selftest-plan';
import {validateTemplate} from '../../../supabase/functions/_shared/adaptive/template';
import {requireStageStructure,requireIdeaHierarchy} from '../../../supabase/functions/mcp/stress-guards';

const accepted=[
  {title:'Cover basics',objective:'Define covers',criterion:'States a correct definition unaided',steps:['Define cover','Give example']},
  {title:'Compactness',objective:'Use covers',criterion:'Proves a finite subcover result',steps:['Choose cover','Prove finite subcover'],prereqs:[1]},
  {title:'Applications',objective:'Apply theorem',criterion:'Constructs a correct example',steps:['Find example','Explain'],prereqs:[2]}
];
describe('incident #1518: smoke plan after Atlas v3 activation',()=>{
  it('does not add a template to the legacy pre-activation smoke',()=>{
    expect(selftestPlanTemplate(accepted,false)).toBeUndefined();
  });
  it('generates a valid template with matching checkpoint IDs and prerequisite links',()=>{
    const template=selftestPlanTemplate(accepted,true);
    expect(template).toBeDefined();
    expect(validateTemplate(template)).toEqual([]);
    expect(template!.checkpoints.map(cp=>cp.id)).toEqual(['CP1','CP2','CP3']);
    expect(template!.checkpoints.map(cp=>cp.prereqs)).toEqual([[],['CP1'],['CP2']]);
  });
  it('still rejects malformed scale drafts after the template prerequisite is satisfied',()=>{
    expect(()=>requireStageStructure(Array.from({length:9},()=>({})))).toThrow('3–7 named stages');
    expect(()=>requireIdeaHierarchy(Array.from({length:21},(_,i)=>({name:'Flat idea '+i})))).toThrow('levels and parent links');
  });
  it('uses the activated template for both rejected drafts and the approved draft',()=>{
    const source=readFileSync(resolve(process.cwd(),'supabase/functions/mcp/selftest.ts'),'utf8');
    expect(source).toContain('selftestPlanTemplate(acceptedPlan,Boolean((await settings(c)).atlas_migrated_at))');
    expect(source).toContain('await proposePlan(c,planArgs(noStages))');
    expect(source).toContain('await proposePlan(c,planArgs(noStages.slice(0,3),flatIdeas))');
    expect(source).toContain('await proposePlan(c,planArgs(acceptedPlan,');
  });
});
