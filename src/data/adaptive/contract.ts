import type {Rows,State} from '../../../supabase/functions/_shared/adaptive/facts';
export type RecheckRow={class_id:string;level:string;seq:number;state:string;due:string|null;prompt:string};
export type AdaptiveData={rows:Rows;rechecks:RecheckRow[]};
export type AdaptiveView=AdaptiveData & {state:State};
