import {Link,useLocation} from 'react-router';
import {Search} from 'lucide-react';
import {HubHeader} from './V7Shell';
import '../../ui/v7/empty-moment.css';

/**
 * V32 (v7 UX audit r3): an address Lemma does not know (an old link, something deleted) used to show Today without a
 * word. It now says so, in the notebook's voice, with the two ways on: Search and Today.
 */
export default function NotFoundV7(){
 const location=useLocation();
 return <main id="main-content" className="v7-page v7-not-found" aria-label="Page not found">
  <HubHeader title="Not in the notebook"/>
  <section className="v7-card v7-not-found-card">
   <p className="v7-empty-title">This page isn't in the notebook.</p>
   <p className="v7-meta">The link may be old, or what it pointed to was deleted. <span className="v7-not-found-path">{location.pathname}</span></p>
   <div className="v7-not-found-actions">
    <button type="button" className="v7-button v7-secondary" onClick={()=>window.dispatchEvent(new CustomEvent('v7:search'))}><Search aria-hidden="true"/><span>Search</span></button>
    <Link className="v7-button v7-primary" to="/"><span>Go to Today</span></Link>
   </div>
  </section>
 </main>;
}
