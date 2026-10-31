import {Fragment} from 'react';

/** Only slash boundaries are soft wrap opportunities. The final secret
 * segment stays unbroken and scrolls inside its own viewport when revealed.
 * Never duplicate the connector value into a title, tooltip or log.
 */
export function ConnectorAddress({value}:{value:string}){
 return <span data-connector-address="true" data-code="true"
  className="min-w-0 flex-1 overflow-x-auto whitespace-normal pl-2 font-mono text-label text-ink-2 [overflow-wrap:normal] [word-break:normal]">
  {value.split('/').map((part,index)=><Fragment key={index}>
   {index>0&&<>/<wbr/></>}<span className="whitespace-nowrap">{part}</span>
  </Fragment>)}
 </span>;
}
