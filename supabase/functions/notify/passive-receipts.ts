import {signActionToken} from './action-token.ts';

/** FIX-714a: pure producer-side receipt envelope, independent of delivery.
 * Call only after the NOTIF-4b5 builder has validated and sanitized the v1
 * payload. Never persist or serialize the HMAC secret. The existing /act
 * verifier and owner-scoped atomic claim remain the only receipt authority.
 */
export interface PassiveReceiptOptions {
 ownerId:string;
 secret:string;
 expiresAt:number;
 nowSeconds?:number;
}
const utf8=new TextEncoder();
const MAX_BYTES=3072;
const FIELDS=['v','id','kind','tag','title','body','url','actions','ts'] as const;
const invalid=(reason:string):never=>{throw new Error('Invalid passive receipt payload: '+reason)};

/** Append two *nonvisible* signed tokens to a validated two-action payload.
 * The row ID is taken from the exact JSON being delivered, never a separate
 * caller-supplied number that could bind receipts to another notification.
 * Unsafe 64-bit IDs fail closed until /act supports lossless bigint claims.
 */
export async function attachPassiveReceipts(
 payloadJson:string,options:PassiveReceiptOptions,
):Promise<string>{
 if(typeof payloadJson!=='string'||utf8.encode(payloadJson).length>MAX_BYTES)
  invalid('3 KB limit');
 let raw:unknown;
 try{raw=JSON.parse(payloadJson)}catch{invalid('malformed JSON')}
 if(!raw||typeof raw!=='object'||Array.isArray(raw))invalid('not a v1 object');
 const payload=raw as Record<string,unknown>;
 if(Object.keys(payload).length!==FIELDS.length||
    FIELDS.some(field=>!Object.prototype.hasOwnProperty.call(payload,field)))
  invalid('unexpected or missing fields');
 if(payload.v!==1||typeof payload.kind!=='string'||
    typeof payload.tag!=='string'||typeof payload.title!=='string'||
    typeof payload.body!=='string'||typeof payload.url!=='string'||
    !Number.isSafeInteger(payload.ts)||Number(payload.ts)<=0||
    !Array.isArray(payload.actions)||payload.actions.length>2||
    payload.actions.some(action=>!action||typeof action!=='object'||Array.isArray(action)||
      typeof action.action!=='string'||typeof action.title!=='string'))
  invalid('invalid v1 envelope');
 const id=payload.id;
 const n=typeof id==='number'?id:
  typeof id==='string'&&/^[1-9]\d*$/.test(id)?Number(id):NaN;
 if(!Number.isSafeInteger(n)||n<1||
    (typeof id==='string'&&String(n)!==id))invalid('unsafe notification id');
 const nowSeconds=options.nowSeconds??Math.floor(Date.now()/1000);
 const common={u:options.ownerId,n,exp:options.expiresAt};
 const [openToken,dismissToken]=await Promise.all([
  signActionToken({...common,a:'open'},options.secret,nowSeconds),
  signActionToken({...common,a:'dismiss'},options.secret,nowSeconds),
 ]);
 const encoded=JSON.stringify({...payload,openToken,dismissToken});
 if(utf8.encode(encoded).length>MAX_BYTES)invalid('3 KB limit');
 return encoded;
}
