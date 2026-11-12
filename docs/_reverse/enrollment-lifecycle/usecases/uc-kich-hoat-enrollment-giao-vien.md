# UC-2: Kích hoạt enrollment (giáo viên)

> Reverse draft — truy vết: S3 `kernel.ts:1453-1470`; S4 `enrollment-activation.ts:656-776`; S7 `class-roster-tab.tsx`; S15 e2e `:265-289`; S19 `kernel.test.ts:7136-7171`.

## a. Mục tiêu & phạm vi

- Giáo viên chuyển một enrollment "Đã mời" thành "Đang học" ngay trên roster lớp; hệ thống cấp gói học (derive từ lớp) + chuỗi buổi học. ✅ [S15 `enroll-existing-student.spec.ts:274-289` — "Đang học", "0/12"]
- Phạm vi: nút "Kích hoạt" trên teacher web. Đường portal học viên là UC-3 (cùng hàm server).

## b. Actor chính & stakeholder

- **Chính:** Giáo viên. ✅ [S7 `class-roster-tab.tsx:188-203`]
- **Stakeholder:** Học viên (được cấp tài nguyên học tập; vẫn nhận email portal invite nếu tick ở UC-1). 🔵

## c. Tiền điều kiện

- Enrollment tồn tại trong org với `status = 'invited'` (nút chỉ render cho invited). ✅ [S7 `class-roster-tab.tsx:188-203`; S4 `enrollment-activation.ts:684-695`]
- Lớp tồn tại cùng org (nếu không → 404 class). ✅ [S4 `enrollment-activation.ts:706-727`]

## d. Trigger

- Nút "Kích hoạt" trên dòng roster invited → modal xác nhận "Kích hoạt học viên?" → bấm "Kích hoạt". ✅ [S7 `class-roster-tab.tsx:231-278`]

## e. Kịch bản chính

1. GV bấm "Kích hoạt"; modal mô tả: học viên chuyển "Đang học" và được tạo gói học cùng lịch buổi. ✅ [S7 `class-roster-tab.tsx:240-243`]
2. Web POST `/api/enrollments/{id}/accept`. ✅ [S7 `class-roster-tab.tsx:262-267`; S10 `repos/kernel.ts:263-267`]
3. Server pre-read enrollment org-scoped; không thấy → 404 `enrollment not found`. ✅ [S4 `enrollment-activation.ts:683-695`; S3 `kernel.ts:1463-1469`]
4. Server đọc lớp; không thấy → error `class` → 404 `class not found`. ✅ [S4 `enrollment-activation.ts:706-727`]
5. CAS UPDATE `status='active'` WHERE `status='invited'`; request khác đã flip → re-read active → coi như thành công (idempotent). ✅ [S4 `enrollment-activation.ts:733-757`]
6. `materializeScheduleForEnrollment` sinh sessionPackage (total/price/mode từ lớp) + chuỗi lesson (auto từ schedule / manual từ class_session, áp nghỉ dời) trong một batch có statement-0 guard, retry 3. ✅ [S4 `enrollment-activation.ts:269-654`]
7. Backfill study-pack target cho học viên. ✅ [S4 `enrollment-activation.ts:769-774`]
8. Trả 200 `{ok:true}`; toast "Đã kích hoạt học viên vào lớp."; badge "Đang học"; tab buổi học hiện "0/12". ✅ [S7 `class-roster-tab.tsx:266`; S15 `:274-289`]

## f. Luồng thay thế / mở rộng

- **f1 Đã active từ trước (accept-đặp):** trả 200, KHÔNG tạo thêm gói/buổi; chỉ backfill study-pack. ✅ [S4 `enrollment-activation.ts:696-704,745-757`; S20 `student.test.ts:1383-1404`]
- **f2 Lớp manual/template-less:** vẫn active, gói total 0 + 0 buổi. ✅ [S4 `enrollment-activation.ts:321-323`; S17 `:78-83`] 🟡 OQ-4
- **f3 Xung đột materialize:** constraint error → re-check; đã có lesson/package → ok; chưa → retry tới 3 lần rồi throw. ✅ [S4 `enrollment-activation.ts:607-653`] 🟡 Gap (không có test riêng)

## g. Business rules & ràng buộc

BR-EL-003 (chỉ invited → active, CAS), BR-EL-008 (gói/buổi sinh đúng lúc kích hoạt, derive lớp, không client nhập), BR-EL-013 (2 đường kích hoạt cùng hàm); org-scoped. ✅

## h. Lỗi & phục hồi

E-EL-005 (404 enrollment), E-EL-001 (404 class), E-EL-011 (guard retry exhausted → 500; thử lại an toàn vì idempotent); nếu kích hoạt qua nhánh `activateNow` của UC-1 mà lỗi → E-EL-004 (500, enrollment tồn tại invited, kích hoạt lại trên roster). ✅
