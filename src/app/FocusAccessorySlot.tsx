/** Shell-wide v6 timer, separate from Today so it survives route changes. */
import {isFlagOn} from '../flags';
import FocusAccessory from './FocusAccessory';
export default function FocusAccessorySlot(){
 // Preserve the N13 flag-off placeholder and its original regression contract.
 return isFlagOn('v6Shell')?<FocusAccessory/>:null;
}
