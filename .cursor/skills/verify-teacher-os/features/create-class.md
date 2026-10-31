# Create a class

Create class lets a signed-in teacher open the create-class dialog from the class list, set a name, skill chips, and weekdays, and persist a scheduled class that appears in the list after the modal closes.

## Sub-features

- `class-list-open` opens `/classes` from the sidebar.
- `class-dialog-open` opens the `Tạo lớp mới` dialog via `+ Tạo lớp`.
- `class-save` persists name + schedule and shows the class row with a session fraction like `0/12 buổi`.

## How to get to it (user POV)

- After sign-in, choose `Lớp học` in the sidebar, then `+ Tạo lớp`.
- From dashboard command search (⌘K), navigate to classes then create (secondary; map still requires the sidebar path for proof).

## Driving it with verify-teacher-os

Preconditions:

- Stack is healthy.
- Teacher session exists (run sign-up first, or use `drive.mjs create-class` which signs up then creates).
- No class already titled the chosen unique name.

- **Sign up.** Run `node .cursor/skills/verify-teacher-os/scripts/drive.mjs create-class --name "Verify Writing Evening"` (includes sign-up) **or** complete [sign-up-dashboard](./sign-up-dashboard.md) then drive the steps below in the same Playwright page.
- **Open list.** Choose sidebar text `Lớp học` (exact). URL is `/classes`.
- **Open dialog.** Click button `+ Tạo lớp`. A dialog containing text `Tạo lớp mới` appears.
- **Fill.** Fill label `Tên lớp *` with the unique name. Click skill chip `Writing`. Click weekday chips `T2` and `T4` (defaults keep 19:00–20:30, 12 buổi, start tomorrow).
- **Save.** Click button `Tạo lớp` (exact, inside the dialog). Dialog becomes hidden. The class name is visible on the list and `0/12 buổi` appears for a default 12-session class.
- **Proof.** Capture `evidence/create-class/list.png` and `list.aria.txt` showing the new class name. Reload `/classes` and confirm the name still appears.

## Gotchas

- The submit button label `Tạo lớp` collides with the page header CTA if not scoped to the dialog — always click inside `role="dialog"`.
- Start date cannot be today in the form; tomorrow is the default — do not assert sessions on "today" without adjusting the start date.
- Sessions are **not** generated at class creation; they appear after a student is enrolled and activated (see [enroll-activate-student](./enroll-activate-student.md)).
- Exact weekday chip labels are `T2`…`T7` style — do not use English weekday names.
