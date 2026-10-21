---
phase: 2
title: "Client isLessonEnded delegate helper chung"
status: completed
priority: P2
effort: "30m"
dependencies: [1]
---

# Phase 2: Client `isLessonEnded` delegate helper chung

## Goal
Toán học múi giờ của `isLessonEnded` (app student) dùng chung `vietnamSessionEndMs` từ `@teacher-os/api/vietnam-date` — hết bản sao 3 dòng time-math gây ra desync #395; behavior #393 giữ nguyên 100%.

## Files to Create / Modify
- Modify: `apps/student/src/components/class/class-lesson-list.tsx` (chỉ hàm `isLessonEnded` + import)

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

---

### Task 2.1 — Delegate phần MATH, giữ lại phần POLICY
- Goal: `isLessonEnded` không còn tự tính `new Date(\`${date}T${time}:00+07:00\`)`; vẫn giữ gate `status === "upcoming"` + `date != null` + fallback `null → false` (policy hiển thị của client #393).
- Target files: `apps/student/src/components/class/class-lesson-list.tsx` (hàm `isLessonEnded`, dòng ~52-57; block import đầu file).
- Steps:
  1. Thêm vào block import: `import { vietnamSessionEndMs } from "@teacher-os/api/vietnam-date";` (module đã là dependency có sẵn của app student — month-heatmap, week-table, assignment-status đang import; KHÔNG thêm package mới).
  2. Thay thân `isLessonEnded` thành:
     ```ts
     export function isLessonEnded(lesson: StudentClassLesson, now: Date): boolean {
       if (lesson.status !== "upcoming" || lesson.date == null) return false;
       const end = vietnamSessionEndMs(lesson.date, lesson.time, lesson.dur);
       if (end == null) return false;
       return end <= now.getTime();
     }
     ```
     Cập nhật comment đầu hàm: bổ sung một dòng "toán học end-time dùng chung `vietnamSessionEndMs` (server `loadNextSession` #395 cùng nguồn)".
  3. KHÔNG đụng `findNextLessonId`, `ClassLessonList`, `LESSON_STATUS`, hay bất kỳ export nào khác trong file.
- Success criteria: toàn bộ test student hiện có pass mà KHÔNG sửa assertion nào. Gate chống sửa test là **git diff** (đo được), không phải đếm số test: `git diff --name-only` không được chứa bất kỳ file nào dưới `apps/student/test/`. Policy hiển thị của `isLessonEnded` đã bị ghim cứng bởi `describe("isLessonEnded")` + các test `findNextLessonId` có sẵn (`apps/student/test/class-detail.test.tsx:167-208`, gồm case NaN/fallback/ranh giới) — không cần gate mới.
- Verify: (a) `git diff --name-only` — output KHÔNG chứa `apps/student/test/`; (b) `pnpm --filter student test` — exit 0.

---

## Verification (cả phase + gate chung repo)
- `git diff --name-only` — không chứa file dưới `apps/student/test/`.
- `pnpm --filter student test` — exit 0.
- `pnpm check` — exit 0 (format/lint toàn repo).
- `pnpm check-types` — exit 0.
- Full regression trước merge (chạy ở bước ship, không phải trong phase): `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e` — exit 0. Lưu ý (red-team): đây là gate bắt buộc theo quy ước repo (AGENTS.md), KHÔNG phải coverage cho diff này — e2e hiện không có assertion nào đi qua `nextSession` server (assertion "Buổi tới" duy nhất đi qua client `findNextLessonId`); diff này được bảo vệ bởi route tests Task 1.2.
