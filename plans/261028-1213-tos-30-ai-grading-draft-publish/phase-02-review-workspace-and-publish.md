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
- Cổng học viên (`apps/student`): attempt `submitted` chưa `graded_at` hiện "Đã nộp — Đang chờ giáo viên chấm".

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
