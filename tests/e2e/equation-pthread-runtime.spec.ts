import {expect,test} from '@playwright/test';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import type {AddressInfo} from 'node:net';
import manifest from '../../public/models/tutor-symbols/detypify-0.3.0-lemma-v1/manifest.json' with {type:'json'};

test('the packaged equation pthread entry starts a real isolated worker without model weights',async({page})=>{
  // Use the actual built worker and offline shell, not the helper in node_modules. Two threads exercise the
  // nested module even on small CI machines. Only the ephemeral loopback test origin is isolated.
  const dist=join(process.cwd(),'dist');
  const sw=readFileSync(join(dist,'sw.js'),'utf8');
  const asset=(pattern:RegExp)=>{
    const match=sw.match(pattern);
    expect(match,'Required release file is missing from the offline shell').toBeTruthy();
    return match![0];
  };
  const helper=asset(/assets\/ort-wasm-simd-threaded-[\w-]+\.mjs/);
  const appWorker=asset(/assets\/equationRecognizer\.worker-[\w-]+\.js/);
  expect(readFileSync(join(dist,appWorker),'utf8')).toContain('/lemma/'+helper);
  const wasm='models/tutor-symbols/'+manifest.assetSetVersion+'/'+manifest.files.wasm.path;
  const files=new Map<string,[string,string|Buffer]>([
    ['/',['text/html','<!doctype html><title>Equation pthread smoke</title>']],
    ['/lemma/'+helper,['application/javascript',readFileSync(join(dist,helper))]],
    ['/lemma/'+wasm,['application/wasm',readFileSync(join(dist,wasm))]],
    ['/worker.mjs',['application/javascript',`
      import runtime from ${JSON.stringify('/lemma/'+helper)};
      try {
        const wasmBinary=await (await fetch(${JSON.stringify('/lemma/'+wasm)})).arrayBuffer();
        const module=await runtime({numThreads:2,wasmBinary,locateFile:file=>file});
        postMessage({isolated:self.crossOriginIsolated,code:module._OrtInit(2,3)});
      } catch(error) {postMessage({error:String(error)});}
    `]],
  ]);
  const server=createServer((req,res)=>{
    const file=files.get(req.url??'');
    if(!file){res.writeHead(404).end();return;}
    res.writeHead(200,{'content-type':file[0],'cross-origin-opener-policy':'same-origin',
      'cross-origin-embedder-policy':'require-corp','content-security-policy':"script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'"});
    res.end(file[1]);
  });
  try{
    server.listen(0,'127.0.0.1');await once(server,'listening');
    await page.goto('http://127.0.0.1:'+(server.address() as AddressInfo).port);
    const result=await page.evaluate(()=>new Promise(resolve=>{
      const worker=new Worker('/worker.mjs',{type:'module'});
      worker.onmessage=e=>{worker.terminate();resolve(e.data);};
      worker.onerror=e=>{worker.terminate();resolve({error:e.message});};
    }));
    expect(result).toEqual({isolated:true,code:0});
  }finally{server.closeAllConnections();server.close();}
});
