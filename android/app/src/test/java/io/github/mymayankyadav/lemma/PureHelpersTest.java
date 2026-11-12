package io.github.mymayankyadav.lemma;

import static org.junit.Assert.*;

import java.util.Arrays;
import java.util.Collections;
import org.json.JSONException;
import org.json.JSONObject;
import org.junit.Test;

public class PureHelpersTest {
    @Test public void exactAlarmsOnlyWhenAllowed() {
        assertTrue(AlarmPolicy.exact(30, false));
        assertTrue(AlarmPolicy.exact(34, true));
        assertFalse(AlarmPolicy.exact(34, false));
        assertEquals(970_000L, AlarmPolicy.windowStart(1_000_000L, 0L));
        assertEquals(990_000L, AlarmPolicy.windowStart(1_000_000L, 990_000L));
    }

    @Test public void studyCommandEnvelopeMatchesTheWebLayer() throws JSONException {
        JSONObject body = StudyCommandClient.body("pause", "e1", 7, "op-1");
        JSONObject p = body.getJSONObject("p");
        assertEquals("op-1", p.getString("operationId"));
        assertEquals(1, p.getInt("schemaVersion"));
        assertEquals("study_entries", p.getString("resource"));
        assertEquals("pause", p.getString("operation"));
        assertEquals("e1", p.getJSONObject("target").getString("id"));
        assertEquals(7, p.getInt("expectedVersion"));
        assertEquals(0, p.getJSONObject("patch").length());
    }

    @Test public void receiptsGiveTheNewVersionOrRefuse() {
        assertEquals(8, StudyCommandClient.newVersion("{\"status\":\"ok\",\"changed\":[{\"id\":\"e1\",\"version\":8}]}"));
        assertEquals(-1, StudyCommandClient.newVersion("{\"status\":\"conflict\",\"conflict\":{\"currentVersion\":9}}"));
        assertEquals(-1, StudyCommandClient.newVersion("{\"status\":\"ok\",\"changed\":[]}"));
        assertEquals(-1, StudyCommandClient.newVersion("not json"));
    }

    @Test public void onlyAFreshHttpsSessionIsUsed() {
        long now = 1_000_000L;
        assertTrue(StudyCommandClient.usable(new SessionStore.Session("https://x.supabase.co", "k", "t", now + 60_000L), now));
        assertFalse(StudyCommandClient.usable(new SessionStore.Session("https://x.supabase.co", "k", "t", now + 10_000L), now));
        assertFalse(StudyCommandClient.usable(new SessionStore.Session("http://x.supabase.co", "k", "t", now + 60_000L), now));
        assertFalse(StudyCommandClient.usable(new SessionStore.Session("https://x.supabase.co", "k", "", now + 60_000L), now));
        assertFalse(StudyCommandClient.usable(null, now));
    }

    @Test public void calendarDiffInsertsUpdatesAndDeletes() {
        CalendarPlan.Event a = new CalendarPlan.Event("a", "Rudin", 100, 200, "d", "UTC");
        CalendarPlan.Event b = new CalendarPlan.Event("b", "Axler", 300, 400, "d", "UTC");
        CalendarPlan.Event c = new CalendarPlan.Event("c", "Munkres", 500, 600, "d", "UTC");
        CalendarPlan plan = CalendarPlan.diff(Arrays.asList(
            new CalendarPlan.Existing(1, a),
            new CalendarPlan.Existing(2, new CalendarPlan.Event("b", "Axler", 300, 450, "d", "UTC")),
            new CalendarPlan.Existing(3, new CalendarPlan.Event("gone", "Old", 1, 2, "d", "UTC")),
            new CalendarPlan.Existing(4, a),
            new CalendarPlan.Existing(5, new CalendarPlan.Event(null, "Typed by hand", 1, 2, "", "UTC"))),
            Arrays.asList(a, b, c));
        assertEquals(Collections.singletonList(c), plan.inserts);
        assertEquals(Collections.singleton(2L), plan.updates.keySet());
        assertEquals(400L, plan.updates.get(2L).end);
        assertEquals(Arrays.asList(3L, 4L, 5L), plan.deletes);
    }

    @Test public void calendarDiffOfNothingDeletesEverything() {
        CalendarPlan plan = CalendarPlan.diff(Collections.singletonList(new CalendarPlan.Existing(9, new CalendarPlan.Event("a", "t", 1, 2, "", "UTC"))), Collections.emptyList());
        assertEquals(Collections.singletonList(9L), plan.deletes);
        assertTrue(plan.inserts.isEmpty());
    }

    @Test public void sharedFilesAreSourcesOnly() {
        assertTrue(ShareIntake.acceptedFile("rudin.pdf", null));
        assertTrue(ShareIntake.acceptedFile("notes", "text/markdown"));
        assertTrue(ShareIntake.acceptedFile("proof.TEX", "application/octet-stream"));
        assertFalse(ShareIntake.acceptedFile("photo.jpg", "image/jpeg"));
        assertFalse(ShareIntake.acceptedFile(null, null));
    }

    @Test public void sharedNamesCannotEscapeTheCache() {
        assertEquals(".._.._etc_passwd", ShareIntake.safeName("../../etc/passwd"));
        assertEquals("shared", ShareIntake.safeName("  "));
        assertEquals(120, ShareIntake.safeName(new String(new char[300]).replace('\0', 'a') + ".pdf").length());
    }

    @Test public void linksStayInsideTheApp() {
        assertEquals("https://mymayankyadav.github.io/lemma/#/review", Links.url("/review"));
        assertEquals("https://mymayankyadav.github.io/lemma/#/", Links.url("https://evil.example"));
        assertEquals("https://mymayankyadav.github.io/lemma/#/", Links.url(null));
    }

    @Test public void remindersHaveStableSeparateIds() throws JSONException {
        assertEquals(Reminders.notificationId("due"), Reminders.notificationId("due"));
        assertEquals(0, Reminders.notificationId("block:1") % 4);
        assertTrue(Reminders.notificationId("block:1") >= 0x4000);
        JSONObject notToday = new JSONObject().put("due", "2026-11-12");
        assertTrue(Reminders.suppressed(notToday, "due", "2026-11-12"));
        assertFalse(Reminders.suppressed(notToday, "due", "2026-11-13"));
        assertFalse(Reminders.suppressed(notToday, "block:1", "2026-11-12"));
    }

    @Test public void reminderKindsMapToChannels() {
        assertEquals(Channels.CALENDAR, Channels.forReminder("calendar"));
        assertEquals(Channels.REVIEW, Channels.forReminder("review"));
        assertEquals(Channels.REVIEW, Channels.forReminder("tutor"));
    }
}
