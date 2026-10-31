/** QA-3b: structural inspection of the 144 ST-0 screenshot artifacts.
 * This catches missing, truncated, wrong-sized and stale/duplicated captures.
 * A structural PASS is NOT a visual/behavioral PASS; see docs/acceptance/qa3b.md.
 */
import {createHash} from 'node:crypto'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {dirname,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {QA3_ROUTES,qa3Cases,qa3ScreenshotName} from './qa3-report'

const SIGNATURE=Buffer.from([137,80,78,71,13,10,26,10])
const IEND=Buffer.from([0,0,0,0,73,69,78,68,174,66,96,130])

export interface PngHeader {width:number;height:number;scale:number}
export interface ScreenAudit {
 status:'PASS'|'FAIL'
 expected:number
 checked:number
 errors:string[]
 warnings:string[]
}

/** Validate the PNG envelope and viewport size, not the decoded pixels.
 * Playwright screenshots may use device scale 1, 2 or 3.
 */
export function pngHeader(bytes:Buffer,viewportWidth:number,viewportHeight:number):PngHeader|null {
 if(bytes.length<64||!bytes.subarray(0,8).equals(SIGNATURE))return null
 if(bytes.readUInt32BE(8)!==13||bytes.toString('ascii',12,16)!=='IHDR')return null
 if(!bytes.subarray(-12).equals(IEND))return null
 const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20)
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<=0||height<=0)return null
 const scale=width/viewportWidth
 if(!Number.isInteger(scale)||scale<1||scale>3||height!==viewportHeight*scale)return null
 return {width,height,scale}
}

export function auditQa3Screens(directory:string):ScreenAudit {
 const errors:string[]=[],warnings:string[]=[]
 let checked=0
 const cases=qa3Cases(),expected=cases.length*QA3_ROUTES.length
 for(const matrix of cases){
  const hashes=new Map<string,string>()
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
   const earlier=hashes.get(hash)
   if(earlier&&earlier!==route)warnings.push('Identical captures for '+earlier+' and '+route+' in '+matrix.filename+'; inspect for stale navigation')
   else hashes.set(hash,route)
  }
 }
 return {status:errors.length?'FAIL':'PASS',expected,checked,errors,warnings}
}

export function renderScreenAudit(report:ScreenAudit):string {
 return [
  '# QA-3b screenshot structural evidence','',
  '**Structural status: '+report.status+'** · '+report.checked+'/'+report.expected+' captures inspected.','',
  'This verifies PNG headers, intact IEND markers and viewport dimensions only. It does **not** establish pixel-level legibility, behavior, accessibility, live API budgets or visual acceptance.','',
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
