---
feature: parent-reports
type: reverse-gaps
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# reverse-gaps — parent-reports

## OQ (câu hỏi mở — kèm 🟡 trong spec)

- **OQ-01.** Ý định hiện tại: bật lại khi nào, điều kiện gì (chờ Zalo OA thật?).
  Cụm hoãn từ #210 ("hoãn phát triển", giữ nguyên backend) — plans/260921-0347-hide-parent-reports-cluster/plan.md:8-22.
- **OQ-02.** Nguồn dữ liệu "Phụ huynh đã đọc": schema chừa cột `read` + trạng thái
  `read` nhưng không có nguồn ghi nào. Webhook Zalo OA có trong lộ trình không?
- **OQ-03.** "Số buổi" luôn 0 khi tạo (server ghi cứng 0) — ai/what sẽ điền? Tự đếm
  từ điểm danh?
- **OQ-04.** "Chu kỳ" chuỗi tự do (≤120 ký tự) — có cần cấu trúc tuần chuẩn để gom
  nhóm/truy vấn?
- **OQ-05.** Nháp không có vòng đời tiếp theo (không sửa/gửi tiếp/xóa) — nghiệp vụ
  có cần không?
- **OQ-06.** Option "Email" không gắn nhãn "chưa kết nối" như "Zalo OA (Chưa kết
  nối)" — mâu thuẫn tiềm ẩn với nguyên tắc trung thực #172.
- **OQ-07.** Mẫu báo cáo tuần (tpl_report trong bảng setting đã mộ #321): tính năng
  "Mẫu báo cáo" trong Cài đặt đã biến mất cùng trang Cài đặt — khi bật lại cụm, mẫu
  sống ở đâu?
- **OQ-08.** Nguồn giới hạn content 4000 / period 120 — có khớp giới hạn tin Zalo OA?
- **OQ-09.** Không xem lại nội dung báo cáo đã gửi — có cần màn chi tiết?
- **OQ-10.** Hướng dẫn bật lại trong plan #210 phần trang Cài đặt đã lỗi thời (trang
  đã bị xóa) — cần plan bật lại mới.

## Negative-search (R3 — mọi khẳng định "không có" đều kèm lệnh + kết quả)

1. **Cờ cụm chỉ điều khiển đúng 4 điểm gắn cờ.** Lệnh:
   `grep -rn "PARENT_REPORTS_ENABLED" --include="*.ts" --include="*.tsx" --include="*.js" . | grep -v node_modules`
   → 10 hit, gom vào: features.ts:7 (khai báo), sidebar.tsx:24,121, reports.tsx:13,17,
   $studentId.tsx:28,218,382 + 2 file test (sidebar.test.tsx:178 tên test,
   $studentId.reports.test.tsx:17 mock cờ BẬT). plans/docs không có hit (.md bị
   --include loại). Không có nơi nào khác đọc cờ.
2. **App học viên KHÔNG có báo cáo phụ huynh.** Lệnh:
   `grep -rniE "parent.?report|báo cáo|bao cao|/reports" apps/student/src --include="*.ts" --include="*.tsx"`
   → 0 hit. Tương tự apps/landing, apps/profile, apps/admin → 0 hit. (FR-16)
3. **Không có tích hợp gửi Zalo OA/Email thật trên server.** Lệnh:
   `grep -rniE "zalo.?oa|zalo_api|zaloclient" apps/server/src packages/ --include="*.ts" | grep -v dist | grep -v .test.`
   → chỉ contracts.ts:1308 (enum nhãn kênh) + dist (build). Không client Zalo, không
   webhook. (BR-05, OQ-02)
4. **Không có nguồn ghi cập nhật/xóa báo cáo.** Lệnh:
   `grep -rn "update(report)\|delete(report)" apps/server/src --include="*.ts"` → 0 hit;
   đọc reporting/index.ts:54-103 → chỉ GET list + POST create; test kernel.test.ts:2758-2768 xác nhận 404 cho PATCH là ở /api/notifs
   (notif), kèm assert report chèn tay vẫn đọc được — không có test PATCH trực tiếp
   lên /api/reports. (FR-15, BR-02, OQ-05)
5. **Trạng thái "read" và mốc đọc không có writer.** create luôn ghi `read: ""`
   (reporting/index.ts:94) và `status` chỉ nhận "draft" | "sent"
   (contracts.ts:1309); grep #4 cho thấy không endpoint cập nhật. → "Đã đọc" bất khả
   đạt ở hiện tại. (BR-02, OQ-02, SM-08)
6. **Không có gửi định kỳ/tự động.** Lệnh:
   `grep -rniE "cron|scheduled.*report|report.*schedul" apps/server/src --include="*.ts" | grep -v .test.`
   → 1 hit duy nhất ở exam-import/release-stale.ts (feature khác, về credit). (OQ-01)
7. **Không có i18n catalog cho web.** Lệnh:
   `find apps/web/src -name "*.json" -path "*locale*" -o -name "i18n*" -o -name "*translations*"`
   → rỗng; wording là literal trong TSX. (R2, NFR-08)
8. **Không có e2e nào đi tới /reports.** Lệnh:
   `grep -rn 'goto("/reports\|/reports"' apps/e2e/specs/*.spec.ts apps/e2e/*.ts` → các
   hit đều là đường lưu ảnh `plans/reports/...` (thư mục screenshot), không phải route.
   (GAP-1)
9. **Trang Cài đặt + mẫu báo cáo đã biến mất.** Lệnh:
   `ls apps/web/src/routes/_auth/settings.tsx` → không tồn tại;
   `grep -rn "tplReport\|tpl_report" apps/web/src --include="*.ts" --include="*.tsx"` → 0 hit.
   Plan #210 (plan.md:36, 42, 59-63) còn nhắc settings.tsx + settings.test.tsx — đã
   lỗi thời. (OQ-07, OQ-10)
10. **Không có điểm vào UI nào khác tới /reports.** Lệnh:
    `grep -rn '"/reports"' apps/web/src --include="*.ts" --include="*.tsx" | grep -v .test.`
    → đúng 3 hit: routes-matcher.ts:13 (SW allowlist), sidebar.tsx:120 (nav, bị cờ),
    sidebar.tsx:204 (bảng active-key, vô hại khi không điều hướng). (FR-01, FR-02)
11. **Web KHÔNG gọi GET /api/reports (danh sách luôn đi qua bản chụp kernel).** Lệnh:
    `grep -rn "api/reports" apps/web/src --include="*.ts" --include="*.tsx" | grep -v "\.test\."`
    → đúng 1 hit: apps/web/src/lib/repos/kernel.ts:184 (đường POST của lệnh
    create-report, không phải GET). Lệnh
    `grep -rnE "GET[^\"']*api/reports|api/reports[^\"']*GET" apps/web/src --include="*.ts" --include="*.tsx" | grep -v "\.test\."`
    → 0 hit. Trang đọc qua fetchKernelSnapshot → GET /api/kernel (kernel.ts:622-640).
    (FR-13, F2)

## GAP (khoảng trống chứng minh)

- **GAP-1.** Không có e2e cho cụm — mọi test là unit/integration jsdom hoặc test
  server. Khi flip cờ, không có smoke trình duyệt nào bảo vệ trang. (liên quan OQ-10)
- **GAP-2.** Nhánh 500 "xung đột ghi" (reporting/index.ts:97-99) là bảo vệ kiểu,
  không có test kích hoạt.
- **GAP-3 (R1).** Quét skip/todo/only/fails trong 5 file test của feature
  (S24-S29): `grep -n "\.skip\|\.todo\|\.only" ...` → 0 hit (chỉ có `it.each` hợp lệ
  ở modal test). Không test nào bị bỏ — mục này rỗng.
- **GAP-4.** `period` chỉ validate độ dài, không validate định dạng — dữ liệu chu kỳ
  tự do có thể loạn dạng mà không lỗi. (OQ-04)
- **GAP-5.** Khi tổ chức KHÔNG có học viên, modal vẫn mở với lựa chọn rỗng
  "Chưa có học viên" và chỉ chặn lúc bấm lưu — không có trạng thái vô hiệu hóa sớm.
- **GAP-6.** Không test nào cho KPI "Phụ huynh đã đọc" với giá trị > 0 (bất khả —
  xem negative-search #5); nhãn trạng thái "Đã đọc" cũng chưa từng render trong test.

## INF (suy luận nhiều bằng chứng — 🔵)

- **INF-1.** Cụm bị HOÃN chứ không phải CHƯA LÀM: (a) server route + bảng + hợp đồng
  hoàn chỉnh từ #173 (S16-S21, S24); (b) trang + modal + test đầy đủ (S2, S3, S25-S27);
  (c) plan #210 nói rõ "hoãn, không xóa, giữ backend để flip bật lại" (S33);
  (d) docs dự án gọi là "deferred feature cluster" (S31, S32).
- **INF-2.** UI trung thực về tích hợp (#172) là nguyên tắc thiết kế của trang:
  (a) hằng `isZaloConnected = false` kèm chú thích "prevent fake integration promises"
  (reports.tsx:38-42); (b) badge "Zalo OA: Chưa kết nối" + option "Zalo OA (Chưa kết
  nối)" (reports.tsx:81, create-report-modal.tsx:116); (c) test cấm claim "Gửi qua
  Zalo OA" khi chưa kết nối (reports.test.tsx:79-81).
- **INF-3.** Ghi báo cáo đi theo pattern "ghi → tải lại bản chụp, store không tự
  biến đổi": (a) reducer trả nguyên state cho create-report (data-store-reducer.ts:97-105);
  (b) result kinds refreshed/committed/definite-failure/outcome-unknown
  (repos/kernel.ts:393-421); (c) modal xử lý riêng từng kind, kể cả giữ nội dung khi
  lỗi (create-report-modal.tsx:53-69).
- **INF-4.** Trạng thái "Đã đọc" được THIẾT KẾ chừa sẵn nhưng chưa nối: (a) enum có
  "read" trong schema + hợp đồng (report.ts:6 và KernelReportRow contracts.ts:1899; hợp
  đồng tạo contracts.ts:1309 chỉ draft|sent); (b) UI map nhãn "Đã đọc" + KPI đếm mốc đọc (reports.tsx:24-33, 100-103);
  (c) nhật ký có nhánh "Phụ huynh đã mở {mốc}" (reports.tsx:52-54); (d) không nguồn
  ghi (negative-search #4, #5) — cả 3 nhóm bằng chứng UI đều chờ dữ liệu từ một
  nguồn chưa tồn tại.

## CF (xung đột dữ liệu)

- Không phát hiện xung đột mã ↔ test ↔ migration trong phạm vi feature.
- Phát hiện 1 LỆCH plan ↔ code (không phải xung đột runtime): hướng dẫn bật lại của
  plan #210 quy định đổi kỳ vọng trang Cài đặt (plan.md:60-62) nhưng trang Cài đặt
  và repos/settings đã bị xóa khỏi codebase sau đó (negative-search #9) — chi tiết
  tại OQ-07, OQ-10.
