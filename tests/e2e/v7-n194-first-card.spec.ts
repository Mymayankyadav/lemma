import {expect,test} from '@playwright/test';
import {at,NOW} from './v7-scenes';

const firstUseAt=(route:string)=>at(route).replace('demo=1&','demo=first-use&');
const title='First-use topology',front='What is a clopen set?',back='A set that is both open and closed.';

test('empty Review creates one path and card and reviews that exact card once after reload',async({page})=>{
 await page.clock.setFixedTime(NOW);
 await page.goto(firstUseAt('/review'));
 const firstCard=page.getByRole('region',{name:'First card'});
 const create=firstCard.getByRole('button',{name:'Create a path and card',exact:true});
 await create.click();
 const pathName=firstCard.getByLabel('Path name',{exact:true}),question=firstCard.getByLabel('Front',{exact:true}),answer=firstCard.getByLabel('Back',{exact:true});
 await pathName.fill(title);
 await question.fill(front);
 await answer.fill(back);
 await firstCard.getByRole('button',{name:'Cancel',exact:true}).click();
 await create.click();
 await expect(pathName).toHaveValue(title);
 await expect(question).toHaveValue(front);
 await expect(answer).toHaveValue(back);
 // Two submits in the same turn must still create one path and one card.
 await firstCard.getByRole('button',{name:'Save card',exact:true}).evaluate((button:HTMLButtonElement)=>{
  if(!button.form)throw new Error('Save card must submit the first-card form');
  button.form.requestSubmit(button);
  button.form.requestSubmit(button);
 });
 await expect(page).toHaveURL(/#\/cards\/[1-9]\d*$/);
 const noteNo=Number(new URL(page.url()).hash.split('/').at(-1));
 await expect(page.getByRole('article',{name:'Card',exact:true}).getByText(front,{exact:true})).toBeVisible();
 const readAuthored=()=>page.evaluate(()=>{
  const raw=sessionStorage.getItem('lemma.demo.first-use.authored.v1');
  if(!raw)return null;
  return JSON.parse(raw) as {
   projects:{id:string;title:string}[];
   notes:{projectId:string;note:{noteNo:number;front:string;back:string};cards:{id:string}[]}[];
   reviews:{id:number;cardId:string;rating:number;undoneAt:string|null}[];
  };
 });
 const saved=await readAuthored();
 expect(saved?.projects).toEqual([expect.objectContaining({title})]);
 expect(saved?.notes).toEqual([expect.objectContaining({
  projectId:saved?.projects[0]?.id,note:expect.objectContaining({noteNo,front,back}),cards:[expect.objectContaining({id:expect.any(String)})],
 })]);
 const cardId=saved!.notes[0].cards[0].id;
 await page.getByRole('button',{name:'Review now',exact:true}).click();
 await expect(page).toHaveURL(/#\/review\/run\?run=/);
 const runUrl=page.url(),runId=new URLSearchParams(new URL(runUrl).hash.split('?')[1]).get('run');
 expect(runId).toBeTruthy();
 const round=page.getByRole('main',{name:'Review round'}),shown=round.getByRole('article',{name:'Review card'});
 await expect(round.getByRole('progressbar',{name:'Review progress'})).toHaveText('1 of 1');
 await expect(shown.getByText(front,{exact:true})).toBeVisible();
 await page.reload();
 await expect(page).toHaveURL(runUrl);
 await expect(round.getByRole('progressbar',{name:'Review progress'})).toHaveText('1 of 1');
 await expect(shown.getByText(front,{exact:true})).toBeVisible();
 await expect(shown.getByText(back,{exact:true})).toHaveCount(0);
 await expect(round.getByRole('group',{name:'Grade answer'})).toHaveCount(0);
 await round.getByRole('button',{name:'Show answer',exact:true}).click();
 await expect(shown.getByText(back,{exact:true})).toBeVisible();
 await round.getByRole('group',{name:'Grade answer'}).getByRole('button',{name:/^Good\b/}).click();
 await expect(page).toHaveURL(/#\/review\/done\?run=/);
 await expect(page.getByRole('heading',{name:'Round complete',exact:true})).toBeVisible();
 const completed=await page.evaluate(()=>{
  const raw=sessionStorage.getItem('lemma.v6.demo.review-runs.v1.first-use');
  return JSON.parse(raw??'{"runs":[]}').runs as {id:string;items:{state:string;cardId:string;reviewId:number}[]}[];
 });
 expect(completed).toHaveLength(1);
 expect(completed[0]).toMatchObject({id:runId,items:[{state:'graded',cardId,reviewId:expect.any(Number)}]});
 const reviews=(await readAuthored())?.reviews;
 expect(reviews).toEqual([expect.objectContaining({id:completed[0].items[0].reviewId,cardId,rating:3,undoneAt:null})]);
 await page.reload();
 await expect(page).toHaveURL(/#\/review\/done\?run=/);
 await expect(page.getByRole('heading',{name:'Round complete',exact:true})).toBeVisible();
 expect((await readAuthored())?.reviews).toEqual(reviews);
});

test('empty Cards offers first use, while a filtered seeded library does not',async({page})=>{
 await page.goto(firstUseAt('/cards'));
 await expect(page.getByRole('region',{name:'First card'}).getByRole('button',{name:'Create a path and card',exact:true})).toBeVisible();
 await page.goto(at('/cards'));
 await expect(page.getByRole('list',{name:'Cards',exact:true})).toBeVisible();
 await page.getByRole('searchbox',{name:'Search cards'}).fill('no matches ZZZQ99007');
 await expect(page.getByText(/No cards match these filters/)).toBeVisible();
 await expect(page.getByRole('region',{name:'First card'})).toHaveCount(0);
});
