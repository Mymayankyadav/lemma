// @vitest-environment node
import {readdirSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

describe('Supabase migration history',()=>{
 it('uses each migration version once across the complete pending chain',()=>{
  // Supabase records the numeric version, not the descriptive filename. Two
  // branches can therefore merge cleanly while introducing a deployment clash.
  const files=readdirSync('supabase/migrations').filter(name=>name.endsWith('.sql')).sort();
  const versions=new Map<string,string[]>();
  for(const file of files){
   const match=/^(\d+)_/.exec(file);
   expect(match,'Migration needs a numeric version: '+file).not.toBeNull();
   const version=match![1];
   versions.set(version,[...(versions.get(version)??[]),file]);
  }
  const collisions=[...versions].filter(([,names])=>names.length>1)
   .map(([version,names])=>({version,files:names}));
  expect(collisions,'Migration versions must remain unique when branches are combined').toEqual([]);
 });
});
