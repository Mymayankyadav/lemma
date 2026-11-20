/** Each prespecified clean attempt stream owns one guard for its full registered lifetime. */
const epsilon=1e-8;
export const validProbability=(p:unknown):p is number=>typeof p==='number'&&Number.isFinite(p)&&p>=0&&p<=1;
const clip=(p:number)=>Math.max(epsilon,Math.min(1-epsilon,p));
const logsum=(xs:number[])=>{const peak=Math.max(...xs);return peak+Math.log(xs.reduce((total,x)=>total+Math.exp(x-peak),0));};
export class ForecastGuard {
  private mass=[Math.log(.5),Math.log(.25),Math.log(.25)];
  observations=0;
  predict(reference:number,challengers:readonly (number|null)[]){
    if(!validProbability(reference)||challengers.length!==2)throw Error('A native reference and two registered challengers are required');
    const components=[reference,...challengers.map(p=>validProbability(p)?p:reference)].map(clip);
    const [native,...pool]=this.mass,total=logsum(pool);
    const prior=[native,...pool.map(w=>logsum([Math.log1p(-.035)+w,Math.log(.035/2)+total]))];
    const normal=logsum(prior),weights=prior.map(w=>Math.exp(w-normal));
    return {forecast:clip(components.reduce((p,x,i)=>p+x*weights[i],0)),components,weights,prior};
  }
  observe(reference:number,challengers:readonly (number|null)[],outcome:boolean){
    if(typeof outcome!=='boolean')throw Error('Only a binary outcome updates the guard');
    const offered=this.predict(reference,challengers);
    const mass=offered.prior.map((w,i)=>w+(outcome?Math.log(offered.components[i]):Math.log1p(-offered.components[i])));
    const normal=logsum(mass);
    this.mass=mass.map(x=>x-normal);this.observations++;
    return offered;
  }
}
