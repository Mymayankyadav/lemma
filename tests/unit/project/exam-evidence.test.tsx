import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {EvidenceEntry,groupEvidence} from '../../../src/features/project/v7/Evidence';
import type {SessionEvent} from '../../../src/data/types';

const event:SessionEvent={id:1,kind:'attempt',body:'Row rank',outcome:'partial',hintLevel:0,checkpointCode:'CP1',createdAt:'2026-11-25T09:00:00Z'};

describe('exam evidence in checkpoint and session history',()=>{
 it.each([
  ['exam','independent','Exam prep','Independent'],
  ['study','assisted','Study','Assisted'],
  ['exam','reading','Exam prep','Reading'],
 ] as const)('renders %s and %s beside the recorded outcome',(mode,assistance,modeLabel,assistanceLabel)=>{
  const html=renderToStaticMarkup(<ul><EvidenceEntry event={{...event,mode,assistance}} time zone="UTC"/></ul>);
  expect(html).toContain('>'+modeLabel+'<');
  expect(html).toContain('>'+assistanceLabel+'<');
  expect(html).toContain('>Partial<');
 });
 it('leaves legacy mode blank and preserves the known session when another overlaps it',()=>{
  const html=renderToStaticMarkup(<ul><EvidenceEntry event={event}/></ul>);
  expect(html).not.toContain('>Exam prep<');
  expect(html).not.toContain('>Study<');
  const sessions=[
   {number:1,startedAt:'2026-11-25T08:00:00Z',lastActivityAt:'2026-11-25T10:00:00Z'},
   {number:2,startedAt:'2026-11-25T08:30:00Z',lastActivityAt:'2026-11-25T09:30:00Z'},
  ];
  const corrected={...event,id:2,body:'Corrected: a hint was needed.',outcome:'failed' as const,sessionNumber:1,assistance:'assisted' as const};
  expect(groupEvidence([corrected],sessions)[0]).toMatchObject({key:'s1',events:[corrected]});
 });
});
