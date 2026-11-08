// N88: keep Atlas hierarchy and prerequisite graph validation owner-scoped.
export type AtlasNode={id:string;user_id:string;subject_id:string;parent_id?:string|null};
export type AtlasLink={from_id:string;to_id:string;kind:string};

/** A new parent must be in this subject and cannot be the node or its descendant. */
export function assertValidAtlasParent(
 current:AtlasNode,parentId:unknown,subjectId:unknown,nodes:readonly AtlasNode[],
):void{
 if(typeof subjectId!=='string'||!subjectId)throw Error('Atlas subject must be an owner subject');
 if(parentId===null||parentId===undefined)return;
 if(typeof parentId!=='string'||!parentId)throw Error('Invalid Atlas parent');
 const byId=new Map(nodes.map(node=>[node.id,node]));
 const seen=new Set([current.id]);
 let cursor:string|null=parentId;
 while(cursor!==null){
  if(seen.has(cursor))throw Error('Atlas parent cycle');
  seen.add(cursor);
  const node=byId.get(cursor);
  if(!node||node.user_id!==current.user_id||node.subject_id!==subjectId)
   throw Error('Atlas parent must be an idea in the same owner subject');
  cursor=node.parent_id??null;
 }
}

/** Adding prerequisite -> node is unsafe if node already reaches prerequisite. */
export function assertNoPrerequisiteCycle(
 nodeId:string,prerequisiteId:string,edges:readonly AtlasLink[],
):void{
 if(nodeId===prerequisiteId)throw Error('An idea cannot depend on itself');
 const outgoing=new Map<string,string[]>();
 for(const edge of edges){
  if(edge.kind!=='prereq')continue;
  const row=outgoing.get(edge.from_id)??[];
  row.push(edge.to_id);outgoing.set(edge.from_id,row);
 }
 const seen=new Set<string>(),pending=[nodeId];
 while(pending.length){
  const id=pending.pop()!;
  if(id===prerequisiteId)throw Error('Atlas prerequisite cycle');
  if(seen.has(id))continue;
  seen.add(id);
  pending.push(...(outgoing.get(id)??[]));
 }
}
