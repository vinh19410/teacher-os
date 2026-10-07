---
phase: 5
title: "E2E + docs + gate cuối"
status: pending
priority: P2
effort: "2h"
dependencies: [1, 2, 3, 4]
---

# Phase 5: E2E + docs + gate cuối

## Goal

Một e2e chạy trọn luồng highlight thật trên Chromium; runbook có migration 0035; CHANGELOG có mục mới; toàn bộ gate local xanh.

## Files to Create / Modify

- Create: `apps/e2e/specs/teacher-essay-annotations.spec.ts`
- Modify: `docs/production-release-runbook.md` (danh sách migration, sau mục 0034)
- Modify: `CHANGELOG.md` (mục `## 2026-10-07` → `### Added`; tạo mục ngày nếu chưa có)

## Tasks & Steps

### 5.1 E2E `teacher-essay-annotations.spec.ts`

Spec riêng thay vì thêm vào `teacher-grade-submission.spec.ts`, vì plan `261007-0830-grade-form-band-slider` đang sửa phần chọn điểm trong spec đó. Spec này chấm điểm qua API nên không phụ thuộc widget chọn điểm.

Setup copy theo `teacher-grade-submission.spec.ts` (`beforeAll`): `signUpViaUi` giáo viên → `orgIdForTeacherEmail` → `seedQuizFixture` với 1 prompt Writing task2 → `seedSubmittedEssay` với essay `"Living in a city has many benefits.\nFirst, jobs are plentiful."` → portal signup + `verifyStudentEmailFromMailLog`. Học viên luôn đăng nhập bằng context mới (`signIn`).

Test 1 — giáo viên highlight:
1. `teacherPage.goto(\`${WEB_ORIGIN}/grading/${attemptId}\`)`.
2. Bôi đen một phần từ `benefits` bằng `page.evaluate` tạo `Range` trên text node trong `[data-testid=essay-text]` (offset giữa từ), rồi `dispatchEvent(new PointerEvent("pointerup", { bubbles: true }))`. (Kéo chuột thật bằng `mouse.down/move/up` cũng được nếu ổn định; ưu tiên `Range` để không phụ thuộc toạ độ.)
3. `getByRole("dialog", { name: "Thêm highlight" })` hiện, chứa `“benefits”`.
4. Điền `#annotation-note` = `"Dùng 'advantages' cho đa dạng."`, bấm "Lưu highlight".
5. Có `mark[data-n="1"]` chứa `benefits`; danh sách "Ghi chú trên bài viết" có mục 1.
6. Tạo highlight thứ 2 trên `plentiful` với ghi chú rỗng → `mark[data-n="2"]`.
7. Bôi đen lại `benefits` → popover báo "Đoạn này trùng với highlight khác." và nút "Lưu highlight" disable; bấm "Huỷ".
8. Sửa ghi chú mục 2 thành `"Từ hay."` qua nút "Sửa ghi chú 2". `page.reload()` → vẫn còn 2 highlight và ghi chú mới.

Test 2 — học viên chỉ thấy sau khi chấm:
1. Context học viên mới, `signIn`, mở `/learn/quizzes/attempt/<id>` → **không** có `mark`, không có `essay-annotation-list`, có dòng "Giáo viên sẽ chấm bài viết của bạn.".
2. Giáo viên chấm qua API: `teacherPage.request.post(\`${API_ORIGIN}/api/grading/${attemptId}/grade\`, { headers: { Origin: WEB_ORIGIN, "Content-Type": "application/json" }, data: { scores: { task: 6, coherence: 6.5, lexical: 6, grammar: 6.5 }, feedback: "" } })` → 200. (Precedent gọi API bằng `page.request` với `API_ORIGIN`: `class-operations.spec.ts:156`.)
3. Học viên reload → có 2 `mark`, `essay-annotation-list` có `Dùng 'advantages' cho đa dạng.` và `Từ hay.`; band `6.5` vẫn hiện.

Test 2 phụ thuộc Test 1: dùng `test.describe.configure({ mode: "serial" })`.

### 5.2 Runbook

Thêm sau mục 0034 trong danh sách migration của `docs/production-release-runbook.md`, cùng giọng mục 0033:

- **0035** (`0035_<tên drizzle>.sql`): tạo bảng `quiz_attempt_annotation` (highlight + ghi chú giáo viên trên bài Writing, FK cascade theo `quiz_attempt`). **DEPLOY ORDER**: migration chạy TRƯỚC worker; worker mới query bảng này ở GET `/api/grading/:attemptId` và summary học viên đã chấm — thiếu bảng thì trả 500, `/readyz` không phát hiện. Rollback code: bảng còn sót vô hại, không có bước hoàn tác dữ liệu.

Kiểm đoạn "Hệ quả rollback" chung đã bao trường hợp "bảng mới còn sót" (đã có câu "bảng/cột mới còn sót lại trong D1 sau rollback là vô hại").

### 5.3 CHANGELOG

Dưới `## 2026-10-07` → `### Added`:
- `Chấm Writing: giáo viên bôi đen từ/cụm từ trong bài để highlight và ghi chú (lưu ngay, sửa/xoá trong danh sách dưới bài); học viên thấy highlight đánh số và ghi chú ở màn kết quả khi bài đã có điểm (#332)`

Issue: #332.

### 5.4 Gate cuối

Chạy lần lượt, tất cả phải xanh:
```bash
pnpm check
pnpm check-types
pnpm --filter @teacher-os/api test
pnpm --filter server test
pnpm --filter web test
pnpm --filter student test
E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e teacher-essay-annotations teacher-grade-submission student-quiz-take-review
```

### 5.5 Screenshot cho PR

Trang chấm có 2 highlight + popover mở ở 1440×900, 768×1024, 375×812; màn kết quả học viên ở 375×812.

## Verification

- Toàn bộ lệnh 5.4 xanh.
- `git diff --stat` chỉ gồm file liệt kê ở các phase 1–5.

## Failure Protocol

- E2E bôi đen bằng `Range` không bật popover: kiểm listener `pointerup` gắn trên container essay, và `Range` nằm trong text node của phần tử có `data-start`. Không thêm hook test-only vào code production.
- `teacher-grade-submission` đỏ do thay đổi `SubmissionView`: dừng, đối chiếu `data-testid="essay-text"` và nội dung text của khối essay còn nguyên.
