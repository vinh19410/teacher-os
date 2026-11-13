# dashboard — Câu hỏi mở, Gap, Conflict, Inferred (reverse)

## Open Questions

### OQ-1 — Dead branch: scope "assigned" (trợ giảng) trong bộ đếm
- **Bằng chứng:** `resolveReminderScope(role?)` luôn trả `{kind:"org", finance}` — apps/server/src/routes/dashboard-reminders.ts:273-280 (nguyên văn comment: "Hiện tại mọi teacher là toàn org"). Toàn repo chỉ có 3 caller production và cả ba dùng giá trị trả về của hàm này: apps/server/src/routes/dashboard-reminders.ts:291 (route reminders) và apps/server/src/routes/kernel.ts:2916, apps/server/src/routes/daily-attendance.ts:325 (không truyền role → finance true). Không có chỗ nào sản xuất scope `{kind:"assigned", ...}` (negative-search §7 _evidence.md — chỉ tests + type definition).
- **Hệ quả:** các nhánh `scope.kind === "assigned"` (dashboard-reminders.ts:88-89, 128-130, 194-196, 199-201; kernel.ts:2917-2919) hiện không thể chạy trong production; chỉ test gọi trực tiếp với scope tự dựng.
- **Câu hỏi:** giữ làm điểm cắm Phase 5 (FR-029, vai trò Trợ giảng) như comment, hay xóa đến khi vai trò tồn tại (dead code che chi phí bảo trì + phủ test)?
- 🟡 (code không trả lời ý định sản phẩm)

### OQ-2 — Ngưỡng nghiệp vụ không có nguồn mục tiêu
- **Bằng chứng:** các hằng số tồn tại rõ trong code nhưng không tìm thấy tài liệu giải thích "vì sao là con số này": quá hạn chấm 24h (apps/server/src/routes/dashboard-reminders.ts:37-39), cửa sổ học phí 7 ngày (40-41), preview 3 ca (42-43), cửa sổ vắng 14 ngày (apps/web/src/lib/dashboard-from-kernel.ts:117-122).
- **Câu hỏi:** đây là giá trị chốt sản phẩm (cần giữ + đưa vào spec duyệt) hay mặc định kỹ thuật có thể review?
- 🟡

### OQ-3 — Hai con số "còn phải thu" trên cùng màn hình (CF-1)
- **Bằng chứng:** KPI "Còn phải thu" = `tuitionTotals(data.invoices).outstanding` trên TOÀN BỘ hóa đơn org (apps/web/src/routes/_auth/dashboard.tsx:114, 187-192; apps/web/src/lib/tuition-from-kernel.ts:35-48); thẻ 3 = chỉ hóa đơn `due ≤ hôm nay + 7` chưa thu đủ (apps/server/src/routes/dashboard-reminders.ts:240-250).
- **Câu hỏi:** chủ ý (KPI = dư nợ toàn phần, thẻ = việc cần hành động tuần này) hay cần thống nhất nhãn/định nghĩa để giáo viên không nhầm?
- 🟡

### OQ-4 — KPI không phân quyền tài chính khi Phase 5 ra mắt
- **Bằng chứng:** KPI "Học viên" và "Còn phải thu" tính client-side cho mọi viewer có snapshot (apps/web/src/routes/_auth/dashboard.tsx:177-192); bộ đếm server có phân quyền (finance flag, dashboard-reminders.ts:278) nhưng KPI thì không; viewer hiện tại là mọi teacher org. Khi role `ta`/`class_teacher` dùng app (TOS-48 — packages/auth/src/role.ts), KPI tài chính vẫn hiện.
- **Câu hỏi:** KPI có cần theo scope/phân quyền tương tự thẻ học phí?
- 🟡

### OQ-5 — "Lịch hôm nay" day-based (không xét date) là chủ ý
- **Bằng chứng:** `lessonsToday` lọc theo `lesson.day === weekday hôm nay` và loại cancelled/holiday, KHÔNG xét `date`; comment chủ ý "lessonsToday giữ semantics day-based (không xét date) — không đổi" (apps/web/src/lib/dashboard-from-kernel.ts:13-25, 79-87). Ngược lại "Lịch sắp tới" có xét date cho lớp dated.
- **Hệ quả:** lớp dated có row day trùng thứ hôm nay nhưng date khác (buổi dời/ghi đè) vẫn hiện ở "Lịch hôm nay".
- **Câu hỏi:** chấp nhận trade-off này (template weekly là nguồn sự thật hiển thị) hay cần đổi sang date-aware?
- 🟡

### OQ-6 — Priority FR/NFR/Severity do nhà phân tích gán
- Không có nguồn ưu tiên trong code/test; bảng Priority/Severity là phân loại của BA (nhất quán với spec `classes`). Cần người duyệt xác nhận.
- 🟡

## Gaps

- **GAP-1 — Không có tài liệu chính cho dashboard:** PDR (docs/project-overview-pdr.md) không nhắc "dashboard"/"tổng quan" (grep 0 hit); docs/_reverse/ cũng chưa có bản reverse nào cho feature này trước bản draft này. → Toàn bộ spec tái lập từ code; OQ-2/OQ-3/OQ-5 là hệ quả trực tiếp. 🟡
- **GAP-2 — Không có nguồn "why" cho từng thẻ ngoài comment code:** mục đích nghiệp vụ của từng thẻ chỉ tồn tại dạng comment tham chiếu TOS-6 #439 / AC-001 (apps/server/src/routes/dashboard-reminders.ts:38-43, 45-79; apps/e2e/specs/dashboard-reminders.spec.ts:12-17). 🟡
- **GAP-3 — Success Criteria định lượng chỉ có AC-001:** ngoài SC-01 (e2e ≤2s + 1 cú bấm + đếm khớp), không có đo nào cho "giảm thời gian tổng hợp ngày làm việc" — SC-04 là suy đoán cấu trúc. 🔵

## Conflicts

- **CF-1 (= OQ-3):** Cùng nhãn nghiệp vụ "còn phải thu" với 2 phạm vi dữ liệu khác nhau trên cùng trang (KPI toàn bộ hóa đơn org — client; thẻ 3 chỉ hóa đơn đến hạn ≤7 ngày — server). Code không mâu thuẫn nội tại nhưng 2 định nghĩa cùng tên chưa được tài liệu hóa.
- **CF-2:** "Bài tập chưa có điểm" (KPI) đếm từ bảng `assignments` legacy theo `status !== "graded"` client-side (apps/web/src/routes/_auth/dashboard.tsx:115), trong khi thẻ 2 "Bài tập quá hạn chấm > 24h" đếm từ `quiz_attempt` submitted + gradeScores null + >24h server-side (apps/server/src/routes/dashboard-reminders.ts:161-229). Hai khái niệm gần nhau, nguồn và cửa sổ khác nhau — dễ bị đọc là cùng một số. 🟡

## Inferred (suy đoán có căn cứ code)

- **INF-1 — Priority P0/P1/P2:** do nhà phân tích gán theo mức độ chi phí lỗi (gate/IDOR = P0, luồng chính = P0, tiện ích = P1/P2). Không có nguồn. 🟡
- **INF-2 — Định vị "một điểm xuất phát ngày làm việc":** suy từ cấu trúc trang (greeting + reminders + KPI + lịch + risk) và comment design `Dashboard` (apps/web/src/routes/_auth/dashboard.tsx:165-166); không có văn bản sản phẩm nói trực tiếp. 🔵
- **INF-3 — Kế hoạch Phase 5 (FR-029, Trợ giảng):** chỉ tồn tại trong comment code (dashboard-reminders.ts:45-54, 273-280) — không tìm thấy kế hoạch trong docs/. 🟡
