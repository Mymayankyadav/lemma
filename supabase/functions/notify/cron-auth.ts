/**
 * NOTIF-4b6a: fail-closed cron credential gate for POST /tick.
 *
 * Invoke before constructing a service-role client or reading owner data.
 * The configured secret is the 32-byte hexadecimal value provisioned in
 * NOTIFY_CRON_SECRET and Vault; it must never be logged or echoed.
 */
export type CronAuthorization =
 | {ok:true;status:200}
 | {ok:false;status:401|503;message:string};

const HEX_32_BYTES=/^[0-9a-f]{64}$/i;

/**
 * Compare all 64 credential positions even when the supplied value has a
 * different length or an early mismatch. Work is bounded independently of
 * the length and content of the untrusted header.
 *
 * This deliberately avoids a JS short-circuit comparison, which would leak
 * the index of the first differing character. The secret is always 64 ASCII
 * characters; the server validates that configuration before comparison.
 */
function equalFixedHex64(supplied:string,configured:string):boolean {
 let mismatch=supplied.length^64;
 for(let i=0;i<64;i++){
  // charCodeAt outside the string returns NaN; bitwise operations coerce to 0.
  mismatch|=(supplied.charCodeAt(i)^configured.charCodeAt(i));
 }
 return mismatch===0;
}

export function authorizeCronTick(
 header:string|null,
 configuredSecret:string|undefined,
):CronAuthorization {
 if(!configuredSecret||!HEX_32_BYTES.test(configuredSecret)){
  return {ok:false,status:503,message:'Reminders are not set up yet'};
 }
 const supplied=header??'';
 if(!equalFixedHex64(supplied,configuredSecret)){
  return {ok:false,status:401,message:'Unauthorized'};
 }
 return {ok:true,status:200};
}
