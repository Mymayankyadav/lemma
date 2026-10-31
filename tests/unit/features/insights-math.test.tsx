import {expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router';
import {SubjectRules,MostRevisitedLink} from '../../../src/features/insights/InkRules';

it('renders mathematical subject names as KaTeX, not literal TeX, with readable accessible names',()=>{
 const html=renderToStaticMarkup(<SubjectRules data={[{subject:{name:'Algebra $\\mathbb{F}_p$',glyph:'A'},minutes:35}]} format={n=>n+' min'}/>);
 expect(html).toContain('class="katex"');
 expect(html).toContain('aria-label="Algebra 𝔽ₚ"');
 expect(html).not.toContain('aria-label="Algebra $');
});

it('typesets the most revisited mathematical concept and keeps a readable Atlas link',()=>{
 const html=renderToStaticMarkup(<MemoryRouter><MostRevisitedLink conceptName={'Uniform $\\ell^p$ convergence'} label="Uniform convergence"/></MemoryRouter>);
 expect(html).toContain('class="katex"');
 expect(html).toContain('Most revisited');
 expect(html).toContain('href="/atlas?');
 expect(html).not.toContain('Uniform $');
});
