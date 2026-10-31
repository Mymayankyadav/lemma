import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {ConnectorAddress} from '../../../src/features/settings/ConnectorAddress';

describe('LOOK-9b slash-only connector wrapping',()=>{
 it('preserves the exact address while inserting wrap opportunities only after slashes',()=>{
  const address='https://demo.example/functions/v1/mcp/••••••';
  const html=renderToStaticMarkup(createElement(ConnectorAddress,{value:address}));
  expect(html.replace(/<[^>]*>/g,'')).toBe(address);
  expect(html.match(/<wbr\s*\/>/g)??[]).toHaveLength((address.match(/\//g)??[]).length);
  expect(html).toContain('overflow-x-auto');
  expect(html).toContain('overflow-wrap:normal');
  expect(html).not.toContain('break-all');
 });
});
