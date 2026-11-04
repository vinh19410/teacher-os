---
title: "feat(student): hiện hạn nộp trên trang làm bài (#587)"
description: "Hiển thị hạn nộp (ngày và giờ theo múi giờ Việt Nam) trên header trang làm bài của học viên, ẩn hoàn toàn với bài tự luyện"
status: pending
priority: P3
effort: "45m"
issue: 587
branch: feat/587-student-quiz-due-date
tags: [student, quiz, due-date, ui, server, contracts]
blockedBy: []
blocks: []
created: 2026-11-04
---

# 587-student-quiz-due-date

## Overview

Sheet "TeacherOS staging - Theo dõi lỗi" (dòng #19, issue #587) phản ánh:
Trang làm bài của học viên không hiển thị hạn nộp, chỉ có ở danh sách bài tập. Học viên làm bài không biết được hạn nộp chính xác (ngày và giờ) nếu không quay lại màn hình danh sách bài tập.

Điều tra hiện trạng:
1. **Server & Contracts**:
   - `studentQuizDetailSchema` (`packages/api/src/contracts.ts`) đã có trường `due: z.string()`.
   - `apps/server/src/routes/student.ts` (GET `/assignments/:assignmentId/quiz`) đã trả `due: row.due`.
   - `apps/server/src/routes/student-practice.ts` (GET `/practice/quizzes/:testId`) trả `due: ""`.
   - Bảng `class_assignment` đã có cột `due_at` (timestamp_ms, hỗ trợ giờ phút từ #572). Tuy nhiên `studentQuizDetailSchema` chưa khai báo `dueAt` và `student.ts` chưa select `dueAt`.
2. **Client UI**:
   - `apps/student/src/components/quiz/quiz-runtime-header.tsx` (`QuizRuntimeHeader`) chỉ nhận `title`, `saveState`, `onSubmitClick`, `submitDisabled`, `children`.
   - `apps/student/src/components/quiz/quiz-take-view.tsx` (`QuizTakeView`) render `QuizRuntimeHeader` ở 2 trạng thái: start dialog (chưa bắt đầu) và active attempt (đang làm bài). Cả 2 đều có `detail` chứa `due` (và `dueAt`).
   - `apps/student/src/lib/assignment-status.ts` đã có hàm chuẩn hóa ngày giờ hạn nộp theo chuẩn Việt Nam (`formatDayMonth`, `formatVietnamTimeHHMM`, `evaluateAssignmentDeadline`).

Kế hoạch này thực hiện theo quy chuẩn handover `--advice` và quy trình `--tdd`:
1. **Phase 1: Contracts & Server Payload**:
   - Bổ sung `dueAt?: string | null` vào `studentQuizDetailSchema` (optional để tương thích ngược).
   - Bổ sung `classAssignment.dueAt` vào select trong `apps/server/src/routes/student.ts` và chuyển thành ISO string `row.dueAt ? row.dueAt.toISOString() : null`.
   - Trong `apps/server/src/routes/student-practice.ts`, giữ nguyên `due: ""` và thêm `dueAt: null`.
   - TDD tests cho API contracts và server quiz endpoint.
2. **Phase 2: Client Helper & UI Header Integration**:
   - Thêm helper thuần `formatQuizDueText({ due, dueAt })` trong `apps/student/src/lib/assignment-status.ts`: trả về `""` nếu không có hạn; trả về `"Hạn: HH:mm dd/mm"` nếu có `dueAt` hợp lệ; trả về `"Hạn: dd/mm"` nếu chỉ có `due`. Tránh lỗi nhầm lẫn ngày giữa `due` và `dueAt` (nguyên tắc từ red-team #572).
   - Thêm prop `dueText?: string | null` vào `QuizRuntimeHeader`. Hiển thị dưới hoặc cạnh `title` với style typography chuẩn DESIGN.md (`text-muted-foreground`, `tabular-nums`, `min-w-0`), ẩn hoàn toàn khi rỗng hoặc null.
   - Truyền `dueText` vào cả 2 vị trí render `QuizRuntimeHeader` trong `QuizTakeView`.
   - TDD unit tests cho `formatQuizDueText`, `QuizRuntimeHeader`, và `QuizTakeView`.
   - Kiểm tra hiển thị responsive ở 375px và 320px để đảm bảo không tràn và không che nút Nộp bài.
3. **Phase 3: Verification & Quality Gate**:
   - Typecheck, Biome check, test suites toàn bộ repo.
   - Cập nhật CHANGELOG.md.

## Advisor Scope Lock

- **Locked Scope:**
  - `packages/api/src/contracts.ts` (thêm `dueAt` vào `studentQuizDetailSchema`).
  - `apps/server/src/routes/student.ts` (select `dueAt` và trả trong payload quiz detail).
  - `apps/server/src/routes/student-practice.ts` (trả `dueAt: null` trong practice detail).
  - `apps/student/src/lib/assignment-status.ts` (helper `formatQuizDueText`).
  - `apps/student/src/components/quiz/quiz-runtime-header.tsx` (nhận và render `dueText`).
  - `apps/student/src/components/quiz/quiz-take-view.tsx` (truyền `dueText` vào header).
  - Unit tests: `packages/api/src/hybrid-writing.contracts.test.ts`, `apps/server/src/routes/student-quiz.test.ts`, `apps/student/test/assignment-status.test.ts`, `apps/student/test/quiz-navigator.test.tsx`, `apps/student/test/quiz-take-view.test.tsx`.
  - `CHANGELOG.md`.
- **Explicit Non-Goals:**
  - Không thêm đếm ngược (countdown timer) hay chặn nộp bài sau hạn trên trang làm bài (đó là tính năng riêng).
  - Không hiển thị hậu tố "quá hạn" làm xao nhãng học viên đang làm bài; chỉ hiển thị mốc hạn nộp rõ ràng ("Hạn: ...").
  - Không chạm vào màn hình review bài `$attemptId.tsx` hay các màn hình ngoài luồng làm bài.
  - Không thay đổi cấu trúc DB vì `class_assignment.due_at` đã có sẵn từ #572.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Mở rộng contract `studentQuizDetailSchema` và server payload để trả `dueAt` song song với `due` | P3 |
| 2 | Xây dựng helper `formatQuizDueText` và tích hợp hiển thị hạn nộp trên `QuizRuntimeHeader` và `QuizTakeView` | P3 |
| 3 | Chạy toàn bộ test suites, typecheck, lint, kiểm tra responsive 375px/320px và cập nhật CHANGELOG | P3 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Contracts & Server Payload](./phase-01-contracts-and-server-payload.md) | pending |
| 2 | [Phase 2: Client Helper & UI Header Integration](./phase-02-client-helper-and-ui-header.md) | pending |
| 3 | [Phase 3: Verification & Quality Gate](./phase-03-verification-and-quality-gate.md) | pending |

## Acceptance Criteria

- [ ] `studentQuizDetailSchema` parse thành công payload có `dueAt` (ISO string), `dueAt: null`, hoặc thiếu `dueAt`.
- [ ] Endpoint `GET /api/student/assignments/:assignmentId/quiz` trả về `dueAt: string | null` khớp với `class_assignment.dueAt`.
- [ ] Endpoint `GET /api/student/practice/:testId/quiz` trả về `due: ""` và `dueAt: null`.
- [ ] Trang làm bài học viên hiển thị hạn nộp dạng `"Hạn: HH:mm dd/mm"` khi có giờ, hoặc `"Hạn: dd/mm"` khi chỉ có ngày.
- [ ] Bài tự luyện (practice) hoặc bài tập không có hạn nộp thì header không hiển thị dòng hạn nộp, không để lại khoảng trống thừa hay layout shift.
- [ ] Hiển thị co giãn tốt trên màn hình hẹp (375px và 320px), không làm tràn tiêu đề và không đẩy lệch nút "Thoát" hay "Nộp bài".
- [ ] Toàn bộ unit tests mới và cũ đều pass; `pnpm check-types` và `pnpm check` pass 100%.

## Red Team Review

| # | Finding | Severity | Lens | Disposition | Rationale / Resolution |
|---|---------|----------|------|-------------|------------------------|
| 1 | `studentQuizDetailSchema` dùng `.strict()`, có thể gây deploy skew nếu server deploy trước client bundle cũ | High | Security Adversary | Accept | Ghi nhận release train: server và student cùng repo và release cùng thời điểm trên develop/staging. Đặt `dueAt: z.string().nullable().optional()` để client mới chạy với server cũ không throw. |
| 2 | Typo đường dẫn endpoint practice trong plan: ghi `/practice/quizzes/:testId` thay vì `/practice/:testId/quiz` | Medium | Security Adversary | Accept | Đã sửa trong plan và phase 1 thành `GET /practice/:testId/quiz` (`student-practice.ts:140`). |
| 3 | Gọi `row.dueAt.toISOString()` thiếu check `getTime()` có thể ném `RangeError` nếu timestamp lỗi | Medium | Failure Mode Analyst | Accept | Guard server serialization: `row.dueAt instanceof Date && Number.isFinite(row.dueAt.getTime()) ? row.dueAt.toISOString() : null`. |
| 4 | `formatQuizDueText` có thể lọt text rác `"Hạn: <junk>"` nếu `due` không đúng chuẩn `YYYY-MM-DD` | Medium | Assumption Destroyer | Accept | Chỉ render tiền tố `"Hạn: ..."` khi `parseISODate` thành công hoặc `hasDueAt` hợp lệ; mọi input không hợp lệ trả về `""`. |
| 5 | Màn hình hẹp 320px/375px: nguy cơ `dueText` bị co ép nếu để chung truncate với title | Medium | Failure Mode Analyst | Accept | Trong header flex-col: `h1` giữ `truncate`, `dueText` gắn `whitespace-nowrap shrink-0` để luôn hiển thị đầy đủ ngày giờ, tiêu đề co giãn theo không gian còn lại. |

### Whole-Plan Consistency Sweep
- Toàn bộ các file plan, phase 1 và phase 2 đã được đối chiếu:
  - Cập nhật đúng endpoint practice: `GET /practice/:testId/quiz`.
  - Thêm guard an toàn cho date serialization ở server `student.ts`.
  - Cập nhật định dạng an toàn cho helper `formatQuizDueText`.
  - Cập nhật style CSS cho mobile layout của `QuizRuntimeHeader`.

## Validation Log

### Verification Results
- Claims checked: 8
- Verified: 8 | Failed: 0 | Unverified: 0
- Tier: Standard (Fact Checker + Contract Verifier)
- Key facts verified:
  - `studentQuizDetailSchema` tại `packages/api/src/contracts.ts:2682` đã có `due: z.string()`, strict.
  - `apps/server/src/routes/student.ts:1330` select `due: classAssignment.due`.
  - `apps/server/src/routes/student-practice.ts:140` trả `due: ""`.
  - `classAssignment.dueAt` có trong schema DB `packages/db/src/schema/class-assignment.ts:39`.
  - `apps/student/src/components/quiz/quiz-runtime-header.tsx` đang nhận 5 props, chưa có `dueText`.
  - `apps/student/src/components/quiz/quiz-take-view.tsx` render header ở dòng 380 và 481.
- Recommendation: Sẵn sàng thực thi (Ready to Cook).
