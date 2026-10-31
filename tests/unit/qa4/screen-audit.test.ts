import {describe,it,expect} from 'vitest'
import {mkdtempSync,mkdirSync,readFileSync,rmSync,unlinkSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {deflateSync} from 'node:zlib'
import {auditV4Screens,renderV4Audit,V4_SCENES,V4_FULL} from '../../../scripts/qa4-screens'

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
 const out=Buffer.alloc(12+data.length)
 out.writeUInt32BE(data.length,0);out.write(type,4,'ascii')
 data.copy(out,8)
 out.writeUInt32BE(crc32(out.subarray(4,8+data.length)),8+data.length)
 return out
}
function png(width:number,height:number,nonce:number){
 const ihdr=Buffer.alloc(13)
 ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4)
 ihdr[8]=1;ihdr[9]=0
 const raw=Buffer.alloc((Math.ceil(width/8)+1)*height)
 raw[1]=nonce&255;raw[2]=(nonce>>>8)&255
 return Buffer.concat([signature,chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))])
}
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'lemma-qa4-'))
 let nonce=0
 for(const theme of ['graph','graph-night'])
 for(const demo of ['1','stress'])
 for(const [width,height] of [[360,780],[390,844]] as const){
  const dir=join(root,'v4',theme,demo,width+'px')
  mkdirSync(dir,{recursive:true})
  for(const {name} of V4_SCENES)writeFileSync(join(dir,name+'.png'),png(width,height,++nonce))
  for(const name of V4_FULL)writeFileSync(join(dir,name+'-full.png'),png(width,height+100,++nonce))
 }
 return root
}
describe('QA-4a complete v4 screenshot evidence gate',()=>{
 it('requires all 23 documented scenes across eight worlds/profiles/widths',()=>{
  expect(V4_SCENES).toHaveLength(23)
  const root=fixture()
  try{
   const result=auditV4Screens(root)
   expect(result.status).toBe('PASS')
   expect(result.checked).toBe(184)
   expect(result.fullChecked).toBe(64)
   expect(result.errors).toEqual([])
   expect(renderV4Audit(result)).toContain('does **not** prove')
  }finally{rmSync(root,{recursive:true,force:true})}
 })
 it('fails closed on a missing route or missing full-page evidence',()=>{
  const root=fixture()
  try{
   const dir=join(root,'v4','graph','1','360px')
   unlinkSync(join(dir,'review-run-answer.png'))
   unlinkSync(join(dir,'paths-full.png'))
   const report=auditV4Screens(root)
   expect(report.status).toBe('FAIL')
   expect(report.errors).toEqual(expect.arrayContaining([
    expect.stringContaining('Missing scene:'),
    expect.stringContaining('Missing full-page scene:'),
   ]))
  }finally{rmSync(root,{recursive:true,force:true})}
 })
 it('rejects a duplicate answer/idle image even when both PNGs are valid',()=>{
  const root=fixture()
  try{
   const dir=join(root,'v4','graph-night','stress','390px')
   writeFileSync(join(dir,'review-run-answer.png'),readFileSync(join(dir,'review-run.png')))
   const report=auditV4Screens(root)
   expect(report.status).toBe('FAIL')
   expect(report.errors.some(e=>e.includes('Unchanged interaction screenshot: review-run-answer'))).toBe(true)
  }finally{rmSync(root,{recursive:true,force:true})}
 })
 it('rejects corrupted PNGs, incorrect viewport dimensions and undersized full-page shots',()=>{
  const root=fixture()
  try{
   const dir=join(root,'v4','graph','stress','360px')
   writeFileSync(join(dir,'atlas.png'),Buffer.alloc(100))
   writeFileSync(join(dir,'settings.png'),png(390,844,999))
   writeFileSync(join(dir,'settings-full.png'),png(360,700,1000))
   const report=auditV4Screens(root)
   expect(report.status).toBe('FAIL')
   expect(report.errors.some(e=>e.includes('Invalid PNG or viewport:')&&e.includes('atlas.png'))).toBe(true)
   expect(report.errors.some(e=>e.includes('Invalid PNG or viewport:')&&e.includes('settings.png'))).toBe(true)
   expect(report.errors.some(e=>e.includes('Invalid full-page PNG:')&&e.includes('settings-full.png'))).toBe(true)
  }finally{rmSync(root,{recursive:true,force:true})}
 })
})
