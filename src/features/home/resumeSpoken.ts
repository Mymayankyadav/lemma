import {plainMath} from '../../lib/plain-math';

/** A readable, single accessible description for the visually clipped Continue row. */
export function resumeSpoken(projectTitle:string,checkpointTitle:string,step:string,paused:string|null):string{
 return plainMath(projectTitle)+'. '+plainMath(checkpointTitle)
  +step.replace(' · step',', step')+(paused?'. Paused '+paused:'');
}
