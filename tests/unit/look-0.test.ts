import {readFileSync} from 'node:fs'
import {describe,expect,it} from 'vitest'
import {scheduleColor} from '../../src/lib/schedule'

const css=readFileSync('src/styles/themes.css','utf8')
function tokens(theme:'graph'|'graph-night'):Record<string,string>{
 const block=css.match(new RegExp('html\\[data-theme="'+theme+'"\\] \\{([\\s\\S]*?)\\n\\}'))?.[1]
 if(!block)throw new Error('Missing theme '+theme)
 return Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([,key,value])=>[key,value.trim()]))
}
function lab(hex:string):[number,number,number]{
 const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4)
 const [r,g,b]=c
 const xyz=[(.4124564*r+.3575761*g+.1804375*b)/.95047,
  (.2126729*r+.7151522*g+.072175*b),
  (.0193339*r+.119192*g+.9503041*b)/1.08883]
 const f=xyz.map(v=>v>.008856451679?v**(1/3):v/(3*(6/29)**2)+4/29)
 return [116*f[1]-16,500*(f[0]-f[1]),200*(f[1]-f[2])]
}
/** CIEDE2000 (kL=kC=kH=1), not the less strict CIE76 distance. */
function deltaE2000(h1:string,h2:string):number{
 const [l1,a1,b1]=lab(h1),[l2,a2,b2]=lab(h2),pi=Math.PI
 const c1=Math.hypot(a1,b1),c2=Math.hypot(a2,b2),c=(c1+c2)/2
 const g=.5*(1-Math.sqrt(c**7/(c**7+25**7)))
 const ap1=(1+g)*a1,ap2=(1+g)*a2
 const cp1=Math.hypot(ap1,b1),cp2=Math.hypot(ap2,b2)
 const hue=(a:number,b:number)=>((Math.atan2(b,a)*180/pi)%360+360)%360
 const hp1=hue(ap1,b1),hp2=hue(ap2,b2)
 const dh=cp1*cp2===0?0:hp2-hp1>180?hp2-hp1-360:hp2-hp1< -180?hp2-hp1+360:hp2-hp1
 const dl=l2-l1,dc=cp2-cp1,dH=2*Math.sqrt(cp1*cp2)*Math.sin(dh*pi/360)
 const lm=(l1+l2)/2,cm=(cp1+cp2)/2
 const hm=cp1*cp2===0?hp1+hp2:Math.abs(hp1-hp2)>180?(hp1+hp2+360)/2%360:(hp1+hp2)/2
 const cos=(d:number)=>Math.cos(d*pi/180)
 const t=1-.17*cos(hm-30)+.24*cos(2*hm)+.32*cos(3*hm+6)-.20*cos(4*hm-63)
 const dt=30*Math.exp(-(((hm-275)/25)**2))
 const rc=2*Math.sqrt(cm**7/(cm**7+25**7))
 const sl=1+.015*(lm-50)**2/Math.sqrt(20+(lm-50)**2),sc=1+.045*cm,sh=1+.015*cm*t
 const rt=-Math.sin(2*dt*pi/180)*rc
 const x=dl/sl,y=dc/sc,z=dH/sh
 return Math.sqrt(x*x+y*y+z*z+rt*y*z)
}
describe('LOOK-0 approved graph worlds',()=>{
 it('generates only day and night, with every role present',()=>{
  expect([...css.matchAll(/html\[data-theme="([^"]+)"\]/g)].map(x=>x[1])).toEqual(['graph','graph-night'])
  for(const theme of ['graph','graph-night'] as const){
   const t=tokens(theme)
   for(const key of ['--accent','--late','--danger','--early','--link','--paper','--paper-2','--hair','--edge','--ink','--ink-2','--ink-3','--ink-4'])expect(t[key],theme+' '+key).toBeTruthy()
   expect(t['--bad']).toBe(t['--danger'])
   expect(t['--warn']).toBe(t['--late'])
   expect(t['--good']).toBe(t['--early'])
   expect(t['--again']).toBe(t['--danger'])
   expect(t['--hard']).toBe(t['--late'])
   expect(t['--grade-good']).toBe(t['--early'])
   expect(t['--easy']).toBe(t['--link'])
  }
 })
 it('separates red pencil, ochre lateness and danger by CIEDE2000 >= 20',()=>{
  for(const theme of ['graph','graph-night'] as const){
   const t=tokens(theme),roles=['--accent','--late','--danger']
   for(let i=0;i<roles.length;i++)for(let j=i+1;j<roles.length;j++)
    expect(deltaE2000(t[roles[i]],t[roles[j]]),theme+' '+roles[i]+' / '+roles[j]).toBeGreaterThanOrEqual(20)
  }
 })
 it('maps schedule states to their v4 semantic colours, never red for late or on time',()=>{
  expect(scheduleColor).toEqual({
   early:'var(--early)',on_time:'var(--ink-2)',late:'var(--late)',
   future:'var(--ink-4)',unscheduled:'var(--hair)'
  })
 })
})
