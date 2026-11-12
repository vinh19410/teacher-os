# enrollment-lifecycle — Danh mục nguồn (provenance)

| ID | Nguồn (file/folder) | Loại | Ngày (nếu biết) | Confidence | Encoding OK? | Phần feature suy ra từ đây |
|----|---------------------|------|-----------------|------------|--------------|----------------------------|
| S1 | `packages/db/src/schema/enrollment.ts` | code (schema Drizzle/SQLite) | develop @ d6c0f6b5 | high | OK | Bảng enrollment, enum nhận xét lifecycle, default `active`, unique (classId, studentId) |
| S2 | `packages/api/src/contracts.ts` | code (Zod contract) | develop @ d6c0f6b5 | high | OK | `enrollStudentSchema`, `studentCreateSchema` (classId, activateNow), `ENROLLMENT_STATUSES`, `KernelEnrollmentRow`, `invoiceCreateSchema`, `StudentClass.enrollmentStatus`, `STUDENT_INVITATION_ERROR_CODES` |
| S3 | `apps/server/src/routes/kernel.ts` | code (Hono route) | develop @ d6c0f6b5 | high | OK | POST /students (classId), POST /classes/:id/enroll, POST /enrollments/:id/accept, DELETE /enrollments/:id, guard hóa đơn 409, guard giao bài 400, resend invite lớp |
| S4 | `apps/server/src/routes/enrollment-activation.ts` | code (service) | develop @ d6c0f6b5 | high | OK | `activateEnrollment` CAS idempotent, `materializeScheduleForEnrollment` (gói + buổi + holiday), guard retry |
| S5 | `apps/server/src/routes/student.ts` | code (Hono route portal) | develop @ d6c0f6b5 | high | OK | POST /api/student/enrollments/:id/accept, CSRF/requireStudent, overview enrollmentStatus, chi tiết lớp active-only, lịch active-only |
| S6 | `apps/server/src/routes/student-class.ts` | code (helper) | develop @ d6c0f6b5 | high | OK | `toStudentClass` map enrollmentStatus, nhận xét lifecycle chỉ ghi invited|active |
| S7 | `apps/web/src/components/class-detail/class-roster-tab.tsx` | code (UI teacher) | develop @ d6c0f6b5 | high | OK | Badge Đã mời/Đang học, nút Kích hoạt/Hủy lời mời, modal xác nhận, ô Học phí invited "—" |
| S8 | `apps/web/src/components/modals/enroll-student-modal.tsx` | code (UI teacher) | develop @ d6c0f6b5 | high | OK | Modal thêm học viên 2 chế độ, checkbox "Kích hoạt trạng thái Đang học ngay", xử lý 409 email + callout mời lại |
| S9 | `apps/web/src/routes/_auth/classes/$classId.tsx` | code (route UI) | develop @ d6c0f6b5 | high | OK | Tab roster, nút "+ Thêm học viên vào lớp", KPI "N chờ xác nhận" |
| S10 | `apps/web/src/lib/repos/kernel.ts` | code (client API) | develop @ d6c0f6b5 | high | OK | Mapping action `activate-enrollment` → POST accept, `delete-enrollment` → DELETE |
| S11 | `apps/web/src/lib/repos/classes.ts` + `apps/web/src/lib/data-store-reducer.ts` | code (adapter) | develop @ d6c0f6b5 | high | OK | Tách `studentIds` (active) vs `invitedStudentIds` từ snapshot enrollments |
| S12 | `apps/student/src/components/overview/class-card.tsx` | code (UI portal) | develop @ d6c0f6b5 | high | OK | Thẻ "Chờ kích hoạt", nút "Tham gia lớp", trạng thái invited/active |
| S13 | `apps/student/src/routes/_auth/index.tsx`, `.../classes/index.tsx` | code (route portal) | develop @ d6c0f6b5 | high | OK | Gọi `useAcceptClassEnrollment` khi bấm nút |
| S14 | `apps/student/src/lib/repos/student.ts` | code (client API portal) | develop @ d6c0f6b5 | high | OK | `useAcceptClassEnrollment` mutation + invalidate overview |
| S15 | `apps/e2e/specs/enroll-existing-student.spec.ts` | test (Playwright e2e) | develop @ d6c0f6b5 | high | OK | Luồng enroll → Đã mời → Kích hoạt → Đang học → 0/12; hủy lời mời → mời lại |
| S16 | `apps/e2e/specs/create-invoice.spec.ts` | test (e2e) | develop @ d6c0f6b5 | high | OK | Picker hóa đơn loại trừ học viên invited (test:219-248) |
| S17 | `apps/e2e/specs/student-package-validation.spec.ts` | test (e2e) | develop @ d6c0f6b5 | high | OK | Không có input gói khi enroll (D4); kích hoạt derive gói từ lớp (D1) |
| S18 | `apps/e2e/specs/student-portal-provisioning.spec.ts` | test (e2e) | develop @ d6c0f6b5 | high | OK | Guard: teacher signup không sinh student row (biên trên provisioning) |
| S19 | `apps/server/src/kernel.test.ts` | test (colocated API) | develop @ d6c0f6b5 | high | OK | invited 0 pkg 0 lesson; accept → active + pkg + lessons; DELETE invited/active/404; invoice invited 409 wording; assignment invited 400; notify + replay 409; cross-org 404 |
| S20 | `apps/server/src/student.test.ts` | test (colocated portal) | develop @ d6c0f6b5 | high | OK | Portal accept suite: ownership, idempotent, CSRF, role gate; activateNow=true mở khóa invoice+assignment |
| S21 | `apps/server/src/routes/holidays.test.ts` | test (colocated) | develop @ d6c0f6b5 | medium | OK | Kích hoạt cùng áp nghỉ/dời buổi (`activateEnrollment` gọi trực tiếp 16 chỗ) |
| S22 | `docs/project-overview-pdr.md` | doc (PDR) | develop @ d6c0f6b5 | high | OK | Quyết định bền vững vòng đời invited → active (:24); provisioning teacher-only enroll (:23); chi tiết lớp active-only (:25) |
| S23 | `packages/db/src/schema/invoice.ts` | code (schema) | develop @ d6c0f6b5 | high | OK | `enrollmentId` text không FK, hợp lệ kiểm lúc ghi |
| S24 | `packages/db/src/schema/class-assignment.ts` | code (schema) | develop @ d6c0f6b5 | high | OK | class_assignment + target, unique (assignment, student) |
| S25 | `packages/db/src/schema/session-package.ts` | code (schema) | develop @ d6c0f6b5 | high | OK | unique `session_package_enrollment_uq`; gói parked khi enrollmentId null |
| S26 | `apps/server/src/lib/notifications/templates.ts` | code | develop @ d6c0f6b5 | high | OK | `classEnrolledEvent` — idempotencyKey `class_enrolled:<enrollmentId>`, wording "Được mời vào lớp" |
| S27 | `apps/server/src/lib/study-pack-assign.ts` | code | develop @ d6c0f6b5 | medium | OK | `backfillStudyPackTargetsForStudent` gọi sau kích hoạt |
| S28 | `apps/server/src/routes/snapshot.ts` | code | develop @ d6c0f6b5 | high | OK | Snapshot expose enrollment rows cho teacher web |

## Ghi chú nguồn

- **Confidence:** high = code/test đọc trực tiếp, khớp PDR. Toàn bộ nhãn ✅ trong spec truy được về S1-S28 kèm `file:line`.
- **Encoding:** OK toàn bộ (không mojibake).
- **Nguồn mâu thuẫn:** 1 điểm — PDR:23 ("teachers no longer create students manually") vs code vẫn giữ nhánh tạo mới kèm lớp → xem Conflict C-1 ở `reverse-gaps.md`.
- **Negative-search đã chạy:** `grep -rn "unenroll\|withdraw" apps/server/src` (0 kết quả); `grep -rn "status.*cancelled" packages/db/src/schema/enrollment.ts` (0 — không có trạng thái cancelled); `grep -rn "enrollmentId" apps/e2e/specs/helpers.ts` (seedStudent chỉ tạo student, không tạo enrollment).
