# Review correction screenshots

These six captures use the rebuilt application and demo data with the clock set to November 9, 2026 at 13:43 in Asia/Kolkata. The manifest records the loaded build entry, viewport and checksums. [Capture manifest](manifest.json)

| Flow | Capture |
| --- | --- |
| Calendar Day at 390 × 844 in Night | [Due count in the control row](calendar-phone-deadline-trigger.jpg) · [Analysis examination in the sheet](calendar-phone-deadline.jpg) |
| Calendar Day at 320 × 640 in Day with 160% text | [Due practice with time and title on separate lines](calendar-small-practice.jpg) |
| Calendar Day at 1280 × 844 in Day | [Deadline in the selected-day sidebar](calendar-desktop-deadline.jpg) |
| Tutor at 390 × 844 in Night | [Failed image read with the answer, retry, removal and keyboard visible](tutor-image-recovery.jpg) |
| Today at 390 × 844 in Night | [Explanation for the scheduled Linear Algebra checkpoint](today-scheduled-checkpoint.jpg) |

The Tutor capture injects a failed IndexedDB read to hold the recovery state. Today uses a study window restricted to Linear Algebra, with Atlas off. The browser regression follows the action into Linear Algebra CP9.
