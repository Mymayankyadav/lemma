/** NOTIF-7: a Review N link requests N cards independently of the daily goal.
 * The ordinary Start button still respects reviewsPerDay. */
export function notificationRoundCap(reviewsPerDay:number|undefined,requested?:number):number{
 if(requested===undefined)return reviewsPerDay||200;
 if(!Number.isFinite(requested))return 1;
 return Math.max(1,Math.min(50,Math.trunc(requested)));
}

/** The review queue applies its own daily cap after the page selects cards.
 * An explicit notification round must not be capped a second time. */
export function notificationQueueSettings<T extends {reviewsPerDay:number}>(
 settings:T,requested?:number,
):T{
 if(requested===undefined)return settings;
 return {...settings,reviewsPerDay:Math.max(settings.reviewsPerDay,notificationRoundCap(settings.reviewsPerDay,requested))};
}
