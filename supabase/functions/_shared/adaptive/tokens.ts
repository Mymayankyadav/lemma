// The two token gates of the release report (07 Acceptance 2): `resume` at most 1,500 tokens and a Atlas card at most 100, for every project.
// Same conservative estimate the existing tests use (3 characters per token), so the number reported equals the number tested.
export const approxTokens=(text:string)=>Math.ceil(text.length/3);
export function tokenGates(input:{resumes:string[];cards:string[]}):{resume_tokens_max:number;card_tokens_max:number}{
 return {resume_tokens_max:Math.max(0,...input.resumes.map(approxTokens)),card_tokens_max:Math.max(0,...input.cards.map(approxTokens))};
}
