import {useEffect,useRef,useState} from 'react';

/** Full-viewport ink editor with optional physical landscape or CSS-rotated fallback.
 * The drawing data stays in the paper's canonical coordinates in either orientation. */
export function useWritingFullscreen(active = true) {
  const root = useRef<HTMLElement>(null);
  const [fullscreen,setFullscreen] = useState(false);
  const [landscape,setLandscape] = useState(false);

  const close = () => {
    if (document.fullscreenElement === root.current) void document.exitFullscreen().catch(() => {});
    setFullscreen(false);
    setLandscape(false);
  };
  const toggleFullscreen = () => {
    if (fullscreen) {close(); return;}
    setFullscreen(true);
    // An Android WebView or iOS Safari may reject this: fixed viewport CSS is the fallback.
    void root.current?.requestFullscreen?.().catch(() => {});
  };
  useEffect(() => {
    if (!active && fullscreen) close();
  },[active,fullscreen]);
  useEffect(() => {
    if (!fullscreen) return;
    const prior=document.body.style.overflow;
    document.body.style.overflow='hidden';
    const escaped=(event:KeyboardEvent) => {if(event.key==='Escape') close();};
    const changed=() => {if(!document.fullscreenElement) close();};
    document.addEventListener('keydown',escaped);
    document.addEventListener('fullscreenchange',changed);
    return () => {
      document.body.style.overflow=prior;
      document.removeEventListener('keydown',escaped);
      document.removeEventListener('fullscreenchange',changed);
    };
  },[fullscreen]);
  useEffect(() => {
    if (!fullscreen || !landscape || typeof screen === 'undefined') return;
    const orientation=screen.orientation as (ScreenOrientation & {lock?: (value:'landscape')=>Promise<void>}) | undefined;
    void orientation?.lock?.('landscape').catch(() => {});
    return () => {try {orientation?.unlock?.();} catch {/* CSS rotation remains available. */}};
  },[fullscreen,landscape]);
  return {root,fullscreen,landscape,toggleFullscreen,
    toggleLandscape:()=>setLandscape(value=>!value)};
}
