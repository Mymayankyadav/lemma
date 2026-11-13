import {describe,expect,it} from 'vitest';
import {FLAG_DEFAULTS,resolveFlags} from '../../../src/flags';

const released=['v7Ruler','v7Qed','v7Spread','v7Scratch','v7Paper','v7DeskClock','v7Week'] as const;
describe('N159 Owner-approved production rollout',()=>{
 it('enables every U4 feature without allowing production URL or environment overrides',()=>{
  const resolved=resolveFlags({allowOverrides:false,search:'?flags='+released.map(flag=>'-'+flag).join(','),envFlags:released.map(flag=>'-'+flag).join(',')});
  for(const flag of released){expect(FLAG_DEFAULTS[flag],flag).toBe(true);expect(resolved[flag],flag).toBe(true);}
 });
 it('keeps explicit flag-off scenarios available in development and tests',()=>{
  for(const flag of released){
   expect(resolveFlags({allowOverrides:true,search:'?flags=-'+flag})[flag],flag).toBe(false);
   expect(resolveFlags({allowOverrides:true,envFlags:'-'+flag,search:'?flags='+flag})[flag],flag).toBe(true);
  }
 });
 it('does not turn unrelated experiments or infrastructure on',()=>{
  for(const flag of ['focusOrbit','v7Margin','v7Room','androidShell','notificationsPush','ciSelfTest'] as const)expect(FLAG_DEFAULTS[flag],flag).toBe(false);
 });
});
