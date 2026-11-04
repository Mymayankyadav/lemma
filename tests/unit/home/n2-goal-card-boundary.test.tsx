import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {MemoryRouter} from 'react-router'
import {describe,expect,it,vi} from 'vitest'
import type {ProjectSummary} from '../../../src/data/types'

vi.mock('../../../src/data/hooks',()=>({
 useProject:()=>({isPending:true,data:undefined}),
}))

import GoalCard from '../../../src/features/home/GoalCard'
import {SummaryGoalCard as FastSummaryGoalCard} from '../../../src/features/home/FastGoalDistance'
import {SummaryGoalCard as RegularSummaryGoalCard} from '../../../src/features/home/GoalDistance'

const demoProject=(total:number):ProjectSummary=>({
 id:'demo-'+total,slug:'demo-'+total,title:'Demo path '+total,
 subject:{glyph:'∫',hue:'slate'} as ProjectSummary['subject'],
 status:'active',done:3,total,
 current:{code:'CP4',title:'Next proof checkpoint',step:2,stepsTotal:4},
 lastActivityAt:null,cardsCount:0,sessionsCount:0,sourcesCount:0,
 scheduleHeadline:'On schedule',
})

const markup=(element:React.ReactElement)=>renderToStaticMarkup(<MemoryRouter>{element}</MemoryRouter>)

describe('N2: Today goal cards at the 14-checkpoint boundary',()=>{
 it('shows project, next checkpoint and distance on demo paths of 14, 15 and 40 checkpoints',()=>{
  const cases=[
   {total:14,view:markup(<GoalCard project={demoProject(14)} events={undefined}/>)},
   {total:15,view:markup(<RegularSummaryGoalCard project={demoProject(15)} events={undefined}/>)},
   {total:40,view:markup(<FastSummaryGoalCard project={demoProject(40)} events={undefined}/>)},
  ]
  for(const {total,view} of cases){
   expect(view).toContain('data-goal-card=""')
   expect(view).toContain('Goal progress for Demo path '+total)
   expect(view).toContain('Demo path '+total)
   expect(view).toContain('data-goal-now=""')
   expect(view).toContain('Next checkpoint:')
   expect(view).toContain('CP4')
   expect(view).toContain('Next proof checkpoint')
   expect(view).toContain('data-goal-distance=""')
   expect(view).toContain('3 of '+total)
   expect(view).toContain('Distance to goal: '+(total-3)+' checkpoints remaining')
  }
 })
 it('large demo paths do not fall back to percentage-only summary cards in either Today path',()=>{
  for(const component of [FastSummaryGoalCard,RegularSummaryGoalCard]){
   for(const total of [15,40]){
    const view=markup(React.createElement(component,{project:demoProject(total),events:undefined}))
    expect(view).toContain('data-goal-now=""')
    expect(view).toContain('data-goal-distance=""')
    expect(view).not.toContain('Open the path for individual checkpoints')
   }
  }
 })
})
