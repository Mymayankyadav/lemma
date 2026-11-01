/** NOTIF-7: a Review N link requests N cards independently of the daily goal.
 * The ordinary Start button still respects reviewsPerDay. */
export function notificationRoundCap(reviewsPerDay:number|undefined,requested?:number):number{
 if(requested===undefined)return reviewsPerDay||200;
 if(!Number.isFinite(requested))return 1;
 return Math.max(1,Math.min(50,Math.trunc(requested)));
}
