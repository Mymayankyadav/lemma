// Compiles production native data code against small Android plumbing stubs, without an emulator.
// The classpath uses the project's existing test dependencies (JUnit 4, Hamcrest, org.json).
import {mkdtempSync,readdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const cp=process.env.NATIVE_TEST_CLASSPATH;
if(!cp)throw Error('Set NATIVE_TEST_CLASSPATH to JUnit, Hamcrest and Android-compatible org.json jars.');
const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);
const root=process.cwd(),actual=resolve('android/app/src/main/java/io/github/mymayankyadav/lemma');
const classes=['Reminders','AlarmPolicy','PendingActions','ShareIntake','TimerState','TimerText','PushMessage','PushOrder','NoticeActionClient','CalendarPlan','CalendarSync','Exports','BackPolicy','OrientationPolicy','TextZoomPolicy','StudyCommandClient','LemmaMessagingService'];
const junit=['PushOrderTest','PushMessageTest','TimerStateTest','TimerTextTest','ExportsTest','BackPolicyTest','OrientationPolicyTest','TextZoomPolicyTest'];
const sources=[...walk(resolve('tests/native/audit/src')).filter(p=>p.endsWith('.java')),...classes.map(n=>join(actual,n+'.java')),...junit.map(n=>resolve('android/app/src/test/java/io/github/mymayankyadav/lemma',n+'.java'))];
const dir=mkdtempSync(join(tmpdir(),'lemma-native-audit-'));
function run(cmd,args){const result=spawnSync(cmd,args,{cwd:root,stdio:'inherit'});if(result.error)throw result.error;if(result.status!==0)throw Error(cmd+' failed: '+result.status);}
try{
 const list=join(dir,'sources.txt');writeFileSync(list,sources.join('\n')+'\n');
 if(process.env.ECJ_JAR)run('java',['-jar',process.env.ECJ_JAR,'-17','-warn:none','-cp',cp,'-d',dir,'@'+list]);
 else run('javac',['--release','17','-cp',cp,'-d',dir,'@'+list]);
 run('java',['-cp',dir+':'+cp,'org.junit.runner.JUnitCore',...['NativeDataReprosTest','CalendarRaceReproTest','PushServiceRegressionTest',...junit].map(n=>'io.github.mymayankyadav.lemma.'+n)]);
}finally{rmSync(dir,{recursive:true,force:true});}
