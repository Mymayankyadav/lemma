import {v7ScreenFor} from '../v7Kit';

export function isImmersiveWorkspace(path:string){
 const screen=v7ScreenFor(path);
 return screen==='focus'||screen==='close-day'||screen==='pad'||screen==='review-run'||screen==='tutor';
}
