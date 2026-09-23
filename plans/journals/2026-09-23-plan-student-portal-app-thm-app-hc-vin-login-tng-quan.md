---
title: "Plan student-portal-app: thêm app học viên (login + tổng quan)"
date: 2026-09-23
summary: "Hard-mode plan 260923-0641: apps/student (port 8003) tái dùng packages/ui + Better-Auth; bridge student.email chỉ khi emailVerified, fail-closed STUDENT_AMBIGUOUS; red-team 25→13 findings (callbackURL absolute, kernel corsOrigins, dev CORS :8003, due-rỗng derive); issue #254"
---

# Plan student-portal-app: thêm app học viên (login + tổng quan)

## Plan student-portal-app (260923-0641) — /ak:plan --hard --github

**Kết quả:** plan 5 phase, 29h, issue #254, tại `plans/260923-0641-student-portal-app/`.

### Bằng chứng scout then chốt
- `student.email` đã được thiết kế sẵn làm "danh tính đăng nhập tương lai" (`packages/db/src/schema/student.ts:18-21`, migration 0021) → hướng bridge qua email là chủ đích repo, không phải phát minh mới.
- `apps/landing` là static site — không phải precedent React; blueprint đúng là `apps/web` (Vite + TanStack Router + packages/ui).
- Bootstrap middleware tự tạo org + membership `teacher` cho MỌI user mới login (`apps/server/src/app.ts:63-77`) — học viên login hiện chưa tồn tại, và đây là write thật, không vô hại.
- `kernel.ts` có CSRF origin-check riêng (`kernel.ts:131,137-145`) — consumer thứ 3 của corsOrigin mà scout đầu tiên bỏ sót.

### Red-team (3 reviewer, 25 findings thô → 13 accept)
2 Critical: (1) bridge không check `emailVerified` → impersonation qua signup email/password; (2) email match GLOBAL không scope org → cross-org pick/email planting. Khắc phục: gate verified + fail-closed `STUDENT_AMBIGUOUS`, ghi accepted-risk vào Non-goals.
High đáng nhớ: callbackURL Google phải ABSOLUTE (relative "/" đáp vào trang "OK" của API — better-auth redirect Location thô); dev CORS default chỉ :8001 sẽ khóa toàn bộ login :8003 local; `SessionUser` không có email nên middleware như thiết kế đầu không chạy được; grading rows không có classId + `due` rỗng sẽ bị dán nhãn "Quá hạn" oan.

### Quyết định kiến trúc (autonomous, ghi Validation Log)
1. emailVerified gate (thay vì bật verification flow — cần infra mail, follow-up).
2. Fail-closed ambiguity (thay vì pick-earliest hoặc bảng link teacher-approve — Non-goals).
3. Skip bootstrap cho `/api/student` (tránh org rác); student user vẫn là teacher session hợp lệ khi gọi API trực tiếp — accepted-risk, role-guard follow-up.

### Bài học quy trình
- 2 Explore agent đầu timeout 600s → scout trực tiếp bằng batch bash + grep nhanh hơn và đủ sâu.
- Red-team bằng code-reviewer với prompt chặt (giới hạn file đọc + yêu cầu file:line) chạy tốt: 3 agent ~5-8 phút, bắt được 2 Critical mà self-review sẽ bỏ.
- `ak plan create/add-phase/reindex/validate` hoạt động trơn; bảng Phases do CLI sở hữu — không hand-edit ngoài link text.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
