---
phase: 2
title: "Màn Rà soát [7], lưu nháp và Chốt trả bài"
status: pending
effort: 1.25d
---

# Phase 2 — Màn Rà soát [7], lưu nháp và Chốt trả bài

## Files

- Sửa `apps/server/src/routes/grading.ts`: `GET /:attemptId` trả thêm `aiDraft` (status, aiScores, aiFeedback, reviewedScores, reviewedFeedback, gradingMode, version, errorCode); `PATCH /:attemptId/draft` (body: scores, feedback, version) → `teacher_reviewing`, `version + 1`; `POST /:attemptId/grade` cập nhật draft `published` trong cùng batch; hàng chờ `loadGradingQueue` trả `aiStatus`.
- Contract `packages/api/src/contracts.ts`: `AiGradingDraftView`, `aiDraftPatchSchema`, mở rộng `TeacherSubmission`, `GradingQueueItem`.
- Sửa `apps/web/src/routes/_auth/grading/$attemptId.tsx`: bố cục 2 cột; panel "Gợi ý từ AI" (4 select bước 0.5 điền sẵn, textarea nhận xét, badge trạng thái); nút "Lưu bản nháp" + "Chốt trả bài". Tạo component `apps/web/src/components/grading/ai-draft-panel.tsx`.
- Sửa `apps/web/src/routes/_auth/grading/index.tsx`: badge trạng thái (`AI đã chấm nháp`, `Đang rà soát`, `Chờ chấm tay`, `Đã trả kết quả`).
- Cổng học viên nhãn "Đã nộp — Đang chờ giáo viên chấm" — **skill-aware**: chỉ Writing/Speaking chưa `graded_at`; Reading/Listening tự chấm giữ "Đã nộp"; bài đã "Chốt trả bài" (`gradedAt`) → "Đã chấm"/"Điểm: X":
  - `apps/student/src/components/history/history-list.tsx` — chip `awaiting` (chỉ tồn tại với Writing/Speaking) → "Đã nộp — Đang chờ giáo viên chấm".
  - `apps/student/src/components/practice/skill-catalog.tsx` — `isAwaitingGrade` → cùng chuỗi.
  - `apps/student/src/lib/assignment-status.ts` — `submitted` + `skill` gradable → cùng chuỗi; thêm nhánh `gradedAt` → "Đã chấm" (Speaking shape scores không khớp IELTS Writing).
  - `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx` — `data-testid="awaiting-grade"` chỉ khi skill gradable + grade null.
  - `packages/api` `studentAssignmentSchema` thêm `skill`/`gradedAt` (optional); `loadClassAssignmentItems` join `assignment_prompt.skill` + `quiz_attempt.graded_at/grade_scores`.
  - Sửa test: `history-list.test.tsx`, `practice-catalog.test.tsx`, `apps/student/test/assignment-status.test.ts`, `attempt-summary.test.tsx`.
- API học viên không bao giờ join `ai_grading_draft`; test hợp đồng chặn rò rỉ ở `grading.test.ts` (BR-001) + e2e AC-001.

## Steps

1. Server API + contract, test trước (draft → PATCH → publish; học viên GET không có field AI).
2. UI theo `DESIGN.md` (token `globals.css`, shadcn), responsive 1440/768/375: dưới 1024px hai cột xếp dọc.
3. Bài cũ không có draft: panel AI ẩn, luồng chấm tay giữ nguyên.

## Tests

- `grading.test.ts`: PATCH đổi trạng thái + tăng version; publish ghi `grade_scores` + draft `published` + phát `grade_returned`; GET học viên không chứa `aiScores`/`aiFeedback`.
- `apps/web` test component `ai-draft-panel` (điền sẵn, chỉ cho phép bước 0.5).

## Verify

- `pnpm --filter server test -- grading`, `pnpm --filter web test -- grading`, `pnpm check-types`
- Screenshot 3 viewport + `pnpm design:compare`
