import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {SectionHeading} from '../../../src/ui/SectionHeading';

describe('LOOK-1f SectionHeading semantic depth',()=>{
 it('keeps h2 as the default notebook section role',()=>{
  const html=renderToStaticMarkup(<SectionHeading id="review-heading">Review</SectionHeading>);
  expect(html).toContain('<h2');
  expect(html).toContain('class="ui-section-heading"');
  expect(html).toContain('id="review-heading"');
  expect(html).toContain('>Review</h2>');
 });
 it('supports a semantic h3 inside checkpoint sheets without losing notebook styling',()=>{
  const html=renderToStaticMarkup(<SectionHeading as="h3" className="mb-3" aria-label="Steps">Steps</SectionHeading>);
  expect(html).toContain('<h3');
  expect(html).toContain('class="ui-section-heading mb-3"');
  expect(html).toContain('aria-label="Steps"');
  expect(html).toContain('>Steps</h3>');
  expect(html).not.toContain(' as=');
 });
});
