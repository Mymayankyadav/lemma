package io.github.mymayankyadav.lemma;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.provider.CalendarContract;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * N123 · N5 the opt-in device calendar. Lemma owns one local calendar named "Lemma" (read-only in calendar apps) and
 * keeps it equal to the study blocks in the sync window; it reads busy times only from calendars the learner chose.
 */
public final class CalendarSync {
    private CalendarSync() {}

    static final String ACCOUNT = "Lemma";

    private static Uri asSyncAdapter(Uri uri) {
        return uri.buildUpon().appendQueryParameter(CalendarContract.CALLER_IS_SYNCADAPTER, "true")
            .appendQueryParameter(CalendarContract.Calendars.ACCOUNT_NAME, ACCOUNT)
            .appendQueryParameter(CalendarContract.Calendars.ACCOUNT_TYPE, CalendarContract.ACCOUNT_TYPE_LOCAL).build();
    }

    static Long lemmaCalendar(ContentResolver resolver, boolean create) {
        try (Cursor c = resolver.query(CalendarContract.Calendars.CONTENT_URI, new String[] {CalendarContract.Calendars._ID},
            CalendarContract.Calendars.ACCOUNT_NAME + "=? AND " + CalendarContract.Calendars.ACCOUNT_TYPE + "=?",
            new String[] {ACCOUNT, CalendarContract.ACCOUNT_TYPE_LOCAL}, null)) {
            if (c != null && c.moveToFirst()) return c.getLong(0);
        }
        if (!create) return null;
        ContentValues values = new ContentValues();
        values.put(CalendarContract.Calendars.ACCOUNT_NAME, ACCOUNT);
        values.put(CalendarContract.Calendars.ACCOUNT_TYPE, CalendarContract.ACCOUNT_TYPE_LOCAL);
        values.put(CalendarContract.Calendars.NAME, "lemma_study");
        values.put(CalendarContract.Calendars.CALENDAR_DISPLAY_NAME, "Lemma");
        values.put(CalendarContract.Calendars.CALENDAR_COLOR, 0xFF3D5A80);
        values.put(CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL, CalendarContract.Calendars.CAL_ACCESS_READ);
        values.put(CalendarContract.Calendars.OWNER_ACCOUNT, ACCOUNT);
        values.put(CalendarContract.Calendars.VISIBLE, 1);
        values.put(CalendarContract.Calendars.SYNC_EVENTS, 1);
        Uri created = resolver.insert(asSyncAdapter(CalendarContract.Calendars.CONTENT_URI), values);
        return created == null ? null : Long.parseLong(created.getLastPathSegment());
    }

    /** Make the Lemma calendar match `events` between `from` and `to`. Returns {inserted, updated, deleted}. */
    public static int[] sync(Context context, JSONArray events, long from, long to) throws JSONException {
        ContentResolver resolver = context.getContentResolver();
        Long calendar = lemmaCalendar(resolver, true);
        if (calendar == null) return new int[] {0, 0, 0};
        List<CalendarPlan.Existing> existing = new ArrayList<>();
        try (Cursor c = resolver.query(CalendarContract.Events.CONTENT_URI,
            new String[] {CalendarContract.Events._ID, CalendarContract.Events.SYNC_DATA1, CalendarContract.Events.TITLE,
                CalendarContract.Events.DTSTART, CalendarContract.Events.DTEND, CalendarContract.Events.DESCRIPTION, CalendarContract.Events.EVENT_TIMEZONE},
            CalendarContract.Events.CALENDAR_ID + "=? AND " + CalendarContract.Events.DTSTART + "<? AND " + CalendarContract.Events.DTEND + ">? AND "
                + CalendarContract.Events.DELETED + "=0",
            new String[] {String.valueOf(calendar), String.valueOf(to), String.valueOf(from)}, null)) {
            while (c != null && c.moveToNext()) {
                existing.add(new CalendarPlan.Existing(c.getLong(0), new CalendarPlan.Event(c.getString(1), c.getString(2), c.getLong(3), c.getLong(4), c.getString(5), c.getString(6))));
            }
        }
        List<CalendarPlan.Event> desired = new ArrayList<>();
        for (int i = 0; i < events.length(); i++) {
            JSONObject e = events.getJSONObject(i);
            desired.add(new CalendarPlan.Event(e.getString("key"), e.optString("title", "Study block"), e.getLong("start"), e.getLong("end"),
                e.optString("description", ""), e.optString("timeZone", "UTC")));
        }
        CalendarPlan plan = CalendarPlan.diff(existing, desired);
        Uri eventsUri = asSyncAdapter(CalendarContract.Events.CONTENT_URI);
        for (CalendarPlan.Event event : plan.inserts) {
            ContentValues values = values(event);
            values.put(CalendarContract.Events.CALENDAR_ID, calendar);
            values.put(CalendarContract.Events.SYNC_DATA1, event.key);
            resolver.insert(eventsUri, values);
        }
        for (Map.Entry<Long, CalendarPlan.Event> update : plan.updates.entrySet()) {
            resolver.update(withId(eventsUri, update.getKey()), values(update.getValue()), null, null);
        }
        for (Long row : plan.deletes) resolver.delete(withId(eventsUri, row), null, null);
        return new int[] {plan.inserts.size(), plan.updates.size(), plan.deletes.size()};
    }

    /** A row URI that keeps the sync-adapter query parameters. */
    private static Uri withId(Uri base, long id) {
        return base.buildUpon().appendPath(String.valueOf(id)).build();
    }

    private static ContentValues values(CalendarPlan.Event event) {
        ContentValues values = new ContentValues();
        values.put(CalendarContract.Events.TITLE, event.title);
        values.put(CalendarContract.Events.DESCRIPTION, event.description);
        values.put(CalendarContract.Events.DTSTART, event.start);
        values.put(CalendarContract.Events.DTEND, event.end);
        values.put(CalendarContract.Events.EVENT_TIMEZONE, event.timeZone);
        values.put(CalendarContract.Events.AVAILABILITY, CalendarContract.Events.AVAILABILITY_BUSY);
        values.put(CalendarContract.Events.HAS_ALARM, 0);
        return values;
    }

    /** Delete the Lemma calendar and everything in it (calendar sync turned off, or sign-out). */
    public static int removeAll(Context context) {
        ContentResolver resolver = context.getContentResolver();
        Long calendar = lemmaCalendar(resolver, false);
        if (calendar == null) return 0;
        int deleted = resolver.delete(asSyncAdapter(CalendarContract.Events.CONTENT_URI), CalendarContract.Events.CALENDAR_ID + "=?",
            new String[] {String.valueOf(calendar)});
        resolver.delete(withId(asSyncAdapter(CalendarContract.Calendars.CONTENT_URI), calendar), null, null);
        return deleted;
    }

    /** Calendars the learner may choose for busy times (never Lemma's own). */
    public static JSONArray list(Context context) throws JSONException {
        JSONArray out = new JSONArray();
        try (Cursor c = context.getContentResolver().query(CalendarContract.Calendars.CONTENT_URI,
            new String[] {CalendarContract.Calendars._ID, CalendarContract.Calendars.CALENDAR_DISPLAY_NAME, CalendarContract.Calendars.ACCOUNT_NAME,
                CalendarContract.Calendars.CALENDAR_COLOR, CalendarContract.Calendars.ACCOUNT_TYPE},
            CalendarContract.Calendars.VISIBLE + "=1", null, CalendarContract.Calendars.CALENDAR_DISPLAY_NAME)) {
            while (c != null && c.moveToNext()) {
                if (ACCOUNT.equals(c.getString(2)) && CalendarContract.ACCOUNT_TYPE_LOCAL.equals(c.getString(4))) continue;
                out.put(new JSONObject().put("id", String.valueOf(c.getLong(0))).put("name", c.getString(1) == null ? "Calendar" : c.getString(1))
                    .put("account", c.getString(2) == null ? "" : c.getString(2)).put("colour", c.getInt(3)));
            }
        }
        return out;
    }

    /** Busy, timed events between two instants in the chosen calendars (free and all-day events are ignored). */
    public static JSONArray busy(Context context, long from, long to, Set<String> calendarIds) throws JSONException {
        JSONArray out = new JSONArray();
        if (calendarIds.isEmpty() || to <= from) return out;
        Uri.Builder uri = CalendarContract.Instances.CONTENT_URI.buildUpon();
        android.content.ContentUris.appendId(uri, from);
        android.content.ContentUris.appendId(uri, to);
        Set<String> chosen = new HashSet<>(calendarIds);
        try (Cursor c = context.getContentResolver().query(uri.build(),
            new String[] {CalendarContract.Instances.BEGIN, CalendarContract.Instances.END, CalendarContract.Instances.CALENDAR_ID,
                CalendarContract.Instances.AVAILABILITY, CalendarContract.Instances.ALL_DAY}, null, null, CalendarContract.Instances.BEGIN)) {
            while (c != null && c.moveToNext()) {
                if (!chosen.contains(String.valueOf(c.getLong(2))) || c.getInt(4) == 1) continue;
                if (c.getInt(3) == CalendarContract.Events.AVAILABILITY_FREE) continue;
                out.put(new JSONObject().put("start", c.getLong(0)).put("end", c.getLong(1)));
            }
        }
        return out;
    }
}
