/** Deterministic reminder data for the offline/demo adapter; never registers a real push device. */
export const demoPushDevices = [
 {id:'demo-phone',label:'This phone',platform:'android_web',lastSeenAt:null,lastOkAt:null,disabledAt:null,disabledReason:null,isThisDevice:true},
 {id:'demo-desktop',label:'Study desktop',platform:'desktop',lastSeenAt:null,lastOkAt:null,disabledAt:null,disabledReason:null,isThisDevice:false},
] as const
