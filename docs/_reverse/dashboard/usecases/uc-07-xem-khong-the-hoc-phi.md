# UC-07 — Xem dashboard không có thẻ học phí (thiếu quyền tài chính)

| Trường | Nội dung |
|--------|----------|
| **a. Mô tả** | Thành viên với membership role `ta`/`class_teacher` (hoặc giá trị lạ) vẫn xem được 2 thẻ việc (điểm danh, chấm bài) nhưng không bao giờ nhận thẻ học phí. |
| **b. Actor** | Thành viên org không có quyền tài chính. |
| **c. Điều kiện tiên quyết** | Session hợp lệ với membership.role ngoài allowlist finance. |
| **d. Trigger** | Gọi `GET /api/dashboard/reminders` (hoặc mở /dashboard). |
| **e. Luồng chính** | 1. `resolveReminderScope(ctx.role)` → finance = canAccessFinance(role) = false (dashboard-reminders.ts:273-280; role.ts:79-87). 2. `computeReminders` bỏ nhánh hóa đơn; response không có key `tuition` (`...(tuition ? { tuition } : {})`, 268-270). 3. Web: thiếu block → không render thẻ học phí (reminder-cards.tsx:68-77; test 66-74). |
| **f. Luồng thay thế** | f1. Role `ta/class_teacher` vẫn nhận đủ thẻ 1 + thẻ 2 (scope org) — không bị thu hẹp lớp ở hiện tại (nhánh assigned là dead branch, OQ-1). |
| **g. Ngoại lệ** | g1. Nếu người này tự điều hướng tới `/tuition` → guard trả về `/dashboard` + toast (use-finance-route-guard.ts:12-28). |
| **h. Hậu điều kiện** | Không lộ số liệu tài chính cho vai trò không có quyền; hợp đồng vẫn parse hợp lệ khi thiếu block (test 537-541; lưu ý phủ test: chưa có test gọi computeReminders với {kind:"org", finance:false} hay session ta — chỉ phủ gián tiếp qua test scope assigned 514-542). FR: FR-005, FR-016. BR: BR-008. |
