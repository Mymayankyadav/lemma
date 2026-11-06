import type {Proposal} from '../../../data/types';

export type ProposalCitation = {source:string;pages:string|null};

/** Only cite source/page identifiers already stored in the proposal payload. */
export function proposalCitations(proposal:Proposal):ProposalCitation[]{
  const citations:ProposalCitation[]=[];
  const seen=new Set<string>();
  const add=(source:unknown,pages:unknown)=>{
    if(typeof source!=='string'||!source.trim())return;
    const citation={source:source.trim(),pages:typeof pages==='string'&&pages.trim()?pages.trim():null};
    const key=JSON.stringify([citation.source,citation.pages]);
    if(!seen.has(key)){seen.add(key);citations.push(citation);}
  };
  if(proposal.card)add(proposal.card.source,proposal.card.page);
  for(const checkpoint of proposal.plan?.checkpoints??[]){
    for(const citation of checkpoint.sources??[])add(citation.source,citation.pages);
    if(checkpoint.source)add(checkpoint.source,checkpoint.pages);
  }
  return citations;
}

/** N32.1 v6-only rationale and evidence panel. It never invents provenance. */
export default function ProposalEvidence({proposal}:{proposal:Proposal}){
  const rationale=proposal.reason?.trim()||'Rationale unavailable';
  const citations=proposalCitations(proposal);
  return <section aria-label="Proposal evidence"
    className="min-w-0 space-y-3 rounded-slab border border-edge bg-[var(--paper)] p-4">
    <div>
      <h3 className="text-label font-semibold text-ink">Why this proposal</h3>
      <p className="mt-1 whitespace-pre-wrap break-words text-body text-ink-2">{rationale}</p>
    </div>
    {citations.length>0&&<div>
      <h4 className="text-label font-semibold text-ink">Source references</h4>
      <ul className="mt-1 flex flex-col gap-1">
        {citations.map((citation,index)=><li key={index}
          className="min-w-0 break-words text-label text-ink-2">
          {citation.source}{citation.pages?' · '+citation.pages:''}
        </li>)}
      </ul>
    </div>}
  </section>;
}
