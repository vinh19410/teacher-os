# reverse-gaps.md — Câu hỏi mở, Gap, Conflict, Inferred (feature `schedule`)

## Open Questions (OQ)

### OQ-1 — Sự kiện chỉ tạo/xóa, không sửa: chấp nhận xóa-tạo-lại?
- **Bằng chứng:** route sự kiện chỉ có POST + DELETE (`apps/server/src/routes/events.ts:34,65`); chip/hộp thoại không có nút sửa (`apps/web/src/components/schedule/org-event-chip.tsx:101-141`); plan TOS-14 liệt kê "Sửa sự kiện, sự kiện lặp, mời người tham dự, thông báo sự kiện" vào non-goals (`plans/261026-2018-tos-14-schedule-views-and-events/plan.md:60`).
- **Câu hỏi:** nghiệp vụ có chấp nhận người dùng phải xóa rồi tạo lại khi nhập nhầm giờ không, hay cần đường sửa (PATCH) trong tương lai gần?
- **Hệ quả nếu cần sửa:** thêm endpoint + giao diện sửa; hợp đồng snapshot không đổi (vẫn đọc từ `events`).
- **Nhãn:** 🟡

### OQ-2 — Ai được phép tạo/xóa sự kiện vận hành?
- **Bằng chứng:** route chỉ chặn chưa đăng nhập (`apps/server/src/routes/events.ts:36,67`); `kernelCtx` chốt org/user/role nhưng role không được kiểm ở đây (`apps/server/src/app.ts:296-300`); không có cổng vai trò nào như các nhóm khác (so sánh: kiểm `canManageStudentInvites` ở `apps/server/src/routes/kernel.ts:699`).
- **Câu hỏi:** mọi thành viên org đều được tạo/xóa sự kiện — đây là chủ ý (org giáo viên nhỏ, một vai trò) hay cần phân quyền (vd. chỉ teacher/owner)?
- **Nhãn:** 🟡

### OQ-3 — `maxLength` ô nhập nới rộng hơn bộ luật (200/600 vs 100/500) là chủ ý?
- **Bằng chứng:** ô tên `maxLength={200}` (`apps/web/src/components/schedule/org-event-modal.tsx:161`), ô ghi chú `maxLength={600}` (`apps/web/src/components/schedule/org-event-modal.tsx:220`) trong khi schema chặn 100/500 (`packages/api/src/event-contracts.ts:3-5`). Không có comment giải thích (các comment khác trong file đều có).
- **Câu hỏi:** chủ ý để trình duyệt không cắt ngầm và lỗi inline ("Tên sự kiện cần 2–100 ký tự.") kịp hiện, hay số liệu chưa khớp cần hạ về 100/500?
- **Nhãn:** 🟡

### OQ-4 — Ưu tiên/độ phủ vai trò của tính năng này
- **Bằng chứng:** plan TOS-14 ghi `priority: P1` (`plans/261026-2018-tos-14-schedule-views-and-events/plan.md:5`); code không chứa metadata ưu tiên; PDR không nhắc Lịch dạy (grep rỗng trên `docs/project-overview-pdr.md`).
- **Câu hỏi:** xác nhận lại mức ưu tiên P1 cho feature khi đưa vào SRS chính thức (P0 cho phần xem lịch, P1/P2 cho phần còn lại là phán định BA trong Mục 3/4).
- **Nhãn:** 🟡

### OQ-5 — Có cần cảnh báo trùng khung giờ khi tạo sự kiện?
- **Bằng chứng:** thiết kế D4 ghi rõ sự kiện không chặn trùng giờ với ca học (`plans/261026-2018-tos-14-schedule-views-and-events/plan.md:53`); server cũng không kiểm trùng (`apps/server/src/routes/events.ts:47-60`).
- **Câu hỏi:** khi org có nhiều sự kiện + ca học, người dùng có muốn gợi ý "khung giờ này đã có ca học" (chỉ cảnh báo, không chặn) không?
- **Nhãn:** 🟡

### OQ-6 — Số lượng sự kiện/tần suất: có cần trần tổ chức?
- **Bằng chứng:** POST không có trần số lượng dòng `org_event` theo org (`apps/server/src/routes/events.ts:47-60`); snapshot tải toàn bộ dòng của org mỗi lần (`apps/server/src/routes/snapshot.ts:96-106`).
- **Câu hỏi:** có cần trần mềm (vd. giới hạn số sự kiện/tháng) để bảo vệ kích thước snapshot không, hay tin vào quy mô thực tế?
- **Nhãn:** 🟡

## Gaps (thứ code KHÔNG có — đã tìm chủ động)

### Gap-1 — Không có chức năng sửa sự kiện (PUT/PATCH)
- **Negative search:** grep `PUT\|PATCH` trong `apps/server/src/routes/events.ts` → 0; grep `updateEvent|editEvent` trong `apps/web/src` → 0 (chỉ `createEvent`/`deleteEvent` tại `apps/web/src/lib/repos/events.ts:55,96`).
- **Ảnh hưởng:** nhập nhầm phải xóa-tạo-lại (→ OQ-1). Nhãn: 🟡

### Gap-2 — Không có GET /api/events (đọc riêng)
- **Negative search:** route chỉ đăng ký `post("/")` và `delete("/:id")` (`apps/server/src/routes/events.ts:34,65`); dữ liệu đọc duy nhất qua mảng `events` trong snapshot `/api/kernel` (`apps/server/src/routes/snapshot.ts:732`).
- **Ảnh hưởng:** mọi nguồn đọc khác (nếu sau này cần: thông báo, portal) phải đi qua snapshot. Nhãn: ✅ (thực tế mã hóa, không phải thiếu sót)

### Gap-3 — Sự kiện không có trạng thái, không lặp, không người tham dự, không thông báo
- **Negative search:** schema chỉ 9 cột, không `status`/`recurrence`/`attendees` (`packages/db/src/schema/org-event.ts:9-27`); không có bảng phụ sự kiện; plan non-goals (`plans/261026-2018-tos-14-schedule-views-and-events/plan.md:58-63`).
- **Ảnh hưởng:** state machine của thực thể rất ngắn (xem `srs/schedule-reverse-states.md`). Nhãn: ✅

### Gap-4 — Ứng dụng học viên/admin không thấy sự kiện
- **Negative search:** `grep -rn "orgEvent|org-event|/api/events" apps/student/src apps/admin/src` → rỗng.
- **Ảnh hưởng:** sự kiện là tài liệu nội bộ giáo viên; nếu sau này học viên cần thấy (vd. lịch thi) thì phải mở hợp đồng. Nhãn: ✅

## Conflicts (mâu thuẫn với doc chính / đặt tên)

### Conflict-1 — PDR "ghi xong refetch snapshot" vs thực tế sự kiện "vá cache tại chỗ"
- **PDR:** "Kernel writes are POST-only JSON commands; the client refreshes the snapshot after each write" (`docs/project-overview-pdr.md:18`).
- **Code:** sự kiện cố ý KHÔNG đi qua command bus và client KHÔNG refetch — vá mảng `events` trong cache `['kernel']` từ response (`apps/web/src/lib/repos/events.ts:1-6,31-52`); test chặt chẽ không cho phép refetch (`apps/web/src/routes/_auth/schedule.test.tsx:698-703`); route vẫn mount dưới kernel tree để dùng chung CSRF guard (`apps/server/src/routes/kernel.ts:3509-3514`).
- **Đề xuất:** cập nhật PDR với carve-out (giống cách PDR đã carve-out "persist-vs-derive" cho tuitionFee) — `/cr`. Nhãn: ✅ hai vế đều cite được

### Conflict-2 — Trùng tên "events" hai khái niệm trong web app
- `data.events` = sự kiện vận hành (`org_event`, TOS-14) dùng trong các file lịch; nhưng `billing-timeline-drawer` cũng có `data?.events` = sự kiện dòng tiền thanh toán (`apps/web/src/components/debts/billing-timeline-drawer.tsx:68,104`; schema khác `billingTimelineEventSchema` tại `packages/api/src/contracts.ts:4076`).
- **Ảnh hưởng:** chỉ rủi ro hiểu nhầm khi đọc code; không sai hành vi (hai nguồn dữ liệu khác tên trường snapshot? — cùng tên trường `events` trong scope component khác nhau). Nhãn: 🔵

## Inferred (suy đoán có hậu thuẫn ≥2 chỗ trong code)

### Inf-1 — Sự kiện vận hành chỉ phục vụ màn Lịch dạy của giáo viên
- `data.events` chỉ được tiêu thụ trong `apps/web/src/routes/_auth/schedule.tsx:196`, `apps/web/src/components/schedule/schedule-{month,day,week}-view.tsx`, `apps/web/src/lib/schedule-{day,month}.ts`, `apps/web/src/lib/repos/kernel.ts:385`; apps student/admin không tham chiếu (Gap-4). 🔵

### Inf-2 — Thứ tự hiển thị chuẩn của dữ liệu lịch là (ngày, giờ, id)
- Server sắp theo (date, startTime, id) khi tải snapshot (`apps/server/src/routes/snapshot.ts:100-105`); client vá cache cũng sắp lại theo đúng bộ này (`apps/web/src/lib/repos/events.ts:43-48`); sort trong cột tuần theo (startTime, id) (`apps/web/src/components/schedule/schedule-week-view.tsx:91-95`). 🔵

### Inf-3 — "Ngày" của sự kiện là ngày lịch nguyên vẹn, không có khái niệm nửa ngày/đêm khuya qua ngày
- Schema chỉ có 1 cột `date` + startTime/endTime HH:mm (`packages/db/src/schema/org-event.ts:17-19`); phép kiểm chỉ bảo đảm `endTime > startTime` trong cùng ngày (`packages/api/src/event-contracts.ts:43-45`); mọi hiển thị group theo `event.date` (`apps/web/src/lib/schedule-day.ts:143-144`). 🔵
