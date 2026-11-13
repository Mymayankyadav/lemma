import type {DeviceCommand,DeviceCommandApi,DeviceCommandKind} from './contract';

type Row=Record<string,unknown>;
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
async function client(){return (await import('../live/client')).liveClient()}
function command(row:Row):DeviceCommand|null{
 if(typeof row.id!=='string'||!UUID.test(row.id))return null;
 if(row.kind!=='open'&&row.kind!=='timer')return null;
 if(!row.payload||typeof row.payload!=='object'||Array.isArray(row.payload))return null;
 if(typeof row.expires_at!=='string'||!Number.isFinite(Date.parse(row.expires_at)))return null;
 return {id:row.id,kind:row.kind as DeviceCommandKind,payload:row.payload as Record<string,unknown>,expiresAt:row.expires_at};
}
export function createLiveDeviceCommandApi():DeviceCommandApi{
 return {
  mode:'live',
  async register(input){
   const db=await client();
   const {data,error}=await db.rpc('register_app_device',{p_key:input.key,p_label:input.label,p_platform:input.platform});
   if(error)throw new Error(error.message);
   const id=(data as Row|null)?.id;
   return typeof id==='string'&&UUID.test(id)?{id}:null;
  },
  async pending(deviceId){
   const db=await client();
   const {data,error}=await db.rpc('device_commands_for',{p_device:deviceId});
   if(error)throw new Error(error.message);
   return ((data as Row[]|null)??[]).map(command).filter((x):x is DeviceCommand=>x!==null);
  },
  async report(id,stage,reason){
   const db=await client();
   const {error}=await db.rpc('device_command_report',{p_id:id,p_stage:stage,p_reason:reason??null});
   if(error)throw new Error(error.message);
  },
  subscribe(deviceId,onChange){
   let stop=()=>undefined as void;
   let closed=false;
   client().then(db=>{
    if(closed)return;
    const channel=db.channel('device-commands-'+deviceId)
     .on('postgres_changes',{event:'INSERT',schema:'public',table:'device_commands',filter:'device_id=eq.'+deviceId},()=>onChange())
     .subscribe();
    stop=()=>{void db.removeChannel(channel)};
   }).catch(()=>undefined);
   return ()=>{closed=true;stop()};
  },
 };
}
