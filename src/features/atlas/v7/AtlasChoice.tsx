import {Picker} from '../../../ui/v7/components';

/** Keep stable concept IDs behind the kit's searchable, labelled choices. */
export function AtlasChoice({label,value,options,onChange,disabled=false}:{
 label:string;value:string;options:{id:string;name:string}[];
 onChange:(id:string)=>void;disabled?:boolean;
}){
 const counts=new Map<string,number>();for(const option of options)counts.set(option.name,(counts.get(option.name)??0)+1);
 const seen=new Map<string,number>();
 const names=options.map(option=>{const ordinal=(seen.get(option.name)??0)+1;seen.set(option.name,ordinal);
  return counts.get(option.name)!>1?option.name+' ('+ordinal+')':option.name;});
 return <Picker label={label} value={names[options.findIndex(option=>option.id===value)]??''}
  options={names} disabled={disabled} onChange={name=>{
   const option=options[names.indexOf(name)];if(option)onChange(option.id);
  }}/>;
}
