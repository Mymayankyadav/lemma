import {act, useEffect, useState} from 'react'
import {createRoot} from 'react-dom/client'
import {createMemoryRouter, RouterProvider} from 'react-router'
import {expect,test,vi} from 'vitest'
import AppShell from '../../../src/app/AppShell'
vi.mock('../../../src/ui/Ground',()=>({Ground:()=>null}))
vi.mock('../../../src/app/TabBar',()=>({default:()=>null}))
vi.mock('../../../src/app/DemoChip',()=>({default:()=>null}))

test('incoming route mounts once and retains input through the outgoing route exit',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
 let mounts=0,unmounts=0
 function Editor(){
  const [text,setText]=useState('')
  useEffect(()=>{mounts++;return()=>{unmounts++}},[])
  return <input aria-label="Study note" value={text} onChange={e=>setText(e.target.value)}/>
 }
 const router=createMemoryRouter([{element:<AppShell/>,children:[
  {path:'/',element:<p>Home</p>},{path:'/editor',element:<Editor/>},
 ]}])
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
 try{
  await act(async()=>root.render(<RouterProvider router={router}/>))
  await act(async()=>{await router.navigate('/editor')})
  // The route may still be entering. Every editor that becomes interactive must
  // be the final editor, rather than a transient copy in the exiting wrapper.
  const observed=host.querySelector('input')
  await act(async()=>{await new Promise(r=>setTimeout(r,600))})
  expect(mounts).toBe(1);expect(unmounts).toBe(0)
  const editor=host.querySelector('input')!
  expect(editor).not.toBeNull()
  if(observed)expect(editor).toBe(observed)
 }finally{await act(async()=>root.unmount());router.dispose();host.remove()}
})
