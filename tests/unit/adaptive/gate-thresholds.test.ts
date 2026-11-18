import {readFileSync,readdirSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

/** The release gates exist twice: the Python harness that measures them and the SQL that refuses activation without them. They must agree. */
const python=readFileSync('research/sim/gates.py','utf8'),sqlFile=readdirSync('supabase/migrations').find(f=>f.includes('_n175_atlas_migrate'))!,sql=readFileSync('supabase/migrations/'+sqlFile,'utf8');
const fromPython=new Map([...python.matchAll(/'(\w+)': \('(<=|>=|>)', (-?[\d.]+)\)/g)].map(m=>[m[1],m[2]+m[3]]));
const fromSql=new Map([...sql.matchAll(/\('(\w+)','(<=|>=|>)',(-?[\d.]+)\)/g)].map(m=>[m[1],m[2]+m[3]]));
describe('release gate thresholds',()=>{
 it('are the same sixteen gates with the same operators and values in the harness and in the activation SQL',()=>{
  expect(fromPython.size).toBe(16);
  expect([...fromSql.entries()].sort()).toEqual([...fromPython.entries()].sort());
 });
 it('match 07 Simulation gates',()=>{
  expect(fromPython.get('kf_kl_w1')).toBe('<=0.040');expect(fromPython.get('kf_kl_w2')).toBe('<=0.050');expect(fromPython.get('kf_reduction_vs_v2')).toBe('>=0.40');
  expect(fromPython.get('attendance_log_loss')).toBe('<=0.57');expect(fromPython.get('duration_log_density')).toBe('>=-0.70');expect(fromPython.get('e2e_se_ratio')).toBe('>2');
 });
});
