---
title: "Form trong Modal dính field — sửa tận gốc ở Modal primitive"
status: pending
created: 2026-10-22
branch: develop
mode: fast
issue: https://github.com/vinh19410/teacher-os/issues/416
---

# Form trong Modal dính field — sửa tận gốc ở Modal primitive

## Vấn đề

Modal "Tạo syllabus mới" (và mọi modal bọc nội dung trong `<form>`): các field dính sát nhau — label của
field sau chạm đáy control của field trước ("Tên syllabus" → "Loại lớp" → "Trình độ" → …), không có nhịp
khoảng cách giữa các nhóm.

## Nguyên nhân gốc (đã kiểm bằng source)

`apps/web/src/components/ui/modal.tsx:93` — thân modal là `<div className="flex flex-col gap-4 p-6">`.
`gap-4` chỉ áp lên **con trực tiếp**. Khi caller truyền `<form>` làm con duy nhất, cả form là **một** flex
item; bên trong form là block flow, còn `Field` (`field.tsx`, wrapper `flex flex-col gap-1`) không có margin
→ các field xếp sát nhau, khoảng cách = 0.

- Lỗi tồn tại từ trước #378 (cấu trúc Modal body + form trần không đổi qua `5717a670`, `c308b434`), nhưng
  label v1 là mono 11px uppercase nên khó nhận ra; label v2 `text-sm font-medium` làm lộ rõ.
- Không có rule CSS global nào cho `form` ở bất kỳ revision nào (`git grep` trên `*.css`).

Phạm vi bị ảnh hưởng — `<form>` trần (không class layout) là con trực tiếp của `Modal`, 11 file trong
`apps/web/src/components/modals/`: `add-syllabus`, `add-class`, `add-invoice`, `add-lesson`, `add-module`,
`create-report`, `edit-lesson`, `edit-module`, `enroll-student`, `grade-modal`, `import-syllabus`.
Hai modal đã tự vá bằng class trên form: `edit-class-fee` (`flex flex-col gap-5`), `invite-student`
(`flex flex-col gap-4 py-2`). Form ngoài Modal (`profile.tsx`, `grade-form.tsx`) đã có `flex flex-col gap-4`;
`lesson-edit-form.tsx` lồng trong div của `lesson-modal` và tự lo `mt-*` — không thuộc phạm vi.

## Hướng sửa

Sửa **một chỗ** ở primitive: Modal body cho form con trực tiếp cùng nhịp layout với body —
`[&>form]:flex [&>form]:flex-col [&>form]:gap-4`. Mọi modal hiện tại và modal viết sau đều đúng mà không
cần nhớ thêm class. Kèm 3 chỉnh nhỏ để tránh khoảng trống kép khi form thành flex container:

1. Wrapper trạng thái luôn render `<div className="flex flex-col gap-2">{error && …}{notice && …}</div>`
   (9 file) — khi rỗng vẫn là flex item → khoảng trống 32px trước footer. Thêm `empty:hidden`.
2. `mb-3` trên `<p>` lỗi ở `grade-modal.tsx:230`, `create-report-modal.tsx:121` — cộng dồn với gap → bỏ.
3. `Field` đổi `gap-1` → `gap-2`: tạo phân cấp rõ label→control (8px) < field→field (16px), khớp shadcn v2.

Không chọn phương án "thêm `className="flex flex-col gap-4"` vào 11 form": churn, và modal mới sẽ tái phát.
Không dùng `[&>form]:contents`: phá padding/id của form (`invite-student` dùng `py-2`, `id` cho nút submit ngoài).

Lưu ý specificity: `.\[\&\>form\]\:gap-4 > form` (0,1,1) thắng `.gap-5` (0,1,0) trên chính form, nên
`edit-class-fee` sẽ về `gap-4` — chấp nhận để đồng nhất nhịp 16px; xoá class layout thừa ở 2 form đã tự vá.

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | [Sửa Modal + Field primitive + test khoá hợp đồng](phase-01-fix-modal-primitive.md) | pending |
| 2 | [Dọn call site: wrapper rỗng, margin thừa, class trùng](phase-02-clean-call-sites.md) | pending |
| 3 | [Verify UI 3 viewport + design:compare + e2e](phase-03-verify.md) | pending |

## Acceptance criteria

- [ ] Modal "Tạo syllabus mới": mỗi field cách field kế 16px; label cách control 8px; không còn chỗ dính.
- [ ] Cả 13 modal có form (11 trần + 2 đã vá) có nhịp field đồng nhất 16px; không có khoảng trống kép
      trước footer khi không có lỗi/notice.
- [ ] Khi có lỗi/notice, khối trạng thái hiện đúng vị trí, cách field trên 16px.
- [ ] `modal.test.tsx` fail nếu body Modal mất layout cho form con trực tiếp; `field.test.tsx` khoá `gap-2`.
- [ ] `pnpm check`, `pnpm check-types`, `pnpm --filter web test` PASS; e2e full suite PASS trước merge.

## Ngoài phạm vi

- `add-syllabus`: "Trình độ" nằm trong `grid-cols-2` một mình (select rộng nửa modal) và lỗi tên hiển thị hai
  lần (Field `error` + `<p role="alert">`) — hành vi riêng, tách issue nếu cần.
- `apps/student` không dùng Modal/Field của `apps/web` — không ảnh hưởng.
- Modal không dùng form (lesson-modal, session-actions…) đã là con trực tiếp của body → đã có `gap-4`.
