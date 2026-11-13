/** The one coded end mark, exposed as “Done” and drawn in brand ink. */
export function ProofEnd({large=false}:{large?:boolean}){
 return <span className={'v7-proof-end'+(large?' v7-proof-end-large':'')} role="img" aria-label="Done">∎</span>;
}
