/** The same deterministic Capacitor stand-in as v7-n133-app.spec.ts; no Android service or real permission is invoked. */
export function nativeFixture(){
 const m=names=>names.map(name=>({name,rtype:'promise'}));
 const answers={LemmaNative:{notificationStatus:{permission:'granted',exactAlarms:true,channelsBlocked:[]},studyModeStatus:{access:true,enabled:false,active:false},calendarStatus:{permission:'prompt'},voiceAvailable:{available:false},timerPendingActions:{actions:[]},shareTake:{items:[]},calendarList:{calendars:[]},remindersSet:{scheduled:0},calendarBusy:{busy:[]},shareFile:{shared:true}},App:{getInfo:{version:'2.0.592',build:'200592',id:'io.github.mymayankyadav.lemma',name:'Lemma'},getState:{isActive:true},getLaunchUrl:{}}};
 window.androidBridge={postMessage(){}};
 window.Capacitor={isNativePlatform:()=>true,getPlatform:()=>'android',PluginHeaders:[
  {name:'LemmaNative',methods:[...m(['setSession','clearSession','timerUpdate','timerClear','timerPendingActions','timerAckActions','notificationStatus','requestNotifications','openNotificationSettings','openExactAlarmSettings','remindersSet','studyModeStatus','studyModeSetEnabled','openStudyModeSettings','calendarStatus','calendarRequest','calendarList','calendarSync','calendarRemoveAll','calendarBusy','shareTake','voiceAvailable','voiceRecognise','shortcutsSet','shareFile','removeListener']),{name:'addListener',rtype:'callback'}]},
  {name:'App',methods:[...m(['getInfo','getState','getLaunchUrl','exitApp','minimizeApp','toggleBackButtonHandler','removeListener','removeAllListeners']),{name:'addListener',rtype:'callback'}]},
  ...[['SystemBars',['setStyle','show','hide','setAnimation']],['Haptics',['impact','notification','vibrate','selectionStart','selectionChanged','selectionEnd']],['SplashScreen',['hide','show']],['Browser',['open','close','removeAllListeners']]].map(([name,methods])=>({name,methods:m(methods)}))
 ],nativePromise:(plugin,method)=>Promise.resolve(answers[plugin]?.[method]??{}),nativeCallback:()=>'capture-callback'};
 localStorage.setItem('lemma.android.welcomeSeen','true');localStorage.setItem('lemma.android.notificationsAsked','true');
}
