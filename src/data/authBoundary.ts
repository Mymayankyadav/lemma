/** One account boundary for caches and asynchronous native work, including SDK-initiated logout. */
type Identity={id:string;email?:string}|null;
let identity:Identity|undefined,generation=0;
const listeners=new Set<(user:Identity)=>void>();
export const authSignedOut=()=>identity===null;
export const authGeneration=()=>generation;
export const authOwner=()=>identity?.id??null;
export function publishAuth(user:Identity):void{
 if(identity!==undefined&&identity?.id===user?.id)return;
 identity=user;generation++;
 for(const listener of listeners)listener(user);
}
export function onAccountChange(listener:(user:Identity)=>void):()=>void{
 listeners.add(listener);return()=>{listeners.delete(listener);};
}
