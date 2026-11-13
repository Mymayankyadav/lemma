import {test,expect,type Page} from "@playwright/test";
import {NOW,at} from "./v7-scenes";
// N130 · the Owner's decisions of 12 Nov 2026 on the v7 UX audit r3, on the audit seed with the clock frozen. The
// Android checks run the web layer with a stand-in for Capacitor's bridge (as the audit did): every native call answers
// with a fixed value and is recorded, so the app-only screens can be checked without a device.
test.use({locale:"en-IN",timezoneId:"Asia/Kolkata",colorScheme:"dark"});

/** Capacitor's bridge, as the Android WebView injects it, answering from `answers` and recording each call. */
function standIn(){
 const m=(names:string[])=>names.map(name=>({name,rtype:"promise"}));
 const answers:Record<string,Record<string,unknown>>={
  LemmaNative:{notificationStatus:{permission:"granted",exactAlarms:true,channelsBlocked:[]},studyModeStatus:{access:false,enabled:false,active:false},
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
async function open(page:Page,hash:string,{app=false,scheme="dark" as "dark"|"light"}={}){
 await page.setViewportSize({width:390,height:844});
 await page.emulateMedia({colorScheme:scheme});
 if(app){
  await page.addInitScript(standIn);
  // The app shows a welcome sheet on first open; these checks are about Settings.
  await page.addInitScript(()=>{try{localStorage.setItem("lemma.android.welcomeSeen","true");localStorage.setItem("lemma.android.notificationsAsked","true");}catch{/* private mode */}});
 }
 await page.clock.setFixedTime(NOW);
 await page.goto(at(hash));
 await expect(page.locator("html")).toHaveAttribute("data-v7","");
 await page.waitForLoadState("networkidle");
}
const calls=(page:Page,method:string)=>page.evaluate(name=>((window as unknown as {__nativeCalls:{method:string;options:unknown}[]}).__nativeCalls).filter(call=>call.method===name),method);

const touch=(page:Page)=>page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue("--v7-touch").trim());
test("E6 · touch targets are 48 px in the app",async({page})=>{
 await open(page,"/",{app:true});
 await expect(page.locator("html")).toHaveAttribute("data-native-app","");
 expect(await touch(page)).toBe("48px");
 // A control drawn with the kit's touch size is 48 px tall.
 await open(page,"/settings?section=reminders",{app:true});
 const row=page.getByRole("region",{name:"Remind me about"}).getByRole("switch").first();
 expect(await row.evaluate(node=>getComputedStyle(node.closest("li")??node).getPropertyValue("--v7-touch").trim())).toBe("48px");
});
test("E6 · touch targets stay 44 px on the web",async({page})=>{
 await open(page,"/");
 await expect(page.locator("html")).not.toHaveAttribute("data-native-app");
 expect(await touch(page)).toBe("44px");
});

test("E16 · AW4 · in the app only cards due and study blocks have switches; the rest wait in the Inbox",async({page})=>{
 await open(page,"/settings?section=reminders",{app:true});
 const kinds=page.getByRole("region",{name:"Remind me about"});
 await expect(kinds.getByRole("switch")).toHaveCount(2);
 await expect(kinds.getByRole("switch",{name:"Cards due"})).toBeVisible();
 await expect(kinds.getByRole("switch",{name:"Time blocks"})).toBeVisible();
 const inbox=page.getByRole("region",{name:"In your Inbox on this phone"});
 await expect(inbox).toBeVisible();
 await expect(inbox.getByRole("switch")).toHaveCount(0);
 for(const label of ["Checkpoint deadlines","Tutor proposals","Weekly digest","New card proposals"])await expect(inbox.getByText(label,{exact:true})).toBeVisible();
});

test("E16 · on the web every reminder kind keeps its switch",async({page})=>{
 await open(page,"/settings?section=reminders");
 await expect(page.getByRole("region",{name:"Remind me about"}).getByRole("switch")).toHaveCount(9);
 await expect(page.getByRole("region",{name:"In your Inbox on this phone"})).toHaveCount(0);
});

test("E14 · E15 · in the app Data and account saves a backup through the share sheet and shows the version",async({page})=>{
 await open(page,"/settings?section=data",{app:true});
 const about=page.getByRole("region",{name:"About this app"});
 await expect(about.getByText("2.0.592",{exact:true})).toBeVisible();
 await about.getByRole("button",{name:/Check for updates/}).click();
 await expect.poll(async()=>(await calls(page,"open")).map(call=>(call.options as {url:string}).url)).toContain("https://github.com/Mymayankyadav/lemma/releases/latest");
 await about.getByRole("button",{name:"What changed in 2.0.592"}).click();
 await expect.poll(async()=>(await calls(page,"open")).map(call=>(call.options as {url:string}).url)).toContain("https://github.com/Mymayankyadav/lemma/releases/tag/android-build-592");
 await page.getByRole("button",{name:"Save a backup"}).click();
 await expect.poll(async()=>(await calls(page,"shareFile")).length).toBe(1);
 const [share]=await calls(page,"shareFile");
 const options=share.options as {name:string;mime:string;text:string};
 expect(options.name).toMatch(/^lemma-backup-\d{4}-\d\d-\d\d\.json$/);
 expect(options.mime).toBe("application/json");
 expect(()=>JSON.parse(options.text)).not.toThrow();
 await expect(page.getByText(/Your backup is in Android's share sheet/)).toBeVisible();
});

test("E14 · E15 · on the web Data and account still downloads and has no About group",async({page})=>{
 await open(page,"/settings?section=data");
 await expect(page.getByRole("button",{name:"Download a backup"})).toBeVisible();
 await expect(page.getByRole("region",{name:"About this app"})).toHaveCount(0);
});

async function closeDay(page:Page){
 await page.clock.setFixedTime(NOW);
 await page.goto(at("/today/close?date=2026-11-08"));
 await page.getByRole("button",{name:"Next",exact:true}).click();
 await page.getByRole("button",{name:"Next",exact:true}).click();
 await page.getByRole("button",{name:"Close the day",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Day closed",exact:true})).toBeVisible();
}

test("E20 · LT3 · under reduced motion Day closed stays until Done",async({page})=>{
 await page.emulateMedia({reducedMotion:"reduce"});
 await closeDay(page);
 // It used to leave after 0.4 s with reduced motion.
 await page.waitForTimeout(1500);
 await expect(page.getByRole("heading",{name:"Day closed",exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Done",exact:true}).click();
 await expect(page).toHaveURL(/#\/$/);
});

test("E20 · LT3 · without Done, Day closed returns to Today after 5 s",async({page})=>{
 await page.emulateMedia({reducedMotion:"reduce"});
 await closeDay(page);
 await page.waitForTimeout(4000);
 await expect(page.getByRole("heading",{name:"Day closed",exact:true})).toBeVisible();
 await expect(page).toHaveURL(/#\/$/,{timeout:4000});
});

for(const scheme of ["dark","light"] as const)test(`E18 · P1 · ${scheme==="dark"?"Night":"Day"}: the drawing's object is lighter than its disc`,async({page})=>{
 await page.emulateMedia({colorScheme:scheme,reducedMotion:"reduce"});
 await closeDay(page);
 const tones=await page.locator('[data-illustration="closed"]').evaluate(svg=>{
  const rgb=(value:string)=>value.match(/\d+(\.\d+)?/g)!.slice(0,3).map(Number);
  const lum=([r,g,b]:number[])=>.2126*r+.7152*g+.0722*b;
  return {page:lum(rgb(getComputedStyle(document.body).backgroundColor)),disc:lum(rgb(getComputedStyle(svg.querySelector(".bg")!).fill)),
   object:lum(rgb(getComputedStyle(svg.querySelector(".page")!).fill))};
 });
 expect(tones.object).toBeGreaterThan(tones.disc);
 if(scheme==="dark")expect(tones.disc).toBeGreaterThan(tones.page);
 else expect(tones.object).toBeGreaterThan(tones.page);
});
