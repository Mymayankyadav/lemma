// Minimal, fully validated Atlas v3 template for the isolated MCP smoke project.
// Deliberately not used for real user plans; the smoke must exercise the same
// template requirement after activation without changing the legacy smoke path.
export type SelftestCheckpoint={
  title:string;objective:string;criterion:string;steps:string[];prereqs?:number[];
};
export function selftestPlanTemplate(checkpoints:readonly SelftestCheckpoint[],activated:boolean){
  if(!activated)return undefined;
  return {schema:'plan_template_v1' as const,checkpoints:checkpoints.map((cp,i)=>{
    const id='CP'+(i+1),kc='selftest-kc-'+(i+1);
    return {
      id,title:cp.title,objective:cp.objective,
      criterion:{text:cp.criterion,concept_id:kc,facet:'understand',kind:'holdout',novel:true,cued:[] as string[]},
      kind:'learn' as const,tier:'core' as const,estimate:20,
      kcs:[{id:kc,kind:'definition' as const,home:id}],
      steps:cp.steps,prereqs:(cp.prereqs??[]).map(n=>'CP'+n),stage:1,
      teach:['Explain '+cp.title+'.'],
      practice:[1,2,3].map(n=>({text:cp.title+' practice '+n,concept_id:kc,facet:'understand'})),
      close:{questions:['Define '+cp.title,'Explain '+cp.title,'Apply '+cp.title],minutes:5},
      card_plan:[]
    };
  })};
}
