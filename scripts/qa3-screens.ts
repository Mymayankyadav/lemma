/** QA-3b: structural inspection of the 144 ST-0 screenshot artifacts.
 * This catches missing, truncated, wrong-sized and stale/duplicated captures.
 * A structural PASS is NOT a visual/behavioral PASS; see docs/acceptance/qa3b.md.
 */
import {createHash} from 'node:crypto'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {dirname,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {inflateSync} from 'node:zlib'
import {QA3_ROUTES,QA3_ROUTE_READINESS,qa3Cases,qa3ScreenshotName} from './qa3-report'

const SIGNATURE=Buffer.from([137,80,78,71,13,10,26,10])

// PNG chunk CRC-32, IEEE polynomial. A plausible signature/IEND is not enough:
// malformed IDAT, missing chunks and corrupt captures must fail closed.
const CRC_TABLE=Uint32Array.from({length:256},(_,n)=>{
 let c=n
 for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1
 return c>>>0
})
function crc32(bytes:Buffer):number{
 let crc=0xffffffff
 for(const value of bytes)crc=CRC_TABLE[(crc^value)&255]^(crc>>>8)
 return (crc^0xffffffff)>>>0
}

export interface PngHeader {width:number;height:number;scale:number}
export interface ScreenAudit {
 status:'PASS'|'FAIL'
 expected:number
 checked:number
 errors:string[]
 warnings:string[]
}

/** Validate the complete PNG chunk chain and viewport dimensions.
 * CRCs, mandatory IHDR/IDAT/IEND, chunk bounds and IEND at EOF are required.
 * Structural validity does not replace independent pixel/visual inspection.
 */
export function pngHeader(bytes:Buffer,viewportWidth:number,viewportHeight:number):PngHeader|null {
 if(bytes.length<57||!bytes.subarray(0,8).equals(SIGNATURE))return null
 let offset=8,width=0,height=0,depth=0,color=0,interlace=0,seenIHDR=false,seenPLTE=false,seenIDAT=false,endedIDAT=false,seenIEND=false
 const idats:Buffer[]=[]
 while(offset<bytes.length){
  if(offset+12>bytes.length)return null
  const length=bytes.readUInt32BE(offset)
  if(length>bytes.length-offset-12)return null
  const type=bytes.toString('ascii',offset+4,offset+8)
  // Unknown critical chunks cannot be decoded safely by a PNG reader;
  // ancillary chunks may be ignored, but the reserved bit must be zero.
  if(!/^[A-Za-z]{4}$/.test(type)||type[2]!==type[2].toUpperCase()||
     (type[0]===type[0].toUpperCase()&&
      !['IHDR','PLTE','IDAT','IEND'].includes(type)))return null
  const data=offset+8,crcOffset=data+length
  if(bytes.readUInt32BE(crcOffset)!==crc32(bytes.subarray(offset+4,crcOffset)))return null
  if(!seenIHDR){
   if(type!=='IHDR'||length!==13)return null
   width=bytes.readUInt32BE(data);height=bytes.readUInt32BE(data+4)
   depth=bytes[data+8];color=bytes[data+9];interlace=bytes[data+12]
   const validDepth:Record<number,number[]>={0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]}
   if(!validDepth[color]?.includes(depth)||bytes[data+10]!==0||
      bytes[data+11]!==0||interlace!==0)return null
   seenIHDR=true
  }else if(type==='IHDR')return null
  if(type==='PLTE'){
   // Indexed-colour images are undecodable without a palette. A PNG palette
   // must precede IDAT, contain 1..256 RGB triples and fit the bit depth.
   // Grayscale images forbid PLTE; duplicate/late palettes are invalid.
   const entries=length/3
   if(seenPLTE||seenIDAT||seenIEND||color===0||color===4||
      length===0||length%3!==0||length>768||
      (color===3&&entries>2**depth))return null
   seenPLTE=true
  }
  if(seenIDAT&&type!=='IDAT')endedIDAT=true
  if(type==='IDAT'){
   if(seenIEND||endedIDAT||(color===3&&!seenPLTE))return null
   seenIDAT=true
   idats.push(bytes.subarray(data,crcOffset))
  }
  if(type==='IEND'){
   if(length!==0||!seenIDAT||crcOffset+4!==bytes.length)return null
   seenIEND=true;break
  }
  offset=crcOffset+4
 }
 if(!seenIHDR||!seenIDAT||!seenIEND||width<=0||height<=0)return null
 // CRC-correct arbitrary bytes are not a decodable PNG image. Inflate the
 // bounded IDAT stream and verify noninterlaced row lengths/filter bytes.
 const channels:Record<number,number>={0:1,2:3,3:1,4:2,6:4}
 const rowBytes=Math.ceil(width*channels[color]*depth/8)
 const maxRaw=32*1024*1024
 if(!Number.isSafeInteger(rowBytes)||rowBytes<=0)return null
 if((rowBytes+1)*height>maxRaw)return null
 let raw:Buffer
 try{raw=inflateSync(Buffer.concat(idats),{maxOutputLength:maxRaw})}
 catch{return null}
 // Chromium's screenshot writer emits noninterlaced PNGs. Adam7 would need
 // seven independently validated pass dimensions and filters; reject it
 // rather than accepting any successfully inflated byte stream as a screenshot.
 const stride=rowBytes+1
 if(raw.length!==stride*height)return null
 for(let y=0;y<height;y++)if(raw[y*stride]>4)return null

 const scale=width/viewportWidth
 if(!Number.isInteger(scale)||scale<1||scale>3||height!==viewportHeight*scale)return null
 return {width,height,scale}
}

export function auditQa3Screens(directory:string):ScreenAudit {
 const errors:string[]=[],warnings:string[]=[]
 let checked=0
 const hashes=new Map<string,string>()
 const imageHashes=new Map<string,string>()
 const cases=qa3Cases(),expected=cases.length*QA3_ROUTES.length
 for(const matrix of cases){
  const viewportHeight=matrix.width===390?844:740
  for(const route of QA3_ROUTES){
   const name=qa3ScreenshotName(matrix,route)
   let bytes:Buffer
   try{bytes=readFileSync(resolve(directory,name))}
   catch{errors.push('Missing screenshot: '+name);continue}
   const header=pngHeader(bytes,matrix.width,viewportHeight)
   if(!header){errors.push('Invalid PNG envelope or viewport size: '+name);continue}
   checked++
   const hash=createHash('sha256').update(bytes).digest('hex')
   imageHashes.set(name,hash)
   const earlier=hashes.get(hash)
   if(earlier&&earlier!==name)warnings.push('Identical captures for '+earlier+' and '+name+' across the full matrix; inspect for stale navigation')
   else hashes.set(hash,name)
  }
 }
 // FIX #586: a valid PNG of the Graph shell is not a valid screenshot of the
 // route. Every matrix needs a producer-written, data-backed readiness record
 // for each route, tied to the exact screenshot bytes by SHA-256.
 for(const matrix of cases){
  const manifestName=matrix.profile+'-'+matrix.theme+'-'+matrix.width+'-readiness.json'
  let manifest:unknown
  try{manifest=JSON.parse(readFileSync(resolve(directory,manifestName),'utf8'))}
  catch{errors.push('Missing or invalid readiness manifest: '+manifestName);continue}
  if(!Array.isArray(manifest)){
   errors.push('Malformed readiness manifest (expected array): '+manifestName)
   continue
  }
  const seen=new Set<string>()
  for(const row of manifest){
   if(!row||typeof row!=='object'||Array.isArray(row)||typeof row.route!=='string'||
      !Object.prototype.hasOwnProperty.call(QA3_ROUTE_READINESS,row.route)){
    errors.push('Invalid readiness route in '+manifestName)
    continue
   }
   const route=row.route as (typeof QA3_ROUTES)[number]
   if(seen.has(route)){errors.push('Duplicate readiness route '+route+' in '+manifestName);continue}
   seen.add(route)
   const contract=QA3_ROUTE_READINESS[route]
   const screenshot=qa3ScreenshotName(matrix,route)
   const hash=imageHashes.get(screenshot)
   if(row.profile!==matrix.profile||row.theme!==matrix.theme||row.width!==matrix.width||
      row.actualRoute!==route||row.ready!==true||row.heading!==contract.heading||
      row.landmark!==contract.landmark||row.screenshot!==screenshot||
      !hash||row.sha256!==hash){
    errors.push('Stale, unready or mismatched screenshot readiness: '+manifestName+' '+route)
   }
  }
  for(const route of QA3_ROUTES)if(!seen.has(route))
   errors.push('Missing readiness route '+route+' in '+manifestName)
 }
 return {status:errors.length?'FAIL':'PASS',expected,checked,errors,warnings}
}

export function renderScreenAudit(report:ScreenAudit):string {
 return [
  '# QA-3b screenshot structural evidence','',
  '**Structural status: '+report.status+'** · '+report.checked+'/'+report.expected+' captures inspected.','',
  'This verifies PNG chunk boundaries, CRCs, mandatory IDAT/IEND, viewport dimensions, and route-specific data-backed readiness manifests tied to exact PNG hashes. It does **not** establish pixel-level legibility, behavior, accessibility, live API budgets or visual acceptance.','',
  '## Errors',...(report.errors.length?report.errors.map(e=>'- '+e):['None.']),
  '','## Review warnings',...(report.warnings.length?report.warnings.map(e=>'- '+e):['None.']),''
 ].join('\n')
}

function main(){
 const directory=process.argv[2]??'test-results/screens/stress'
 const output=process.argv[3]??'test-results/qa3/screenshot-structure.md'
 const report=auditQa3Screens(directory)
 mkdirSync(dirname(resolve(output)),{recursive:true})
 writeFileSync(resolve(output),renderScreenAudit(report),'utf8')
 process.stdout.write('QA-3b screenshots '+report.status+' · '+report.checked+'/'+report.expected+' · '+output+'\n')
 if(report.status!=='PASS')process.exitCode=1
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main()
