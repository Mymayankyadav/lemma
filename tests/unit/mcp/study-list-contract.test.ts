import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {assertStudyReadListContract} from '../../../supabase/functions/mcp/tools/study-list-contract';

const make=(name: string, selector: 'what' | 'resource')=>({
  name,inputSchema:{type:'object',properties:{
    [selector]:{type:'string',enum:['plan','study_entries','calendar_blocks']},
    start:{type:'string'},end:{type:'string'},cursor:{type:'string'}
  }}
});
const wire=()=>({tools:[make('get','what'),make('search','resource')]});
describe('N15 serialized MCP read-tool contract',()=>{
  it('accepts both study resources and all bounded paging inputs in real tools/list-shaped JSON',()=>{
    expect(()=>assertStudyReadListContract(JSON.parse(JSON.stringify(wire())).tools)).not.toThrow();
  });
  it('rejects missing resource selectors, range inputs and invalid tool inventories',()=>{
    const sample=wire();
    delete (sample.tools[0].inputSchema.properties as Record<string,unknown>).cursor;
    expect(()=>assertStudyReadListContract(sample.tools)).toThrow(/cursor/);
    const wrong=wire();
    wrong.tools[1].inputSchema.properties.resource.enum=['plan'];
    expect(()=>assertStudyReadListContract(wrong.tools)).toThrow(/study resources/);
    expect(()=>assertStudyReadListContract([])).toThrow(/study resources/);
  });
  it('incident #1179: accepts the N37 enum-or-registered-pattern selector (zod anyOf) and still needs the study enum',()=>{
    const widened=wire();
    for(const [i,sel] of [[0,'what'],[1,'resource']] as const){
      const props=widened.tools[i].inputSchema.properties as Record<string,unknown>;
      props[sel]={anyOf:[{type:'string',enum:['plan','study_entries','calendar_blocks']},{type:'string',pattern:'^[a-z][a-z0-9_]{0,60}$'}]};
    }
    expect(()=>assertStudyReadListContract(JSON.parse(JSON.stringify(widened)).tools)).not.toThrow();
    const patternOnly=wire();
    (patternOnly.tools[0].inputSchema.properties as Record<string,unknown>).what={anyOf:[{type:'string',pattern:'^[a-z]+$'}]};
    expect(()=>assertStudyReadListContract(patternOnly.tools)).toThrow(/study resources/);
    const missingOne=wire();
    (missingOne.tools[1].inputSchema.properties as Record<string,unknown>).resource={anyOf:[{type:'string',enum:['study_entries']},{type:'string'}]};
    expect(()=>assertStudyReadListContract(missingOne.tools)).toThrow(/study resources/);
  });
  it('connects this check to the real serialized selftest handler, retaining the hard 15000 gate',()=>{
    const source=readFileSync('supabase/functions/mcp/selftest.ts','utf8');
    expect(source).toContain('assertStudyReadListContract(list)');
    expect(source).toContain("if(chars>15000)throw Error('tools/list too large: '+chars)");
    expect(source).toContain('const payload=parseMcpReply(body,res.headers.get(');
  });
});
