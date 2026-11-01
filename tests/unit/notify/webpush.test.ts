import { beforeAll, describe, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
import { base64url, fromBase64url, importEcdhKeyPair, encryptPushMessage, createVapidAuthorization, prepareWebPush } from '../../../supabase/functions/_shared/webpush'

beforeAll(()=>{ vi.stubGlobal('crypto',webcrypto) })

describe('RFC 8291 Web Push encryption',()=>{
 it('matches Appendix A ciphertext exactly, not just round-trip decryption',async()=>{
  // RFC 8291 Appendix A: public interoperability test vector (not a secret).
  const serverPublic='BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIg'+'Dll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8'
  const serverPrivate='yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'
  const uaPublic='BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-'+'JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4'
  const pair=await importEcdhKeyPair(serverPublic,serverPrivate)
  const payload=fromBase64url('V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24')
  const salt=fromBase64url('DGv6ra1nlYgDCS1FRnbzlw')
  const bytes=await encryptPushMessage(payload,uaPublic,'BTBZMqHH6r4Tts7J_aSIgg',{serverKeyPair:pair,salt})
  expect(bytes.length).toBe(86+payload.length+1+16)
  expect(base64url(bytes.slice(0,16))).toBe('DGv6ra1nlYgDCS1FRnbzlw')
  expect(new DataView(bytes.buffer).getUint32(16,false)).toBe(4096)
  expect(bytes[20]).toBe(65)
  expect(base64url(bytes.slice(21,86))).toBe(serverPublic)
  expect(base64url(bytes.slice(86))).toBe('8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ')
 })
 it('rejects malformed subscriptions and messages above the single-record bound',async()=>{
  await expect(encryptPushMessage('hello','invalid','invalid')).rejects.toThrow()
  const pair=await webcrypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits'])
  const pub=base64url(new Uint8Array(await webcrypto.subtle.exportKey('raw',pair.publicKey)))
  await expect(encryptPushMessage('x'.repeat(4000),pub,'BTBZMqHH6r4Tts7J_aSIgg')).rejects.toThrow('single-record')
 })
})

describe('RFC 8292 VAPID',()=>{
 it('rejects a notification JSON body above 3 KB before any network request',async()=>{
  await expect(prepareWebPush({endpoint:'https://push.example.net/abc',keys:{p256dh:'x',auth:'x'}},
   'x'.repeat(3073),{publicKey:'x',privateKey:'x',subject:'mailto:owner@example.org'}))
   .rejects.toThrow('3 KB')
 })

 it('signs a verifiable ES256 token for the push endpoint origin, expiring within 12 hours',async()=>{
  const pair=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify'])
  const pub=base64url(new Uint8Array(await webcrypto.subtle.exportKey('raw',pair.publicKey)))
  const jwk=await webcrypto.subtle.exportKey('jwk',pair.privateKey)
  const now=Date.parse('2026-11-01T10:00:00Z')
  const result=await createVapidAuthorization('https://push.example.net/endpoint/abc',{publicKey:pub,privateKey:jwk.d!,subject:'mailto:owner@example.org'},now)
  const [header,payload,signature]=result.token.split('.')
  expect(JSON.parse(new TextDecoder().decode(fromBase64url(header)))).toMatchObject({alg:'ES256',typ:'JWT'})
  const claims=JSON.parse(new TextDecoder().decode(fromBase64url(payload)))
  expect(claims.aud).toBe('https://push.example.net')
  expect(claims.sub).toBe('mailto:owner@example.org')
  expect(claims.exp).toBe(Math.floor(now/1000)+12*3600)
  expect(await webcrypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},pair.publicKey,fromBase64url(signature),new TextEncoder().encode(header+'.'+payload))).toBe(true)
  expect(result.authorization).toContain('vapid t=')
 })
 it('rejects insecure endpoints',async()=>{
  await expect(createVapidAuthorization('http://push.example.net',{publicKey:'x',privateKey:'x',subject:'mailto:x@example.org'})).rejects.toThrow('HTTPS')
 })
})
