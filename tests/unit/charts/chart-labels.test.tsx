import {describe,expect,it} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {StackedBars} from '../../../src/ui/charts/StackedBars'
import {GroupedBars} from '../../../src/ui/charts/GroupedBars'
import {HBars} from '../../../src/ui/charts/HBars'
import {LineArea} from '../../../src/ui/charts/LineArea'
import {InkRecall} from '../../../src/features/insights/InkRecall'
import {CalibrationBars} from '../../../src/ui/charts/CalibrationBars'

function labels(html:string){
 const host=document.createElement('div')
 host.innerHTML=html
 return Array.from(host.querySelectorAll('svg text'))
}
function readable(html:string){
 const nodes=labels(html)
 expect(nodes.length).toBeGreaterThan(0)
 for(const node of nodes){
  const font=Number(node.getAttribute('font-size')??node.getAttribute('fontSize'))
  expect(font,'SVG label '+node.textContent).toBeGreaterThanOrEqual(12)
 }
 return nodes
}

describe('FIX #506 chart labels',()=>{
 it('thins 30 review-day ticks at 316 units instead of shrinking their font',()=>{
  const data=Array.from({length:30},(_,i)=>({
   label:String(i+1),again:1,hard:1,good:3,easy:2,
  }))
  const nodes=readable(renderToStaticMarkup(<StackedBars data={data} width={316}/>))
  expect(nodes.length).toBeLessThanOrEqual(8)
 })
 it('thins 20 checkpoint-week ticks to a readable mobile density',()=>{
  const data=Array.from({length:20},(_,i)=>({
   label:'W'+(i+1),demonstrated:3,rechecked:1,
  }))
  const nodes=readable(renderToStaticMarkup(<GroupedBars data={data} width={316}/>))
  expect(nodes.length).toBeLessThanOrEqual(7)
 })
 it('keeps subject values, recall targets, axes and dates at readable size',()=>{
  readable(renderToStaticMarkup(<HBars data={[{label:'Algebra',value:120,display:'2 h'}]}/>))
  readable(renderToStaticMarkup(<CalibrationBars data={[{label:'sure',total:100,right:80,rate:0.8}]}/>))
  readable(renderToStaticMarkup(<LineArea data={[
   {label:'30 days ago',value:0.84},{label:'Today',value:0.92},
  ]}/>))
  readable(renderToStaticMarkup(<InkRecall data={[
   {label:'30 days ago',value:0.84},{label:'Today',value:0.92},
  ]} target={0.9}/>))
 })
})
