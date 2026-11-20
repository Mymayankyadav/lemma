import {authGeneration} from '../authBoundary';
import {getMode} from '../mode';

const demoKey = 'lemma.demo.capacity-overrides';

export function demoCapacityOverrides(): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(demoKey) ?? '{}');
  } catch {
    return {};
  }
}

export async function setDayCapacity(day: string, minutes: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isInteger(minutes) || minutes < 0 || minutes > 1440) {
    throw new Error('Choose a valid study duration.');
  }
  if (getMode() === 'demo') {
    sessionStorage.setItem(demoKey, JSON.stringify({...demoCapacityOverrides(),[day]:minutes}));
    return;
  }
  const generation = authGeneration();
  const {liveClient} = await import('../live/client');
  const db = liveClient();
  // The versioned command arbitrates with a change from another device. Re-read once if that device won.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (generation !== authGeneration()) throw new Error('Your account changed.');
    const row = await db.from('capacity_overrides').select('id,version,minutes').eq('on_date',day).maybeSingle();
    if (row.error) throw row.error;
    if (generation !== authGeneration()) throw new Error('Your account changed.');
    if (row.data?.minutes === minutes) return;
    const receipt = await db.rpc('adaptive_facts_command',{p:{
      schemaVersion:1,operationId:crypto.randomUUID(),resource:'capacity_overrides',
      operation:row.data ? 'update' : 'create',
      target:row.data ? {id:row.data.id} : {id:crypto.randomUUID()},
      patch:{...(!row.data && {on_date:day}),minutes,reason:'Time available today'},
      ...(row.data && {expectedVersion:row.data.version}),
    }});
    if (receipt.error && receipt.error.code !== '23505') throw receipt.error;
    if (!receipt.error && receipt.data?.status === 'ok') return;
    if (!receipt.error && receipt.data?.status !== 'conflict') break;
  }
  throw new Error('Could not save the study time. Try again.');
}
