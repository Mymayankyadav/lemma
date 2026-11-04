import {describe,it,expect} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {MemoryRouter} from 'react-router'
import {SummaryGoalCard} from '../../../src/features/home/FastGoalDistance'
import type {ProjectSummary} from '../../../src/data/types'

describe('Today goal cards at checkpoint boundaries',()=>{
 for(const total of [14,15,40]){
  it(`shows title, next checkpoint and distance for ${total} checkpoints`,()=>{
   const project={
    id:'goal-'+total,slug:'goal-'+total,title:'Boundary Goal '+total,
    status:'active',total,done:3,
    current:{code:'CP4',title:'Next proof'},
    stageProgress:[],
   } as unknown as ProjectSummary
   const html=renderToStaticMarkup(
    <MemoryRouter><SummaryGoalCard project={project} events={undefined}/></MemoryRouter>
   )
   expect(html).toContain('data-goal-card')
   expect(html).toContain('Boundary Goal '+total)
   expect(html).toContain('CP4')
   expect(html).toContain('Next proof')
   expect(html).toContain('3 of '+total)
   expect(html).not.toContain('Open the path for individual checkpoints and keyboard navigation')
  })
 }
})
