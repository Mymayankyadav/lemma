/** Attach v6 token styling only while the opted-in shell is mounted. */
export function setV6Root(enabled:boolean, root:Element=document.documentElement):void {
 root.toggleAttribute('data-v6',enabled);
}
