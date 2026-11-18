import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {memoryStep,likelihood} from '../../../supabase/functions/_shared/adaptive/measure';
import {DAY} from '../../../supabase/functions/_shared/adaptive/math';
const runs=JSON.parse(readFileSync('tests/unit/adaptive/atlas-v3-golden.json','utf8')) as {seed:number;rows:any[]}[];
describe('Python harness numerical golden files',()=>{for(const run of runs)it('reproduces seed '+run.seed+' to 1e-6',()=>{let m=memoryStep(undefined,0,3);for(const row of run.rows){m=memoryStep(m,row.day*DAY,row.grade,row.weight,row.reset);expect(m.s).toBeCloseTo(row.s,6);expect(m.d).toBeCloseTo(row.d,6);expect(m.last).toBe(row.last*DAY);const l=likelihood(row.m,row.v,row.r);expect(l.p).toBeCloseTo(row.p,6);expect(l.G(row.y)).toBeCloseTo(row.G,6);expect(l.H).toBeCloseTo(row.H,6);}});});
