import {describe,it,expect} from 'vitest'
import {mkdtempSync,writeFileSync,rmSync,unlinkSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {deflateSync} from 'node:zlib'
import {auditQa3Screens,pngHeader,renderScreenAudit} from '../../../scripts/qa3-screens'
import {qa3Cases,QA3_ROUTES,qa3ScreenshotName} from '../../../scripts/qa3-report'

const signature=Buffer.from([137,80,78,71,13,10,26,10])
const table=Uint32Array.from({length:256},(_,n)=>{
 let c=n
 for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1
 return c>>>0
})
function crc32(bytes:Buffer){
 let c=0xffffffff
 for(const value of bytes)c=table[(c^value)&255]^(c>>>8)
 return (c^0xffffffff)>>>0
}
function chunk(type:string,data:Buffer){
 const bytes=Buffer.alloc(12+data.length)
 bytes.writeUInt32BE(data.length,0)
 bytes.write(type,4,'ascii')
 data.copy(bytes,8)
 bytes.writeUInt32BE(crc32(bytes.subarray(4,8+data.length)),8+data.length)
 return bytes
}
/** A genuine grayscale 1-bit PNG: every scanline has filter=0 and zlib data. */
function envelope(width:number,height:number,nonce=0){
 const ihdr=Buffer.alloc(13)
 ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4)
 ihdr[8]=1;ihdr[9]=0
 const stride=Math.ceil(width/8)+1,raw=Buffer.alloc(stride*height)
 raw[1]=nonce&255
 raw[2]=(nonce>>>8)&255
 return Buffer.concat([signature,chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))])
}
function forgedEnvelope(width:number,height:number){
 const bytes=Buffer.alloc(128)
 signature.copy(bytes,0);bytes.writeUInt32BE(13,8);bytes.write('IHDR',12,'ascii')
 bytes.writeUInt32BE(width,16);bytes.writeUInt32BE(height,20)
 Buffer.from([0,0,0,0,73,69,78,68,174,66,96,130]).copy(bytes,bytes.length-12)
 return bytes
}

function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'lemma-qa3-screens-'))
 let n=0
 for(const matrix of qa3Cases())for(const route of QA3_ROUTES){
  const height=matrix.width===390?844:740
  writeFileSync(join(dir,qa3ScreenshotName(matrix,route)),envelope(matrix.width*2,height*2,++n))
 }
 return dir
}
describe('QA-3b screenshot structural gate',()=>{
 it('accepts 1×/2×/3× matching PNG envelopes and rejects malformed dimensions',()=>{
  for(const scale of [1,2,3])expect(pngHeader(envelope(390*scale,844*scale),390,844)?.scale).toBe(scale)
  expect(pngHeader(envelope(390,740),390,844)).toBeNull()
  expect(pngHeader(envelope(360,740),390,844)).toBeNull()
  expect(pngHeader(Buffer.alloc(128),390,844)).toBeNull()
  expect(pngHeader(envelope(390,844).subarray(0,100),390,844)).toBeNull()
  // Valid CRCs and chunk order are insufficient if IDAT is not zlib data.
  const ihdr=Buffer.alloc(13)
  ihdr.writeUInt32BE(390,0);ihdr.writeUInt32BE(844,4);ihdr[8]=1
  const invalidZlib=Buffer.concat([signature,chunk('IHDR',ihdr),
   chunk('IDAT',Buffer.from([1,2,3,4])),chunk('IEND',Buffer.alloc(0))])
  expect(pngHeader(invalidZlib,390,844)).toBeNull()
  const corrupted=envelope(390,844)
  corrupted[55]^=1 // damage IDAT payload without updating its CRC
  expect(pngHeader(corrupted,390,844)).toBeNull()
  const truncated=envelope(390,844)
  expect(pngHeader(truncated.subarray(0,truncated.length-1),390,844)).toBeNull()
 })
 it('checks all 144 expected S/X world and viewport captures',()=>{
  const dir=fixture()
  try{
   const report=auditQa3Screens(dir)
   expect(report.status).toBe('PASS')
   expect(report.expected).toBe(144)
   expect(report.checked).toBe(144)
   expect(report.errors).toEqual([])
   expect(renderScreenAudit(report)).toContain('Structural status: PASS')
   expect(renderScreenAudit(report)).toContain('does **not** establish')
  }finally{rmSync(dir,{recursive:true,force:true})}
 })
 it('fails closed on missing, corrupt and wrong-size images',()=>{
  const dir=fixture()
  try{
   const cases=qa3Cases(),name=qa3ScreenshotName(cases[0],'/')
   writeFileSync(join(dir,name),envelope(360,740))
   const wrong=auditQa3Screens(dir)
   expect(wrong.status).toBe('FAIL')
   expect(wrong.errors.some(e=>e.includes(name))).toBe(true)
   writeFileSync(join(dir,name),Buffer.alloc(200))
   expect(auditQa3Screens(dir).errors.some(e=>e.includes('Invalid PNG'))).toBe(true)
   unlinkSync(join(dir,name))
   expect(auditQa3Screens(dir).errors.some(e=>e.includes('Missing screenshot: '+name))).toBe(true)
  }finally{rmSync(dir,{recursive:true,force:true})}
 })
 it('warns on identical screenshots of distinct routes without falsely passing visual review',()=>{
  const dir=fixture()
  try{
   const matrix=qa3Cases()[0]
   const a=qa3ScreenshotName(matrix,'/'),b=qa3ScreenshotName(matrix,'/projects')
   writeFileSync(join(dir,b),envelope(matrix.width*2,(matrix.width===390?844:740)*2,1))
   const report=auditQa3Screens(dir)
   expect(report.status).toBe('PASS')
   expect(report.warnings.some(w=>w.includes(a)&&w.includes(b))).toBe(true)
  }finally{rmSync(dir,{recursive:true,force:true})}
 })

 it('rejects a forged IHDR/IEND envelope without an IDAT chunk',()=>{
  // This was the old positive fixture: signature and tail alone are not PNG.
  expect(pngHeader(forgedEnvelope(390,844),390,844)).toBeNull()
 })
 it('warns when an identical capture is reused across different matrices',()=>{
  const dir=fixture()
  try{
   const cases=qa3Cases(),a=cases[0],b=cases.find(c=>c.width===a.width&&c.filename!==a.filename)!
   const source=qa3ScreenshotName(a,'/'),target=qa3ScreenshotName(b,'/projects')
   writeFileSync(join(dir,target),envelope(a.width*2,(a.width===390?844:740)*2,1))
   const report=auditQa3Screens(dir)
   expect(report.warnings.some(w=>w.includes(source)&&w.includes(target))).toBe(true)
  }finally{rmSync(dir,{recursive:true,force:true})}
 })

 it('requires a valid PLTE before IDAT for indexed-colour PNGs',()=>{
  const ihdr=Buffer.alloc(13)
  ihdr.writeUInt32BE(390,0);ihdr.writeUInt32BE(844,4)
  ihdr[8]=1;ihdr[9]=3 // indexed 1-bit; max two palette entries
  const raw=Buffer.alloc((Math.ceil(390/8)+1)*844)
  const idat=chunk('IDAT',deflateSync(raw))
  const end=chunk('IEND',Buffer.alloc(0))
  const palette=chunk('PLTE',Buffer.from([0,0,0,255,255,255]))
  expect(pngHeader(Buffer.concat([signature,chunk('IHDR',ihdr),idat,end]),390,844)).toBeNull()
  expect(pngHeader(Buffer.concat([signature,chunk('IHDR',ihdr),palette,idat,end]),390,844))
   .toMatchObject({width:390,height:844,scale:1})
  expect(pngHeader(Buffer.concat([signature,chunk('IHDR',ihdr),idat,palette,end]),390,844)).toBeNull()
  expect(pngHeader(Buffer.concat([signature,chunk('IHDR',ihdr),
   chunk('PLTE',Buffer.from([0,0])),idat,end]),390,844)).toBeNull()
  expect(pngHeader(Buffer.concat([signature,chunk('IHDR',ihdr),palette,palette,idat,end]),390,844)).toBeNull()
 });
 it('rejects a CRC-correct but undecodable Adam7 interlaced PNG',()=>{
  // Playwright Chromium captures are non-interlaced. A one-byte inflated IDAT
  // cannot encode the seven Adam7 passes of a 390x844 grayscale image.
  const ihdr=Buffer.alloc(13)
  ihdr.writeUInt32BE(390,0);ihdr.writeUInt32BE(844,4)
  ihdr[8]=1;ihdr[9]=0;ihdr[12]=1
  const forged=Buffer.concat([signature,chunk('IHDR',ihdr),
   chunk('IDAT',deflateSync(Buffer.from([0]))),chunk('IEND',Buffer.alloc(0))])
  expect(pngHeader(forged,390,844)).toBeNull()
 })
})
