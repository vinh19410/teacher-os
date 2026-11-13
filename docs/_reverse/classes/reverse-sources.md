# classes — Danh mục nguồn (provenance)

| ID | Nguồn (file/folder) | Loại | Ngày (nếu biết) | Confidence | Encoding OK? | Phần feature suy ra từ đây |
|----|---------------------|------|-----------------|------------|--------------|----------------------------|
| S1 | /root/projects/teacher-os/docs/project-overview-pdr.md | md (tài liệu kiến trúc/PDR) | — | high | OK | Mục 0, 1 (boundary), 11 (Constraints) |
| S2 | /root/projects/teacher-os/packages/api/src/contracts.ts | code (schema hợp đồng kernel + wording lỗi VN) | — | high | OK | Mục 3 (FR), 5 (BR), 6 (Error), 8 (Entities) |
| S3 | /root/projects/teacher-os/packages/db/src/schema/class.ts · class-session.ts · lesson.ts · enrollment.ts · session-package.ts | code (schema Drizzle) | — | high | OK | Mục 5 (BR hằng số), 8 (Entities), ERD |
| S4 | /root/projects/teacher-os/apps/server/src/routes/kernel.ts · app.ts · routes/enrollment-activation.ts · routes/student-class.ts · routes/dashboard-reminders.ts | code (route kernel + middleware + luồng kích hoạt) | — | high | OK | Mục 1-9 toàn bộ; Error Matrix server-side |
| S5 | /root/projects/teacher-os/apps/server/src/lib/class-mode.ts · lib/syllabus-curriculum.ts · routes/syllabus.ts | code (helper chế độ lớp + copy giáo trình) | — | high | OK | BR-005, FR-007, FR-029 |
| S6 | /root/projects/teacher-os/apps/web/src/routes/_auth/classes/ · components/modals/ · components/class-detail/ · lib/schedule-conflicts.ts · lib/kernel-outcome.ts · lib/repos/classes.ts | code (UI + client rules + toast) | — | high | OK | Mục 3 (client rules), 6 (Error client), 10 (Screens), Flows |
| S7 | /root/projects/teacher-os/apps/e2e/specs/class-operations.spec.ts · create-class-validation.spec.ts · create-class-schedule-conflict.spec.ts · class-tuition-fee.spec.ts · class-roster-tuition-debt.spec.ts · class-sessions-manage-modal.spec.ts · enroll-existing-student.spec.ts · helpers-dated-class.ts | code (E2E Playwright) | — | high | OK | R1 test-citations cho FR/SC/Error |
| S8 | /root/projects/teacher-os/apps/server/src/kernel.test.ts · manual-sessions.test.ts · kernel-occurrence.test.ts · routes/student-classmates.test.ts · apps/web/src/routes/_auth/classes/*.test.tsx · apps/web/src/components/modals/*.test.tsx | code (unit/component test) | — | high | OK | R1 test-citations cho FR/BR/NFR |
| S9 | /root/projects/teacher-os/packages/api/src/skeleton.ts | code (hàm thuần ngày VN + bộ sinh khung buổi) | — | high | OK | BR-014 (ngày VN), FR-018 (gợi ý buổi kế tiếp) |

## Ghi chú nguồn

- __Confidence mỗi nguồn:__ tất cả nguồn đều là code/test/doc trong repo, đọc trực tiếp — confidence high; không có nguồn mojibake.
- __Encoding ⚠:__ không có. Mọi wording tiếng Việt trích nguyên văn từ source (contracts, UI, e2e) đều đọc được đầy đủ.
- __Nguồn mâu thuẫn / lỗi thời:__ brief nhiệm vụ nhắc "gán giáo viên" nhưng code + PDR (/root/projects/teacher-os/docs/project-overview-pdr.md:25) khẳng định bảng lớp chưa có cột giáo viên → ghi vào `reverse-gaps.md` Mục 3 (Conflicts) + OQ, KHÔNG tự chế luồng gán giáo viên.
- Ranh giới dữ liệu: mọi trích dẫn theo dạng `đường-dẫn-đầy-từ-repo:số-dòng`; số dòng chốt ở commit làm việc trên nhánh `develop` (2026-11-11), có thể trôi nếu code đổi.


<!-- wm:c3e3a8b9c06f46427bf9089e2fdafa48 -->
<sub>Tài liệu thuộc bộ AI4BA BA-Kit — bản quyền hoangphan.blog</sub>
