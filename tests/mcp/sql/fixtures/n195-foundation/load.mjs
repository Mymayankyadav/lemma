// Offline integration candidate: real, pinned dependency SQL, not mock writers.
// Deployment owns N191/N197 independently. This loader is only imported by tests.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
const here=new URL('./',import.meta.url);
const blobSha=sql=>createHash('sha1').update('blob '+Buffer.byteLength(sql)+'\0').update(sql).digest('hex');

export async function firstStudyMigrationStack(directory){
 const files=(await readdir(directory)).filter(name=>name.endsWith('.sql')&&!name.includes('_storage'));
 const manifest=JSON.parse(await readFile(new URL('manifest.json',here),'utf8'));
 const snapshots=new Map();
 for(const entry of manifest){
  const snapshot=await readFile(new URL(entry.file,here),'utf8');
  assert.equal(blobSha(snapshot),entry.blob,'Pinned N195 dependency fixture changed: '+entry.file);
  if(files.includes(entry.file)){
   const canonical=await readFile(join(directory,entry.file),'utf8');
   assert.equal(blobSha(canonical),entry.blob,
    'Canonical N195 dependency diverged from its reviewed fixture; re-review and update provenance: '+entry.file);
  }else{
   snapshots.set(entry.file,snapshot);
   files.push(entry.file);
  }
 }
 return Promise.all(files.sort().map(async name=>({
  name,sql:snapshots.get(name)??await readFile(join(directory,name),'utf8'),
 })));
}
