import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {navigationTabs} from '../../../src/app/TabBar';

const read=(path:string)=>readFileSync(path,'utf8');
const mockup=read('src/ui/v6/mockup.css');
const shell=read('src/app/AppShell.tsx');
const header=read('src/app/V6Header.tsx');
const tabs=read('src/app/TabBar.tsx');
const focus=read('src/app/FocusAccessory.tsx');

describe('N110 reviewed mockup shell port',()=>{
 it('ports the actual mockup palette and shared control styles only under data-v6',()=>{
  expect(mockup).toContain(':root[data-v6][data-theme=graph]{');
  expect(mockup).toContain(':root[data-v6][data-theme=graph-night]{');
  expect(mockup).toContain('--accent:#294c66');
  expect(mockup).toContain('--accent:#aacce5');
  expect(mockup).toContain(':root[data-v6] .notebook-header');
  expect(mockup).toContain(':root[data-v6] nav[data-ui=main-navigation]');
  expect(mockup).toContain(':root[data-v6] .ui-button');
  expect(mockup).not.toMatch(/(^|\n)\s*html\[data-theme=/);
  expect(shell).toContain("import '../ui/v6/mockup.css'");
  expect(shell).toContain('setV6Root(v6)');
 });
 it('keeps every mockup tab labelled while retaining the original flag-off routes',()=>{
  expect(navigationTabs(true).map(t=>t.label)).toEqual(['Today','Paths','Review','Calendar','Progress']);
  expect(navigationTabs(false).map(t=>t.label)).toEqual(['Today','Paths','Review','Insights']);
  expect(tabs).toContain("data-ui={v6?'main-navigation':undefined}");
  expect(tabs).toContain('lemma-nav-active-label');
  expect(tabs).toContain('!v6&&label');
 });
 it('keeps the header actions functional and the focus dock above the nav',()=>{
  expect(header).toContain('className="notebook-header');
  expect(header).toContain('aria-label="Page actions"');
  expect(header).toContain('aria-label="Add to notebook"');
  expect(header).toContain('aria-label="Notebook menu"');
  expect(header).toContain('onClick={()=>{if(addMenu.current)addMenu.current.open=false;setTaskOpen(true);}');
  expect(mockup).toContain(':root[data-v6] [data-v6-focus-accessory]');
  expect(focus).toContain('aria-label="Focus accessory"');
  expect(focus).toContain("calc(var(--tab) + env(safe-area-inset-bottom) + 8px)");
  expect(focus).toContain("api.activeStudyEntry()");
  expect(focus).toContain("api.pauseStudyEntry");
  expect(focus).toContain("api.resumeStudyEntry");
 });
});
