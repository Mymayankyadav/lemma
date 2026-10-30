import {useEffect,useState} from 'react'
import {useMergeSubjects,useSubjects,useUpdateSubject} from '../../data/hooks'
import type {Subject} from '../../data/types'
import {getMode} from '../../data/mode'
import {Sheet} from '../../ui/Sheet'
import {useToast} from '../../ui/Toast'

export function SubjectsPanel(){
 const subjects=useSubjects(),edit=useUpdateSubject(),merge=useMergeSubjects(),notify=useToast()
 const [open,setOpen]=useState(false),[selected,setSelected]=useState<Subject|null>(null)
 const [name,setName]=useState(''),[glyph,setGlyph]=useState(''),[target,setTarget]=useState('')
 const [confirm,setConfirm]=useState(false)
 const live=getMode()==='live'
 const all=[...(subjects.data??[])].sort((a,b)=>a.position-b.position)
 useEffect(()=>{
  if(!open){setSelected(null);setConfirm(false);setTarget('')}
 },[open])
 function choose(subject:Subject){setSelected(subject);setName(subject.name);setGlyph(subject.glyph);setTarget('');setConfirm(false)}
 async function save(){
  if(!selected)return
  const trimmed=name.trim(),mark=glyph.trim()
  if(!trimmed||!mark){notify('Name and glyph are required',{tone:'danger'});return}
  try{
   await edit.mutateAsync({id:selected.id,patch:{name:trimmed,glyph:mark}})
   notify('Subject updated',{tone:'success'});setSelected(null)
  }catch(error){notify(error instanceof Error?error.message:'Unable to update subject',{tone:'danger'})}
 }
 async function commitMerge(){
  if(!selected||!target||selected.id===target)return
  try{
   await merge.mutateAsync({sourceId:selected.id,targetId:target})
   notify('Subjects merged. The change is logged and undoable.',{tone:'success'})
   setConfirm(false);setSelected(null)
  }catch(error){notify(error instanceof Error?error.message:'Unable to merge subjects',{tone:'danger'})}
 }
 return <section aria-label="Subjects" className="rounded-slab border border-edge bg-[var(--card)] p-4">
  <div className="flex items-center justify-between gap-3">
   <div><h2 className="text-title-s font-semibold">Subjects</h2>
    <p className="mt-1 text-caption text-ink-2">Keep your fields few and easy to find.</p></div>
   <button type="button" onClick={()=>setOpen(true)} className="min-h-11 rounded-ctl border border-edge px-3 text-label text-amber">Manage</button>
  </div>
  <p className="mt-2 text-label text-ink-2">{all.map(subject=>subject.name).join(' · ')||'No subjects yet'}</p>
  <Sheet open={open} onClose={()=>setOpen(false)} title="Manage subjects">
   <div className="space-y-3">
    {!live&&<p className="text-label text-ink-2">Demo subjects are examples. Editing and merging use your live study record.</p>}
    {subjects.isPending?<p className="text-label text-ink-2">Loading subjects…</p>:
     all.map(subject=><button type="button" key={subject.id} onClick={()=>choose(subject)}
      aria-pressed={selected?.id===subject.id} className="flex min-h-11 w-full items-center gap-3 rounded-ctl border border-edge px-3 text-left">
      <span aria-hidden="true" className="text-title-s text-amber">{subject.glyph}</span>
      <span className="flex-1 text-body">{subject.name}</span>
      <span className="text-caption text-ink-3">{subject.position}</span>
     </button>)}
    {selected&&<div className="space-y-3 border-t border-edge pt-4" aria-label={'Edit '+selected.name}>
     <label className="block text-label text-ink-2">Name
      <input value={name} onChange={event=>setName(event.target.value)} className="mt-1 min-h-11 w-full rounded-ctl border border-edge bg-[var(--card)] px-3 text-body text-ink"/>
     </label>
     <label className="block text-label text-ink-2">Glyph
      <input value={glyph} onChange={event=>setGlyph(event.target.value)} maxLength={4} className="mt-1 min-h-11 w-full rounded-ctl border border-edge bg-[var(--card)] px-3 text-body text-ink"/>
     </label>
     {live&&<button type="button" disabled={edit.isPending} onClick={()=>void save()}
      className="min-h-11 w-full rounded-ctl border border-amber bg-amber-tint px-3 text-label text-amber">Save subject</button>}
     <div className="space-y-2 border-t border-edge pt-3">
      <p className="text-label text-ink-2">Merge this subject into another. Projects and ideas move together.</p>
      <label className="block text-label text-ink-2">Merge into
       <select value={target} onChange={event=>setTarget(event.target.value)}
        className="mt-1 min-h-11 w-full rounded-ctl border border-edge bg-[var(--card)] px-3 text-body text-ink">
        <option value="">Choose destination</option>
        {all.filter(subject=>subject.id!==selected.id).map(subject=><option key={subject.id} value={subject.id}>{subject.name}</option>)}
       </select>
      </label>
      {live&&target&&<button type="button" onClick={()=>setConfirm(true)} className="min-h-11 rounded-ctl border border-edge px-3 text-label text-ink">Review merge</button>}
     </div>
    </div>}
    {confirm&&selected&&<div role="alertdialog" aria-label="Confirm subject merge" className="space-y-3 rounded-ctl border border-amber p-3">
     <p className="text-body">Merge {selected.name} into {all.find(subject=>subject.id===target)?.name}? This moves its projects and ideas. The operation is logged and undoable.</p>
     <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={()=>setConfirm(false)} className="min-h-11 rounded-ctl border border-edge text-label">Cancel</button>
      <button type="button" disabled={merge.isPending} onClick={()=>void commitMerge()} className="min-h-11 rounded-ctl border border-amber bg-amber-tint text-label text-amber">Confirm merge</button>
     </div>
    </div>}
   </div>
  </Sheet>
 </section>
}
