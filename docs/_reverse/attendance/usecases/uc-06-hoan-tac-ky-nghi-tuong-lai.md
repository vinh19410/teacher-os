# UC-06 — Hoàn tác kỳ nghỉ tương lai

a. **Mục tiêu:** Rút lại kỳ nghỉ chưa bắt đầu, trả buổi gốc/bù/cancelled về trạng thái trước apply. 🟡 (INF-1)
b. **Actor:** Giáo viên.
c. **Tiền điều kiện:** Kỳ nghỉ `fromDate > hôm nay (VN)`; các buổi bù còn nguyên `upcoming`, buổi gốc còn nguyên `holiday`/`cancelled` (không ai đụng sau apply).
d. **Luồng chính (truy vết F8):**
   1. Bấm `Xóa kỳ nghỉ (Hoàn tác)` trên kỳ tương lai → dialog xác nhận.
   2. DELETE `/api/holidays/:id`: kiểm tồn tại (404), đã bắt đầu (422 `holiday-started`) (FR-26, BR-07).
   3. Server kiểm mọi shift/cancel còn nguyên; lệch → 409 `makeup-touched` kèm `touched[]` (FR-26, E-22).
   4. Batch guard: UPDATE `organization_holiday` với CASE — lệch → NULL → rollback toàn batch.
   5. Restore shift: move-back `lesson_material` về ngày gốc; DELETE buổi bù `upcoming`; `holiday → upcoming`.
   6. Restore cancel: chỉ dòng do kỳ này hủy (`holiday_session_cancel`) → `upcoming`; buổi GV hủy tay giữ nguyên (BR-08).
   7. Xóa bảng con + `organization_holiday`; notif `Đã xóa kỳ nghỉ «tên»: khôi phục {n} buổi`.
   8. 200 `{restoredCount, removedMakeupCount}`.
e. **Luồng thay thế:**
   - 3a. Buổi bù đã bị điểm danh / lịch lệch → 409 + dialog liệt kê ngày đụng (E-22).
   - 3b. Kỳ không còn tồn tại → `Kỳ nghỉ không còn tồn tại.` (E-20).
   - 3c. Kỳ đã bắt đầu → `Kỳ nghỉ đã bắt đầu — không thể hoàn tác.` (E-21); E2E xác nhận nút undo không còn với kỳ đã bắt đầu.
   - 4a. Batch lỗi constraint → 409 makeup-touched (touched rỗng).
f. **Hậu điều kiện:** DB về trạng thái trước apply (buổi, tài liệu, đếm buổi không-holiday giữ nguyên); không còn bản ghi kỳ nghỉ.
g. **Quy tắc liên quan:** FR-24, FR-26, FR-28; BR-02, BR-07, BR-08, BR-09.
h. **Truy vết:** apps/server/src/routes/holidays.ts:673-1009; packages/db/src/schema/organization-holiday.ts:71-149; test: apps/server/src/routes/holidays.test.ts:1679-1998; UI: apps/web/src/components/schedule/holiday-undo-dialog.tsx:9-161; apps/web/src/lib/repos/holidays.ts:73-122; E2E: apps/e2e/specs/holiday-cancel-and-undo.spec.ts:113-231.
