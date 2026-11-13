# students — Danh mục nguồn (provenance)

| ID | Nguồn (file/folder) | Loại | Ngày (nếu biết) | Confidence | Encoding OK? | Phần feature suy ra từ đây |
|----|---------------------|------|-----------------|------------|--------------|----------------------------|
| S1 | `apps/server/src/routes/kernel.ts` (GET/POST `/students`, resend-invite, invite/invitations — boundary) | code TS (server route) | 2026-11 (develop @ d6c0f6b5) | high | OK | FR-001, FR-012→FR-018, FR-021, BR-001→BR-015, E-001→E-017 |
| S2 | `apps/web/src/routes/_auth/students/index.tsx`, `$studentId.tsx`, `$studentId.test.tsx`, `$studentId.reports.test.tsx` + `apps/web/src/components/modals/add-student-modal.tsx`, `apps/web/src/components/students/pending-invite-callout.tsx` | code TSX (SPA routes + colocated tests) | 2026-11 | high | OK | FR-002→FR-011, FR-019, FR-020, screens, E-001, E-002, E-018, E-019 |
| S3 | `apps/web/src/lib/repos/students.ts`, `use-students.ts`, `invitations.ts`, `mock-data.ts`, `tuition-from-kernel.ts`, `format-student-target.ts` | code TS (read model web) | 2026-11 | high | OK | BR-006→BR-009, BR-016, NFR-004/005 |
| S4 | `apps/server/src/routes/snapshot.ts` + `apps/server/src/student-provisioning.ts` | code TS (snapshot loader + provisioning) | 2026-11 | high | OK | FR-001, FR-023, BR-003, BR-006; provisioning chỉ đọc để hiểu nguồn gốc hồ sơ (hand-off `auth-student-signup`) |
| S5 | `packages/db/src/schema/student.ts` + `packages/db/src/migrations/0065_student_entry_score.sql` + `packages/db/src/schema/student-invitation.ts` | code (schema + migration) | 2026-11 | high | OK | BR-001/002, FR-014, FR-015, ERD |
| S6 | `packages/api/src/contracts.ts` (studentCreateSchema, KernelStudentRow, StudentCreateResponse, STUDENT_INVITATION_ERROR_CODES, onboarding — boundary) | code TS (hợp đồng API) | 2026-11 | high | OK | FR-012/014, NFR-004, E-003 |
| S7 | `apps/server/src/student-invitation.test.ts`, `apps/server/src/role-gates.test.ts`, `apps/server/src/kernel.test.ts`, `apps/server/src/student.test.ts`, `apps/server/src/student-multi-org-migration.test.ts`, `student-email-unique-migration.test.ts`, `student-identity-migration.test.ts`, `student-projection-lock.test.ts` | test vitest (active) | 2026-11 | high | OK | R1: mọi nhãn ✅ có test đều cite dòng cụ thể; không thấy test skip trong phạm vi |
| S8 | `apps/e2e/specs/student-row-detail.spec.ts`, `manual-student-and-trial-grading.spec.ts` (FR-012/FR-013 activateNow E2E), `enroll-existing-student.spec.ts` (ranh giới), `student-org-invitation-and-switcher.spec.ts` (ranh giới) | test Playwright | 2026-11 | high | OK | FR-006/008/012/013 (E2E), boundary enrollment/invitation |
| S9 | `docs/project-overview-pdr.md` | doc md (quyết định bền vững) | 2026-11 | high | OK | Mục 0.3 (mâu thuẫn PDR dòng 23), mô hình multi-org dòng 44-49 |
| S10 | `apps/web/src/lib/features.ts`, `apps/web/src/lib/data-store-reducer.ts`, `data-actions.ts`, `repos/kernel.ts`, `use-kernel-form-submit.ts`, `kernel-load-state.ts`, `packages/auth/src/role.ts`, `apps/server/src/app.ts` | code TS (hạ tầng web/auth) | 2026-11 | high | OK | FR-020, SC-01, E-017, NFR-001/002, BR-013 |

## Ghi chú nguồn

- __Confidence mỗi nguồn:__ toàn bộ là source code + test đang active trên branch `develop` (commit d6c0f6b5) → high. Không có nguồn mojibake.
- __Encoding ⚠:__ không phát hiện.
- __Nguồn mâu thuẫn / lỗi thời:__ PDR (S9) dòng 23 mâu thuẫn với code (S1/S2/S7) về việc giáo viên tạo học viên thủ công — ghi cả 2 ở Mục 0.3 của spec + OQ-1, KHÔNG tự chọn bên. Chi tiết ở `reverse-gaps.md` §3.
