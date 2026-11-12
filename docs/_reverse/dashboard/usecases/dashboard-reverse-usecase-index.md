# dashboard — Use case index (reverse)

## Bảng UC

| ID | Tên UC | Actor chính | Mô tả ngắn | Nguồn | Nhãn |
|----|--------|-------------|------------|-------|------|
| UC-01 | Xem tổng quan ngày dạy | Giáo viên | Mở /dashboard, thấy lời chào + KPI + lịch + risk từ kernel | S3 — apps/web/src/routes/_auth/dashboard.tsx:67-296 | ✅ |
| UC-02 | Theo dõi bộ đếm "Việc cần làm hôm nay" | Giáo viên | Xem 3 thẻ đếm từ server (điểm danh / chấm / thu) | S4 — apps/server/src/routes/dashboard-reminders.ts:80-300 | ✅ |
| UC-03 | Mở màn đích đã lọc từ thẻ | Giáo viên | 1 cú bấm thẻ → /attendance, /grading, /tuition với query lọc sẵn (AC-001) | S10 — apps/e2e/specs/dashboard-reminders.spec.ts:143-163 | ✅ |
| UC-04 | Làm mới bộ đếm | Giáo viên | Nút làm mới thủ công + tự refetch theo kernel snapshot | S3 — apps/web/src/routes/_auth/dashboard.tsx:135-142; S9 — apps/web/src/lib/repos/dashboard-reminders.ts:16-24 | ✅ |
| UC-05 | Rà soát học viên rủi ro | Giáo viên | Xem bảng "Cần kiểm tra": Vắng / Miss check-in + số buổi còn | S8 — apps/web/src/lib/dashboard-from-kernel.ts:110-178 | ✅ |
| UC-06 | Bị chặn truy cập tổng quan (sai app) | Hệ thống (gate) | Student/admin nhận 403 + blocked view | S6 — apps/server/src/app.ts:224-242; S23 — apps/e2e/specs/account-role-separation.spec.ts:137-145 | ✅ |
| UC-07 | Xem dashboard không có thẻ học phí | Thành viên không quyền tài chính | Role ta/class_teacher nhận response thiếu block tuition | S4 — apps/server/src/routes/dashboard-reminders.ts:232-258; S14 — packages/auth/src/role.ts:75-87 | ✅ |

## Ma trận UC ↔ FR ↔ BR ↔ Error

| UC | FR liên quan | BR liên quan | Error liên quan |
|----|--------------|--------------|-----------------|
| UC-01 | FR-001, FR-007, FR-008, FR-009, FR-010, FR-011 | BR-005, BR-010, BR-011 | E-006 |
| UC-02 | FR-002, FR-003, FR-004, FR-005, FR-012, FR-013, FR-014, FR-015, FR-016 | BR-001, BR-002, BR-003, BR-004, BR-005, BR-008, BR-009 | E-001, E-002, E-003, E-004, E-005 |
| UC-03 | FR-003, FR-004, FR-005 | BR-011 (đảm bảo CTA cập nhật) | E-004 |
| UC-04 | FR-006, FR-013 | BR-011 | E-004 |
| UC-05 | FR-010 | BR-006, BR-007, BR-012 | — |
| UC-06 | FR-015 | BR-009 | E-002, E-003, E-005 |
| UC-07 | FR-005, FR-016 | BR-008 | — |
