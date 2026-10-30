import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,expect,test,vi} from 'vitest';
import PwaStatus from '../../../src/app/PwaStatus';

const mock=vi.hoisted(()=>({
 notify:vi.fn(),
 register:vi.fn(),
 options:null as null | {onOfflineReady:()=>void},
}));
vi.mock('virtual:pwa-register',()=>({
 registerSW:(options:{onOfflineReady:()=>void})=>{
  mock.options=options;
  mock.register();
  return vi.fn();
 },
}));
vi.mock('../../../src/ui/Toast',()=>({useToast:()=>mock.notify}));

afterEach(()=>{
 vi.unstubAllEnvs();
 vi.restoreAllMocks();
 mock.notify.mockClear();
 mock.register.mockClear();
 mock.options=null;
 window.sessionStorage.clear();
 window.history.replaceState(null,'','/');
});

test.each([
 {mode:'demo',expected:0},
 {mode:'live',expected:1},
])('PWA offline-ready notice in $mode mode',async({mode,expected})=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 vi.stubEnv('PROD',true);
 const original=Object.getOwnPropertyDescriptor(navigator,'serviceWorker');
 Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{}});
 window.sessionStorage.clear();
 window.history.replaceState(null,'',mode==='demo'?'/?demo=1':'/?demo=0');
 const host=document.createElement('div');
 document.body.append(host);
 const root=createRoot(host);
 try{
  await act(async()=>root.render(<PwaStatus/>));
  expect(mock.register).toHaveBeenCalledTimes(1);
  expect(mock.options).not.toBeNull();
  await act(async()=>mock.options!.onOfflineReady());
  expect(mock.notify).toHaveBeenCalledTimes(expected);
  if(expected)expect(mock.notify).toHaveBeenCalledWith(
   'Lemma is ready to open offline. Changes still require a connection to save.',
   {tone:'success'},
  );
 }finally{
  await act(async()=>root.unmount());
  host.remove();
  if(original)Object.defineProperty(navigator,'serviceWorker',original);
  else delete (navigator as {serviceWorker?:unknown}).serviceWorker;
 }
});
