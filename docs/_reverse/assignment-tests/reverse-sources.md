# Nguồn truy vết — feature `assignment-tests`

Repo: /root/projects/teacher-os @ develop (d6c0f6b5). Cite dòng theo working tree hiện tại.

| ID | File / nguồn | Vai trò | Ghi chú |
|----|--------------|---------|---------|
| S1 | apps/server/src/routes/assignments/tests.ts | Route CRUD bộ đề + replace-all parts + khóa attempt | 305 dòng; mount qua `routes/assignments/index.ts:529` ← `routes/kernel.ts:3495` |
| S2 | packages/db/src/schema/assignment-test.ts | Schema `assignment_test` + `assignment_test_part` | 78 dòng |
| S3 | apps/web/src/routes/_auth/assignments/tests/new.tsx · `$id.tsx` · `preview.tsx` · `import.tsx` (touchpoint) | Routes UI | |
| S3 | apps/web/src/components/assignment-tests/test-builder-shell.tsx | Shell builder (1040 dòng) | |
| S3 | apps/web/src/components/assignment-tests/test-header-form.tsx · test-part-slot.tsx · prompt-picker-dialog.tsx · answers-checking-panel.tsx · test-preview-paper.tsx | Component con | |
| S3 | apps/web/src/lib/assignment-test-draft-store.ts · assignment-test-preview-draft.ts · use-kernel-form-submit.ts | Draft/handoff/submit | |
| S4 | apps/web/src/lib/test-ranges.ts | computeTestRanges — nguồn số duy nhất | Pure module |
| S4 | apps/web/src/lib/test-answer-key.ts · apps/web/src/lib/repos/assignment-tests.ts · apps/web/src/lib/repos/kernel.ts (case 274-301) | Parse/compare key; payload & mutation map | |
| S5 | apps/e2e/specs/assignment-test-create.spec.ts | E2E dựng 3-part/40-câu | 1 test, active |
| S6 | packages/api/src/contracts.ts | PRACTICE_SKILLS, ASSIGNMENT_TEST_PRESETS, ASSIGNMENT_TEST_ERROR_CODES, 3 schema zod, kernel rows, practice catalog item | |
| S7 | apps/server/src/routes/snapshot.ts · apps/server/src/routes/assignments/index.ts · apps/server/src/routes/kernel.ts (3495) | Snapshot mapping, router cha, mount | |
| S8 | apps/server/src/lib/exam-import/publish-to-bank.ts · apps/web/src/routes/_auth/assignments/tests/import.tsx | Điểm chạm exam-import-ai | boundary |
| S9 | packages/db/src/schema/quiz-attempt.ts | FK test_id SET NULL + CHECK mode | touchpoint student-quiz |
| S10 | apps/server/src/routes/student-practice.ts | Catalog tự luyện đọc assignment_test ready | touchpoint student-practice |
| S11 | packages/db/src/schema/library-test.ts · packages/db/src/schema/placement-test.ts · apps/server/src/routes/grading.ts · apps/server/src/routes/dashboard-reminders.ts | Phân định biên giới + consumer khác của skill test | |
| S12 | Test unit: apps/server/src/routes/assignments/tests.test.ts (19 test), apps/server/src/assignment-rich-text-contract.test.ts (540-557), apps/web/src/lib/test-ranges.test.ts (4), apps/web/src/lib/test-answer-key.test.ts (13), apps/web/src/lib/repos/assignment-tests.test.ts (20), apps/web/src/components/assignment-tests/test-builder-shell.test.tsx (15), answers-checking-panel.test.tsx (8), test-header-form.test.tsx (13), test-preview-paper.test.tsx (6) | R1: toàn bộ active (grep `.skip/.todo/.only` = 0 kết quả trong phạm vi) | |
| S13 | docs/project-overview-pdr.md (dòng 20, 26) · docs/_reverse/reverse-plan.json (slug assignment-tests, dòng 156) | Doc chính đối chiếu Mục 0.3 | |
