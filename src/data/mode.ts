export type DataMode = 'live' | 'demo'
export type DemoProfile = 'default' | 'stress' | 'extreme' | 'first-use'
const DEMO_KEY = 'lemma.demo'
const allowFirstUse=import.meta.env.DEV||import.meta.env.MODE==='test'||import.meta.env.VITE_ALLOW_FLAG_OVERRIDES==='1'
const explicit=(value:string|null):DemoProfile|null=>{
 if(value==='1')return 'default'
 if(value==='stress'||value==='extreme')return value
 return value==='first-use'&&allowFirstUse?'first-use':null
}
function selectedDemo():DemoProfile|null{
 if(typeof window==='undefined')return null
 const query=new URLSearchParams(window.location.search).get('demo'),profile=explicit(query)
 try{
  if(query==='0'){sessionStorage.removeItem(DEMO_KEY);return null}
  if(profile&&query){sessionStorage.setItem(DEMO_KEY,query);return profile}
  return explicit(sessionStorage.getItem(DEMO_KEY))
 }catch{return profile}
}
/** Remember the chosen demo profile only for this browser tab. */
export function getDemoProfile():DemoProfile{return selectedDemo()??'default'}
export function getMode():DataMode{return selectedDemo()?'demo':'live'}
