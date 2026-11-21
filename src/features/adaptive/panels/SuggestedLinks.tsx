import {useContext,useState} from 'react';
import {QueryClientContext} from '@tanstack/react-query';
import {decideLink,useAtlasModel,useRefreshAtlas} from '../../../data/adaptive/atlas-api';
import {authGeneration} from '../../../data/authBoundary';
import {Button} from '../../../ui/v7/components';
import {Disclosure} from '../../../ui/v7/Disclosure';
import {LinkKindChip} from '../../../ui/v7/AtlasValues';
import {isFlagOn} from '../../../flags';
import {groupProposals} from '../../../../supabase/functions/_shared/adaptive/links';

export function SuggestedLinks() {
  const client = useContext(QueryClientContext);
  return client && isFlagOn('atlasV3') ? <SuggestedLinkRows/> : null;
}

function SuggestedLinkRows() {
  const query = useAtlasModel(), refresh = useRefreshAtlas();
  const [pending, setPending] = useState(false), [error, setError] = useState('');
  const proposals = query.data?.links.filter(link => link.status === 'proposed');
  if (!proposals?.length) return null;
  const name = (id: string) => query.data?.model.facts.concepts.find(concept => concept.id === id)?.name;
  async function decide(links: NonNullable<typeof proposals>, approve: boolean) {
    const generation = authGeneration();
    setPending(true);
    setError('');
    try {
      for (const link of links) {
        if (generation !== authGeneration()) return;
        await decideLink(link.id, approve, (link as {version?:number}).version ?? 1);
      }
    } catch {
      setError('Could not save the decision.');
    } finally {
      if (generation === authGeneration()) await refresh();
      setPending(false);
    }
  }
  return <section id="atlas-link-proposals" tabIndex={-1} aria-label="Suggested links" className="v7-atlas-panel">
    <h2 className="v7-subhead">Suggested links</h2>
    <ul>{proposals.map(link => <li key={link.id} className="v7-suggested-link">
      <span><strong>{name(link.from_id)} ↔ {name(link.to_id)}</strong> <LinkKindChip kind={link.kind} proposed/>
        {link.rationale && <small>{link.rationale}</small>}</span>
      <div className="v7-atlas-row">
        <Button small disabled={pending} onClick={() => {void decide([link],false);}}>Reject link</Button>
        <Button small disabled={pending} onClick={() => {void decide([link],true);}}>Approve link</Button>
      </div>
    </li>)}</ul>
    <Disclosure label="Review links by kind">
      {groupProposals(proposals).map(({kind,links})=>{
        const label=kind.replace(/_/g,' ');
        return <div className="v7-atlas-row" key={kind} role="group" aria-label={label+' links'}>
          <Button small disabled={pending} onClick={()=>{void decide(links,true);}}>Approve all {links.length} {label}</Button>
          <Button small disabled={pending} onClick={()=>{void decide(links,false);}}>Reject all {links.length} {label}</Button>
        </div>;
      })}
    </Disclosure>
    {error && <p role="alert">{error}</p>}
  </section>;
}
