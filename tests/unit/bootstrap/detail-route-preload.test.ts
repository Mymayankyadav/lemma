// @vitest-environment node
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {describe,expect,it} from 'vitest';
const html=readFileSync('index.html','utf8');
const script=html.match(/<script type="module" data-detail-route-preload>([\s\S]*?)<\/script>/)![1];
function targets(hash:string,reject=false){
 const loaded:string[]=[];
 const preload=(target:string)=>{loaded.push(target);return reject?Promise.reject(Error('offline')):Promise.resolve();};
 const code=script.replace(/import\('([^']+)'\)/g,(_,target)=>`preload('${target}')`);
 runInNewContext(code,{location:{hash},preload},{timeout:1000});
 return loaded;
}
describe('direct detail route module requests',()=>{
 for(const [hash,feature] of [
  ['#/p/analysis/cp/CP4','checkpoint'],['#/proposals/plan-1','plan-proposal'],
  ['#/p/analysis','project'],['#/projects/new','new-project'],['#/s/analysis/7','session'],
 ])it('requests only the active '+feature+' module, including filtered URLs',()=>{
  for(const suffix of ['', '?from=notification'])
   expect(targets(hash+suffix)).toEqual(['/src/features/'+feature+'/Page.tsx']);
 });
 it('does not request detail modules on list routes, Review-run or prefix collisions',()=>{
  for(const hash of ['#/','#/atlas','#/cards','#/projects','#/proposals','#/review/run',
   '#/p/a/cp/CP4/extra','#/proposals/x/extra','#/projects/newer','#/s/a/7/extra'])
   expect(targets(hash),hash).toEqual([]);
 });
 it('handles preload rejections so normal route recovery still owns errors',async()=>{
  expect(targets('#/p/a/cp/CP4',true)).toHaveLength(1);
  await Promise.resolve();
 });
});
