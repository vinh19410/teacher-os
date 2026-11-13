# UC-03 — Mở màn đích đã lọc từ thẻ nhắc việc

| Trường | Nội dung |
|--------|----------|
| **a. Mô tả** | Từ một thẻ việc cần làm, 1 cú bấm duy nhất đưa giáo viên tới màn đích đã lọc sẵn đúng ngữ cảnh (AC-001). |
| **b. Actor** | Chính: Giáo viên. |
| **c. Điều kiện tiên quyết** | Bộ đếm đã render (data có `date`); màn đích tồn tại. |
| **d. Trigger** | Bấm vào bất kỳ điểm nào của thẻ (link phủ inset-0, 1 điểm focus/thẻ). |
| **e. Luồng chính** | 1. Thẻ 1 → `/attendance?date=<date trả về>&status=pending` (reminder-cards.tsx:53-55); e2e assert URL + heading "Điểm danh tổng theo ngày" (dashboard-reminders.spec.ts:143-152). 2. Thẻ 2 → `/grading?status=awaiting` (reminder-cards.tsx:64-66; spec:160-163). 3. Thẻ 3 → `/tuition` (reminder-cards.tsx:74-75). |
| **f. Luồng thay thế** | f1. Thẻ zero-inbox vẫn dẫn đúng đích (CTA giữ nguyên, nhãn "Đã hoàn tất hôm nay") (reminder-cards.test.tsx:76-92). |
| **g. Ngoại lệ** | g1. `/tuition` với vai trò không có quyền tài chính → guard ở màn đích điều hướng về `/dashboard` + toast "Bạn không có quyền xem Sổ công nợ" (use-finance-route-guard.ts:12-28). |
| **h. Hậu điều kiện** | Màn đích mở với bộ lọc đúng (date hôm nay VN / status pending / awaiting); không có thay đổi dữ liệu từ phía dashboard. FR: FR-003…FR-005. |
