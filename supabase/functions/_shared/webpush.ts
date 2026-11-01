/** RFC 8291 aes128gcm Web Push and RFC 8292 VAPID, WebCrypto only. */
const utf8 = new TextEncoder()
const enc = (text:string)=>utf8.encode(text)
const join=(...parts:Uint8Array[])=>{
 const result=new Uint8Array(parts.reduce((sum,part)=>sum+part.length,0))
 let offset=0
 for(const part of parts){result.set(part,offset);offset+=part.length}
 return result
}
export const base64url=(bytes:Uint8Array):string=>
 btoa(Array.from(bytes,b=>String.fromCharCode(b)).join('')).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')
export function fromBase64url(value:string):Uint8Array{
 if(!/^[A-Za-z0-9_-]+={0,2}$/.test(value))throw new Error('Invalid base64url key')
 const raw=atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4))
 return Uint8Array.from(raw,ch=>ch.charCodeAt(0))
}
const hmac=async(key:Uint8Array,data:Uint8Array):Promise<Uint8Array>=>{
 const imported=await crypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['sign'])
 return new Uint8Array(await crypto.subtle.sign('HMAC',imported,data))
}
const hkdfExpand=async(prk:Uint8Array,info:Uint8Array,length:number)=>
 (await hmac(prk,join(info,new Uint8Array([1])))).slice(0,length)
const rawPoint=(bytes:Uint8Array)=>{
 if(bytes.length!==65||bytes[0]!==4)throw new Error('Invalid P-256 public key')
 return bytes
}

/** Deterministic ECDH import for the RFC 8291 Appendix A vector. */
export async function importEcdhKeyPair(publicKey:string,privateKey:string):Promise<CryptoKeyPair>{
 const point=rawPoint(fromBase64url(publicKey)),scalar=fromBase64url(privateKey)
 if(scalar.length!==32)throw new Error('Invalid P-256 private key')
 const jwk={kty:'EC',crv:'P-256',x:base64url(point.slice(1,33)),y:base64url(point.slice(33)),d:base64url(scalar),ext:true}
 const [pub,priv]=await Promise.all([
  crypto.subtle.importKey('raw',point,{name:'ECDH',namedCurve:'P-256'},true,[]),
  crypto.subtle.importKey('jwk',jwk,{name:'ECDH',namedCurve:'P-256'},true,['deriveBits']),
 ])
 return {publicKey:pub,privateKey:priv}
}

export interface EncryptOptions {salt?:Uint8Array;serverKeyPair?:CryptoKeyPair;recordSize?:number}
/** Returns the complete 86-byte aes128gcm header followed by ciphertext and tag. */
export async function encryptPushMessage(
 plaintext:string|Uint8Array,uaPublicKey:string,authSecret:string,options:EncryptOptions={}
):Promise<Uint8Array>{
 const message=typeof plaintext==='string'?enc(plaintext):plaintext
 const ua=rawPoint(fromBase64url(uaPublicKey))
 const auth=fromBase64url(authSecret)
 if(auth.length!==16)throw new Error('Invalid Web Push auth secret')
 const salt=options.salt??crypto.getRandomValues(new Uint8Array(16))
 if(salt.length!==16)throw new Error('Web Push salt must be 16 bytes')
 const rs=options.recordSize??4096
 if(!Number.isInteger(rs)||rs<18||rs>65535||message.length+17>=rs||86+message.length+17>4096)
  throw new Error('Web Push message exceeds single-record limit')
 const pair=options.serverKeyPair??await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits'])
 const asPublic=rawPoint(new Uint8Array(await crypto.subtle.exportKey('raw',pair.publicKey)))
 const uaKey=await crypto.subtle.importKey('raw',ua,{name:'ECDH',namedCurve:'P-256'},false,[])
 const shared=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:uaKey},pair.privateKey,256))
 const prkKey=await hmac(auth,shared)
 const ikm=await hkdfExpand(prkKey,join(enc('WebPush: info'),new Uint8Array([0]),ua,asPublic),32)
 const prk=await hmac(salt,ikm)
 const cek=await hkdfExpand(prk,join(enc('Content-Encoding: aes128gcm'),new Uint8Array([0])),16)
 const nonce=await hkdfExpand(prk,join(enc('Content-Encoding: nonce'),new Uint8Array([0])),12)
 const aes=await crypto.subtle.importKey('raw',cek,{name:'AES-GCM'},false,['encrypt'])
 const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce,tagLength:128},aes,join(message,new Uint8Array([2]))))
 const header=new Uint8Array(86)
 header.set(salt)
 new DataView(header.buffer).setUint32(16,rs,false)
 header[20]=65
 header.set(asPublic,21)
 return join(header,ciphertext)
}

export interface VapidKeys {publicKey:string;privateKey:string;subject:string}
/** Signs a short-lived ES256 JWT. Keys are supplied by Edge secrets, never by the browser. */
export async function createVapidAuthorization(endpoint:string,keys:VapidKeys,now=Date.now()):Promise<{
 token:string;authorization:string;publicKey:string
}>{
 const url=new URL(endpoint)
 if(url.protocol!=='https:')throw new Error('Web Push endpoint must use HTTPS')
 if(!/^mailto:|^https:\/\//.test(keys.subject))throw new Error('Invalid VAPID subject')
 const point=rawPoint(fromBase64url(keys.publicKey)),privateScalar=fromBase64url(keys.privateKey)
 if(privateScalar.length!==32)throw new Error('Invalid VAPID private key')
 const jwk={kty:'EC',crv:'P-256',x:base64url(point.slice(1,33)),y:base64url(point.slice(33)),d:base64url(privateScalar),ext:false}
 const key=await crypto.subtle.importKey('jwk',jwk,{name:'ECDSA',namedCurve:'P-256'},false,['sign'])
 const head=base64url(enc(JSON.stringify({typ:'JWT',alg:'ES256'})))
 const body=base64url(enc(JSON.stringify({aud:url.origin,exp:Math.floor(now/1000)+12*3600,sub:keys.subject})))
 const signingInput=head+'.'+body
 const signature=new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,enc(signingInput)))
 const token=signingInput+'.'+base64url(signature)
 return {token,authorization:'vapid t='+token+', k='+keys.publicKey,publicKey:keys.publicKey}
}

/** Ready for NOTIF-4 to send with TTL, Urgency and Topic headers. */
export async function prepareWebPush(
 subscription:{endpoint:string;keys:{p256dh:string;auth:string}},payload:string,vapid:VapidKeys
):Promise<{body:Uint8Array;headers:Record<string,string>}>{
 if(enc(payload).length>3072)throw new Error('Notification JSON payload exceeds 3 KB')
 const [body,auth]=await Promise.all([
  encryptPushMessage(payload,subscription.keys.p256dh,subscription.keys.auth),
  createVapidAuthorization(subscription.endpoint,vapid),
 ])
 return {body,headers:{'Content-Encoding':'aes128gcm','Content-Type':'application/octet-stream',Authorization:auth.authorization}}
}
