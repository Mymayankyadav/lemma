/** Schedule supplemental checkpoint data after the Project Route has had
 * two opportunities to paint. Keep the shell (title, steps, Resume, link)
 * immediately usable; only the separate detail query is deferred.
 *
 * The timeout is deliberately a task after the second animation frame:
 * running the query inside a frame callback would compete with that paint.
 * Cancellation prevents a stale route from starting an obsolete request.
 */
export function afterProjectPaint(run:()=>void):()=>void {
 let active=true;
 let second=0;
 let task:ReturnType<typeof setTimeout>|null=null;
 const first=requestAnimationFrame(()=>{
  if(!active)return;
  second=requestAnimationFrame(()=>{
   if(!active)return;
   task=setTimeout(()=>{
    task=null;
    if(active)run();
   },0);
  });
 });
 return ()=>{
  active=false;
  cancelAnimationFrame(first);
  if(second)cancelAnimationFrame(second);
  if(task!==null)clearTimeout(task);
 };
}
