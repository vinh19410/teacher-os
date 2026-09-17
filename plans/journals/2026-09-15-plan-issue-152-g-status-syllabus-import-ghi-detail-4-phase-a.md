---
title: "Plan issue #152: gỡ status syllabus + import ghi đè detail (4 phase, --advice)"
date: 2026-09-15
summary: "ak-plan --github --advice: plan 4 phase cho bỏ status buổi học ở màn hình syllabus và import ghi đè ở detail; red-team bắt 2 Critical compile-break trước khi cook"
---

# Plan issue #152: gỡ status syllabus + import ghi đè detail (4 phase, --advice)

## What happened
Chạy `ak-plan --github --advice` cho yêu cầu: buổi học ở màn hình syllabus bỏ thông tin trạng thái (status chỉ đổi ở lớp học), gỡ status ở create/edit syllabus, thêm nút import Excel/CSV ở màn hình detail kèm cảnh báo ghi đè phải xác nhận.

- Plan: `plans/260915-0904-syllabus-status-off-detail-import/` (plan.md + 4 phase files + reports/scout-report.md), issue #152, label `ready to review`.
- Mode auto-detect → hard; scope HOLD. Scout bằng Explore agent + đọc trực tiếp toàn bộ file chính (contracts, kernel.ts routes, modals, parser, e2e).
- Thiết kế chính: status chỉ gỡ khỏi UI `/syllabus/*` (DB/snapshot/types giữ nguyên — class copy vẫn cần); `lessonUpsertSchema.status` → `.optional()` + server preserve-on-edit; parser import v3 bỏ cột Trạng thái (4 cột, chặn file v2 cả bản không header); endpoint mới `POST /api/syllabi/:id/replace-content` (batch delete→insert, mirror pattern create + module-remove); nút import ở detail chỉ cho template (`classId === null`).

## Decision
- D4 sửa sau red-team: parser push hằng `status: "upcoming"` thay vì bỏ field — `SyllabusModuleContent` là zod OUTPUT type nên `.default()` vẫn làm `status` required ở output; bỏ field sẽ gãy `pnpm check-types` (TS2741).
- Red-team (3 reviewer: Security/Failure/Assumption) 12 findings: 9 accept + 2 partial + 1 reject. Hai Critical: (1) zod output type như trên; (2) `data-store-reducer.ts:256,282` gán `action.payload.status` vào field bắt buộc — thêm task mirror semantics (`?? "upcoming"` / `?? l.status`).
- High: gate nút import theo `classId === null` vì ghi đè bản copy lớp xóa sạch tiến độ sống (progress lớp derive từ `syllabus_lesson.status`); `useDirectKernelAction.run` đổi trả `KernelCommandResult` để chỉ clear preview khi refreshed/committed; `refresh()` trước khi mở modal xác nhận (chống stale counts đa tab). Reject: token `expectedModuleCount`/409 (over-engineering).
- Fixture XLSX e2e: script regen `apps/e2e/scripts/regen-syllabus-import-fixture.mjs`, `exceljs` qua catalog `pnpm-workspace.yaml`, anchor path bằng `import.meta.url`, commit kèm lockfile (CI `--frozen-lockfile`).

## Next steps
- Cook: `/ak:cook plans/260915-0904-syllabus-status-off-detail-import/plan.md --advice` (khuyến nghị `/clear` trước).
- Executor tuân Failure Protocol từng phase; mọi Verify là điều kiện cơ khí (exit code/substring).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
