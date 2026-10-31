# Enroll and activate a student

Enroll-and-activate lets a teacher add an existing org student into a class roster as `invited`, then activate them to `active` so sessions generate and invoices/assignments can target them.

## Sub-features

- `enroll-open` opens the class roster tab and the add-student dialog.
- `enroll-pick` selects an existing student and saves the invitation.
- `enroll-activate` confirms `Kích hoạt học viên?` and shows status `Đang học`.

## How to get to it (user POV)

- From `/classes`, open a class, choose tab `Học viên`, then `+ Thêm học viên vào lớp`.
- After the student row appears, choose `Kích hoạt` and confirm in the dialog.

## Driving it with verify-teacher-os

Preconditions:

- Stack is healthy.
- A teacher session and a scheduled class exist (complete [sign-up-dashboard](./sign-up-dashboard.md) and [create-class](./create-class.md)).
- An org student already exists for that teacher. Teacher OS no longer creates students from the teacher UI; e2e uses `seedStudent({ teacherEmail, name })` from `apps/e2e/specs/helpers.ts` against `apps/e2e/local.db`. If that seed is unavailable, provision via the student portal invitation path first — otherwise report failure here, do not skip activation.

- **Open class roster.** From `/classes`, click the class title (`h3` with the class name). Choose tab `Học viên`.
- **Add student.** Click `+ Thêm học viên vào lớp`. In the dialog, click option named with the student name, then button `Lưu`. Dialog hides; the student name is visible on the roster.
- **Activate.** Click button `Kích hoạt`. A dialog containing `Kích hoạt học viên?` appears. Click `Kích hoạt` inside that dialog. Dialog hides; text `Đang học` is visible.
- **Proof.** Reload the class roster. Capture screenshot + ARIA under `evidence/enroll-activate/`. Student still shows as active. On tab `Sessions & practice`, upcoming session badges appear (for a default 12-buổi class, twelve `Sắp tới` badges) — this is the side effect of activation, not of class creation alone.

## Gotchas

- Without activation, invoices and assignments reject the enrollment — do not treat a visible invited row as an active student.
- Future-dated classes generate sessions that are not check-in-able yet (no `Điểm danh` button) — that is expected, not a failure of enrollment.
- Scope tab assertions to the active tab; other tabs can render similar labels.
- If `seedStudent` was skipped and the org has no students, the picker is empty — fail the journey with that precondition rather than creating a student through a non-product path invented for the run.
