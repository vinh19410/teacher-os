---
phase: 3
title: "E2E + gate cuối"
status: completed
priority: P2
effort: "1.5h"
dependencies: [1, 2]
---

# Phase 3: E2E + gate cuối

## Goal
Chứng minh luồng thật end-to-end. Học viên đăng nhập, thấy giáo viên trên card, bấm card mở trang chi tiết, thấy buổi học và bài tập của lớp, rồi quay về trang chủ. Lớp invited không mở được.

## Bối cảnh
- Fixture: `apps/e2e/specs/helpers-quiz.ts` → `seedQuizFixture({ orgName, className, studentName, studentEmail, prompts })` seed org, class, student (đã onboarding), enrollment `active` và bài tập. Fixture **không** seed giáo viên (`user` + `membership`) và lesson.
- Đăng nhập học viên: tái dùng đúng luồng của `student-quiz-take-review.spec.ts`, gồm `seedQuizFixture` (`:124`) và `verifyStudentEmailFromMailLog` (`:397`).
- Port e2e: `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103` (AGENTS.md).

## Files to Create / Modify
- Create: `apps/e2e/specs/student-class-detail.spec.ts`
- Modify (nếu cần seed dùng chung): `apps/e2e/specs/helpers-quiz.ts`. Thêm option `teacher?: { name; email }` để insert `user` + `membership(role 'teacher')`, và option `lessons?: Array<{ date; time; dur; status; topic }>` để insert `lesson` gắn enrollment vừa tạo. Option là optional nên spec cũ không đổi.

## Tasks & Steps
- [x] Seed:
  - Một org có giáo viên "Cô Lan" (`lan.teacher@e2e.local`).
  - Lớp active "IELTS Detail E2E" gồm:
    - 3 lesson: 1 `completed` hôm qua, 1 `upcoming` ngày mai, 1 `upcoming` sau 1 tuần.
    - 1 bài tập Reading.
  - Thêm một lớp thứ hai trong cùng org với enrollment `invited` (insert SQL trực tiếp như trong fixture).
- [x] Spec `test("class card shows the teacher and opens the class detail page")`:
  1. Học viên đăng nhập và vào trang chủ.
  2. Card "IELTS Detail E2E" chứa "Cô Lan" và `lan.teacher@e2e.local`.
  3. Card invited **không** có `role=link` (`getByRole("link", { name: /Xem chi tiết lớp IELTS Invited/ })` có count 0).
  4. Bấm card active thì URL là `/classes/<classId>`.
  5. Trang chi tiết có `h1` "IELTS Detail E2E", card giáo viên có link `mailto:lan.teacher@e2e.local`.
  6. Danh sách có 3 buổi, buổi ngày mai mang nhãn "Buổi tới", buổi hôm qua mang nhãn "Đã học".
  7. Section "Bài tập" có bài Reading. Bấm vào thì mở màn làm bài, sau đó `page.goBack()`.
  8. Bấm sidebar "Trang chủ" thì quay về `/`.
- [x] Spec `test("class detail of an invited or foreign class shows not found")`: `page.goto("/classes/<invitedClassId>")` hiện "Không tìm thấy lớp".

## Validation (gate cuối)
- `pnpm check`
- `pnpm check-types`
- `pnpm --filter server test`
- `pnpm --filter student test`
- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e -- student-class-detail.spec.ts student-quiz-take-review.spec.ts student-portal-onboarding.spec.ts`
- Đối chiếu từng mục Acceptance Criteria trong `plan.md`.

## Risks / Rollback
- Ngày "hôm qua/ngày mai" phụ thuộc timezone VN. Dùng `vietnamTodayISO` + `addDaysISO` từ `helpers.ts`, không dùng `new Date()` thô.
- Rollback: xoá spec. Option fixture mới là optional nên không ảnh hưởng spec khác.
