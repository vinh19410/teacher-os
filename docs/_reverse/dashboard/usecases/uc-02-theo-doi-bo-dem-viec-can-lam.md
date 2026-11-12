# UC-02 — Theo dõi bộ đếm "Việc cần làm hôm nay"

| Trường | Nội dung |
|--------|----------|
| **a. Mô tả** | Giáo viên xem 3 thẻ đếm việc tồn trong ngày: ca học chưa điểm danh, bài quá hạn chấm >24h, học phí đến hạn/quá hạn — số liệu tính server theo org. |
| **b. Actor** | Chính: Giáo viên. Phụ: API server (`GET /api/dashboard/reminders`). |
| **c. Điều kiện tiên quyết** | Session teacher hợp lệ (kernelCtx có orgId + role); đã có kernel snapshot (để enable query). |
| **d. Trigger** | Mount trang dashboard với `kernelUpdatedAt > 0`; hoặc kernel snapshot refresh; hoặc bấm "Làm mới dữ liệu"/"Thử lại". |
| **e. Luồng chính** | 1. Middleware gate: teacher hợp lệ → kernelCtx (app.ts:296-300). 2. `resolveReminderScope(role)` → `{kind:"org", finance: canAccessFinance(role)}` (dashboard-reminders.ts:273-280). 3. Thẻ 1: lesson upcoming hôm nay — dated so `date=today(VN)`, legacy so `day`=weekday ISO; gom bucket; sort giờ; preview 3 (dashboard-reminders.ts:99-158). 4. Thẻ 2: submitted + grade null + quá 24h (assignment skill writing/speaking/hybrid-writing + practice deck writing/speaking), loại demo (160-229). 5. Thẻ 3 (nếu finance): hóa đơn due≠rỗng, ≤ hôm nay+7, chưa thu đủ; đếm học viên distinct + outstanding clamp (231-258). 6. Parse zod `.strict()` → 200 (294-296). 7. Web parse zod + render 3 thẻ (repos/dashboard-reminders.ts:26-51; reminder-cards.tsx:42-80). |
| **f. Luồng thay thế** | f1. finance=false (ta/class_teacher): bỏ hẳn key `tuition` — thẻ 3 không render (dashboard-reminders.ts:268-270; reminder-cards.test.tsx:66-74) [UC-07]. f2. Scope classIds rỗng (nhánh assigned — hiện dead): trả 0, không query (dashboard-reminders.ts:88-97; test 544-559). f3. Đếm 0 thẻ nào → nhãn "Đã hoàn tất hôm nay", không hiện số 0 (reminder-cards.tsx:106-112). |
| **g. Ngoại lệ** | g1. Chưa đăng nhập → 401 `unauthorized` (dashboard-reminders.ts:286-287) [E-001]. g2. Student → 403 `ACCOUNT_STUDENT_ROLE` (app.ts:224-232) [E-002]. g3. Admin → 403 `ACCOUNT_ADMIN_ROLE` [E-003]. g4. Email ngoài allowlist/chưa xác thực (khi cấu hình) → 403 [E-005]. g5. Fetch lỗi → "Không tải được bộ đếm nhắc việc." + Thử lại (dashboard.tsx:150-160) [E-004]. |
| **h. Hậu điều kiện** | Bộ đếm phản ánh đúng dữ liệu org tại thời điểm gọi; không ghi thay đổi nào. BR: BR-001…BR-005, BR-008, BR-009. FR: FR-002…FR-005, FR-012…FR-016. |
