import {test,expect,type Page} from "@playwright/test";
import {NOW,at} from "./v7-scenes";
// N133 · v7 UX audit r3: the rest of AN1 and G0, checked with the same stand-in for Capacitor's bridge as N130 (every
// native call answers with a fixed value and is recorded). Here the phone has granted Study mode access.
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
 const calls:{plugin:string;method:string;options:unknown}[]=[];
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
  nativePromise:(plugin:string,method:string,options:unknown)=>{calls.push({plugin,method,options});return Promise.resolve(answers[plugin]?.[method]??{});},
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

test("AW5 · the welcome sheet: three rows with glyphs, focus on its text, the notification line",async({page})=>{
 await open(page,"/",{app:true,welcome:true});
 const sheet=page.getByRole("dialog",{name:"Welcome"});
 await expect(sheet).toBeVisible();
 await expect(sheet.locator(".v7-native-welcome-list > li")).toHaveCount(3);
 await expect(sheet.locator(".v7-native-welcome-icon svg")).toHaveCount(3);
 const rows=await sheet.locator(".v7-native-welcome-list > li").evaluateAll(nodes=>nodes.map(node=>Math.round(node.getBoundingClientRect().top)));
 expect(new Set(rows).size).toBe(3);
 await expect(sheet.getByText("Lemma asks about notifications after your first focus session.")).toBeVisible();
 expect(await page.evaluate(()=>document.activeElement?.tagName)).toBe("P");
 await sheet.getByRole("button",{name:"Continue"}).click();
 await expect(sheet).toBeHidden();
});

test("AW9 · coming back with access granted turns Study mode on (one trip)",async({page})=>{
 await open(page,"/settings?section=planning",{app:true,seed:()=>{try{localStorage.setItem("lemma.android.studyModeRequestedAt",String(Date.now()-60_000));}catch{/* private mode */}}});
 await expect.poll(async()=>(await calls(page,"studyModeSetEnabled")).map(call=>(call.options as {enabled:boolean}).enabled)).toEqual([true]);
 await expect(page.getByText("Study mode is on.")).toBeVisible();
 expect(await page.evaluate(()=>localStorage.getItem("lemma.android.studyModeRequestedAt"))).toBeNull();
});

test("AW9 · without a request nothing turns on by itself",async({page})=>{
 await open(page,"/settings?section=planning",{app:true});
 await expect(page.getByRole("region",{name:"On this phone"}).first()).toBeVisible();
 await page.waitForTimeout(500);
 expect(await calls(page,"studyModeSetEnabled")).toEqual([]);
});

test("G0 · the install screenshots are v7 Today",async({page})=>{
 const manifest=await (await page.request.get("/lemma/manifest.webmanifest")).json() as {screenshots:{src:string;label:string}[]};
 expect(manifest.screenshots.map(shot=>shot.label)).toEqual(["Today · Day","Today · Night"]);
 for(const shot of manifest.screenshots)expect((await page.request.get(shot.src)).status()).toBe(200);
});
