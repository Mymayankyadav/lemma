import {expect,type Page} from '@playwright/test'

export const examPath=(path:string)=>'/lemma/?demo=1&flags=v7Shell,v6Shell,examMode,-tutorScratch#'+path
export const examThread='/p/linear-algebra/tutor?exam=demo-exam-project-linear'
export const examTutor=(page:Page)=>page.getByRole('main',{name:'Exam tutor'})
export const examAnswer=(page:Page)=>examTutor(page).getByRole('textbox',{name:'Your answer',exact:true})

export async function sendExamQuestion(page:Page,text:string){
 await examAnswer(page).fill(text)
 await examTutor(page).getByRole('button',{name:'Send',exact:true}).click()
 await expect(examTutor(page).getByRole('log',{name:'Conversation'})).toContainText(text)
}

export async function examActions(page:Page){
 await examTutor(page).getByRole('button',{name:'Session actions',exact:true}).click()
 return page.getByRole('dialog',{name:'Exam session',exact:true})
}

export async function importExamReply(page:Page,text:string){
 const menu=await examActions(page)
 await menu.getByRole('button',{name:'Connection',exact:true}).click()
 const dialog=page.getByRole('dialog',{name:'Connection',exact:true})
 await dialog.getByLabel('Paste reply').fill(text)
 await dialog.getByRole('button',{name:'Preview import'}).click()
 await dialog.getByRole('button',{name:'Confirm import'}).click()
 await dialog.getByRole('button',{name:'Close',exact:true}).click()
 await expect(examTutor(page).getByRole('article',{name:'Imported reply'}).last()).toContainText(text.split('\n')[0])
}

export async function saveExamIdea(page:Page,target:string){
 await examTutor(page).getByRole('button',{name:'Save for later',exact:true}).last().click()
 const sheet=page.getByRole('dialog',{name:'Save for later',exact:true})
 await sheet.getByLabel('What should be retrievable?').fill(target)
 await sheet.getByRole('button',{name:'Save idea',exact:true}).click()
 await expect(examTutor(page).getByRole('link',{name:/Idea saved:/}).last()).toBeVisible()
}
