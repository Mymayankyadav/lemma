import { describe, expect, it } from 'vitest'
import { DemoAdapter } from '../../../src/data/demo/adapter'
import { LiveAdapter } from '../../../src/data/live/adapter'
import { mergeNotifyPrefs } from '../../../src/data/notify'
import { settingsRow } from '../../../src/data/live/helpers'

const demo=()=>new DemoAdapter({now:()=>Date.parse('2026-11-01T10:00:00Z')})

describe('NOTIF-0 additive reminder contract',()=>{
 it('preserves unknown future nested kind keys and exposes live notify JSON',()=>{
  const result=mergeNotifyPrefs({enabled:false,unknown:'keep',kinds:{due:true,future:true} as any},
   {enabled:true,kinds:{tutor:false}})
  expect(result).toMatchObject({enabled:true,unknown:'keep',kinds:{due:true,tutor:false,future:true}})
  expect(settingsRow({notify:{enabled:true}} as any).notify).toEqual({enabled:true})
 })
 it('provides the bounded deterministic demo rows',async()=>{
  const api=demo()
  expect(await api.listPushDevices()).toHaveLength(2)
  expect(await api.listRecentNotifications()).toHaveLength(5)
  expect(await api.listNotifyHolds()).toHaveLength(1)
  expect(await api.previewNotifications()).toHaveLength(3)
 })
 it('preserves unknown top-level and nested notify keys on a partial settings update',async()=>{
  const api=demo()
  await api.updateSettings({notify:{enabled:false,mode:'weekly',experimental:'keep',quiet:{start:'22:30',end:'07:30'}}})
  const after=await api.updateSettings({notify:{enabled:true,quiet:{start:'21:30',end:'07:30'}}})
  expect(after.notify).toMatchObject({enabled:true,mode:'weekly',experimental:'keep',quiet:{start:'21:30',end:'07:30'}})
  expect((await api.getSettings()).notify?.experimental).toBe('keep')
 })
 it('soft-removes and restores the same device id, and clears a hold in memory',async()=>{
  const api=demo()
  const removed=await api.removePushDevice('demo-phone')
  expect(removed.disabledReason).toBe('removed')
  const restored=await api.restorePushDevice('demo-phone')
  expect(restored.id).toBe(removed.id)
  expect(restored.disabledAt).toBeNull()
  await api.clearNotifyHold('due')
  expect(await api.listNotifyHolds()).toEqual([])
 })
 it('reuses an endpoint, enforces 10 active devices and does not lose the removed row',async()=>{
  const api=demo()
  const input=(n:number)=>({endpoint:'https://push.example.test/'+n,p256dh:'key',auth:'auth',label:'Device '+n,platform:'desktop' as const})
  const first=await api.addPushDevice(input(1))
  const again=await api.addPushDevice({...input(1),label:'Renamed'})
  expect(again.id).toBe(first.id)
  for(let n=2;n<=8;n++)await api.addPushDevice(input(n))
  expect((await api.listPushDevices()).filter(d=>!d.disabledAt)).toHaveLength(10)
  await expect(api.addPushDevice(input(9))).rejects.toThrow('You have 10 devices with reminders. Remove one first.')
  await api.removePushDevice(first.id)
  await api.addPushDevice(input(9))
  await expect(api.restorePushDevice(first.id)).rejects.toThrow('You have 10 devices with reminders. Remove one first.')
  expect((await api.listPushDevices()).find(d=>d.id===first.id)?.disabledReason).toBe('removed')
 })
 it('live adapter methods fail closed until NOTIF-6',async()=>{
  const api=new LiveAdapter()
  const calls=[
   ()=>api.listPushDevices(),
   ()=>api.addPushDevice({endpoint:'https://push.example.test',p256dh:'key',auth:'auth',label:'Phone',platform:'android_web'}),
   ()=>api.renamePushDevice('device','Phone'),
   ()=>api.removePushDevice('device'),
   ()=>api.restorePushDevice('device'),
   ()=>api.touchPushDevice('https://push.example.test'),
   ()=>api.listRecentNotifications(),
   ()=>api.listNotifyHolds(),
   ()=>api.clearNotifyHold('due'),
   ()=>api.sendTestNotification('device'),
   ()=>api.previewNotifications(),
  ]
  for(const call of calls)await expect(call()).rejects.toMatchObject({code:'not_implemented'})
 })
})
