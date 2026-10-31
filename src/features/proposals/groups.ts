import type { Proposal } from "../../data/types";

export interface ProposalGroup {
 key: string;
 label: string;
 project: string;
 proposals: Proposal[];
}
/** Keep project in the key: S7 / CP4 in two projects is not one approval batch. */
export function groupProposals(rows: readonly Proposal[]): ProposalGroup[] {
 const groups=new Map<string,ProposalGroup>();
 for(const proposal of rows){
  const checkpoint=proposal.card?.checkpoint ?? null;
  const code=typeof checkpoint==='string'&&checkpoint.trim()?checkpoint.trim():'General';
  const session=proposal.sessionNumber===null?'No session':`S${proposal.sessionNumber}`;
  const key=JSON.stringify([proposal.projectSlug,session,code]);
  let group=groups.get(key);
  if(!group){
   group={key,label:`${session} / ${code}`,project:proposal.projectSlug,proposals:[]};
   groups.set(key,group);
  }
  group.proposals.push(proposal);
 }
 return [...groups.values()];
}
export function pageProposals(rows: readonly Proposal[], visible: number): Proposal[] {
 return rows.slice(0,Math.max(0,visible));
}
