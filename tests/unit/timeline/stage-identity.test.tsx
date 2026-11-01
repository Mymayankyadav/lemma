import {describe,expect,it} from 'vitest'
import {renderAllReady} from '../../helpers/renderAllReady'
import {MemoryRouter} from 'react-router'
import {ProjectTimeline} from '../../../src/ui/timeline/ProjectTimeline'
import type {CheckpointView} from '../../../src/data/types'

const checkpoints:CheckpointView[]=Array.from({length:20},(_,i)=>({
 id:'cp-'+i,code:'CP'+(i+1),title:'Checkpoint '+(i+1),position:i+1,
 ui:i===0?'now':'next',currentStep:0,stepsTotal:1,recheckDue:null,dueCards:0,
 stage:i<10?'Algebra $\\frac{a}{b}$':'Topology $x^2$',
}))

describe('FIX #509 stage identity',()=>{
 it('shows unique compact identifiers and the selected full mathematical name',async()=>{
  const html=await renderAllReady(<MemoryRouter>
   <ProjectTimeline project={{title:'Math',slug:'math',done:0,total:20}}
    checkpoints={checkpoints} variant="metro"/>
  </MemoryRouter>)
  const host=document.createElement('div')
  host.innerHTML=html
  const route=host.querySelector('[data-route-mode="project"]')
  expect(route).not.toBeNull()
  expect(route?.getAttribute('data-route-layout')).toBe('folded')
  expect(route?.getAttribute('data-route-stage-count')).toBe('2')
  // The other stage is a distinct capsule, never a clipped duplicate label.
  const ranges=Array.from(host.querySelectorAll('[data-stage-range]'))
   .map(node=>node.getAttribute('data-stage-range'))
  expect(ranges).toEqual(['1-1'])
  expect(new Set(ranges).size).toBe(ranges.length)
  expect(host.querySelector('[data-route-folded-stage-label]')?.textContent).toBe('Stage 1')
  const full=host.querySelector('[data-route-stage-disclosure]')
  expect(full?.querySelector('.katex')).not.toBeNull()
  expect(full?.textContent).not.toContain('$')
  expect(full?.querySelector('.overflow-x-auto')).not.toBeNull()
  expect(host.querySelector('[data-stage-rail],[data-expanded-stations]')).toBeNull()
 })
})
