---
feature: reports
type: reverse-gaps
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# reverse-gaps — reports

> Quy ước nhãn — mỗi mệnh đề mang nhãn riêng: ✅ = khẳng định bởi code/test, có cite `path:line`; 🔵 = suy luận từ ≥2 bằng chứng độc lập; 🟡 = phỏng đoán nghiệp vụ/vì sao, bắt buộc kèm OQ tương ứng (register OQ ở cuối file và Mục 12 của spec).

Điều tra bằng đọc tĩnh tại develop @ d6c0f6b5, KHÔNG chạy test/app. Lệnh ghi
trong file đều đã CHẠY THẬT; lưu ý máy dùng ugrep 7.8.4 nên mọi lệnh rà cây
kèm `--exclude-dir=node_modules --exclude-dir=dist`.

## A. Khoảng trống và mâu thuẫn phát hiện được

### GAP-1 — Mâu thuẫn chú thích ↔ cấu hình truy vấn (CF-1, OQ-03)

Chú thích tại trang Doanh thu viết nguyên văn "kỳ hiện tại tự cập nhật khi
polling snapshot" ✅ apps/web/src/routes/_auth/tuition/index.tsx:77-78, trong khi
bốn bằng chứng độc lập đều phủ nhận việc polling bản chụp:

1. Cấu hình truy vấn tắt mọi tự làm mới nền: `staleTime: Infinity`,
   `refetchOnWindowFocus: false`, `refetchOnReconnect: false` ✅
   apps/web/src/lib/query-client.ts:9-24.
2. Trang Doanh thu KHÔNG khai báo `refetchInterval` — negative-search #4 (kết
   quả thật ở mục B).
3. Các chỗ duy nhất có polling trong app đều nhắm mục tiêu KHÁC bản chụp:
   trang chi tiết hóa đơn poll lịch sử giao dịch với 3 điều kiện dừng (lỗi
   thanh toán, không còn khả năng thanh toán, hết trần 15 phút) ✅
   apps/web/src/routes/_auth/tuition/$invoiceId.tsx:125-137; modal thanh toán
   ✅ apps/web/src/components/modals/invoice-payment-modal.tsx:54,75; modal liên
   kết ngân hàng chỉ poll khi đang mở ✅
   apps/web/src/components/modals/bank-hub-link-modal.tsx:81-82; chấm bài ✅
   apps/web/src/routes/_auth/grading/$attemptId.tsx:75.
4. Khối tính doanh thu chỉ phụ thuộc danh sách hóa đơn và kỳ chọn — thời điểm
   hệ thống KHÔNG nằm trong danh sách phụ thuộc, nên dù có re-render do đồng hồ
   thì cửa sổ kỳ cũng không cuộn ✅
   apps/web/src/routes/_auth/tuition/index.tsx:79-82.

Hệ quả kép: (i) người maintain đọc chú thích sẽ tưởng có sẵn polling; (ii) kỳ
"hiện tại" của cửa sổ chỉ chốt lại lúc nạp dữ liệu/kỳ đổi, không cuộn theo
thời gian thực. 🟡 OQ-03.

### GAP-2 — Câu chặn quyền nêu sai tên màn (OQ-09)

Câu toast dùng chung cho mọi route tài chính là "Bạn không có quyền xem Sổ công
nợ" ✅ apps/web/src/lib/use-finance-route-guard.ts:6, nhưng cổng này cũng chặn
trang Doanh thu (route /tuition dùng chung cổng) ✅
apps/web/src/routes/_auth/tuition/index.tsx:90; test trang xác nhận hành vi
✅ apps/web/src/routes/_auth/tuition/index.test.tsx:152-178. Trợ giảng bị đẩy
khỏi trang Doanh thu nhưng nhận câu nói về Sổ công nợ. 🟡 OQ-09.

### GAP-3 — Hệ số cửa sổ 12/8/5 là hằng số không truy vết nghiệp vụ (OQ-08)

Ba hằng số đặt tên rõ ✅ apps/web/src/lib/tuition-from-kernel.ts:95-97, plan
ghi nhận con số nhưng không cho thấy vì sao là 12/8/5 ✅
plans/261007-1628-tuition-revenue-stats/plan.md:18-20. Không tìm thấy cấu hình
theo tổ chức (toàn bộ giá trị là hằng biên dịch). 🟡 OQ-08.

### GAP-4 — Hai thẻ KPI hướng chung một khái niệm nhưng khác đơn vị (OQ-05)

"Còn phải thu (VND)" = tổng tiền ✅ apps/web/src/routes/_auth/tuition/index.tsx:69,
115-119; "Chưa khớp" = ĐẾM hóa đơn chưa đủ tiền với luật
`status !== "paid" || paidAmount < amount` ✅
apps/web/src/routes/_auth/tuition/index.tsx:72-74, 126-130. Hai thẻ cùng mô tả
"tiền chưa về" — một cái bằng tiền, một cái bằng số hóa đơn. 🟡 OQ-05.

### GAP-5 — Hóa đơn mốc phát hành hỏng không có đường phục hồi (OQ-04)

Bộ luật loại và đếm "dropped" sinh ra cho lệch phiên triển khai (snapshot cũ
để `createdAt` rỗng) ✅ apps/web/src/lib/tuition-from-kernel.ts:108-110,
162-167; 3 kênh báo hiệu (câu tả, console, chú thích dưới biểu đồ) ✅
apps/web/src/components/tuition/revenue-chart.tsx:132-142, 248-252. Sau khi đã
báo hiệu, KHÔNG có màn sửa mốc hay cơ chế backfill nào — số tiền của các hóa
đơn đó mất khỏi biểu đồ vĩnh viễn. 🔵 (một phía là code chỉ đọc; phía kia:
negative-search #1 và #6 cho thấy không có endpoint công cụ dữ liệu nào) —
🟡 OQ-04.

### GAP-6 — Khoảng trống mở rộng và định vị cụm (OQ-01, OQ-02, OQ-06, OQ-07)

- Plan reverse gán nhầm 4/5 nguồn cụm nhắn tin tuần vào slug `reports` (phân
  tích đầy đủ ở Mục 0 spec) — 🟡 OQ-01.
- Cash-basis (theo dòng tiền ngân hàng) bị loại khỏi scope từ plan #343, để
  dành "phần tiếp theo" — không thấy dấu hiệu tiếp nối — 🟡 OQ-02.
- Mục menu đổi thành "Doanh thu" nhưng đường dẫn còn `/tuition` ✅
  apps/web/src/components/layout/sidebar.tsx:109; plan chốt đổi tên mục giữ
  nguyên route ✅ plans/261007-1628-tuition-revenue-stats/plan.md:50-52 —
  🟡 OQ-06.
- Không có bản xem cho chủ trung tâm đa chi nhánh hay xuất tệp (negative-search
  #1, #5, #6, #7) — 🟡 OQ-07.

## B. Negative-search — mọi khẳng định "không có" kèm lệnh + kết quả thật

| # | Khẳng định "không có" | Lệnh đã chạy | Kết quả thật | Ghi chú |
|---|---|---|---|---|
| 1 | Không có tổng hợp doanh thu phía máy chủ | `grep -rni "revenue" apps/server/src --exclude-dir=node_modules --exclude-dir=dist \| grep -v '\.test\.'` | 0 dòng | Nối tiếp: `grep -rn "doanh\|revenue" apps/server/src/routes --exclude-dir=node_modules` → 2 dòng duy nhất tại apps/server/src/routes/vocab-teacher.test.ts:485-486 tại d6c0f6b5 (489-490 là vị trí HEAD sau khi file +203 dòng) (từ "revenue" trong bộ từ vựng tiếng Anh — false positive) |
| 2 | Code doanh thu KHÔNG đọc dữ liệu cụm báo cáo tuần | `grep -rni "report" apps/web/src/lib/tuition-from-kernel.ts` | 0 dòng | BR-07: điểm chung duy nhất là cùng nằm trong một bản chụp org (apps/server/src/routes/snapshot.ts:348-351) |
| 3 | Bảng báo cáo tuần không chứa cột tiền | `grep -ni "amount\|paid\|money\|vnd" packages/db/src/schema/report.ts` | 0 dòng | 11 cột đọc trực tiếp :12-29 (id, org_id, student_id, period, sessions, status, sent, read, content, channel, created_at); file dài đúng 35 dòng (awk END NR) |
| 4 | Trang Doanh thu không có tự làm mới theo lịch | `grep -rn "refetchInterval" apps/web/src --exclude-dir=node_modules` | 6 dòng ở 4 tệp — KHÔNG có tệp nào của trang Doanh thu | $invoiceId.tsx:131 (poll lịch sử giao dịch), invoice-payment-modal.tsx:54, bank-hub-link-modal.tsx:81, grading/$attemptId.tsx:75 — chi tiết GAP-1 |
| 5 | Không có xuất tệp/in ấn cho báo cáo doanh thu | `grep -rni "csv\|xlsx\|excel" apps/web/src/routes/_auth/tuition apps/web/src/components/tuition --exclude-dir=node_modules` | 0 dòng | |
| 6 | Không có màn hình doanh thu nào khác ngoài trang /tuition; không có gửi báo cáo định kỳ | `grep -rn "RevenueChart\|revenue-chart" apps/web/src --exclude-dir=node_modules --exclude-dir=dist \| grep -v '\.test\.'` | 9 dòng, tất cả thuộc index.tsx (lazy import :34-36, testid :134, dùng :137) và chính revenue-chart.tsx (định nghĩa :114,123,128; testid rỗng :176) | Bổ trợ: `grep -rni "cron\|scheduler\|sendemail\|mailer" apps/server/src --exclude-dir=node_modules \| grep -v '\.test\.'` — hạ tầng gửi mail chỉ phục vụ xác thực/thông báo/lead (apps/server/src/index.ts:38-58; apps/server/src/routes/kernel.ts:285,592,860,1030,1304), không dòng nào chạm hóa đơn; tham số kỳ `ky` chỉ xuất hiện ở 2 route tuition (negative-search trong FR-12, index.tsx:47-87; $invoiceId.tsx:39-140) |
| 7 | App học viên/landing/profile không có màn doanh thu giáo viên | `grep -rni "doanh thu\|revenue" apps/student/src apps/landing/src apps/profile/src --exclude-dir=node_modules \| grep -v '\.test\.'` | 0 dòng | Mục 2 spec: phụ huynh/học viên không phải actor. Lưu ý apps/landing và apps/profile là app tĩnh không có src/ — lệnh chỉ quét thật apps/student/src; rà riêng toàn apps/landing + apps/profile (2026-11-12) vẫn 0 match |
| 8 | Không có catalog i18n (R2) | `find apps/web/src \( -path '*i18n*' -o -name '*.json' \) \| grep -v node_modules` | 0 dòng | Mọi câu chữ là literal trong component |

## C. R1 — Kiểm kê kiểm thử (đếm chạy thật, không chạy test)

Đếm bằng `grep -cE '^[[:space:]]*(test|it)\('` (số kiểm định), 
`grep -cE '^[[:space:]]*describe\('` (nhóm), `grep -cE '\.(skip|only|todo)\('`
(kiểm định bị tắt):

| Tệp | test/it | describe | skip/only/todo |
|---|---|---|---|
| apps/web/src/lib/tuition-from-kernel.test.ts | 64 | 10 | 0 |
| apps/web/src/routes/_auth/tuition/index.test.tsx | 5 | 3 | 0 |
| apps/web/src/components/layout/sidebar.test.tsx | 17 | 7 | 0 |
| apps/e2e/specs/tuition-revenue-chart.spec.ts | 2 | 0 | 0 |
| apps/e2e/specs/student-tuition-summary.spec.ts | 2 | 0 | 0 |

Kết luận: 0 kiểm định bị tắt ở cả 5 tệp; SM-06 (64 kiểm định luật tổng hợp)
khớp số đếm dòng 1 bảng. Hai e2e của feature: cửa sổ kỳ + địa chỉ và giá trị kỳ
lạ không sập (apps/e2e/specs/tuition-revenue-chart.spec.ts:117, 198).

## D. Register câu hỏi mở — mỗi phỏng đoán một OQ

| OQ | Câu hỏi | Nguồn phát hiện | Ảnh hưởng nếu sai |
|---|---|---|---|
| OQ-01 | Plan reverse gán nhầm 4/5 nguồn cụm nhắn tin tuần vào slug `reports` — có cần cập nhật docs/_reverse/reverse-plan.json (tách slug, sửa sources) để assembly sau không lặp nhầm? | Mục 0 spec; bảng S1-S4, S29 | Người đọc plan sau này điều tra lại nhầm cụm; corpus trùng giữa 2 slug |
| OQ-02 | Khi nào cần lại phương pháp theo dòng tiền ngân hàng (cash-basis) — plan #343 để dành làm phần tiếp theo, có còn đúng ưu tiên? | GAP-6; plans/261007-1628-tuition-revenue-stats/plan.md:30-31,56 | Kết toán lệch kỳ nếu người dùng kỳ vọng "tiền về tháng này" |
| OQ-03 | Chú thích "polling snapshot" mâu thuẫn cấu hình tắt mọi tự làm mới — chú thích cũ hay còn kế hoạch polling? | GAP-1 (CF-1); index.tsx:77-78 vs query-client.ts:9-24 | Maintain thêm polling tưởng có sẵn; kỳ hiện tại không cuộn khi mở tab lâu |
| OQ-04 | Hóa đơn mốc hỏng chỉ được đếm "bỏ qua" — có cần màn sửa dữ liệu mốc, hay chấp nhận mất khỏi biểu đồ vĩnh viễn? | GAP-5; FR-07 | Doanh thu hụt số vĩnh viễn, chỉ ai đọc dòng chú thích nhỏ mới thấy |
| OQ-05 | "Chưa khớp" (số lượng) và "Còn phải thu" (tiền) có cần gộp hay tách rõ ý nghĩa? | GAP-4; index.tsx:69-74, 115-130 | Đọc nhanh nhầm hai thẻ cùng hướng khác đơn vị |
| OQ-06 | Mục "Doanh thu" ↔ đường dẫn `/tuition` — đổi path cho khớp hay giữ để không vỡ liên kết/e2e? | GAP-6; sidebar.tsx:109; plan.md:50-52 | Đổi thì vỡ liên kết ngoài/e2e; giữ thì nghịch lý tên↔path kéo dài |
| OQ-07 | Có cần bản xem cho chủ trung tâm đa chi nhánh hay xuất tệp cho cấp trên? | GAP-6; FR-14; Mục 2 spec | Cụm bị đòi mở rộng đột xuất khi tổ chức lớn lên |
| OQ-08 | Nguồn hệ số 12/8/5 — thỏa thuận lúc plan hay quy tắc nghiệp vụ? Có cần cấu hình theo tổ chức? | GAP-3; tuition-from-kernel.ts:95-97 | Cửa sổ cố định có thể ngắn/yếu so với nhu cầu thật |
| OQ-09 | Câu chặn "Sổ công nợ" cho cả trang Doanh thu — cần câu trung tính? | GAP-2; use-finance-route-guard.ts:6 | Trợ giảng nhận thông báo sai tên màn vừa bị chặn |

Không có OQ nào thiếu phỏng đoán tương ứng: 9 OQ bọc đủ 9 cụm nhãn vàng của
spec (Mục 0, Mục 2, FR-02, BR-01, BR-04, GAP-1 đến GAP-6).
