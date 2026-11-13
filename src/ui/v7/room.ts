import type {SearchItem} from '../../app/v7/searchModel';

export const ROOM_RECENT_KEY='lemma.v7.room.recent';
const groups=new Set(['Paths','Checkpoints','Sessions','Cards','Concepts','Tasks']);
/** Device-local navigation history. Treat stored JSON as untrusted and keep only app destinations. */
export function readRoomRecent():SearchItem[]{
 try{
  const value:unknown=JSON.parse(localStorage.getItem(ROOM_RECENT_KEY)??'[]');
  if(!Array.isArray(value))return [];
  return value.filter((item):item is SearchItem=>!!item&&typeof item==='object'&&typeof item.id==='string'&&
   groups.has(item.group)&&typeof item.title==='string'&&item.title.length>0&&item.title.length<=300&&
   typeof item.to==='string'&&/^\/(?:p\/|s\/|cards\/|atlas(?:\?|$)|tasks(?:\?|$))/.test(item.to)&&
   !/[\u0000-\u001f\\]/.test(item.to)&&item.to.length<=2048).slice(0,3);
 }catch{return [];}
}
export function rememberRoomItem(item:SearchItem):void{
 if(!groups.has(item.group))return;
 try{localStorage.setItem(ROOM_RECENT_KEY,JSON.stringify([item,...readRoomRecent().filter(other=>other.to!==item.to)].slice(0,3)));}
 catch{/* Device history is optional. */}
}
export function overdueParts(value:{tasks:number;deadlines:number;topics:number}):string{
 return [value.tasks?value.tasks+' '+(value.tasks===1?'task':'tasks'):'',value.deadlines?value.deadlines+' '+(value.deadlines===1?'deadline':'deadlines'):'',value.topics?value.topics+' practice':''].filter(Boolean).join(', ');
}
