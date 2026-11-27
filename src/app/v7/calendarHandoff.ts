import {motionReduced} from '../../ui/v7/effects';
import {durations} from '../../ui/v7/motion';
import {warmV7Screen} from './routeScreens';

export function openCalendarAfterSheet(close:()=>void,open:()=>void){
 const origin=window.location.hash;
 warmV7Screen('calendar');
 close();
 if(motionReduced()){open();return;}
 window.setTimeout(()=>{if(window.location.hash===origin)open();},durations.baseExit*1000);
}
