# FIX-540a — fail-closed per-route CPU evidence

Audit: [#540](https://github.com/Mymayankyadav/lemma/issues/540). The ST-0 eight-case route matrix currently throttles only Today at 4×; other routes record 1×, so the existing 1.5-second CPU budget is not verified for 17 routes.

This independent split makes the QA-3 evidence reporter reject **any** route lacking a 4× measurement, not only Today, and adds a negative unit test for a non-Today route. It does **not** claim to have measured the missing routes or certify their speed.

FIX-540b must add measured 4× first-render evidence for every route across S/X, both Graph worlds and 360/390 px, using bounded CI partitions where necessary. QA-3b remains INCOMPLETE until that evidence and all strict hard-budget and live-network gates pass. No threshold exemptions are allowed.
