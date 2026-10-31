/** QA-4a: fail-closed structural proof for the optional 23-scene v4 matrix.
 * This is not a visual, semantic, performance or live-network acceptance.
 */
import {createHash} from 'node:crypto'
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {dirname,join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {pngHeader} from './qa3-screens'

type Scene={name:string;route:string;action?:string}
export const V4_SCENES=JSON.parse(readFileSync(new URL('./v4-capture-inventory.json',import.meta.url),'utf8')) as Scene[]
export const V4_FULL=['paths','project-path','project-sources','proposals','cards','atlas','insights','settings'] as const
const SIGNATURE=Buffer.from([137,80,78,71,13,10,26,10])
export interface V4ScreenAudit {status:'PASS'|'FAIL';expected:number;checked:number;fullExpected:number;fullChecked:number;errors:string[];warnings:string[]}

/** Validate PNG contents with the same CRC, decompression and dimension
 * checks as QA-3. Full-page captures may be taller than their viewport.
 */
function validFull(bytes:Buffer,width:number,minHeight:number):boolean{
 if(bytes.length<57||!bytes.subarray(0,8).equals(SIGNATURE))return false
 const pixelWidth=bytes.readUInt32BE(16),pixelHeight=bytes.readUInt32BE(20)
 const scale=pixelWidth/width
 if(!Number.isInteger(scale)||scale<1||scale>3||pixelHeight%scale!==0||pixelHeight/scale<minHeight)return false
 return pngHeader(bytes,width,pixelHeight/scale)!==null
}
export function auditV4Screens(root:string):V4ScreenAudit{
 const errors:string[]=[],warnings:string[]=[]
 let checked=0,fullChecked=0
 const expected=V4_SCENES.length*8,fullExpected=V4_FULL.length*8
 for(const theme of ['graph','graph-night']){
  for(const demo of ['1','stress']){
   for(const [width,height] of [[360,780],[390,844]] as const){
    const dir=join(root,'v4',theme,demo,width+'px')
    const hashes=new Map<string,string>()
    for(const {name} of V4_SCENES){
     const file=join(dir,name+'.png')
     let bytes:Buffer
     try{bytes=readFileSync(file)}catch{errors.push('Missing scene: '+file);continue}
     if(!pngHeader(bytes,width,height)){errors.push('Invalid PNG or viewport: '+file);continue}
     checked++
     const hash=createHash('sha256').update(bytes).digest('hex')
     const previous=[...hashes].find(([,value])=>value===hash)?.[0]
     if(previous)warnings.push('Identical scene images: '+previous+' and '+name+' ('+theme+'/'+demo+'/'+width+')')
     hashes.set(name,hash)
    }
    // These are distinct user-visible interaction states. A shell/idle frame
    // copied into the answer/details capture must fail rather than pass QA-4.
    for(const [changed,baseline] of [
     ['review-run-answer','review-run'],['atlas-selected','atlas'],
     ['atlas-details','atlas-selected'],['atlas-all','atlas'],
    ]){
     const a=hashes.get(changed),b=hashes.get(baseline)
     if(a&&b&&a===b)errors.push('Unchanged interaction screenshot: '+changed+' versus '+baseline+' ('+theme+'/'+demo+'/'+width+')')
    }
    for(const name of V4_FULL){
     const file=join(dir,name+'-full.png')
     let bytes:Buffer
     try{bytes=readFileSync(file)}catch{errors.push('Missing full-page scene: '+file);continue}
     if(!validFull(bytes,width,height)){errors.push('Invalid full-page PNG: '+file);continue}
     fullChecked++
    }
   }
  }
 }
 return {status:errors.length?'FAIL':'PASS',expected,checked,fullExpected,fullChecked,errors,warnings}
}
export function renderV4Audit(report:V4ScreenAudit):string{
 return ['# QA-4a screenshot structural evidence','',
  '**Structural status: '+report.status+'** · '+report.checked+'/'+report.expected+' viewport scenes, '+report.fullChecked+'/'+report.fullExpected+' full-page scenes.','',
  'This checks PNG structure, viewport dimensions, the complete inventory and distinct interaction frames. It does **not** prove readability, layout budgets, route data, 4× CPU timing or visual acceptance.','',
  '## Errors',...(report.errors.length?report.errors.map(e=>'- '+e):['None.']),
  '','## Review warnings',...(report.warnings.length?report.warnings.map(e=>'- '+e):['None.']),''].join('\n')
}
function main(){
 const root=process.argv[2]??'review-shots'
 const output=process.argv[3]??'review-shots/v4-audit.md'
 const report=auditV4Screens(root)
 mkdirSync(dirname(resolve(output)),{recursive:true})
 writeFileSync(resolve(output),renderV4Audit(report),'utf8')
 process.stdout.write('QA-4a screenshots '+report.status+' · '+report.checked+'/'+report.expected+' · '+output+'\n')
 if(report.status!=='PASS')process.exitCode=1
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main()
