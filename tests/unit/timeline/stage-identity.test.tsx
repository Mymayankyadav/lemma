import {describe,expect,it} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {MemoryRouter} from 'react-router'
import {ProjectTimeline} from '../../../src/ui/timeline/ProjectTimeline'
import type {CheckpointView} from '../../../src/data/types'

const checkpoints:CheckpointView[]=Array.from({length:20},(_,i)=>({
 id:'cp-'+i,code:'CP'+(i+1),title:'Checkpoint '+(i+1),position:i+1,
 ui:i===0?'now':'next',currentStep:0,stepsTotal:1,recheckDue:null,dueCards:0,
 stage:i<10?'Algebra $\\frac{a}{b}$':'Topology $x^2$',
}))

describe('FIX #509 stage identity',()=>{
 it('shows unique compact identifiers and the selected full mathematical name',()=>{
  const html=renderToStaticMarkup(<MemoryRouter>
   <ProjectTimeline project={{title:'Math',slug:'math',done:0,total:20}}
    checkpoints={checkpoints} variant="metro"/>
  </MemoryRouter>)
  const host=document.createElement('div')
  host.innerHTML=html
  const buttons=Array.from(host.querySelectorAll('[data-stage-button]'))
  expect(buttons).toHaveLength(2)
  expect(buttons.map(button=>button.querySelector('[data-stage-name]')?.textContent)).toEqual(['S1','S2'])
  expect(buttons.every(button=>button.getAttribute('aria-label')?.includes('checkpoints complete'))).toBe(true)
  const full=host.querySelector('[data-stage-full-name]')
  expect(full?.textContent).toContain('Stage 1:')
  expect(full?.querySelector('.katex')).not.toBeNull()
  expect(full?.getAttribute('class')).toContain('overflow-hidden')
 })
})
