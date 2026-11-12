# enrollment-lifecycle — Gaps & Open Questions

## 1. Open Questions

* [ ] OQ-1: PDR:23 chốt "teachers no longer create students manually and only enroll existing students" nhưng `POST /api/students` vẫn nhận `classId` + UI EnrollStudentModal còn tab "Tạo học viên mới" (S3 `kernel.ts:463-694`; S8 `enroll-student-modal.tsx:139-192`). Nhánh này là chủ đích (tạo nhanh học viên không portal) hay phần còn sót lại cần gỡ? — *(liên quan: FR-EL-002 · cần: PO quyết)*
* [ ] OQ-2: Cột `enrollment.status` default `'active'` — comment schema ghi rõ "default 'active' exists only to backfill pre-existing rows in migrations; new code writes status explicitly" (S1 `enrollment.ts:30-34`). Có còn row production nào đi qua default này, có cần kiểm/migration khóa cột không? — *(liên quan: BR-EL-001 · cần: dev/dba)*
* [ ] OQ-3: Không tồn tại API đưa enrollment `active` ra khỏi trạng thái nào cả (không un-enroll, không chuyển lớp trực tiếp — muốn đổi lớp phải hủy invited rồi mời lại lớp khác). Sản phẩm có cần "học viên rời lớp giữa khóa" không? — *(liên quan: FR-EL-009 · cần: PO)*
* [ ] OQ-4: Kích hoạt lớp manual/template-less sinh gói total 0 + 0 buổi mà vẫn `active` (S17 `student-package-validation.spec.ts:78-83`; S4 `enrollment-activation.ts:321-323`). Có nên cảnh báo/chặn kích hoạt khi lớp chưa có lịch không? — *(liên quan: FR-EL-007 · cần: PO/dev)*
* [ ] OQ-5: Resend lời mời lớp không có đường gọi từ test colocated (chỉ thấy flow code S3 `kernel.ts:1122-1278` và UI `ResendInviteButton`) —độ phủ e2e của resend enrollment-specific đang ở đâu? — *(liên quan: FR-EL-015 · cần: QA)*
* [ ] OQ-6: Khi `activateNow=true` mà activation lỗi, enrollment đã tồn tại ở `invited` và server trả 500 — UI chỉ hiện lỗi chung; có cần tự động retry hay rollback insert enrollment không? — *(liên quan: E-EL-004 · cần: dev)*
* [ ] OQ-7: DELETE enrollment `invited` không xóa/dọn notification `class_enrolled` đã phát (idempotencyKey khóa theo enrollmentId cũ, mời lại tạo enrollment mới nên không va chạm) — chấp nhận để thông báo cũ tồn tại? — *(liên quan: FR-EL-014 · cần: PO)*
* [ ] OQ-8: Portal `.catch("active")` fallback (S2 `contracts.ts:2138`) nghĩa là server cũ → thẻ lớp hiển thị "đang học" dù backend chưa hỗ trợ invited. Sau khi toàn bộ deploy mới, có nên bỏ fallback để lỗi lộ ra? — *(liên quan: NFR-EL-005 · cần: dev)*
* [ ] OQ-9: Không có kiểm tra "đủ/max sĩ số lớp" khi enroll (chỉ cap 52 buổi/lớp, không cap học viên). Sĩ số tối đa lớp thật là bao nhiêu? — *(liên quan: FR-EL-001 · cần: PO)*
* [ ] OQ-10: Cột Priority (bảng FR/NFR) và Severity (Error Matrix) hiện là phán đoán nghiệp vụ không nguồn nào phát biểu (code/test/PDR không nêu mức ưu tiên hay độ nghiêm trọng) — cần PO chốt. — *(liên quan: Mục 3, 4, 6 · cần: PO)*

## 2. Gaps (nguồn thiếu hẳn)

| Mục spec | Thiếu gì | Hệ quả nếu không bổ sung | Cần ai bổ sung |
|----------|----------|--------------------------|----------------|
| FR-EL-008 | Không có test colocated mô phỏng HAI request accept SONG SONG thực sự (race); bằng chứng CAS chỉ từ code + test accept-đúp tuần tự | Tự tin vào chống race dựa trên reading code, không có regression test race | dev (thêm test concurrency) |
| FR-EL-015 | Resend lời mời enrollment-specific chưa thấy e2e dedicated (chỉ unit qua kernel.test luồng khác) | Hỏng resend không bị e2e bắt | QA |
| Mục 6 | `materializeScheduleForEnrollment: guard retry exhausted` (E-EL-011) chưa thấy test trực tiếp phủ nhánh throw | Lỗi hiếm không có regression guard | dev |
| Mục 10 | Không có màn hình nào hiển thị "lý do hủy lời mời" / lịch sử hủy — hủy xóa hẳn row, không audit trail | Không truy vết ai hủy lời mời khi khiếu nại | PO (nếu cần) |

## 3. Conflicts (nguồn mâu thuẫn)

| Điểm | Nguồn A nói | Nguồn B nói | Ghi chú (ngày/độ tin cậy) |
|------|-------------|-------------|---------------------------|
| Cách giáo viên đưa học viên vào lớp | PDR:23: "only enroll existing students into classes via POST /api/classes/:id/enroll" (doc, high) | Code: `POST /api/students` với `classId` vẫn tạo student mới + enrollment invited; UI còn tab "Tạo học viên mới" (S3 `kernel.ts:544-553`; S8) | PDR mô tả luồng chính (#122/#257); nhánh `/students`+classId là luồng #508 cũ hơn vẫn hoạt động → để OQ-1, không tự chọn bên |

## 4. Inferred assumptions (suy đoán cần verify)

* Enrollment bị xóa (cascade từ class/student/org) kéo theo lesson/session_package liên quan (FK onDelete cascade ở lesson/session_package khóa theo enrollment) — *validate: đọc `packages/db/src/schema/lesson.ts`, `session-package.ts` phần FK · nếu sai: dữ liệu mồ côi enrollmentId*.
* Bài đã giao (`class_assignment_target`) KHÔNG dính enrollment — target khóa theo studentId, nên hủy lời mời invited không ảnh hưởng (invited chưa bao giờ giao được bài theo BR-EL-007) — *validate: S24 schema + BR-EL-007 · nếu sai: bài tập dính học viên không trong lớp*.
* "Chờ xác nhận" KPI đếm theo `invitedStudentIds.length` — học viên invited ở lớp KHÁC của cùng học viên không tính vào lớp này — *validate: S9 `$classId.tsx:285-292` + S11 · nếu sai: KPI sai lệch*.
* Kích hoạt qua 2 đường cho KẾT CỤC GIỐNG NHAU (active + package + lessons + study-pack backfill) vì cùng gọi `activateEnrollment` — chỉ khác scoping đầu vào (teacher: org; student: ownership) — *validate: S4 `enrollment-activation.ts:656-663` vs S3 `kernel.ts:1459` vs S5 `student.ts:1313` · nếu sai: cần tách behavior*.
