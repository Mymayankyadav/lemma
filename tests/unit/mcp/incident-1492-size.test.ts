import {describe,expect,it} from 'vitest';
import {prune} from '../../../supabase/functions/mcp/schema-prune';

// Incident #1492: the deployed selftest rejected a 15,173-character tools/list. "Non-empty" (minLength 1) was advertised
// 36 times; zod still validates it on every call, so the advertised schema leaves it out. Other bounds stay advertised.
describe('incident #1492 tools/list headroom',()=>{
  it('drops minLength 1 from the advertised schema, keeps every other bound',()=>{
    const schema={type:'object',$schema:'x',properties:{a:{type:'string',minLength:1,maxLength:60},b:{type:'string',minLength:2},
      c:{type:'array',items:{type:'object',properties:{d:{type:'string',minLength:1}}}},n:{type:'integer',minimum:-Number.MAX_SAFE_INTEGER,maximum:Number.MAX_SAFE_INTEGER}}};
    expect(prune(schema)).toEqual({type:'object',properties:{a:{type:'string',maxLength:60},b:{type:'string',minLength:2},
      c:{type:'array',items:{type:'object',properties:{d:{type:'string'}}}},n:{type:'integer'}}});
  });
});
