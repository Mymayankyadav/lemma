// @vitest-environment jsdom
import {expect,it,vi} from 'vitest';
import {createClient} from '@supabase/supabase-js';
import {startNative} from '../../../src/platform/start';
import {LiveAdapter} from '../../../src/data/live/adapter';

const fixture=vi.hoisted(()=>({db:null as any,native:new Proxy({
 pushToken:vi.fn(async()=>({configured:true,token:'fake-fcm-token-for-local-test'})),
 addListener:vi.fn(async()=>({remove:async()=>{}})),
}, {get(target:any,key){if(key==='then')return undefined;return key in target?target[key]:async()=>({});}})}));
vi.mock('../../../src/data/live/client',()=>({liveClient:()=>fixture.db}));
vi.mock('../../../src/data/env',()=>({supabaseUrl:'https://example.invalid',supabasePublishableKey:'fake-anon-key'}));
vi.mock('../../../src/pdf/ingest',()=>({ingest:vi.fn()}));
vi.mock('../../../src/data/mode',()=>({getMode:()=> 'live'}));
vi.mock('../../../src/data',()=>({getApi:()=>({getHome:async()=>({projects:[],due:0}),getSettings:async()=>({timeZone:'UTC'})})}));
vi.mock('../../../src/data/study',()=>({getStudyApi:()=>({activeStudyEntry:async()=>null})}));
vi.mock('../../../src/data/parked-thoughts',()=>({getThoughtApi:()=>({})}));
vi.mock('../../../src/platform/bridge',()=>({lemmaNative:async()=>fixture.native}));
vi.mock('../../../src/platform/timer',()=>({replayTimerActions:async()=>[],nativeTimerState:()=>null}));
vi.mock('../../../src/platform/device',()=>({DEVICE_PREFS_CHANGED:'prefs',checkForUpdate:async()=>{},readDevicePref:()=>false}));
vi.mock('../../../src/platform/splash',()=>({whenRootPainted:()=>{}}));
vi.mock('../../../src/platform/NativeWelcome',()=>({default:()=>null}));
vi.mock('@capacitor/core',()=>({Capacitor:{isNativePlatform:()=>true}}));
vi.mock('@capacitor/app',()=>({App:{getInfo:async()=>({version:'1'}),addListener:async()=>({}),getLaunchUrl:async()=>null,toggleBackButtonHandler:async()=>{}}}));

it('removes the phone push token before signing out removes its authenticated session',async()=>{
 Object.defineProperty(window,'Capacitor',{configurable:true,value:{isNativePlatform:()=>true}});
 const records=new Set<string>(),calls:{path:string;auth:string}[]=[];
 const user={id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',role:'authenticated',email:'fixture@example.invalid'};
 const encode=(v:unknown)=>btoa(JSON.stringify(v)).replaceAll('=','').replaceAll('+','-').replaceAll('/','_');
 const accessToken=encode({alg:'HS256',typ:'JWT'})+'.'+encode({...user,sub:user.id,exp:Math.floor(Date.now()/1000)+3600})+'.fake-signature';
 const fetcher:typeof fetch=async(input,init)=>{
  const url=String(input),headers=new Headers(init?.headers),auth=headers.get('Authorization')??'';
  calls.push({path:new URL(url).pathname,auth});
  if(url.includes('/auth/v1/user'))return Response.json(user);
  if(url.includes('/auth/v1/logout'))return new Response(null,{status:204});
  if(url.includes('/rest/v1/rpc/')){
   if(auth!=='Bearer '+accessToken)return Response.json({code:'42501',message:'permission denied for function unregister_push_token'},{status:403});
   if(url.endsWith('/register_push_token'))records.add('phone');
   if(url.endsWith('/unregister_push_token'))records.delete('phone');
   return Response.json({registered:true});
  }
  return Response.json({});
 };
 fixture.db=createClient('https://example.invalid','fake-anon-key',{global:{fetch:fetcher},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const signed=await fixture.db.auth.setSession({access_token:accessToken,refresh_token:'fake-refresh'});expect(signed.error).toBeNull();
 const interval=vi.spyOn(window,'setInterval').mockReturnValue(1);
 await startNative();
 await vi.waitFor(()=>expect(records.size).toBe(1));
 Object.defineProperty(window,'Capacitor',{configurable:true,value:{isNativePlatform:()=>true}});
 await new LiveAdapter().signOut();
 await vi.waitFor(()=>expect(calls.some(c=>c.path.endsWith('/unregister_push_token'))).toBe(true));
 expect(calls.find(c=>c.path.endsWith('/unregister_push_token'))?.auth).toBe('Bearer '+accessToken);
 expect(calls.findIndex(c=>c.path.endsWith('/unregister_push_token'))).toBeLessThan(calls.findIndex(c=>c.path.endsWith('/logout')));
 interval.mockRestore();
 expect(records.size).toBe(0);
});
