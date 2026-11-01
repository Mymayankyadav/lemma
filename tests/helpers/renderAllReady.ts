import {PassThrough} from 'node:stream';
import type {ReactElement} from 'react';
import {renderToPipeableStream} from 'react-dom/server';

/** Assert the actual completed HTML of React.lazy/Suspense components.
 * Static SSR renders only the fallback, so it cannot prove rich mathematics
 * survived a safe code split. This waits for all lazy imports and fails closed
 * on a rendering error; callers keep their original KaTeX assertions. */
export function renderAllReady(element:ReactElement):Promise<string>{
 return new Promise((resolve,reject)=>{
  const output=new PassThrough();
  let html='';
  output.setEncoding('utf8');
  output.on('data',(chunk:string)=>{html+=chunk});
  output.on('end',()=>resolve(html));
  output.on('error',reject);
  let stream:ReturnType<typeof renderToPipeableStream>|null=null;
  stream=renderToPipeableStream(element,{
   onAllReady(){stream?.pipe(output)},
   onError(error){stream?.abort();reject(error)},
  });
 });
}
