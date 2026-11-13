---
type: reverse-gap-log
feature: placement-test
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# Gaps, OQ và negative-search — feature `placement-test`

> Quy ước nhãn: ✅ = có code minh họa kèm path:line; 🔵 = suy luận từ ≥2 bằng chứng (liệt kê đầy đủ ở reverse-sources.md / _evidence.md); 🟡 = chưa rõ, phải có OQ tương ứng trong reverse-gaps.md. Mỗi mệnh đề mang nhãn riêng; không nâng 🟡 lên ✅ nếu không có code.

## 1. Câu hỏi mở (OQ)

| OQ | Câu hỏi | Bằng chứng dẫn tới câu hỏi | Nhãn |
|----|---------|----------------------------|------|
| OQ-01 | Có cần chức năng gỡ/hủy phát hành (unpublish) để đưa trang về bảo trì không? Hiện chỉ có cách xoá dòng DB thủ công. | Không có endpoint unpublish; publish chỉ tăng version; e2e phải DELETE FROM placement_test để reset. | 🟡 |
| OQ-02 | Có cần lịch sử phiên bản đề (xem/rollback về vN cũ) không? Hiện chỉ lưu snapshot mới nhất + số version tăng. | apps/server/src/routes/placement-test.ts:481-506 chỉ ghi đè cột published. | 🟡 |
| OQ-03 | Đáp án đúng nằm trong payload công khai (chấm phía client) — mức chấp nhận rủi ro này là bao nhiêu? Học viên xem source là biết hết đáp án. | packages/api/src/placement-test-contracts.ts:447-514 trả cả `answer`; grading.js:49-110 dùng nó; plan #515 D7 chọn thiết kế này. | 🟡 |
| OQ-04 | GV tổ chức thường (không phải lead org) soạn đề mà trang công khai không bao giờ dùng đề đó — chỉ có cảnh báo text; có nên chặn soạn luôn không? | apps/web/src/routes/_auth/placement-test/index.tsx:476-490 chỉ warning; API vẫn cho lưu. | 🟡 |
| OQ-05 | Giới hạn lượt nghe chỉ thi hành bằng localStorage phía client — người dùng xóa dữ liệu trang là nghe lại vô hạn; có cần server đếm lượt không? | apps/profile/public/kiem-tra-dau-vao/test.js:1302-1337; không có API báo lượt nghe. | 🟡 |
| OQ-06 | Thang điểm chỉ đếm số câu đúng (mỗi câu 1 điểm) — có cần trọng số theo phân loại/cấp độ để xếp lớp chính xác hơn không? | apps/profile/public/kiem-tra-dau-vao/grading.js:49-110. | 🟡 |
| OQ-07 | Bài làm dở lưu localStorage máy đó — học viên đổi máy/điện thoại là mất tiến trình; có cần lưu server không? | apps/profile/public/kiem-tra-dau-vao/test.js:17,145-238. | 🟡 |
| OQ-08 | Chưa có ràng buộc/hướng dẫn chất lượng audio (bitrate, thời lượng đoạn nghe); chỉ giới hạn 20 MB và MIME. | packages/api/src/placement-test-contracts.ts:29; apps/server/src/routes/placement-test.ts:285-303. | 🟡 |
| OQ-09 | 30 câu gốc chia đều phần — số câu tối thiểu mỗi phần để kết quả CEFR đáng tin cậy là bao nhiêu? Validate chỉ yêu cầu ≥1 câu mỗi phần. | packages/api/src/placement-test-contracts.ts:299-320. | 🟡 |
| OQ-10 | Đồng bộ điểm vào lead dùng sendBeacon/keepalive — nếu trình duyệt chặn hoặc người dùng đóng tab ngay, có cơ chế gửi lại nào không? | apps/profile/public/kiem-tra-dau-vao/test.js:1483-1519. | 🟡 |

## 2. Negative-search (R3) — lệnh thật, kết quả thật

| # | Khẳng định | Lệnh đã chạy | Kết quả | Kết luận |
|---|-----------|--------------|---------|----------|
| N-01 | Không có rate-limit/throttle trên 2 GET công khai của feature | `grep -rniE "rate|429|limit" apps/server/src/routes/public-placement-test.ts apps/server/src/routes/placement-test.ts` | 0 dòng khớp | Không gắn cờ throttle; ghi nhận như khoảng trống đã chấp nhận trong plan #515 (non-goal). 🔵 |
| N-02 | (đếm N-01 ở trên) | — | — | — |
| N-03 | Không có placement-test nào trong apps/admin và apps/student | `grep -ril --exclude-dir=node_modules --exclude-dir=dist "placement" apps/admin apps/student` | rỗng (không exclude-dir, ugrep trả 21 file node_modules/dist) | Tính năng chỉ ở apps/web + apps/server + apps/profile. 🔵 |
| N-04 | Không có endpoint unpublish/rollback/xóa đề | `grep -rniE "unpublish|rollback|delete" apps/server/src/routes/placement-test.ts apps/server/src/routes/public-placement-test.ts` | chỉ thấy delete trong GC audio mồ côi và discardObject khi upload lỗi | Kết luận BR-05/OQ-01. 🔵 |
| N-05 | Không có catalog i18n cho feature | `find apps/web/src apps/profile -iname "*i18n*" -o -iname "*locale*" -o -iname "*translation*"` (ngoài node_modules) | rỗng | Chuỗi UI viết trực tiếp trong nguồn. 🔵 |
| N-06 | (đếm N-05 ở trên) | — | — | — |
| N-07 | Không có skip/only/todo trong 7 file test feature | đếm regex `^\s*(test|it)\.(skip|only|todo)` và `\.skip\(` trên 7 file | 0 | Số liệu R1 đáng tin. ✅ |
| N-08 | Không có transcript cho audio (chữ kèm đoạn nghe) | `grep -rni "transcript" apps/web/src/components/placement-test packages/api/src/placement-test-contracts.ts apps/profile/public/kiem-tra-dau-vao` | rỗng | Không có tính năng transcript. 🔵 |
| N-09 | Đề công khai không có cơ chế nén/etag riêng | đọc toàn bộ S06 (174 dòng) | chỉ có no-cache; không etag | FR-25 đúng như mã hóa. 🔵 |
| N-10 | Không có migration nào khác tạo/sửa 2 bảng placement | `grep -rl --include="*.sql" "placement_test" packages/db/src/migrations` | chỉ 0058 (không --include, còn 11 file meta/*.json) | Lược đồ DB đúng như S01-S02. ✅ |

## 3. INF — suy luận có bằng chứng

| # | Suy luận | Bằng chứng 1 | Bằng chứng 2 | Nhãn |
|---|----------|--------------|--------------|------|
| INF-01 | ⌘K có mục "Bài test đầu vào" nhờ teacherNavForViewer lọc FINANCE_NAV_KEY_MAP, không cần khai báo riêng cho feature | apps/web/src/components/layout/sidebar.tsx:52-59,128-145 | apps/web/src/components/command-search/search-index.ts:179-191 | 🔵 |
| INF-02 | Media store dùng chung với library-audio (R2/kho đối tượng) nên audio placement lưu cùng hạ tầng, khóa riêng tiền tố `placement/` | apps/server/src/routes/placement-test.ts:322-323 | apps/server/src/app.ts deps getLibraryAudioStore; apps/server/src/routes/admin-library-audio.test.ts dùng cùng MediaStore | 🔵 |
| INF-03 | Trang học viên được host tĩnh riêng (build thay meta API) nên origin khác với API; đây là lý do CORS tường minh | apps/profile/build.mjs:20; apps/profile/serve.mjs:32-39,140-145 | apps/server/src/app.ts:399-405 | 🔵 |
| INF-04 | Hành trình "bảo trì" là trạng thái nghiệp vụ cố ý: chưa phát hành, thiếu cấu hình, hoặc API lỗi đều hiển thị cùng màn hình và không phá bài dở | apps/profile/public/kiem-tra-dau-vao/test.js:316-350,1646-1671 | apps/e2e/specs/placement-test-editor.spec.ts:74-97,261-283 | 🔵 |
| INF-05 | Lệnh "Nhập đề gốc" là công cụ nội bộ ban đầu (seed cố định 30 câu) chứ không phải import đề tùy ý; file nằm trong public của apps/web | apps/web/src/routes/_auth/placement-test/index.tsx:334-415 | apps/web/public/placement-seed/questions.json | 🔵 |

## 4. GAP / CF

| # | Loại | Mô tả |
|---|------|-------|
| GAP-01 | GAP | Không tìm thấy tài liệu nghiệp vụ gốc (SRS/tài liệu sản phẩm) cho feature trong repo; toàn bộ tài liệu này dựng từ code. 🟡 |
| CF-01 | Confidence | Khối server + web editor có độ tin cậy cao (code + test + e2e dày); khối trang học viên tin cậy cao về hành vi nhưng một số ngưỡng nghiệp vụ (OQ-05/06/09) là lựa chọn thiết kế chưa có tài liệu giải thích. 🔵 |
