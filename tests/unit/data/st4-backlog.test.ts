import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {DemoAdapter} from '../../../src/data/demo/adapter';
import type {DemoStore} from '../../../src/data/demo/model';

describe('ST-4 due backlog semantics',()=>{
 it('counts scheduled overdue cards but excludes unseen new cards from the badge and deck tree',async()=>{
  const fixture=JSON.parse(readFileSync('src/data/demo/fixture.json','utf8')) as DemoStore;
  const projectIds=new Set(fixture.projects.filter(p=>p.status!=='archived'&&!p.system).map(p=>p.id));
  const note=fixture.notes.find(n=>n.note.status==='active'&&n.cards.length&&projectIds.has(n.projectId));
  expect(note).toBeDefined();
  note!.cards[0].state.state=0;
  note!.cards[0].state.due='@due:-1';
  const now=Date.parse('2026-10-31T12:00:00Z');
  const api=new DemoAdapter({fixture,now:()=>now,timeZone:'UTC'});
  // The fixture hydrator normalises new-card dates. Force one state-0 card
  // overdue after hydration to exercise the badge exclusion explicitly.
  const hydrated=(api as unknown as {store:DemoStore}).store;
  const newCard=hydrated.notes.find(n=>n.note.noteNo===note!.note.noteNo)!.cards[0];
  newCard.state.state=0;
  newCard.state.due=new Date(now-3600_000).toISOString();
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
 it('pages the card library newest-first without materialising all matches',async()=>{
  const api=new DemoAdapter({now:()=>Date.parse('2026-10-31T12:00:00Z'),timeZone:'UTC'});
  const first=await api.searchCardsPage({query:''});
  expect(first.rows.length).toBe(50);
  expect(first.nextOffset).toBe(50);
  const numbers=first.rows.map(row=>row.noteNo);
  expect(numbers).toEqual([...numbers].sort((a,b)=>b-a));
  const second=await api.searchCardsPage({query:'',offset:first.nextOffset!});
  expect(second.rows.length).toBeGreaterThan(0);
  expect(second.rows[0].noteNo).toBeLessThan(numbers.at(-1)!);
  expect(new Set([...numbers,...second.rows.map(row=>row.noteNo)]).size)
   .toBe(numbers.length+second.rows.length);
 });
});
