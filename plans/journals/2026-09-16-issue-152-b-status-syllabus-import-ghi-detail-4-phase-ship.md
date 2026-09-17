---
title: "issue 152 — bỏ status syllabus + import ghi đè detail: 4 phase ship"
date: 2026-09-16
summary: "Gỡ status buổi học khỏi UI syllabus, parser import v3 4 cột, endpoint replace-content atomic + nút import template-only với modal cảnh báo; 2 failed verification xử lý theo protocol (test-isolation helper, fixture CSV encoding); 0 Critical/Important ở review."
---

# issue 152 — bỏ status syllabus + import ghi đè detail: 4 phase ship

## What happened
- Phase 1 (d9ca76a): `lessonUpsertSchema.status` → optional; edit-lesson preserve (`input.status ?? lesson.status`), add default "upcoming"; endpoint `POST /api/syllabi/:id/replace-content` batch atomic (delete lessons subquery → delete modules → update totalLessons → insert); 7 server tests (gồm cross-org 404 + cây nguyên vẹn).
- Phase 2 (9df8199): gỡ dot/badge/StatCard/card "Buổi hiện tại" khỏi `$syllabusId.tsx`; `showStatus` prop cho 2 lesson modal (chỉ class detail bật); reducer mirror `?? "upcoming"` / `?? l.status`; +2 test reducer.
- Phase 3 (0ed623e): parser v3 4 cột; chặn file v2 5 cột (header ô 5 + mọi dòng data ô 5 khác rỗng); `SyllabusImportPreview` dùng chung; fixtures CSV+XLSX regen từ ROWS chung + self-verify (exceljs qua catalog); xóa `gen-sample-xlsx.mjs` v2 (cùng output path — cạm bẫy).
- Phase 4 (0ef57fb): action `replace-syllabus-content`; `useDirectKernelAction.run` trả `KernelCommandResult` (mirror `KernelRun` + 2 consumer types); nút import chỉ template (`classId === null`); modal cảnh báo ghi đè (refresh trước khi mở, clear preview chỉ khi refreshed/committed); e2e flow + guard copy.

## Decision
- Tái sử dụng plan có sẵn + kongming re-review pre-cook: GO-WITH-CONDITIONS, vá F1 (KernelRun type ripple)–F4 vào plan trước cook (commit 06549e3) — F1 là compile-break thật, plan thiếu file `syllabus-mutations.tsx`.
- 2 failed verification xử lý theo --advice protocol (STOP + kongming trước khi sửa): (1) 141/142 server test — test-isolation bug trong helper (name-find collision giữa tests, KHÔNG phải bug server) → fix id-based; (2) e2e fixture CSV — printf thủ công mất byte "c " của "trúc đề" (fixture sai, app đúng) → regen script single-source ROWS cho cả CSV+XLSX, hết sửa fixture bằng tay.
- Ripple type của run(): ngoài F1 còn 2 consumer (`class-schedule-table`, `session-attendance-modal`) khai báo `Promise<void>` → widening `Promise<KernelCommandResult>`, caller `void run(...)` không đổi.
- Contract test `syllabus-peel` pin source shape `const { classesForSyllabus } = useData()` → cập nhật regex theo wiring mới (vẫn khóa useData cho selector, thêm refresh).

## Next steps
- Ship official: PR base `develop`, review-pr --fix --reply, merge + CI convergence (--ship).
- Known limitations ghi vào PR: Decision #5 (không 409 optimistic-concurrency — last-writer-wins giữa refresh và confirm), gate template-only là UI-only (server nhận mọi syllabus cùng org), không undo cho overwrite, file v2 bị chặn (policy, không migrate ngầm).
- Smoke overwrite happy path trên staging sau merge (deploy-staging có sẵn).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
