---
phase: 5
title: "Phase 5: UI giáo viên, kiểm chứng học viên & E2E"
status: completed
priority: P1
effort: "3h"
dependencies: [2, 3, 4]
---

# Phase 5: UI giáo viên, kiểm chứng học viên & E2E

## Goal

Cung cấp giao diện quản lý bộ đề (`/assignments/packs`) và khu vực `"Bộ đề tự học"` trong chi tiết lớp (`/classes/$classId`) theo đúng chuẩn `DESIGN.md` & `REVIEW.md`; bổ sung giao diện quản lý bộ đề hệ thống trong `apps/admin`; và kiểm chứng E2E toàn trình không cần cron.

## Files

- Create:
  - `apps/web/src/routes/_auth/assignments/packs.tsx`
  - `apps/web/src/components/classes/class-study-pack-section.tsx`
  - `apps/web/src/components/classes/class-study-pack-section.test.tsx`
  - `apps/admin/src/routes/_auth/library/packs.tsx`
  - `apps/e2e/specs/study-pack.spec.ts`
- Modify:
  - `apps/web/src/routes/_auth/assignments/index.tsx`
  - `apps/web/src/routes/_auth/classes/$classId.tsx`
  - `apps/web/src/routes-matcher.ts`
  - `apps/web/src/routes-matcher.test.ts`
  - `apps/admin/src/routes/_auth/library/tests/index.tsx` (hoặc nav của admin để điều hướng sang `/library/packs`)
  - `apps/e2e/src/boot.ts`
  - `CHANGELOG.md`
  - `docs/codebase-summary.md`

## Tasks

### Task 5.1 — Xây dựng trang quản lý Bộ đề (`/assignments/packs`), khu vực lớp (`ClassStudyPackSection`) và trang Admin (`/library/packs`)
- **Goal:** Giáo viên tạo/sửa/xoá bộ đề của mình, xem/nhân bản bộ đề thư viện hệ thống, và gán/xem tiến độ/huỷ bộ đề trong chi tiết lớp (`/classes/$classId`).
- **Target files:**
  - `apps/web/src/routes/_auth/assignments/packs.tsx`
  - `apps/web/src/routes/_auth/assignments/index.tsx`
  - `apps/web/src/components/classes/class-study-pack-section.tsx`
  - `apps/web/src/components/classes/class-study-pack-section.test.tsx`
  - `apps/web/src/routes/_auth/classes/$classId.tsx`
  - `apps/web/src/routes-matcher.ts`
  - `apps/web/src/routes-matcher.test.ts`
  - `apps/admin/src/routes/_auth/library/packs.tsx`
- **Steps:**
  1. Đăng ký `"/assignments/packs"` vào `VALID_EXACT_ROUTES` trong `apps/web/src/routes-matcher.ts` và kiểm tra `routes-matcher.test.ts`.
  2. Tạo `apps/web/src/routes/_auth/assignments/packs.tsx` (và thêm nút/liên kết `"Bộ đề tự học"` trên header trang `/assignments`):
     - Chuyển giữa 2 chế độ `"Bộ đề của tôi"` (`scope === "org"`) và `"Thư viện hệ thống"` (`scope === "system"`).
     - Form tạo/chỉnh sửa bộ đề org: nhập tiêu đề, mô tả, trạng thái (`Nháp` / `Sẵn sàng`), thêm bài theo `Ngày 1..N` (chỉ hiển thị đề `ready` thuộc kỹ năng `Reading`, `Listening`, `Grammar`, `Vocabulary`), xoá bộ đề, và nút `"Nhân bản về trung tâm"` cho bộ đề hệ thống, kèm thông báo `toast.success` / `toast.error`.
  3. Tạo `apps/web/src/components/classes/class-study-pack-section.tsx` và gắn vào `apps/web/src/routes/_auth/classes/$classId.tsx`:
     - Trong `$classId.tsx`, dùng nút chuyển `<button type="button" aria-pressed={practiceMode === "study-pack"}>Bộ đề tự học</button>` (không dùng `role="tab"` và chỉ mount `ClassStudyPackSection` khi người dùng bấm mở để giữ nguyên hành vi và các test hiện hữu của `$classId.test.tsx`).
     - Trong `ClassStudyPackSection`: hiển thị danh sách bộ đề đã gán vào lớp (tiêu đề, ngày bắt đầu `dd/mm/yyyy`, khung giờ mở — hạn nộp, danh sách bài theo từng ngày kèm trạng thái `"Đã mở"` / `"Chưa đến giờ"`, tiến độ nộp/trễ hạn của học viên, nút `"Huỷ bộ đề"`), và form/dialog `"Gán bộ đề"` (chọn bộ đề `ready`, ngày bắt đầu, giờ mở mặc định `06:00`, hạn nộp mặc định `17:00`, bảng xem trước lịch `"Ngày → Bài"` tự động bỏ qua ngày nghỉ của lớp).
  4. Tạo `apps/admin/src/routes/_auth/library/packs.tsx` để admin tạo/nhập JSON bộ đề hệ thống và bài tập thư viện (`library_exercise`).
  5. Viết unit test `apps/web/src/components/classes/class-study-pack-section.test.tsx`.
- **Success criteria:** Toàn bộ unit test của `apps/web` và `apps/admin` (bao gồm `routes-matcher.test.ts` và `$classId.test.tsx`) đều pass.
- **Verify:** `pnpm --filter web test -- class-study-pack-section routes-matcher` exits 0 and `pnpm --filter admin test` exits 0.

### Task 5.2 — Viết E2E spec `apps/e2e/specs/study-pack.spec.ts`, kiểm chứng UI 3 viewport và cập nhật docs
- **Goal:** Chứng minh luồng end-to-end hoạt động trên libsql không cần cron: giáo viên tạo đề Grammar + tạo bộ đề 2 ngày + gán vào lớp -> học viên thấy ngay bài Ngày 1, làm và nộp bài Grammar được chấm tự động, không thấy bài Ngày 2 (và truy cập URL trực tiếp bài Ngày 2 trả 404) -> dịch `available_at` của Ngày 2 sang quá khứ -> học viên thấy ngay bài Ngày 2 -> học viên mới vào lớp nhận bài còn hạn.
- **Target files:**
  - `apps/e2e/src/boot.ts`
  - `apps/e2e/specs/study-pack.spec.ts`
  - `CHANGELOG.md`
  - `docs/codebase-summary.md`
- **Steps:**
  1. Trong `apps/e2e/src/boot.ts`: thêm endpoint chỉ dành cho E2E `POST /__e2e/study-pack-shift` cho phép cập nhật `available_at` / `due_at` của `class_assignment` để kiểm thử thời điểm mở bài và quá hạn một cách tất định không phụ thuộc giờ máy chạy.
  2. Tạo `apps/e2e/specs/study-pack.spec.ts` kiểm chứng:
     - Giáo viên tạo đề Grammar (`ready`), tạo bộ đề 2 ngày, gán vào lớp (với `releaseTime = "00:00"` để Ngày 1 mở ngay mọi thời điểm trong ngày).
     - Học viên mở lớp thấy bài Ngày 1, làm bài Grammar được tự chấm điểm ngay; không thấy bài Ngày 2 và gọi trực tiếp API quiz của Ngày 2 nhận 404.
     - Dịch `available_at` của bài Ngày 2 về quá khứ qua `/__e2e/study-pack-shift` -> học viên tải lại trang thấy ngay bài Ngày 2 mà không cần bất kỳ job cron nào.
     - Học viên mới kích hoạt vào lớp giữa chừng nhận bài còn hạn.
  3. Kiểm chứng giao diện trên 3 viewport (`1440×900`, `768×1024`, `375×812`) và cập nhật `CHANGELOG.md` + `docs/codebase-summary.md`.
- **Success criteria:** E2E spec `study-pack.spec.ts`, `pnpm exec biome check .`, `pnpm check-types`, và `pnpm test` đều xanh.
- **Verify:** `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/study-pack.spec.ts` exits 0, `pnpm exec biome check .` exits 0, `pnpm check-types` exits 0, and `pnpm test` exits 0.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
