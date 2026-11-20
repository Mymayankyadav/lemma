import type {DemoStore} from './model';

export type FirstCardInput={
 operationId:string;
 path:{kind:'new';title:string}|{kind:'existing';slug:string};
 front:string;
 back:string;
};
export type FirstCardReceipt={noteNo:number;noteId:string;cardId:string;projectSlug:string};
export type FirstCardOperation={fingerprint:string;receipt:FirstCardReceipt};

/** Non-production preview fixture. Keep settings and styles, but not another learner's content. */
export function firstUseStore(seed:DemoStore):DemoStore{
 return {...seed,seed:194,projects:[],subjects:[],notes:[],reviews:[],checkpoints:[],
  sources:[],sessions:[],proposals:[],concepts:[],links:[],misconceptions:[],checkpointEvents:[]};
}
