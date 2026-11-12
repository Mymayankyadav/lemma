import {getMode} from '../../../data/mode';
/** First run belongs to an owner who has not finished or skipped it, outside the example workspace. */
export const needsWelcome=(ui:Record<string,unknown>|null|undefined,paths:number)=>getMode()!=='demo'&&ui?.welcomed!==true&&paths===0;
