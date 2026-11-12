# UC-04 — Tạo lịch nghỉ — dời buổi (shift)

a. **Mục tiêu:** Khai báo kỳ nghỉ (lễ/Tết) cho org hoặc nhóm lớp; các buổi trúng khoảng được DỜI +1 vào cuối khóa, giữ trọn số buổi. 🟡 (INF-1)
b. **Actor:** Giáo viên.
c. **Tiền điều kiện:** Khoảng nghỉ bắt đầu từ hôm nay trở đi; lớp có lịch chuẩn (schedule parse được) và mọi dòng có `date` để dời được (ngược lại vào `unsupported`).
d. **Luồng chính (truy vết F5, F6):**
   1. Mở modal `Tạo lịch nghỉ` (từ màn Lịch); nhập tên (2–100), từ/đến ngày (≤30), scope, notify; mode = `shift` (FR-18).
   2. Preview: server tính kế hoạch thuần từ DB, trả shifts + `skippedHolidays` + keptCompleted + unsupported + `planHash`; không ghi DB (FR-19..FR-21).
   3. GV xác nhận bảng xem trước → apply gửi kèm `planHash` (FR-21).
   4. Server buildPlan lại từ DB; kiểm past-range (422), no-sessions (422), hash (409) (FR-22, FR-23).
   5. Batch nguyên tử: gốc `upcoming → holiday`, sinh buổi bù `upcoming` (id `holmk-*`, thứ + giờ chuẩn lớp, sau buổi cuối/không quá khứ, nhảy kỳ nghỉ + ngày có buổi), dời `lesson_material` theo (FR-20, FR-28, BR-05, BR-06, BR-09).
   6. Guard CASE từng shift: trạng thái lệch → rollback toàn batch → 409 `stale-preview` (FR-22).
   7. notify=true → notif in-app org + `holiday_created` (email/in-app) cho học viên ACTIVE (FR-27).
   8. 200 `{holidayId, shiftedCount, cancelledCount: 0, classCount}` → toast `Đã dời {n} buổi của {m} lớp.`
e. **Luồng thay thế:**
   - 2a. Lớp lạ/lệch org → 404 (E-15, NFR-05); form sai → lỗi tại chỗ (E-26).
   - 2b. Lớp legacy-schedule hoặc còn dòng không ngày → `unsupported`, không dời lớp đó.
   - 2c. Buổi có dòng đã điểm danh → `keptCompleted`, giữ nguyên (BR-05).
   - 4a. `too-large` (>500 câu) → 422 → toast `Phạm vi quá lớn — chọn ít lớp hoặc khoảng ngắn hơn.` (E-18).
   - 5a. Guard vi phạm (điểm danh xen giữa preview–apply) → rollback sạch → 409 + tự tải lại preview (E-19).
f. **Hậu điều kiện:** `organization_holiday` + `holiday_session_shift` tạo; buổi gốc `holiday` (không trừ buổi — BR-02); buổi bù `upcoming`; activation muộn vẫn nhận đủ cặp gốc+bù (FR-32).
g. **Quy tắc liên quan:** FR-18..FR-24, FR-27, FR-28, FR-30, FR-32; BR-02, BR-04, BR-05, BR-06, BR-09.
h. **Truy vết:** apps/server/src/routes/holidays.ts:230-441, apps/server/src/routes/holidays.ts:495-671; packages/api/src/holiday-plan.ts:94-283; packages/api/src/contracts.ts:3620-3714; test: apps/server/src/routes/holidays.test.ts:252-523, apps/server/src/routes/holidays.test.ts:1303-1460, packages/api/src/holiday-plan.test.ts:61-393, packages/api/src/holiday-contracts.test.ts:21-152; UI: apps/web/src/components/schedule/holiday-modal.tsx:143-235; E2E: apps/e2e/specs/holiday-shift.spec.ts:69-199, apps/e2e/specs/holiday-skip-and-kept-completed.spec.ts:78-196.
