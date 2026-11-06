import {describe,expect,it} from 'vitest';
import {readFileSync,readdirSync} from 'node:fs';

type Classification='owner-editable'|'command-managed'|'derived'|'credential';
type ColumnRecord={
  classification:Classification;
  appPath:string;
  mcpPath:string;
  exportPolicy:string;
  deletionPolicy:string;
};
type Inventory={table:string;version:number;columns:Record<string,ColumnRecord>};
const classifications=new Set<Classification>([
  'owner-editable','command-managed','derived','credential'
]);

// Only executable DDL counts: a quoted function body can describe another
// CREATE TABLE without actually creating it. SQL comments are not schema.
function executableSql(sql:string):string{
  return sql.replace(/\$([a-zA-Z_][a-zA-Z_0-9]*)?\$[\s\S]*?\$\1\$/g,"''")
    .replace(/\/\*[\s\S]*?\*\//g,' ').replace(/--[^\n]*/g,' ');
}
function topLevelFields(body:string):string[]{
  const fields:string[]=[];
  let start=0,depth=0,quote='';
  for(let i=0;i<body.length;i++){
    const c=body[i],next=body[i+1];
    if(quote){
      if(c===quote&&next===quote){i++;continue;}
      if(c===quote)quote='';
      continue;
    }
    if(c==="'"||c==='"'){quote=c;continue;}
    if(c==='('){depth++;continue;}
    if(c===')'){depth--;continue;}
    if(c===','&&depth===0){fields.push(body.slice(start,i));start=i+1;}
  }
  fields.push(body.slice(start));
  return fields;
}
function tableBody(statement:string,open:number):string{
  let depth=0,quote='';
  for(let i=open;i<statement.length;i++){
    const c=statement[i],next=statement[i+1];
    if(quote){
      if(c===quote&&next===quote){i++;continue;}
      if(c===quote)quote='';
      continue;
    }
    if(c==="'"||c==='"'){quote=c;continue;}
    if(c==='(')depth++;
    if(c===')'&&--depth===0)return statement.slice(open+1,i);
    if(c!==')'&&c==='(')continue;
    if(c!==')'&&c!== '('){/* no parenthesis transition */}
  }
  throw new Error('Unclosed CREATE TABLE definition');
}
/** A DO block can execute deterministic ALTER TABLE statements over a literal
 * table-name list. They are real schema mutations despite the dollar quote.
 * Only accept a constant FOREACH list and an identifier-quoted format %I;
 * do not mistake arbitrary dynamic SQL inside stored functions for DDL. */
function collectConstantLoopAdds(source:string,schema:Map<string,Set<string>>):void{
  for(const block of source.matchAll(/\bdo\s+\$([a-z_][a-z0-9_]*)?\$([\s\S]*?)\$\1\$\s*;/gi)){
    for(const loop of block[2].matchAll(
      /\bforeach\s+([a-z_][a-z0-9_]*)\s+in\s+array\s+array\s*\[([^\]]+)\]\s+loop([\s\S]*?)\bend\s+loop\s*;/gi)){
      const variable=loop[1].toLowerCase();
      const names=[...loop[2].matchAll(/'([a-z_][a-z0-9_]*)'/gi)]
        .map(m=>m[1].toLowerCase());
      if(!names.length||loop[2].replace(/'([a-z_][a-z0-9_]*)'|[\s,]/gi,''))
        continue; // Non-constant loop targets require separate review.
      for(const executed of loop[3].matchAll(
        /\bexecute\s+(?:pg_catalog\.)?format\s*\(\s*'((?:''|[^'])*)'\s*,\s*([a-z_][a-z0-9_]*)\s*\)/gi)){
        if(executed[2].toLowerCase()!==variable)continue;
        const template=executed[1];
        if(!/^\s*alter\s+table\s+public\.%I\s+add\s+column\b/i.test(template))continue;
        const additions=[...template.matchAll(
          /\badd\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)\b/gi)]
          .map(m=>m[1].toLowerCase());
        for(const table of names){
          const columns=schema.get(table);
          if(!columns)continue;
          additions.forEach(column=>columns.add(column));
        }
      }
    }
  }
}

/** Recover public table/column names from additive SQL, not an informal schema list. */
export function columnsFromMigrations(sources:readonly string[]):Map<string,Set<string>>{
  const schema=new Map<string,Set<string>>();
  for(const source of sources){
    for(const statement of executableSql(source).split(';')){
      const create=/\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_][a-z0-9_]*)\s*\(/i.exec(statement);
      if(create){
        const table=create[1];
        const open=statement.indexOf('(',create.index);
        const body=tableBody(statement,open);
        const columns=schema.get(table)??new Set<string>();
        for(const field of topLevelFields(body)){
          const match=/^\s*("?)([a-z_][a-z0-9_]*)\1\s+/i.exec(field);
          if(!match)continue;
          const column=match[2].toLowerCase();
          if(['constraint','foreign','primary','unique','check','exclude','like'].includes(column))continue;
          columns.add(column);
        }
        schema.set(table,columns);
      }
      const alter=/\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?public\.([a-z_][a-z0-9_]*)\s+/i.exec(statement);
      if(alter){
        const table=alter[1];
        const columns=schema.get(table);
        if(!columns)continue; // The table can predate this migration set.
        const tail=statement.slice(alter.index+alter[0].length);
        for(const add of tail.matchAll(/\badd\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)\b/gi))
          columns.add(add[1].toLowerCase());
        for(const drop of tail.matchAll(/\bdrop\s+column\s+(?:if\s+exists\s+)?([a-z_][a-z0-9_]*)\b/gi))
          columns.delete(drop[1].toLowerCase());
      }
    }
    collectConstantLoopAdds(source,schema);
  }
  return schema;
}
function enforceCoverage(schema:Map<string,Set<string>>,inventories:Map<string,Inventory>){
  for(const [table,columns] of schema){
    const inventory=inventories.get(table);
    if(!inventory)throw Error('Missing capability registry for table '+table);
    for(const column of columns){
      const entry=inventory.columns[column];
      if(!entry)throw Error('Unclassified column '+table+'.'+column);
      if(!classifications.has(entry.classification))throw Error('Invalid classification '+table+'.'+column);
      for(const key of ['appPath','mcpPath','exportPolicy','deletionPolicy'] as const)
        if(typeof entry[key]!=='string'||!entry[key].trim())
          throw Error('Missing '+key+' for '+table+'.'+column);
    }
    for(const column of Object.keys(inventory.columns))
      if(!columns.has(column))throw Error('Stale/nonexistent column '+table+'.'+column);
  }
}
const directory='supabase/migrations';
function migrationSources():string[]{
  return readdirSync(directory).filter(file=>file.endsWith('.sql'))
    .sort().map(file=>readFileSync(directory+'/'+file,'utf8'));
}
function inventoryDocs():Map<string,Inventory>{
  const root='docs/v6/capability-registry';
  const docs=new Map<string,Inventory>();
  for(const file of readdirSync(root).filter(x=>x.endsWith('.json'))){
    const parsed=JSON.parse(readFileSync(root+'/'+file,'utf8')) as Partial<Inventory>;
    if(!parsed.table)continue; // Other registries describe command/undo metadata.
    expect(file).toBe(parsed.table+'.json');
    expect(parsed.version).toBe(1);
    expect(typeof parsed.columns).toBe('object');
    docs.set(parsed.table,parsed as Inventory);
  }
  return docs;
}
describe('N40 complete capability registry',()=>{
  it('classifies every existing public column from every CREATE TABLE/ADD COLUMN migration',()=>{
    const schema=columnsFromMigrations(migrationSources());
    const docs=inventoryDocs();
    expect(schema.size).toBeGreaterThan(25);
    expect(docs.size).toBe(schema.size);
    enforceCoverage(schema,docs);
  });
  it('fails with a precise column name when a future migration adds an unclassified field',()=>{
    const schema=columnsFromMigrations([...migrationSources(),
      'alter table public.settings add column capability_fixture_new_minutes int;']);
    expect(()=>enforceCoverage(schema,inventoryDocs()))
      .toThrow('Unclassified column settings.capability_fixture_new_minutes');
  });
  it('handles a table created in a future migration, multiple adds and dropped columns',()=>{
    const schema=columnsFromMigrations([
      'create table public.coverage_fixture(id uuid, old text, constraint not_null check(id is not null));',
      'alter table public.coverage_fixture add column one text, add column two jsonb;',
      'alter table public.coverage_fixture drop column old;'
    ]);
    expect([...schema.get('coverage_fixture')!].sort()).toEqual(['id','one','two']);
    expect(()=>enforceCoverage(schema,new Map())).toThrow('Missing capability registry for table coverage_fixture');
  });
  it('detects bounded DO-block schema additions and rejects an unclassified field',()=>{
    const migration=[
      'do $literal_loop$ begin',
      "foreach tbl in array array['settings'] loop",
      "execute pg_catalog.format('alter table public.%I add column undocumented_loop_minutes int',tbl);",
      'end loop; end $literal_loop$;'
    ].join('\n');
    const schema=columnsFromMigrations([...migrationSources(),migration]);
    expect(schema.get('settings')?.has('undocumented_loop_minutes')).toBe(true);
    expect(()=>enforceCoverage(schema,inventoryDocs()))
      .toThrow('Unclassified column settings.undocumented_loop_minutes');
  });
  it('recognizes the restored record-version DO-block as real schema DDL',()=>{
    const schema=columnsFromMigrations(migrationSources());
    for(const table of ['settings','subjects','cards','proposals']){
      expect(schema.get(table)?.has('version')).toBe(true);
      expect(schema.get(table)?.has('updated_source')).toBe(true);
    }
    expect(schema.get('cards')?.has('updated_at')).toBe(true);
  });
  it('ignores commented SQL and dollar-quoted function bodies',()=>{
    const schema=columnsFromMigrations([
      "-- create table public.not_a_table (field text);\n"+
      "create function public.example() returns void language plpgsql as $$"+
      "begin execute 'create table public.dynamic_table(id int)'; end; $$;"+
      "create table public.real_table (id uuid primary key, label text);"
    ]);
    expect([...schema.keys()]).toEqual(['real_table']);
    expect([...schema.get('real_table')!]).toEqual(['id','label']);
  });
});
