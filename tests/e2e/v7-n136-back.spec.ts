import {test,expect,type Page} from "@playwright/test";
import {NOW,at} from "./v7-scenes";
// N136 · v7 UX audit r3, AN3. AW8: on Today with nothing open, Lemma releases Android's back gesture so the system plays
// its back-to-home preview; anywhere else, or with a sheet open, Lemma takes it. AW7: the splash lifts once the page has
// drawn. Checked with the stand-in for Capacitor's bridge (every native call is recorded, with how much the page held).
test.use({locale:"en-IN",timezoneId:"Asia/Kolkata",colorScheme:"dark"});

/** Capacitor's bridge, as the Android WebView injects it, answering from `answers` and recording each call. */
function standIn(){
 const m=(names:string[])=>names.map(name=>({name,rtype:"promise"}));
 const answers:Record<string,Record<string,unknown>>={
  LemmaNative:{notificationStatus:{permission:"granted",exactAlarms:true,channelsBlocked:[]},studyModeStatus:{access:true,enabled:false,active:false},
   calendarStatus:{permission:"prompt"},voiceAvailable:{available:false},timerPendingActions:{actions:[]},shareTake:{items:[]},calendarList:{calendars:[]},
   remindersSet:{scheduled:0},calendarBusy:{busy:[]},shareFile:{shared:true}},
  App:{getInfo:{version:"2.0.592",build:"200592",id:"io.github.mymayankyadav.lemma",name:"Lemma"},getState:{isActive:true},getLaunchUrl:{}},
 };
 const calls:{plugin:string;method:string;options:unknown;root:number}[]=[];
 (window as unknown as {__nativeCalls:typeof calls}).__nativeCalls=calls;
 (window as unknown as {androidBridge:unknown}).androidBridge={postMessage(){}};
 (window as unknown as {Capacitor:unknown}).Capacitor={isNativePlatform:()=>true,getPlatform:()=>"android",
  PluginHeaders:[
   {name:"LemmaNative",methods:[...m(["setSession","clearSession","timerUpdate","timerClear","timerPendingActions","timerAckActions","notificationStatus","requestNotifications",
    "openNotificationSettings","openExactAlarmSettings","remindersSet","studyModeStatus","studyModeSetEnabled","openStudyModeSettings","calendarStatus","calendarRequest",
    "calendarList","calendarSync","calendarRemoveAll","calendarBusy","shareTake","voiceAvailable","voiceRecognise","shortcutsSet","shareFile","removeListener"]),{name:"addListener",rtype:"callback"}]},
   {name:"App",methods:[...m(["getInfo","getState","getLaunchUrl","exitApp","minimizeApp","toggleBackButtonHandler","removeListener","removeAllListeners"]),{name:"addListener",rtype:"callback"}]},
   {name:"SystemBars",methods:m(["setStyle","show","hide","setAnimation"])},
   {name:"Haptics",methods:m(["impact","notification","vibrate","selectionStart","selectionChanged","selectionEnd"])},
   {name:"SplashScreen",methods:m(["hide","show"])},
   {name:"Browser",methods:[...m(["open","close","removeAllListeners"]),{name:"addListener",rtype:"callback"}]},
  ],
  nativePromise:(plugin:string,method:string,options:unknown)=>{calls.push({plugin,method,options,root:[...(document.getElementById("root")?.children??[])].filter(node=>!node.classList.contains("lemma-splash")&&node.tagName!=="STYLE").length});return Promise.resolve(answers[plugin]?.[method]??{});},
  nativeCallback:()=>"cb-1"};
}
async function open(page:Page,hash:string,{app=false,scheme="dark" as "dark"|"light",welcome=false,seed=(()=>{}) as ()=>void}={}){
 await page.setViewportSize({width:390,height:844});
 await page.emulateMedia({colorScheme:scheme});
 if(app){
  await page.addInitScript(standIn);
  if(!welcome)await page.addInitScript(()=>{try{localStorage.setItem("lemma.android.welcomeSeen","true");}catch{/* private mode */}});
  await page.addInitScript(()=>{try{localStorage.setItem("lemma.android.notificationsAsked","true");}catch{/* private mode */}});
  await page.addInitScript(seed);
 }
 await page.clock.setFixedTime(NOW);
 await page.goto(at(hash));
 await expect(page.locator("html")).toHaveAttribute("data-v7","");
 await page.waitForLoadState("networkidle");
}
const calls=(page:Page,method:string)=>page.evaluate(name=>((window as unknown as {__nativeCalls:{method:string;options:unknown}[]}).__nativeCalls).filter(call=>call.method===name),method);

const handler=async(page:Page)=>{const list=await calls(page,"toggleBackButtonHandler");return list.length?(list[list.length-1].options as {enabled:boolean}).enabled:null;};

test("AW8 · Today with nothing open releases back; a sheet or another screen takes it",async({page})=>{
 await open(page,"/",{app:true});
 await expect.poll(()=>handler(page)).toBe(false);
 await page.getByRole("button",{name:"Capture"}).click();
 await expect(page.getByRole("dialog")).toBeVisible();
 await expect.poll(()=>handler(page)).toBe(true);
 await page.keyboard.press("Escape");
 await expect(page.getByRole("dialog")).toHaveCount(0);
 await expect.poll(()=>handler(page)).toBe(false);
 await page.evaluate(()=>{window.location.hash="#/review";});
 await expect.poll(()=>handler(page)).toBe(true);
});

test("AW7 · the splash is hidden once, after React has drawn into the root (not on the static web splash)",async({page})=>{
 await open(page,"/",{app:true});
 await expect.poll(async()=>(await page.evaluate(()=>((window as unknown as {__nativeCalls:{plugin:string;method:string;root:number}[]}).__nativeCalls)
  .filter(call=>call.plugin==="SplashScreen"&&call.method==="hide").map(call=>call.root>0)))).toEqual([true]);
});
