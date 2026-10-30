# Open the teaching schedule

Schedule view lets a teacher open `/schedule`, move between weeks, and see class session blocks for enrolled classes in the week that contains those dates.

## Sub-features

- `schedule-open` opens `/schedule` from the sidebar `Lịch dạy` link.
- `schedule-week-nav` moves the visible week without leaving the schedule page.
- `schedule-session-visible` shows a session block labeled with the class name for a week that contains generated sessions.

## How to get to it (user POV)

- Choose sidebar `Lịch dạy`.
- Use the week navigation controls on `/schedule` to reach the week of a known session date.

## Driving it with verify-teacher-os

Preconditions:

- Stack is healthy.
- A class with an **activated** enrollment exists so lessons were generated ([enroll-activate-student](./enroll-activate-student.md)). A class with zero active enrollments will show an empty week — that is not a schedule bug; report the unmet precondition.

- **Open schedule.** Click sidebar text `Lịch dạy` (exact). URL matches `/schedule`.
- **Locate week.** Default view anchors on Vietnam today. If the class starts tomorrow, navigate to the week containing the first T2/T4 occurrence (reuse the week math helpers in `apps/e2e/specs/helpers.ts`: `gotoWeek`, `vietnamTodayISO`, `addDaysISO`) or click the UI week controls until the class name appears.
- **Observe.** A session block showing the class name is visible (use `.first()` if multiple occurrences share the name).
- **Proof.** Capture `evidence/schedule-view/week.png` and ARIA with the class name visible. Reload and confirm the same week still shows the block.

## Gotchas

- Runner timezone must be `Asia/Ho_Chi_Minh` or week boundaries diverge from the product.
- On a VN Sunday, "start tomorrow" is Monday of the **next** calendar week — pinning the week explicitly avoids empty grids.
- Session blocks carry the class name; other labels on the page may match substrings — prefer role/name scoped queries.
- Check-in is a different feature (class session modal / attendance). A future session without a `Điểm danh` button is expected.
