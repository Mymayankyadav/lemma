/** Distinguish a failed initial query from a background refetch with usable data.
 * Never discard the active review session just because a refresh failed.
 */
type QuerySnapshot={isError:boolean;data:unknown};
export function reviewInitialLoadFailure(settings:QuerySnapshot,cards:QuerySnapshot):'settings'|'cards'|null{
 if(settings.isError&&settings.data==null)return 'settings';
 if(cards.isError&&cards.data==null)return 'cards';
 return null;
}
