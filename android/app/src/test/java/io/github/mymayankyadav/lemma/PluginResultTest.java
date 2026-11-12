package io.github.mymayankyadav.lemma;

import static org.junit.Assert.*;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import java.util.ArrayList;
import java.util.Arrays;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.junit.Test;

/** N126: lists reached the web layer as null ("Lemma could not open what was shared" on every resume). */
public class PluginResultTest {
    @Test public void theOldWayLostEveryList() {
        // JSArray.from takes only Java arrays; given a List it returns null, which is what the plugin used to send.
        assertNull(JSArray.from(new ArrayList<>(Arrays.asList("a", "b"))));
    }

    @Test public void resultsCarryTheArrayItself() throws JSONException {
        JSONArray items = new JSONArray().put(new JSONObject().put("kind", "text")).put(new JSONObject().put("kind", "file"));
        JSObject out = LemmaNativePlugin.result("items", items);
        assertEquals(2, out.getJSONArray("items").length());
        assertEquals("file", out.getJSONArray("items").getJSONObject(1).getString("kind"));
    }

    @Test public void anEmptyOrMissingListIsAnEmptyArray() throws JSONException {
        assertEquals(0, LemmaNativePlugin.result("items", new JSONArray()).getJSONArray("items").length());
        assertEquals(0, LemmaNativePlugin.result("actions", null).getJSONArray("actions").length());
    }
}
