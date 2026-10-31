import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {DemoAdapter} from '../../../src/data/demo/adapter';
import type {DemoStore} from '../../../src/data/demo/model';

describe('ST-4 due backlog semantics',()=>{
 it('counts scheduled overdue cards but excludes unseen new cards from the badge and deck tree',async()=>{
  const fixture=JSON.parse(readFileSync('src/data/demo/fixture.json','utf8')) as DemoStore;
  const note=fixture.notes.find(n=>n.note.status==='active'&&n.cards.length);
  expect(note).toBeDefined();
  note!.cards[0].state.state=0;
  note!.cards[0].state.due='@due:-1';
  const now=Date.parse('2026-10-31T12:00:00Z');
  const api=new DemoAdapter({fixture,now:()=>now,timeZone:'UTC'});
  const snapshot=JSON.parse(await (await api.exportAll()).text()) as DemoStore;
  const visible=new Set(snapshot.projects.filter(p=>p.status!=='archived'&&!p.system).map(p=>p.id));
  const active=snapshot.notes.filter(n=>n.note.status==='active'&&visible.has(n.projectId))
   .flatMap(n=>n.cards);
  const expected=active.filter(c=>c.state.state>0&&Date.parse(c.state.due)<=now).length;
  const allOverdue=active.filter(c=>Date.parse(c.state.due)<=now).length;
  expect(allOverdue).toBeGreaterThan(expected);
  expect((await api.getHome()).due).toBe(expected);
  const decks=await api.getDeckTree();
  expect(decks.reduce((sum,d)=>sum+d.due,0)).toBe(expected);
 });
});
