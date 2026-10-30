/** Geometry for the Euclid review-round progress figure. */
export interface PolygonPoint { x: number; y: number }

/** A regular n-gon, beginning at the top and proceeding clockwise. */
export function regularPolygon(sides: number, cx = 36, cy = 36, radius = 27): PolygonPoint[] {
 if (!Number.isInteger(sides) || sides < 1 || sides > 10000) throw new RangeError('Invalid round size')
 return Array.from({length:sides},(_,i)=>{
  const angle=-Math.PI/2+2*Math.PI*i/sides
  return {x:cx+radius*Math.cos(angle),y:cy+radius*Math.sin(angle)}
 })
}

/** A card's first Again remains dashed until a later successful pass. */
export function roundEdges(
 cardIds: readonly string[],
 answers: readonly {card:{cardId:string};rating:number}[],
): ('pending'|'passed'|'missed')[] {
 return cardIds.map(cardId=>{
  const grades=answers.filter(answer=>answer.card.cardId===cardId).map(answer=>answer.rating)
  if (!grades.length) return 'pending'
  return grades.at(-1)===1?'missed':'passed'
 })
}
