/** Atlas rows are fixed at 44px (see Outline.ROW). A small outline stays fully
 * mounted for simple keyboard/screen-reader navigation; larger outlines only
 * mount the visible viewport and an eight-row focus/scroll overscan. */
const ROW_HEIGHT=44;
const VIRTUALIZE_ABOVE=40;
const OVERSCAN=8;

export interface AtlasWindow {virtual:boolean;first:number;last:number;height?:number}

export function atlasWindow(count:number,scrollTop:number,viewportHeight:number):AtlasWindow{
 const virtual=count>VIRTUALIZE_ABOVE;
 if(!virtual)return {virtual:false,first:0,last:count,height:undefined};
 const top=Math.max(0,Math.floor(Math.max(0,scrollTop)/ROW_HEIGHT)-OVERSCAN);
 const bottom=Math.min(count,Math.ceil((Math.max(0,scrollTop)+Math.max(0,viewportHeight))/ROW_HEIGHT)+OVERSCAN);
 return {virtual:true,first:top,last:Math.max(top,bottom),height:count*ROW_HEIGHT};
}
