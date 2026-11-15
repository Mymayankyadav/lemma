package io.github.mymayankyadav.lemma;

import static org.junit.Assert.*;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONObject;
import org.junit.Test;

public class PushOrderTest {
    private PushMessage message(String op,String id,int version)throws Exception{
        Map<String,String> fields=new HashMap<>();fields.put("type","timer");fields.put("op",op);fields.put("entryId",id);fields.put("version",String.valueOf(version));
        if("show".equals(op))fields.put("state",new JSONObject().put("entryId",id).put("version",version).put("status","running").toString());
        return PushMessage.parse(fields);
    }
    @Test public void terminalWatermarkSurvivesClearAndProcessRestart()throws Exception{
        PushOrder order=new PushOrder(new JSONObject());
        assertTrue(order.accept(message("show","A",2),10,null));
        assertFalse(order.accept(message("clear","A",3),11,null));
        PushOrder restarted=new PushOrder(new JSONObject(order.toJson().toString()));
        assertFalse(restarted.accept(message("show","A",2),12,null));
    }
    @Test public void delayedEntryCannotReplaceANewerEntry()throws Exception{
        PushOrder order=new PushOrder(new JSONObject());
        assertTrue(order.accept(message("show","B",2),20,null));
        assertFalse(order.accept(message("show","A",99),19,null));
    }
    @Test public void anOlderClearDoesNotRemoveANewerLocalVersion()throws Exception{
        PushOrder order=new PushOrder(new JSONObject());TimerState current=new TimerState();current.entryId="A";current.version=5;
        assertFalse(order.accept(message("clear","A",3),10,current));
    }
}
