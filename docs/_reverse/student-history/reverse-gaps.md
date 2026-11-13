---
feature: student-history
type: reverse-gaps
status: draft
author: vinh19410
updated: "2026-11-12"
source_commit: "develop d6c0f6b5"
---

# Khoảng trống và câu hỏi mở — student-history

## 1. OQ — câu hỏi mở nghiệp vụ (cần chủ sản phẩm/giáo dục trả lời)

| ID | Câu hỏi | Bằng chứng hiện có | Vì sao code không trả lời được |
|----|---------|--------------------|--------------------------------|
| OQ-01 | Tràn giới hạn quét (500 attempt/nguồn, 2000 nhóm ngày từ vựng) cắt dữ liệu im lặng — cần tín hiệu "chưa đầy đủ" không? | apps/server/src/routes/student-history.ts:85-86, apps/server/src/routes/student-history.ts:210 | Chỉ có hằng số, không có nhánh báo thiếu |
| OQ-02 | Vì sao phiên học từ (learn) không tính vào lịch sử? | apps/server/src/routes/student-history.ts:202-204 (comment "vòng Learn … không tính là \"ôn từ vựng\" trên lịch sử") | Comment nói "cái gì" không nói "vì sao"; không tài liệu |
| OQ-03 | Chuỗi ngày liên tiếp: chuẩn nào là chính — client 2 tháng hay server toàn nhật ký (khác nhau về phiên học được tính)? | apps/student/src/routes/_auth/history.tsx:96-118; apps/server/src/routes/vocab.ts:603-611 | Hai bề mặt hiển thị hai con số, không có quy tắc thống nhất trong code |
| OQ-04 | Attempt trỏ đề đã xoá KHÔNG vào lịch sử (dòng bị loại) — chấp nhận mất dòng lịch sử hay cần giữ với nhãn riêng? | apps/server/src/routes/student-history.ts:251-253 | Comment mô tả hành vi loại-bỏ, không có chính sách nghiệp vụ |
| OQ-05 | Lọc bài lớp theo `available_at` tại thời điểm đọc: bài nộp trước khi tới hạn rơi khỏi lịch sử — đúng nghiệp vụ? | apps/server/src/routes/student-history.ts:312; apps/server/src/lib/assignment-visibility.ts:9-16 | Không test, không comment lý do |
| OQ-06 | Thời lượng không có trần — phiên mở qua đêm phình phút; cần trần? | apps/server/src/routes/student-history.ts:113-118 | Chỉ kẹp âm, không trần trên |
| OQ-07 | Ô đếm "N bài" trộn lượt nộp và số thẻ từ — thông điệp cho học viên? | apps/server/src/routes/student-history.ts:352-355; apps/student/src/components/history/month-heatmap.tsx:90 | Quy ước chỉ nằm trong comment dev |
| OQ-08 | Grammar gộp vào Writing: người học Grammar mất nhãn riêng — chấp nhận? | apps/server/src/routes/student-history.ts:158-180 (#533) | Comment ghi "HISTORY_SKILLS giữ 5 dòng (#533)", không ghi ý định nghiệp vụ |
| OQ-09 | Entry `graded` không phải Writing không có nút xem lại — chủ ý? | apps/student/src/components/history/history-list.tsx:39-46 | Điều kiện `canReview` chỉ chặn, không ghi lý do |
| OQ-10 | Bài tự chấm tổng 0 câu hiện "N/0" (nhánh Writing có chặn, nhánh thường không) — hiển thị đúng? | apps/server/src/routes/student-history.ts:131-134 so với 154-155 | Chênh lệch guard giữa hai nhánh chưa được giải thích |
| OQ-11 | Nút lịch sử tải cả trang 20 entry chỉ để lấy tổng — cần endpoint đếm riêng? | apps/student/src/routes/_auth/practice/$skill.tsx:61-68; packages/api/src/contracts.ts:2305 | Không ghi nhận yêu cầu hiệu năng |
| OQ-12 | Định nghĩa nghiệp vụ chính thức của chuỗi ngày liên tiếp (điều kiện tối thiểu mỗi ngày? phần thưởng?) | apps/student/src/routes/_auth/history.tsx:104-111 | Chỉ có vòng lặp, không có spec |
| OQ-13 | `docs/srs-spec.md` §5 (hợp đồng nhật ký từ vựng: idempotency, snapshot) không còn trong repo — phục hồi nguồn nào? | packages/db/src/schema/vocab.ts:126-132 (comment trỏ tới file vắng mặt) | Tài liệu bị xoá/mất, comment còn trỏ |
| OQ-14 | Trang `/history` chưa có test riêng (thẻ thống kê, streak, cổng lỗi) — kế hoạch che phủ? | Kiểm chứng âm NEG-05 (`_evidence.md`) | Không thấy test, không thấy ghi nhận kế hoạch |

## 2. GAP — khoảng trống chứng chứng thực (điều đã kiểm, không phải câu hỏi)

- **GAP-1** Không có bảng/migration riêng cho lịch sử: tìm `student_history|history_day|history_entry` trong `packages/db/src/schema/` và thư mục migration → 0 kết quả (NEG-01). Kết luận read-model chỉ là suy luận nhiều bằng chứng (INF-1), không phải khai báo tường minh.
- **GAP-2** Không tìm thấy tài liệu đặc tả gốc của phase 11 (#378) trong `docs/`; `reverse-plan.json` ghi `existing_doc: null` (docs/_reverse/reverse-plan.json:424-433). Mọi "ý định thiết kế" của phase này chỉ suy được từ comment code + test.
- **GAP-3** Không tìm thấy consumer khác của các endpoint lịch sử ngoài app học viên: tìm khoá truy vấn trên toàn workspace → chỉ 4 file (NEG-03).
- **GAP-4** Không tìm thấy invalidation cache sau khi nộp bài: tìm `invalidateQueries` + "history" → 0 kết quả (NEG-02). Cơ chế cập nhật duy nhất là staleTime 30s + refetch khi nạp trang.
- **GAP-5** Comment "caller chưa mount" ở apps/student/src/components/practice/history-button.tsx:6-8 đã sai so với code hiện tại (component được mount tại apps/student/src/routes/_auth/practice/$skill.tsx:118-126) — dấu vết giai đoạn chuyển tiếp giữa 2 phase, không có bản ghi nào giải thích.
- **GAP-6** Không tìm thấy i18n catalog: tìm `useTranslation|i18next` trong `apps/student/src` → 0 kết quả (NEG-04). Mọi chuỗi hiển thị là literal tại component (quy tắc R2 của bộ tài liệu này).
- **GAP-7** Comment ở apps/server/src/routes/student-history.ts:120-156 cho thấy nhánh Writing có chặn "điểm thành phần > 0" còn nhánh thường không — không tìm thấy test hay comment nào giải thích chênh lệch (liên quan OQ-10).

## 3. INF — suy luận nhiều bằng chứng (mỗi suy luận ≥ 2 bằng chứng độc lập)

- **INF-1** Lịch sử là read-model thuần, không ghi DB. Bằng chứng: (a) cả 3 route chỉ GET, thân hàm không có INSERT/UPDATE — apps/server/src/routes/student-history.ts:404-411; (b) không có bảng/migration lịch sử — NEG-01; (c) kế hoạch ghi phase 11 dữ liệu suy ra — docs/_reverse/reverse-plan.json:424-433.
- **INF-2** Ưu tiên đúng ngày VN hơn đơn giản hiệu năng: (a) hàm ngày VN dùng Intl Asia/Ho_Chi_Minh — packages/api/src/vietnam-date.ts:8-20; (b) SQL gom ngày cộng `+7 hours` — apps/server/src/routes/student-history.ts:182-184; (c) test biên 16:30Z/17:30Z — apps/server/src/routes/student-history.test.ts:399-436.
- **INF-3** Thống nhất nhãn chờ chấm cho cả practice và assignment là quyết định UX sau #478 (TOS-30): (a) comment "nhãn chờ chấm thống nhất \"Đã nộp — Đang chờ giáo viên chấm\"" — apps/student/src/components/history/history-list.tsx:14-16; (b) test khẳng định cả hai loại cùng nhãn, practice không còn nhãn riêng — apps/student/src/components/history/history-list.test.tsx:91-107.
- **INF-4** Phân trang danh sách chủ ý làm trong bộ nhớ vì dữ liệu nhỏ có giới hạn: (a) cửa sổ cố định từ 2020-01-01 + slice trong JS — apps/server/src/routes/student-history.ts:526-545; (b) giới hạn quét 500/nguồn — apps/server/src/routes/student-history.ts:85-86; (c) không LIMIT/OFFSET trong SQL danh sách.

## 4. CF — xung đột dữ liệu giữa nguồn

Không phát hiện xung đột: các nguồn (route, client, hợp đồng, test, e2e) nhất quán về enum `auto|graded|awaiting`, kích thước trang 20, cửa sổ 7 ngày, giới hạn quét và chuỗi hiển thị. Điểm gần xung đột duy nhất là hai cách tính chuỗi ngày liên tiếp (BR-11) — đã xếp loại 🔵 và mở OQ-03, không phải mâu thuẫn hợp đồng.

## 5. Quy tắc xử lý 🟡

Mọi mệnh đề 🟡 trong bộ tài liệu này ánh xạ 1-1 sang OQ ở Mục 1 (BR-03→OQ-02, BR-09→OQ-05, BR-10→OQ-04, BR-11→OQ-03, OQ-06/07/08/09/10/11/12/14 ở bảng trên). Không mệnh đề 🟡 nào được nâng thành ✅; không có OQ nào được trả lời thay chủ sản phẩm.
