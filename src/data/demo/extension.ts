import type { DemoStore, DemoSource } from "./model";
/** V3 deterministic demo enrichment; also used by scripts/make-demo-data.ts. */
export function enrichDemoStore(data: DemoStore) {
 const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
 const projects = [
  {id:"project-analysis",targetDate:"@date:84",label:"Final exam",stages:["Foundations","Compactness and continuity","Major theorems","Connectedness and synthesis"],buckets:[3,6,9,12],dates:[-21,-16,-9,4,11,18,25,32,39,48,62,84],baseSource:"rudin"},
  {id:"project-linear",targetDate:"@date:70",label:"Midterm",stages:["Vector-space foundations","Maps and matrices","Eigenstructure","Canonical forms"],buckets:[4,8,11,14],dates:[-38,-32,-26,-20,-14,-8,-2,3,12,19,28,43,57,70],baseSource:"axler"},
  {id:"project-topology",targetDate:"@date:56",label:"Qualifier",stages:["Foundations","Properties of spaces","Constructions"],buckets:[3,6,9],dates:[-8,2,9,15,22,28,35,45,56],baseSource:"topology-notes"}
 ];
 for (const cfg of projects) {
  const project=data.projects.find(p=>p.id===cfg.id);
  if (!project) continue;
  project.targetDate=cfg.targetDate;
  project.targetLabel=cfg.label;
  const cps=data.checkpoints.filter(cp=>cp.projectId===cfg.id).sort((a,b)=>a.position-b.position);
  for (const [i,cp] of cps.entries()) {
   cp.stage=cfg.stages[cfg.buckets.findIndex(end=>i<end)];
   cp.dueOn=`@date:${cfg.dates[i]}`;
   cp.demonstratedAt=cp.status==="demonstrated"?
    (cfg.id==="project-analysis" ? `@date:${[-26,-21,-3][i]}` : `@date:${cfg.dates[i]-(i%2?0:4)}`):null;
   if (!cp.sourceShort) cp.sourceShort=cfg.baseSource;
  }
 }
 const existing=data.sources.find(s=>s.id==="source-rudin");
 if (existing) {existing.kind="book";existing.position=0;existing.addedAt="@day:-96:0.5:0";existing.planCheckedAt="@day:-8:0.5:0";}
 const extras: Array<[string, string, string, NonNullable<DemoSource["kind"]>, string, number, string, string | null]> = [
  ["project-analysis","analysis-notes","Weekly analysis lecture notes","notes","week-7-notes.pdf",13,"@day:-12:0.5:0","@day:-6:0.5:0"],
  ["project-analysis","analysis-sheet","Compactness problem sheet","problems","problem-sheet-4.pdf",6,"@day:-5:0.5:0","@day:-2:0.5:0"],
  ["project-analysis","analysis-slides","Lecture 8: continuity","slides","slides-continuity.pdf",21,"@day:-1:0.5:0",null],
  ["project-linear","axler","Linear Algebra Done Right — reading outline","book","linear-algebra-outline.pdf",14,"@day:-40:0.5:0","@day:-15:0.5:0"],
  ["project-linear","linear-problems","Eigenvalue practice set","problems","eigenvalue-problems.pdf",8,"@day:-8:0.5:0","@day:-5:0.5:0"],
  ["project-linear","linear-notes","Diagonalization class notes","notes","diagonalization-notes.pdf",10,"@day:-1:0.5:0",null],
  ["project-topology","topology-notes","Topology lecture notebook","notes","topology-notebook.pdf",24,"@day:-25:0.5:0","@day:-7:0.5:0"],
  ["project-topology","topology-book","Topology reading outline","book","topology-reading.pdf",12,"@day:-14:0.5:0","@day:-7:0.5:0"],
  ["project-topology","topology-sheet","Quotient spaces problem set","problems","quotient-problems.pdf",7,"@day:-1:0.5:0",null]
 ];
 for(const [index, row] of extras.entries()){
  const [projectId,short,title,kind,filename,pages,addedAt,planCheckedAt]=row;
  if(data.sources.some(s=>s.projectId===projectId&&s.short===short))continue;
  data.sources.push({
   id:`source-${short}`,projectId,title,short,kind,filename,pageCount:pages,
   status:"ready",hasText:true,outline:[{title:"Overview",page:1,level:1}],
   createdAt:addedAt,addedAt,planCheckedAt,position:index,
   error:null,pages:Array.from({length:pages},(_,i)=>({
     page:i+1,label:String(i+1),
     body:i===0?`${title}: definitions, examples, and proof exercises contributed for study.`:`Page ${i+1}: work through the precise hypotheses and supply a counterexample when a condition fails.`
   }))
  });
 }
 const groups=[
  {subject:"subject-analysis",field:"analysis",galaxies:[
   {name:"Foundations of analysis",systems:[
    {name:"Metric and sequence theory",planets:["Metric spaces","Sequences","Cauchy sequences","Limits","Bolzano–Weierstrass"]},
    {name:"Open sets and topology",planets:["Open sets","Closed sets","Intervals connected"]}
   ]},
   {name:"Compactness and continuity",systems:[
    {name:"Compactness theory",planets:["Compactness","Heine–Borel","Sequential compactness","Lebesgue number"]},
    {name:"Continuous functions",planets:["Continuity","Uniform continuity","Extreme value theorem","Intermediate value theorem"]}
   ]}
  ],moons:[["Metric spaces","Triangle inequality"],["Sequences","Cauchy criterion"],["Compactness","Finite subcover lemma"],["Continuity","Sequential criterion"],["Uniform continuity","Heine–Cantor lemma"]]},
  {subject:"subject-linear",field:"linear",galaxies:[
   {name:"Vector space geometry",systems:[
    {name:"Bases and dimension",planets:["Vector spaces","Linear independence","Span","Basis"]},
    {name:"Linear transformations",planets:["Linear maps","Rank","Kernel","Nullity"]}
   ]},
   {name:"Spectral methods",systems:[
    {name:"Eigenvalue theory",planets:["Eigenvalues","Diagonalization","Minimal polynomial","Determinants"]},
    {name:"Canonical structures",planets:["Orthogonality","Spectral theorem","Jordan blocks"]}
   ]}
  ],moons:[["Basis","Exchange lemma"],["Rank","Rank–nullity"],["Eigenvalues","Characteristic equation"],["Diagonalization","Eigenbasis criterion"],["Jordan blocks","Generalized eigenvector chain"]]},
  {subject:"subject-topology",field:"topology",galaxies:[
   {name:"Foundations of topology",systems:[
    {name:"Topological axioms",planets:["Sets","Topological spaces","Finite intersections","Subspace topology"]},
    {name:"Separation properties",planets:["Hausdorff","Separation axioms","T1 spaces","Clopen sets"]}
   ]},
   {name:"Global topology",systems:[
    {name:"Compactness and connectedness",planets:["Open cover","Connectedness","Connected components","Compactifications"]},
    {name:"Products and quotients",planets:["Product topology","Quotients","Continuous maps"]}
   ]}
  ],moons:[["Topological spaces","Basis for a topology"],["Hausdorff","Closed diagonal criterion"],["Open cover","Finite subcovers"],["Product topology","Projection maps"],["Quotients","Universal property"]]}
 ];
 for(const group of groups){
  const clusterId=`cluster-${group.field}`;
  data.concepts.push({id:clusterId,slug:clusterId,name:data.subjects.find(s=>s.id===group.subject)?.name||group.field,
   blurb:"Explore the main areas and their connections.",subjectId:group.subject,pinX:null,pinY:null,level:"cluster",parentId:null,isStar:false});
  for(const [gi,galaxy] of group.galaxies.entries()){
   const galaxyId=`galaxy-${group.field}-${gi+1}`;
   data.concepts.push({id:galaxyId,slug:galaxyId,name:galaxy.name,
    blurb:`An area connecting ${galaxy.systems.map(s=>s.name.toLowerCase()).join(" and ")}.`,
    subjectId:group.subject,pinX:null,pinY:null,level:"galaxy",parentId:clusterId,isStar:false});
   for(const [si,system] of galaxy.systems.entries()){
    const systemId=`system-${group.field}-${gi+1}-${si+1}`;
    data.concepts.push({id:systemId,slug:systemId,name:system.name,
     blurb:`Key definitions, results, and examples in ${system.name.toLowerCase()}.`,
     subjectId:group.subject,pinX:null,pinY:null,level:"system",parentId:galaxyId,isStar:false});
    for(const [pi,name] of system.planets.entries()){
     let planet=data.concepts.find(c=>c.subjectId===group.subject&&c.name===name);
     if(!planet){
      const slug=`${group.field}-${slugify(name)}`;
      planet={id:`concept-${slug}`,slug,name,blurb:`Study ${name.toLowerCase()} through definitions and examples.`,
       subjectId:group.subject,pinX:null,pinY:null};
      data.concepts.push(planet);
     }
     planet.level="planet";
     planet.parentId=systemId;
     planet.isStar=pi===0;
    }
   }
  }
  for(const [parentName,moonName] of group.moons){
   const parent=data.concepts.find(c=>c.subjectId===group.subject&&c.level==="planet"&&c.name===parentName);
   if(!parent)throw Error(`Missing moon parent ${parentName}`);
   const moonId=`moon-${group.field}-${slugify(moonName)}`;
   data.concepts.push({id:moonId,slug:moonId,name:moonName,
    blurb:`A supporting lemma or worked example for ${parentName.toLowerCase()}.`,
    subjectId:group.subject,pinX:null,pinY:null,level:"moon",parentId:parent.id,isStar:false});
  }
 }
}
