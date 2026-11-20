import {useContext,useState} from 'react';
import {QueryClientContext} from '@tanstack/react-query';
import {decideLink,useAtlasModel,useRefreshAtlas} from '../../../data/adaptive/atlas-api';
import {Button} from '../../../ui/v7/components';
import {isFlagOn} from '../../../flags';

export function SuggestedLinks() {
  const client = useContext(QueryClientContext);
  return client && isFlagOn('atlasV3') ? <SuggestedLinkRows/> : null;
}

function SuggestedLinkRows() {
  const query = useAtlasModel(), refresh = useRefreshAtlas();
  const [pending, setPending] = useState<string | null>(null), [error, setError] = useState('');
  const proposals = query.data?.links.filter(link => link.status === 'proposed');
  if (!proposals?.length) return null;
  const name = (id: string) => query.data?.model.facts.concepts.find(concept => concept.id === id)?.name;
  async function decide(link: NonNullable<typeof proposals>[number], approve: boolean) {
    setPending(link.id);
    setError('');
    try {
      await decideLink(link.id, approve, (link as {version?:number}).version ?? 1);
      await refresh();
    } catch {
      setError('Could not save the decision.');
    } finally {
      setPending(null);
    }
  }
  return <section aria-label="Suggested links" className="v7-atlas-panel">
    <h2 className="v7-subhead">Suggested links</h2>
    <ul>{proposals.map(link => <li key={link.id} className="v7-suggested-link">
      <span><strong>{name(link.from_id)} ↔ {name(link.to_id)}</strong>
        {link.rationale && <small>{link.rationale}</small>}</span>
      <div className="v7-atlas-row">
        <Button small disabled={pending !== null} onClick={() => {void decide(link,false);}}>Reject link</Button>
        <Button small disabled={pending !== null} onClick={() => {void decide(link,true);}}>Approve link</Button>
      </div>
    </li>)}</ul>
    {error && <p role="alert">{error}</p>}
  </section>;
}
