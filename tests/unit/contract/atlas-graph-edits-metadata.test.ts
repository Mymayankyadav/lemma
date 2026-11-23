import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

describe('incident #1839: Atlas graph edits registry has no physical table',()=>{
  it('documents a command-only MCP resource rather than a phantom database table',()=>{
    const source=JSON.parse(readFileSync('docs/v6/capability-registry/atlas_graph_edits.json','utf8'));
    expect(source.resource).toBe('atlas_graph_edits');
    expect(source.table).toBeUndefined();
    expect(source.columns).toBeUndefined();
    expect(source.classification).toBe('command-only');
    expect(source.operations).toEqual(['change_level','delete_empty','reclassify_link','link_batch']);
  });
});
