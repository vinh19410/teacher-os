# UC-03 — Điền nhanh & xử lý lưu thiếu (superset UC-02)

a. **Mục tiêu:** Giảm thao tác khi phần lớn học viên có mặt; xử lý an toàn khi GV bấm lưu còn thiếu trạng thái. 🟡 (INF-1)
b. **Actor:** Giáo viên.
c. **Tiền điều kiện:** Như UC-02; ca chưa recorded để dùng điền nhanh (nút disabled khi đã recorded) và modal xác nhận.
d. **Luồng chính (truy vết F3, F4):**
   1. Bấm `Đánh dấu tất cả Có mặt`: chỉ ô trống được gán `present`, giữ lựa chọn có sẵn + ghi chú (FR-15).
   2. Bấm Lưu còn thiếu (ca chưa recorded) → modal `Còn {n} học viên chưa chọn trạng thái` (FR-16, E-25).
   3. Chọn `Gán Có mặt và lưu` → entries tính từ helper thuần trên snapshot draft → PUT đủ sĩ số (về UC-02).
   4. Lưu thành công lần đầu → auto-advance: ca pending kế mở, focus picker đầu (FR-17).
   5. Hết ca → aria-live thông báo hoàn tất (có biến thể cho legacy) + focus về ô ngày.
e. **Luồng thay thế:**
   - 3a. `Quay lại chỉnh` / Esc → không PUT; alert thiếu + viền vàng + focus dòng thiếu đầu tiên (sau khi modal đóng).
   - 2a. Ca đã recorded còn "Chưa rõ" → KHÔNG modal; giữ alert + focus (không bulk đè lịch sử).
   - 4a. Đổi ngày/chip giữa lúc lưu, refetch lỗi, dữ liệu stale → bỏ auto-advance (không thông báo sai).
   - 4b. Lưu ca đã recorded → không auto-advance, không thông báo hoàn tất (CR-Bugs F3).
   - 4c. Double-submit → guard savingRef + disable mọi nút ghi (chỉ 1 PUT).
f. **Hậu điều kiện:** Như UC-02; UI mở ca kế hoặc báo hoàn tất.
g. **Quy tắc liên quan:** FR-15..FR-17; BR-03, BR-12.
h. **Truy vết:** apps/web/src/lib/attendance-draft.ts:111-131; apps/web/src/components/attendance/attendance-session-row.tsx:136-162, apps/web/src/components/attendance/attendance-session-row.tsx:310-327; apps/web/src/components/attendance/fill-missing-confirm.tsx:19-58; apps/web/src/routes/_auth/attendance.tsx:98-261; test: apps/web/src/lib/attendance-draft.test.ts:107-190, apps/web/src/components/attendance/attendance-session-row.test.tsx:89-470, apps/web/src/routes/_auth/attendance.test.tsx:304-850; E2E: apps/e2e/specs/daily-attendance.spec.ts:244-604.
