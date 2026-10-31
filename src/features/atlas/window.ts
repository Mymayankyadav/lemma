/** Atlas rows are fixed at 44px (see Outline.ROW). A small outline stays fully
 * mounted for simple keyboard/screen-reader navigation; larger outlines only
 * mount the visible viewport and an eight-row focus/scroll overscan. */
const ROW_HEIGHT=44;
const VIRTUALIZE_ABOVE=40;
const OVERSCAN=8;

export interface AtlasWindow {virtual:boolean;first:number;last:number;height?:number}

/** The page may keep a moderate outline mounted for complete keyboard and
 * screen-reader traversal. The default remains the strict 40-row cold-render
 * threshold for large graphs; never raise it for stress/extreme graphs. */
export function atlasWindow(count:number,scrollTop:number,viewportHeight:number,virtualizeAbove=VIRTUALIZE_ABOVE):AtlasWindow{
 const virtual=count>virtualizeAbove;
 if(!virtual)return {virtual:false,first:0,last:count,height:undefined};
 // A fold can shrink 2,500 rows to 50 while the scroll element still
 // reports its previous position for one React render. Clamp immediately so
 // that first paint never becomes an empty virtual slice.
 const viewport=Math.max(0,viewportHeight);
 const position=Math.min(Math.max(0,scrollTop),Math.max(0,count*ROW_HEIGHT-viewport));
 const top=Math.max(0,Math.floor(position/ROW_HEIGHT)-OVERSCAN);
 const bottom=Math.min(count,Math.ceil((position+viewport)/ROW_HEIGHT)+OVERSCAN);
 return {virtual:true,first:top,last:Math.max(top,bottom),height:count*ROW_HEIGHT};
}
