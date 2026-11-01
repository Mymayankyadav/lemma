/** Visible Session card summary, with correct singular/plural wording. */
export function sessionCardSummary(total:number,pending:number):string{
 return `${total} ${total===1?'card':'cards'} · ${pending} waiting`;
}
