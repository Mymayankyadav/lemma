import {describe,it,expect} from 'vitest'
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {auditQa3Screens,pngHeader,renderScreenAudit} from '../../../scripts/qa3-screens'
import {qa3Cases,QA3_ROUTES,qa3ScreenshotName} from '../../../scripts/qa3-report'

const signature=Buffer.from([137,80,78,71,13,10,26,10])
const iend=Buffer.from([0,0,0,0,73,69,78,68,174,66,96,130])
function envelope(width:number,height:number,nonce=0){
 const bytes=Buffer.alloc(128)
 signature.copy(bytes,0)
 bytes.writeUInt32BE(13,8)
 bytes.write('IHDR',12,'ascii')
 bytes.writeUInt32BE(width,16)
 bytes.writeUInt32BE(height,20)
 bytes.writeUInt32BE(nonce,36)
 iend.copy(bytes,bytes.length-12)
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
   expect(report.warnings.some(w=>w.includes('/')&&w.includes('/projects'))).toBe(true)
  }finally{rmSync(dir,{recursive:true,force:true})}
 })
})
