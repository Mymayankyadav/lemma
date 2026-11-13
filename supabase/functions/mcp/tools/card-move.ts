/** N160 (area 17): moving a card to another deck (Path). Pure: the caller resolves
 * the destination project, this decides which links survive the move so no card
 * keeps a checkpoint, session or source that belongs to another Path. */
export type NoteRow={project_id:string;concept_id?:string|null};
export type ProjectRow={id:string;subject_id:string|null};
export function cardMovePatch(note:NoteRow,from:ProjectRow,to:ProjectRow,
 patch:Record<string,unknown>):Record<string,unknown>{
 if(note.project_id!==from.id)throw new Error('Card is not in its stated Path');
 if(to.id===from.id)throw new Error('Card is already in that Path');
 const out:Record<string,unknown>={project_id:to.id,session_id:null};
 // Links into the old Path are cleared unless the same call names one in the new Path.
 if(patch.checkpoint_id===undefined)out.checkpoint_id=null;
 if(patch.source_id===undefined)out.source_id=null;
 // An idea belongs to a subject; it only survives a move inside one subject.
 if(note.concept_id&&from.subject_id!==to.subject_id&&patch.concept_id===undefined)out.concept_id=null;
 return out;
}
