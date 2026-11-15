// @vitest-environment jsdom
import {it,expect,vi} from 'vitest';
import {createClient} from '@supabase/supabase-js';
import {startNative} from '../../../src/platform/start';

const f=vi.hoisted(()=>({db:null as any,registered:[] as string[],native:null as any}));
vi.mock('../../../src/data/live/client',()=>({liveClient:()=>f.db}));
vi.mock('../../../src/data/env',()=>({supabaseUrl:'https://example.invalid',supabasePublishableKey:'fake-anon-key'}));
vi.mock('../../../src/data/mode',()=>({getMode:()=> 'live'}));
vi.mock('../../../src/data',()=>({getApi:()=>({getHome:async()=>({projects:[],due:0}),getSettings:async()=>({timeZone:'UTC',notify:{enabled:false}})})}));
vi.mock('../../../src/data/study',()=>({getStudyApi:()=>({activeStudyEntry:async()=>null})}));
vi.mock('../../../src/data/parked-thoughts',()=>({getThoughtApi:()=>({})}));
vi.mock('../../../src/platform/bridge',()=>({lemmaNative:async()=>f.native}));
vi.mock('../../../src/platform/device',()=>({DEVICE_PREFS_CHANGED:'prefs',checkForUpdate:async()=>{},readDevicePref:()=>false}));
vi.mock('../../../src/platform/splash',()=>({whenRootPainted:()=>{}}));
vi.mock('../../../src/platform/NativeWelcome',()=>({default:()=>null}));
vi.mock('@capacitor/app',()=>({App:{getInfo:async()=>({version:'1'}),addListener:async()=>({}),getLaunchUrl:async()=>null,toggleBackButtonHandler:async()=>{}}}));

it('registers the same physical phone token to the new owner on a SIGNED_IN account replacement',async()=>{
 const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
 const encode=(v:unknown)=>btoa(JSON.stringify(v)).replaceAll('=','').replaceAll('+','-').replaceAll('/','_');
 const jwt=(id:string)=>encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:id,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})+'.fake-signature';
 const tokenA=jwt(a),tokenB=jwt(b);
 const fetcher:typeof fetch=async(input,init)=>{
  const url=String(input),auth=new Headers(init?.headers).get('Authorization')??'';const id=auth==='Bearer '+tokenB?b:a;
  if(url.includes('/auth/v1/user'))return Response.json({id,role:'authenticated',aud:'authenticated',email:'fixture@example.invalid'});
  if(url.endsWith('/register_push_token'))f.registered.push(id);
  return Response.json({registered:true});
 };
 f.db=createClient('https://example.invalid','fake-anon-key',{global:{fetch:fetcher},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 expect((await f.db.auth.setSession({access_token:tokenA,refresh_token:'fake-refresh-A'})).error).toBeNull();
 const events:string[]=[];f.db.auth.onAuthStateChange((event:string)=>{events.push(event);});
 const token=vi.fn(async()=>({configured:true,token:'fake-local-fcm-token-for-this-phone'}));
 f.native=new Proxy({pushToken:token,timerPendingActions:async()=>({actions:[]}),shareTake:async()=>({items:[]})},{get(target:any,key){if(key==='then')return undefined;return key in target?target[key]:async()=>({});}});
 const interval=vi.spyOn(window,'setInterval').mockReturnValue(1);
 await startNative();await vi.waitFor(()=>expect(f.registered).toContain(a));
 const calls=token.mock.calls.length;
 expect((await f.db.auth.setSession({access_token:tokenB,refresh_token:'fake-refresh-B'})).error).toBeNull();
 await vi.waitFor(()=>expect(token.mock.calls.length).toBeGreaterThan(calls));
 await new Promise(resolve=>setTimeout(resolve,20));
 console.info('owners with a token registration after SDK account replacement',f.registered,'auth events',events);
 expect(events).toContain('SIGNED_IN');expect(events).not.toContain('SIGNED_OUT');
 interval.mockRestore();expect(f.registered.at(-1)).toBe(b);
});
