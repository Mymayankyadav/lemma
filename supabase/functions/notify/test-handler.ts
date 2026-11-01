/**
 * NOTIF-4b3: owner-authenticated /test behavior, with network and database
 * adapters injected by the Edge route. Never uses the service role before
 * JWT verification and never looks up a device without its owner id.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BASE64URL=/^[A-Za-z0-9_-]+={0,2}$/;
const CLOCK=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
export interface TestDevice {
 id:string;
 userId:string;
 disabledAt?:string|null;
 subscription:{endpoint:string;keys:{p256dh:string;auth:string}};
 prefs?:{maxPerDay?:number;quiet?:{start?:string;end?:string}};
}
export interface TestPushMessage {kind:'test';tag:'test';title:string;body:string}
/** Structural result; the later transport integration supplies sendWebPush. */
export type TestPushOutcome={status:'sent'|'gone'|'retry'|'failed';httpStatus?:number};
export interface TestPushDeps {
 configured:boolean;
 /** Must call supabase.auth.getUser(jwt), not parse JWT claims locally. */
 verifyJwt:(jwt:string)=>Promise<{id:string}|null>;
 /** Must filter the query by BOTH user_id and device id. */
 loadDevice:(ownerId:string,deviceId:string)=>Promise<TestDevice|null>;
 /** One attempt; the transport handles status classification, not retries. */
 send:(device:TestDevice,message:TestPushMessage)=>Promise<TestPushOutcome>;
}
export interface TestPushResponse {
 status:200|400|401|404|410|503;
 body:{message:string};
}
const reply=(status:TestPushResponse['status'],message:string):TestPushResponse=>({status,body:{message}});
/** Push subscriptions are persisted client data: validate again before outbound I/O. */
function usableSubscription(value:unknown):boolean{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const subscription=value as Record<string,unknown>;
 const endpoint=subscription.endpoint;
 const keys=subscription.keys;
 if(typeof endpoint!=='string'||endpoint.length>1000||/[\x00-\x20\x7f]/u.test(endpoint))return false;
 if(!keys||typeof keys!=='object'||Array.isArray(keys))return false;
 const {p256dh,auth}=keys as Record<string,unknown>;
 if(typeof p256dh!=='string'||!p256dh||p256dh.length>200||!BASE64URL.test(p256dh)||
    typeof auth!=='string'||!auth||auth.length>50||!BASE64URL.test(auth))return false;
 try{
  const url=new URL(endpoint);
  const hostname=url.hostname.toLowerCase().replace(/\.$/,'');
  // Push endpoints are public HTTPS origins. Never allow persisted client
  // data to direct the service-role Edge sender at local infrastructure.
  // Reject all IP literals (including URL-normalized numeric IPv4 forms).
  const local=hostname==='localhost'||hostname.endsWith('.localhost')||
   hostname.endsWith('.local')||hostname.endsWith('.internal')||
   hostname.endsWith('.invalid');
  const ipLiteral=hostname.startsWith('[')||/^[0-9.]+$/.test(hostname);
  return url.protocol==='https:'&&Boolean(hostname)&&!local&&!ipLiteral&&
   !url.username&&!url.password&&!url.hash;
 }catch{return false}
}
function testMessage(device:TestDevice):TestPushMessage{
 const prefs=device.prefs;
 const requestedCap=prefs?.maxPerDay;
 const cap=typeof requestedCap==='number'&&Number.isInteger(requestedCap)&&
  requestedCap>=1&&requestedCap<=5?requestedCap:3;
 const quiet=prefs?.quiet;
 const start=typeof quiet?.start==='string'&&CLOCK.test(quiet.start)?quiet.start:'22:30';
 const end=typeof quiet?.end==='string'&&CLOCK.test(quiet.end)?quiet.end:'07:30';
 // Equal endpoints mean quiet hours are disabled (notifications.md §4a).
 // Do not promise silence during a window that does not exist.
 const cadence=cap===1?'once':`${cap} times`;
 const body=start===end
  ?`Lemma will write at most ${cadence} a day. Quiet hours are off.`
  :`Lemma will write at most ${cadence} a day, never between ${start} and ${end}.`;
 return {
  kind:'test',tag:'test',title:'Reminders are on',body,
 };
}
export async function handleTestPushRequest(
 authorization:string|null,
 input:unknown,
 deps:TestPushDeps,
):Promise<TestPushResponse>{
 if(!deps.configured)return reply(503,'Reminders are not set up yet');
 const token=typeof authorization==='string'
  ?/^Bearer ([^\s]+)$/i.exec(authorization)?.[1]:undefined;
 if(!token)return reply(401,'Sign in to send a test reminder');
 let owner:{id:string}|null;
 try{owner=await deps.verifyJwt(token)}
 catch{return reply(401,'Sign in to send a test reminder')}
 if(!owner||typeof owner.id!=='string'||!UUID.test(owner.id))
  return reply(401,'Sign in to send a test reminder');
 if(!input||typeof input!=='object'||Array.isArray(input))
  return reply(400,'Invalid device');
 const raw=input as Record<string,unknown>;
 if(Object.keys(raw).length!==1||typeof raw.deviceId!=='string'||!UUID.test(raw.deviceId))
  return reply(400,'Invalid device');
 let device:TestDevice|null;
 try{device=await deps.loadDevice(owner.id,raw.deviceId)}
 catch{return reply(503,'Could not send test reminder')}
 if(!device||device.id!==raw.deviceId||device.userId!==owner.id||device.disabledAt)
  return reply(404,'Device not available');
 if(!usableSubscription(device.subscription))return reply(503,'Could not send test reminder');
 try{
  const result=await deps.send(device,testMessage(device));
  // Only an HTTP 201 from the push service confirms delivery acceptance.
  // A contradictory or incomplete adapter result must not claim success.
  if(result.status==='sent'&&result.httpStatus===201)return reply(200,'Test reminder sent');
  if(result.status==='gone')return reply(410,'Device no longer receives reminders');
 }catch{/* Generic response; never expose subscription details. */}
 return reply(503,'Could not send test reminder');
}
