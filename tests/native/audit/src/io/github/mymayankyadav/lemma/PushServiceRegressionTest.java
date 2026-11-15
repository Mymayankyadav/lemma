package io.github.mymayankyadav.lemma;
import java.util.*;import org.json.*;import org.junit.*;import static org.junit.Assert.*;import com.google.firebase.messaging.RemoteMessage;

public class PushServiceRegressionTest {
 @After public void reset(){SessionStore.current=null;TimerController.state=null;}
 private LemmaMessagingService service(NativeDataReprosTest.Ctx context){LemmaMessagingService service=new LemmaMessagingService();service.context=context;return service;}
 private void owner(String id){SessionStore.current=new SessionStore.Session("https://example.invalid","key","token",Long.MAX_VALUE);SessionStore.current.ownerId=id;}
 @Test public void aQueuedPushCannotPublishPrivateDataAfterLogoutOrAccountReplacement()throws Exception{
  NativeDataReprosTest.Ctx context=new NativeDataReprosTest.Ctx();LemmaMessagingService service=service(context);
  Map<String,String> data=new HashMap<>();data.put("type","notice");data.put("ownerId","A");data.put("id","7");data.put("title","Private theorem");data.put("body","Private proof");data.put("url","#/review");
  SessionStore.current=null;service.onMessageReceived(new RemoteMessage(data));assertTrue(context.notifications.posted.isEmpty());
  owner("B");service.onMessageReceived(new RemoteMessage(data));assertTrue(context.notifications.posted.isEmpty());
  owner("A");service.onMessageReceived(new RemoteMessage(data));assertEquals(1,context.notifications.posted.size());
 }
 @Test public void aLateShowCannotResurrectAnEntryAfterTheServiceClearsIt()throws Exception{
  NativeDataReprosTest.Ctx context=new NativeDataReprosTest.Ctx();LemmaMessagingService service=service(context);owner("A");
  Map<String,String> data=new HashMap<>();data.put("type","timer");data.put("ownerId","A");data.put("entryId","entry");data.put("op","show");data.put("version","2");data.put("revision","10");data.put("state",new JSONObject().put("entryId","entry").put("version",2).put("status","running").toString());
  service.onMessageReceived(new RemoteMessage(data));assertNotNull(TimerController.state);
  data.put("op","clear");data.put("version","3");data.put("revision","11");service.onMessageReceived(new RemoteMessage(data));assertNull(TimerController.state);
  data.put("op","show");data.put("version","2");data.put("revision","12");service.onMessageReceived(new RemoteMessage(data));assertNull(TimerController.state);
 }
}
