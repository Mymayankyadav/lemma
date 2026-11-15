package io.github.mymayankyadav.lemma;

import org.json.JSONException;
import org.json.JSONObject;

/** Persistent server revision and per-entry terminal watermark, retained after the notification is cleared. */
public final class PushOrder {
    private long revision;
    private final JSONObject terminal;
    public PushOrder(JSONObject stored){revision=stored.optLong("revision",0);JSONObject entries=stored.optJSONObject("terminal");terminal=entries==null?new JSONObject():entries;}
    public boolean accept(PushMessage message,long incoming,TimerState current){
        if(incoming<revision||incoming<=0)return false;
        if(message.kind==PushMessage.Kind.SHOW&&message.version<=terminal.optInt(message.entryId,-1))return false;
        if(message.kind==PushMessage.Kind.CLEAR){
            try{terminal.put(message.entryId,Math.max(message.version,terminal.optInt(message.entryId,-1)));}catch(JSONException impossible){throw new IllegalStateException(impossible);}
            revision=incoming;return current!=null&&current.entryId.equals(message.entryId)&&message.version>=current.version;
        }
        if(!message.appliesTo(current))return false;
        revision=incoming;return true;
    }
    public JSONObject toJson(){try{return new JSONObject().put("revision",revision).put("terminal",terminal);}catch(JSONException impossible){throw new IllegalStateException(impossible);}}
}
