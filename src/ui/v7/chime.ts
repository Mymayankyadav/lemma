/** Optional, user-enabled phase chime; browsers can decline audio until a gesture. */
export async function playPhaseChime(enabled:boolean, Audio:typeof AudioContext|undefined = typeof AudioContext==='undefined'?undefined:AudioContext):Promise<boolean>{
 if(!enabled||!Audio)return false;
 let context:AudioContext|undefined;
 try{
  context=new Audio();await context.resume();
  const oscillator=context.createOscillator(),gain=context.createGain(),now=context.currentTime;
  oscillator.type='sine';oscillator.frequency.setValueAtTime(660,now);
  gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(.08,now+.03);gain.gain.exponentialRampToValueAtTime(.0001,now+.5);
  oscillator.connect(gain);gain.connect(context.destination);oscillator.start(now);oscillator.stop(now+.5);
  const audio=context;oscillator.onended=()=>{void audio.close();};
  return true;
 }catch{if(context)void context.close().catch(()=>undefined);return false;}
}
