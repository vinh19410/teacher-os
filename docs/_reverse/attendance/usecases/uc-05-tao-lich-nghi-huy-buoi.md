# UC-05 — Tạo lịch nghỉ — hủy buổi (cancel)

a. **Mục tiêu:** Khai báo kỳ nghỉ mà KHÔNG bù: buổi trúng khoảng chuyển `cancelled`, chấp nhận mất buổi đó (BR-11). 🟡 (INF-1, OQ-11)
b. **Actor:** Giáo viên.
c. **Tiền điều kiện:** Như UC-04; mode = `cancel`. Lớp chỉ cần dòng có `date` (lớp schedule legacy nhưng dòng dated vẫn hủy được — khác shift).
d. **Luồng chính (truy vết F5, F7):**
   1. Form như UC-04, chọn mode hủy (FR-18).
   2. Preview trả `cancellations` (không quét ngày bù) + keptCompleted + planHash (FR-19..FR-21).
   3. Apply: các gate như UC-04 (FR-22..FR-24).
   4. Batch: INSERT `holiday_session_cancel` (guard + unique `(classId, date)`) + UPDATE `upcoming → cancelled` (FR-25, BR-09).
   5. notify=true → notif `Lịch nghỉ «tên»: hủy {n} buổi...` + `holiday_created` (FR-27).
   6. 200 `{holidayId, shiftedCount: 0, cancelledCount, classCount}` → toast `Đã hủy {n} buổi.`
e. **Luồng thay thế:**
   - 2a. Buổi trộn completed + upcoming → `keptCompleted` thắng, không hủy một phần (BR-05).
   - 2b. Buổi toàn cancelled/holiday (hủy tay trước đó) → bỏ qua, không ghi đè bản ghi kỳ khác.
   - 2c. Lớp còn dòng `date = null` → `unsupported undated` (không hủy được lớp đó).
   - 3a. Ngày đã có kỳ cancel thành công → guard unique chặn → 409 stale-preview.
f. **Hậu điều kiện:** Buổi thành `cancelled`; KHÔNG sinh bù, max(date) khóa không đổi; activation muộn → dòng ngày hủy là `cancelled`, không sinh bù (FR-32).
g. **Quy tắc liên quan:** FR-18..FR-23, FR-25, FR-27, FR-32; BR-04, BR-05, BR-09, BR-11, BR-02.
h. **Truy vết:** packages/api/src/holiday-plan.ts:201-214; apps/server/src/routes/holidays.ts:414-441, apps/server/src/routes/holidays.ts:577-587; packages/db/src/schema/organization-holiday.ts:114-149; test: packages/api/src/holiday-plan.test.ts:395-640, apps/server/src/routes/holidays.test.ts:1551-1678, apps/server/src/routes/holidays.test.ts:1962-1998; E2E: apps/e2e/specs/holiday-cancel-and-undo.spec.ts:50-112.
