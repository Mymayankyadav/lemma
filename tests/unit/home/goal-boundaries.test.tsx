import {describe,it,expect} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {MemoryRouter} from 'react-router'
import {FastGoalDistance} from '../../../src/features/home/FastGoalDistance'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
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
    <QueryClientProvider client={new QueryClient()}><MemoryRouter><FastGoalDistance projects={[project]}/></MemoryRouter></QueryClientProvider>
   )
   if(total===14){
    // React server rendering suspends the lazy full-Metro card; its loading
    // placeholder is expected until the client resolves the module.
    expect(html).toContain('Distance to your goals')
    expect(html).not.toContain('data-bounded-goal')
    return
   }
   expect(html).toContain('data-goal-card')
   expect(html).toContain('data-bounded-goal')
   expect(html).not.toContain('data-summary-goal')
   expect(html).toContain('Boundary Goal '+total)
   expect(html).toContain('CP4')
   expect(html).toContain('Next proof')
   expect(html).toContain('3 of '+total)
   expect(html).toContain((total-3)+' checkpoints to goal')
   expect(html).not.toContain('Open the path for individual checkpoints and keyboard navigation')
  })
 }
})
