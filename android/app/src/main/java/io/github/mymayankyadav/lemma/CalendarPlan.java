package io.github.mymayankyadav.lemma;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * N123 · N5 what to change in the "Lemma" device calendar so it matches the study blocks in the sync window: insert new
 * blocks, update changed ones, delete blocks that were removed in Lemma (and any duplicate). Pure, unit-tested.
 */
public final class CalendarPlan {
    public static final class Event {
        public final String key, title, description, timeZone;
        public final long start, end;
        public Event(String key, String title, long start, long end, String description, String timeZone) {
            this.key = key; this.title = title; this.start = start; this.end = end; this.description = description; this.timeZone = timeZone;
        }
        boolean sameAs(Event other) {
            return start == other.start && end == other.end && Objects.equals(title, other.title)
                && Objects.equals(description, other.description) && Objects.equals(timeZone, other.timeZone);
        }
    }

    public static final class Existing {
        public final long rowId;
        public final Event event;
        public Existing(long rowId, Event event) { this.rowId = rowId; this.event = event; }
    }

    public final List<Event> inserts = new ArrayList<>();
    public final Map<Long, Event> updates = new HashMap<>();
    public final List<Long> deletes = new ArrayList<>();

    public static CalendarPlan diff(List<Existing> existing, List<Event> desired) {
        CalendarPlan plan = new CalendarPlan();
        Map<String, Event> wanted = new HashMap<>();
        for (Event event : desired) if (event.key != null && !event.key.isEmpty() && event.end > event.start) wanted.put(event.key, event);
        Set<String> seen = new HashSet<>();
        for (Existing row : existing) {
            String key = row.event.key;
            Event target = key == null ? null : wanted.get(key);
            if (target == null || !seen.add(key)) {
                plan.deletes.add(row.rowId);
            } else if (!target.sameAs(row.event)) {
                plan.updates.put(row.rowId, target);
            }
        }
        for (Event event : wanted.values()) if (!seen.contains(event.key)) plan.inserts.add(event);
        plan.inserts.sort((a, b) -> Long.compare(a.start, b.start));
        return plan;
    }
}
