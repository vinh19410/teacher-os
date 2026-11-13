# reverse-gaps — notifications-teacher

Quy ước: mỗi 🟡 trong spec phải có 1 OQ ở đây. Mã OQ dùng xuyên suốt corpus (UC, spec, flows). Phần cuối là negative-search đã CHẠY THẬT (lệnh + kết quả) cho các khẳng định "không tồn tại".

## Bảng OQ

### OQ-01 — Cột Priority (FR/NFR) và Severity (ma trận lỗi) là phân loại của nhà phân tích

- 🟡 đụng: mọi dòng FR/NFR (cột Priority) và mọi dòng E (cột Severity).
- Bằng chứng đã có: code/test chỉ chứa hành vi + wording, không chứa mức ưu tiên P0/P1 hay mức độ nghiêm trọng.
- Câu hỏi mở: Thứ tự ưu tiên nào khớp backlog thật của trung tâm — ví dụ "Gửi lại tất cả mục lỗi" (FR-14) có phải tính năng được chờ nhất không, hay ưu tiên nằm ở độ tin cậy gửi (FR-16/17)?

### OQ-02 — Mục tiêu nghiệp vụ của màn nhật ký: đối soát để ra quyết định gì?

- 🟡 đụng: mục tiêu UC-01/02/03/06, BR nhóm đối soát, Success Metrics.
- Bằng chứng đã có: screen title "Nhật ký gửi thông báo (Email & In-app)" (index.tsx:351); kế hoạch TOS-21 D8 "màn dùng chung cho toàn org"; các wording empty-state ("Chưa có thông báo nào" index.tsx:379-387).
- Câu hỏi mở: GV dùng màn này với tần suất/ao nào — chỉ xử lý lỗi gửi (đã rõ qua UC-04/05), hay còn đối soát định kỳ "đã nhắc đủ lớp chưa" (định lượng nào coi là đủ)? Điều này quyết định có cần xuất CSV/thống kê theo lớp không.

### OQ-03 — Ranh giới 2 bề mặt thông báo: có kế hoạch hợp nhất `notif` (chuông topbar) với nhật ký `notification_record`?

- 🟡 đụng: FR-01 (phạm vi màn [5]), BR-13, phần ranh giới Mục 0.
- Bằng chứng đã có: 2 bảng schema khác nhau (`notif` packages/db/src/schema/notif.ts:11-26, chỉ holidays.ts:594,970 ghi; `notification_record` packages/db/src/schema/notification-record.ts:19-72, GHI duy nhất tại enqueue.ts:73 — NEG-5); màn /notifications không đọc snapshot `notifs` (NEG-4 exit 1).
- Câu hỏi mở: Về product, chuông topbar hiện chỉ phản ánh nghỉ lễ; có chủ đích chuyển dần sang dòng notification_record (thống nhất 1 nguồn) hay giữ 2 bề mặt song song vĩnh viễn?

### OQ-04 — Zalo OA có phải kênh thông báo trong lộ trình không?

- 🟡 đụng: BR-13 (chỉ 2 kênh), E ranh giới.
- Bằng chứng đã có: notification queue chỉ email + in_app (enqueue.ts:59 chỉ ghi "email,in_app"|"in_app"; NEG-1 exit 1 — không chữ "Zalo" nào trong feature files); "Zalo OA" chỉ xuất hiện ở reportCreateSchema `channel: z.enum(["Zalo OA", "Email"])` (contracts.ts:1308, báo cáo phụ huynh #173 — metadata only) và settings preferred_channel "Zalo trước, email dự phòng" (migrations/0016_real_butterfly.sql:13, feature khác).
- Câu hỏi mở: settings đã đặt ưu tiên "Zalo trước" từ sớm — khi nào Zalo trở thành kênh gửi thật của notification_record (schema channels sẽ cần giá trị mới, deliver cần provider Zalo)?

### OQ-05 — Vòng đời dữ liệu: nhật ký không bao giờ bị xóa/archived?

- 🟡 đụng: NFR-05 (dung lượng), BR-13.
- Bằng chứng đã có: app code không có DELETE nào trên notification_record; migration 0060_study_pack.sql:1 có DELETE WHERE event_type = 'self_study_released' (S30) — NEG-3 cũ exit 1 do pattern không khớp tên bảng bọc backtick; total chỉ dùng hiển thị "trên N dòng" và phân trang, không cắt theo thời gian (notification-logs.ts:96-102, 141-152).
- Câu hỏi mở: D1 (Cloudflare SQLite) có giới hạn thực tế — có cần chính sách aging (vd ẩn dòng > N tháng) trước khi bảng phình? Mốc nào coi là cần làm?

### OQ-06 — i18n: toàn bộ wording màn + toast là chuỗi Việt hard-code

- 🟡 đụng: ràng buộc màn hình, NFR.
- Bằng chứng đã có: NEG-2 (find + grep exit 1) — không có file i18n/locale/messages, không dùng useTranslation/i18next/react-i18next trong apps/web/src, apps/server/src, packages/api/src; nhãn nằm trực tiếp trong index.tsx (EVENT_TYPE_LABELS 116-124, CHANNEL_LABELS 126-130, toast 147-168).
- Câu hỏi mở: Nếu yêu cầu đa ngôn ngữ (phụ huynh quốc tế?), tách catalog cho notification trước hay chờ chuẩn chung toàn app?

### OQ-07 — `studentOrigin` luôn lấy origin học viên ĐẦU TIÊN

- 🟡 đụng: FR-17 (link tuyệt đối trong email), BR-04.
- Bằng chứng đã có: apps/server/src/index.ts:165-168 `studentOrigin: parseCORSOrigins(env.STUDENT_ORIGINS)[0]` kèm comment "origin cổng học viên đầu tiên"; allowedOrigins ở kernel chấp nhận nhiều origin (kernel.ts:176-184) nhưng link trong thư chỉ dựng từ 1 origin.
- Câu hỏi mở: Có deployment nào cấu hình nhiều origin học viên không? Nếu có, link trong email nên theo origin nào (org? học viên?).

### OQ-08 — Quy ước mã lỗi sentinel `E-selfomy-alignment-010`

- 🟡 đụng: E-10, NFR (quan sát được).
- Bằng chứng đã có: deliver.ts đặt literal "E-selfomy-alignment-010" khi hết 3 lượt (deliver.ts:47-52); web tự parse tiền tố "E-010:" (notification-error.ts:14-20); kế hoạch TOS-22 dùng đúng chuỗi này.
- Câu hỏi mở: Tên mã mang dấu vết dự án khác ("selfomy") — có cần đổi tên theo convention repo (vd E-notification-retry) không, hay giữ vì web đã phụ thuộc tiền tố "E-010:"?

### OQ-09 — Phân trang chỉ Trang trước/Trang sau: có cần nhảy trang/xuất dữ liệu cho đối soát số lượng lớn?

- 🟡 đụng: UC-02, NFR-04 (phản hồi), Success Metrics.
- Bằng chứng đã có: PAGE_SIZE 20 cứng 2 phía (notification-logs.ts:26, repos/notifications.ts:17); điều khiển chỉ có "Trang trước"/"Trang sau" + dòng "Trang {page} / {pageCount} · {total} thông báo" (index.tsx:556-595); không có tham số page-size hay export (NEG-6 không thấy polling/export; contracts notificationLogQuerySchema chỉ q/event/status/page — contracts.ts:3946-3952).
- Câu hỏi mở: Với org trên ~1.000 dòng/tháng, đối soát "quý danh nào chưa nhắc" bằng cách lọc q là đủ hay cần export?

## Negative-search đã chạy thật

Môi trường: `grep` trong máy này là ugrep-wrapped nên luôn thêm `--exclude-dir=node_modules --exclude-dir=dist`. Chạy lại ngày 2026-11-12 tại working tree develop (bằng chứng = bằng chứng d6c0f6b5, 4 file chính identical — xem _evidence.md).

### NEG-1 — Không có "Zalo" trong phạm vi feature notifications

Lệnh:

```bash
grep -rn "Zalo" apps/server/src/lib/notifications apps/server/src/routes/notification-logs.ts packages/db/src/schema/notification-record.ts apps/web/src/routes/_auth/notifications packages/db/src/migrations/0048_small_champions.sql --exclude-dir=node_modules --exclude-dir=dist
```

Kết quả: exit 1 — 0 dòng khớp. Đối chiếu ngoài phạm vi: `grep -rln "Zalo" apps/server/src apps/web/src packages ...` trả về các file feature KHÁC (public-pay.ts, leads, reports, students/$studentId.tsx, kernel.test.ts, migrations/0016_real_butterfly.sql:13, contracts.ts reportCreateSchema:1308) — xác nhận Zalo chỉ thuộc báo cáo phụ huynh + settings, không thuộc hàng đợi thông báo.

### NEG-2 — Không có hạ tầng i18n

Lệnh:

```bash
find apps/web/src apps/server/src packages/api/src \( -iname '*i18n*' -o -iname '*locale*' -o -iname '*messages*' \)
grep -rn "useTranslation|i18next|react-i18next" apps/web/src apps/server/src packages/api/src --exclude-dir=node_modules --exclude-dir=dist
```

Kết quả: find in ra 0 dòng (exit 0 vì lệnh chạy ok, không có file khớp); grep exit 1 — 0 khớp. → Wording màn/toast là literal tiếng Việt trong source (R2 thỏa: không có catalog để trích).

### NEG-3 — App code không có cơ chế xóa/aging notification_record

Lệnh:

```bash
grep -rnE "delete\(notificationRecord|DELETE FROM .?notification_record" apps/server/src packages/db --exclude-dir=node_modules --exclude-dir=dist
```

Kết quả: 1 khớp — packages/db/src/migrations/0060_study_pack.sql:1 (DELETE WHERE event_type = 'self_study_released' — S30, dọn event_type đã gỡ khỏi schema); app code 0 khớp. Danh sách file đụng `notificationRecord` (grep -rln) chỉ gồm đọc (student.ts, notification-logs.ts, kernel.ts, deliver.ts, requeue.ts), GHI (enqueue.ts) và test — không file nào xóa.

### NEG-4 — Màn /notifications KHÔNG dùng feed snapshot `notifs`

Lệnh:

```bash
grep -n "notifs" apps/web/src/routes/_auth/notifications/index.tsx apps/web/src/lib/repos/notifications.ts --exclude-dir=node_modules --exclude-dir=dist
```

Kết quả: exit 1 — 0 khớp. Màn chỉ dùng query key `["kernel","notification-logs",...]` (repos/notifications.ts:20-23) → xác nhận ranh giới với chuông topbar (notif-panel.tsx dùng useData().notifs).

### NEG-5 — NƠI GHI duy nhất của notification_record là enqueue.ts

Lệnh:

```bash
grep -rn "insert(notificationRecord" apps/server/src --exclude-dir=node_modules --exclude-dir=dist
```

Kết quả: đúng 1 dòng — apps/server/src/lib/notifications/enqueue.ts:73 `.insert(notificationRecord)`. Mọi route nghiệp vụ (kernel.ts 653/1228/3464, grading.ts:1116, assignments/index.ts:184, holidays.ts:659, debt-reminders) đều đi qua enqueueNotifications.

### NEG-6 — Không có realtime/polling trên màn nhật ký

Lệnh:

```bash
grep -rn "EventSource\|WebSocket\|refetchInterval\|setInterval" apps/web/src/routes/_auth/notifications apps/web/src/lib/repos/notifications.ts --exclude-dir=node_modules --exclude-dir=dist
```

Kết quả: exit 1 — 0 khớp. Cập nhật dữ liệu chỉ qua `invalidateQueries({ queryKey: notificationLogsAllQueryKey })` sau resend (index.tsx:231, 254) và refetch khi đổi filter/URL.

## Khoảng trống không thể đảo ngược bằng code (đã ghi OQ tương ứng)

- "Vì sao" các quyết định TOS-21/22/23 đã có trong plan (D1-D9, D1-D8, D1-D7) → phần lớn why là ✅ theo plan; những what-if tương lai (Zalo, aging, i18n, multi-origin, export) là 🟡 + OQ-04..09.
- Số liệu sử dụng thực tế (tần suất GV mở màn, tỉ lệ lỗi gửi thật) không có trong repo → Success Metrics đặt theo AC e2e + wording, không đo được → OQ-02.
