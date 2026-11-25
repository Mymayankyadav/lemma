// @vitest-environment jsdom
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {useAuth,useHome} from '../../../src/data/hooks';
import {startNative} from '../../../src/platform/start';
import {takeSharedSources} from '../../../src/platform/share';
import {authCallback} from '../../../src/platform/links';

const f=vi.hoisted(()=>({auth:null as any,native:null as any,launch:null as any,listeners:{} as Record<string,any>,user:{email:'A@example.test'} as any,exchange:vi.fn()}));
vi.mock('../../../src/data/live/client',()=>({liveClient:()=>({auth:{
 onAuthStateChange:(cb:any)=>{f.auth=cb;return {data:{subscription:{unsubscribe(){}}}};},exchangeCodeForSession:f.exchange},rpc:async()=>({data:{},error:null})})}));
vi.mock('../../../src/data/env',()=>({supabaseUrl:'https://example.invalid',supabasePublishableKey:'fake'}));
vi.mock('../../../src/data/mode',()=>({getMode:()=> 'live'}));
vi.mock('../../../src/data',()=>({getApi:()=>({getAuth:async()=>f.user,getHome:async()=>({private:'Private proof of A',projects:[],due:0}),getSettings:async()=>({timeZone:'UTC',notify:{enabled:false}})})}));
vi.mock('../../../src/data/study',()=>({getStudyApi:()=>({activeStudyEntry:async()=>null,listCalendarBlocks:async()=>[]})}));
vi.mock('../../../src/data/parked-thoughts',()=>({getThoughtApi:()=>({})}));
vi.mock('../../../src/platform/bridge',()=>({lemmaNative:async()=>f.native}));
vi.mock('../../../src/platform/device',()=>({DEVICE_PREFS_CHANGED:'prefs',checkForUpdate:async()=>{},readDevicePref:()=>false,AUTH_CALLBACK:'io.github.mymayankyadav.lemma://auth/callback',APP_ORIGIN:'https://mymayankyadav.github.io',APP_PATH:'/lemma/'}));
vi.mock('../../../src/platform/splash',()=>({whenRootPainted:()=>{}}));
vi.mock('../../../src/platform/NativeWelcome',()=>({default:()=>null}));
vi.mock('@capacitor/app',()=>({App:{getInfo:async()=>({version:'1'}),addListener:async(name:string,cb:any)=>{f.listeners[name]=cb;return {};},getLaunchUrl:async()=>f.launch,toggleBackButtonHandler:async()=>{}}}));
vi.mock('@capacitor/core',()=>({Capacitor:{convertFileSrc:(s:string)=>s}}));
vi.mock('@capacitor/browser',()=>({Browser:{close:async()=>{}}}));
let interval:any;
beforeEach(()=>{
 f.launch=null;f.auth=null;f.listeners={};f.user={email:'A@example.test'};f.exchange.mockReset().mockResolvedValue({error:null});
 f.native=new Proxy({pushToken:async()=>({configured:false,token:null}),timerPendingActions:async()=>({actions:[]}),shareTake:async()=>({items:[]})},{get(target:any,key){if(key==='then')return undefined;return key in target?target[key]:async()=>({});}});
 interval=vi.spyOn(window,'setInterval').mockReturnValue(1);takeSharedSources();
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
});
afterEach(()=>{interval.mockRestore();vi.unstubAllGlobals();});

it('control: Capacitor replays the retained initial OAuth callback to the startup listener',async()=>{
 const url='io.github.mymayankyadav.lemma://auth/callback?code=valid-code-123456';
 expect(authCallback(url)).toEqual({code:'valid-code-123456'});
 f.launch={url};await startNative();
 // BridgeActivity.load calls onNewIntent(getIntent()); AppPlugin retains this event until this listener arrives.
 f.listeners.appUrlOpen({url});
 await vi.waitFor(()=>expect(f.exchange).toHaveBeenCalledWith('valid-code-123456'));
 console.info('retained cold OAuth callback exchange calls',f.exchange.mock.calls);
 expect(f.exchange).toHaveBeenCalledWith('valid-code-123456');
});

it('retains every file from consecutive share intents until the New path importer consumes them',async()=>{
 f.native.shareTake=async()=>({items:[
 {kind:'files',files:[{path:'file-a',name:'first.md',mime:'text/markdown'}]},
 {kind:'files',files:[{path:'file-b',name:'second.md',mime:'text/markdown'}]},
 ]});
 vi.stubGlobal('fetch',async(path:string)=>({ok:true,blob:async()=>new Blob([path],{type:'text/markdown'})}));
 await startNative();const files=takeSharedSources();
 console.info('shared files preserved for importer',files.map(x=>x.name));
 expect(files.map(x=>x.name)).toEqual(['first.md','second.md']);
});

it('clears private query data and the authenticated view when the SDK signs out outside useSignOut',async()=>{
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 function Protected(){const auth=useAuth(),home=useHome();return <p>{auth.data?home.data?.private:'Signed out'}</p>;}
 try{
 await act(async()=>root.render(<QueryClientProvider client={client}><Protected/></QueryClientProvider>));
 await vi.waitFor(()=>expect(host.textContent).toContain('Private proof of A'));
 await startNative();await vi.waitFor(()=>expect(f.auth).toBeTypeOf('function'));
 f.user=null;await act(async()=>f.auth('SIGNED_OUT',null));
 console.info('view after real startup sign-out callback',host.textContent,'cached auth',client.getQueryData(['auth']));
 await vi.waitFor(()=>expect(host.textContent).toBe('Signed out'));
 expect(client.getQueryData(['home'])).toBeUndefined();
 }finally{await act(async()=>root.unmount());client.clear();host.remove();}
});
