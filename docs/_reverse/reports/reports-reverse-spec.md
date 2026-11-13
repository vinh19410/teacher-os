---
feature: reports
type: reverse-srs
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
confidence_summary: "spec: ✅ 85 / 🔵 2 / 🟡 5; tổng toàn assembly: ✅ 181 / 🔵 7 / 🟡 21"
---

# reports — Đặc tả đảo ngược (reverse-SRS) — draft

Feature "reports" = cụm báo cáo doanh thu/thu học của giáo viên: bốn thẻ chỉ số
(đã thu, còn phải thu, số hóa đơn, chưa khớp) và biểu đồ doanh thu cột kép
(Phát hành nền + Đã thu đè giữa) theo cửa sổ Tháng/Quý/Năm trên trang "Doanh thu"
(`/tuition`), cùng bộ luật tổng hợp tiền chạy phía client từ bản chụp dữ liệu.
Trang dùng chung đường dẫn với quản lý hóa đơn; phần GHI (tạo hóa đơn, thu học
phí, sổ công nợ) thuộc feature tuition-invoicing đã soạn riêng — spec này chỉ
đặc tả góc ĐỌC/TỔNG HỢP/HIỂN THỊ.

> Quy ước nhãn — mỗi mệnh đề mang nhãn riêng: ✅ = khẳng định bởi code/test, có cite `path:line`; 🔵 = suy luận từ ≥2 bằng chứng độc lập; 🟡 = phỏng đoán nghiệp vụ/vì sao, bắt buộc kèm OQ tương ứng (Mục 12). Tên endpoint/hàm/bảng chỉ nằm ở cột Truy vết và file nguồn/evidence, không trong mệnh đề FR/BR.

## Mục 0 — Nguồn soạn thảo (draft provenance)

- Soạn từ mã nguồn develop @ d6c0f6b5, đọc tĩnh, không chạy test, không sửa code.
- Plan reverse ghi feature này confidence MEDIUM với 5 nguồn và complexity_flag
  rỗng. Kết quả điều tra thực tế ĐIỀU CHỈNH nhận định đó: 4/5 nguồn liệt kê
  (route server báo cáo, bộ nạp, bảng dữ liệu `report`, trang `/reports`) là
  tài sản của cụm "báo cáo tuần GV↔phụ huynh" trong kernel — KHÔNG phải của
  feature doanh thu; chỉ nguồn thứ 5 (e2e biểu đồ doanh thu) thuộc feature này
  và nó dẫn ra toàn bộ cụm doanh thu thật. 🔵 (bằng chứng gộp:
  docs/_reverse/reverse-plan.json entry slug `reports`; apps/e2e/specs/tuition-revenue-chart.spec.ts:5-18;
  apps/server/src/routes/reporting/index.ts:54-103; apps/web/src/routes/_auth/reports.tsx:15-22)
- Vì sao plan gán nhầm 4 nguồn: cả hai cụm cùng mang nhãn "báo cáo" trong tên
  tệp/tên route — bộ sinh plan dò theo tên trước khi đọc ngữ nghĩa. 🟡 (OQ-01)
- plan-ref trong comment code của feature (điều tra bằng grep số hiệu):
  - #343 — biểu đồ doanh thu + mốc phát hành: 13 tệp, tiêu biểu
    apps/web/src/lib/tuition-from-kernel.ts:103,
    apps/web/src/components/tuition/revenue-chart.tsx:2,
    apps/web/src/routes/_auth/tuition/index.tsx:32,
    packages/api/src/contracts.ts:1791, apps/server/src/routes/snapshot.ts:87. ✅
  - #62/#135 — mọi số trên trang derive từ bản chụp, không số cứng:
    apps/web/src/routes/_auth/tuition/index.tsx:66-68,
    apps/web/src/lib/tuition-from-kernel.ts:1-2. ✅
  - #320 — số đã thu tính lại từ sổ giao dịch, mark-paid giữ 0:
    apps/web/src/lib/tuition-from-kernel.ts:23-27,
    packages/api/src/contracts.ts:1786-1789. ✅
  - #322 — "Quá hạn" suy ra từ hạn đóng: apps/web/src/lib/tuition-from-kernel.ts:188-193. ✅
  - #345 — giữ kỳ doanh thu khi sang chi tiết hóa đơn:
    apps/web/src/routes/_auth/tuition/$invoiceId.tsx:33-34. ✅
  - #451/#515/#524 — ẩn mục tài chính theo vai:
    apps/web/src/components/layout/sidebar.tsx:136-137,
    apps/web/src/lib/use-finance-route-guard.ts:10-14. ✅
- Hệ số cửa sổ kỳ (12 tháng / 8 quý / 5 năm) là hằng số đặt tên rõ trong code:
  apps/web/src/lib/tuition-from-kernel.ts:95-97; khớp con số plan gốc
  plans/261007-1628-tuition-revenue-stats/plan.md:18-20. ✅
- complexity_flag: rỗng (plan) — giữ nguyên; bổ sung hai quan sát pattern:
  trang dùng CHUNG đường dẫn với quản lý hóa đơn (route tuột ra hai mục đích) và
  toàn bộ số liệu DERIVE phía client (không endpoint tổng hợp) — không phải
  state-machine hay async. 🔵 (bằng chứng gộp: apps/web/src/routes/_auth/tuition/index.tsx:40-53;
  negative-search #1, #2 trong reverse-gaps.md)
- Phân định ranh giới NGHIÊM NGẶT ba thứ cùng mang tên "báo cáo":
  - (a) Feature này — báo cáo DOANH THU: bốn thẻ chỉ số + biểu đồ + luật tổng
    hợp + quyền xem, trên trang Doanh thu. ✅
    apps/web/src/routes/_auth/tuition/index.tsx:109-144
  - (b) Bảng `report` + cặp route `/api/reports` của NHẮN TIN TUẦN GV↔phụ huynh
    trong kernel: bảng VẪN SỐNG — được ghi khi tạo báo cáo tuần và đọc vào bản
    chụp dữ liệu — nhưng thuộc cụm khác; module server còn chứa cả ngân hàng
    nhận xét (chấm bài) và chuông thông báo. Feature doanh thu KHÔNG hề chạm:
    toàn bộ code doanh thu có 0 điểm tham chiếu (negative-search #3). ✅
    apps/server/src/routes/reporting/index.ts:54-103 (ghi);
    apps/server/src/routes/reporting/loaders.ts:9-30 (đọc);
    apps/server/src/routes/kernel.ts:3496-3498 (mount);
    packages/db/src/schema/report.ts:8-35 (11 cột, đếm lại bằng awk END NR = 35 dòng);
    apps/server/src/routes/snapshot.ts:58,349 (nạp vào bản chụp)
  - (c) parent-reports — cụm UI trang "Báo cáo phụ huynh" bị cờ tĩnh ẩn:
    apps/web/src/lib/features.ts:7 (cờ = false); trang chuyển hướng về Tổng quan
    khi cờ tắt. Đã soạn đặc tả riêng tại docs/_reverse/parent-reports/ — spec
    này KHÔNG soạn lại. ✅ apps/web/src/routes/_auth/reports.tsx:15-22
  - Ngoài ra trang Doanh thu dùng chung đường dẫn với QUẢN LÝ HÓA ĐƠN (tạo,
    thu học phí, chi tiết, sổ công nợ) — phần ghi đã đặc tả tại
    docs/_reverse/tuition-invoicing/; các mục trùng tài nguyên ở bảng S dưới
    đây đóng vai trò NGUỒN CHUNG, phần FR của spec này chỉ bọc góc đọc. ✅
    apps/web/src/routes/_auth/tuition/index.tsx:241-254, 307-348

### 0.1 Bảng tài nguyên S (đầy đủ ở reverse-sources.md)

| S-id | Tài nguyên | Loại | Vai |
|---|---|---|---|
| S1 | Route server reporting (nhắn tin tuần) | server code | BIÊN GIỚI (b) — không thuộc feature |
| S2 | Bộ nạp báo cáo/tin/nhận xét | server code | BIÊN GIỚI (b) |
| S3 | Bảng báo cáo tuần (11 cột) | db schema | BIÊN GIỚI (b) |
| S4 | Trang "Báo cáo phụ huynh" (bị ẩn) | client route | BIÊN GIỚI (c) |
| S5 | E2E biểu đồ doanh thu | e2e | NGUỒN THẬT duy nhất trong plan |
| S6 | Trang Doanh thu | client route | nguồn chính — KPI + ghép chart |
| S7 | Component biểu đồ doanh thu | client component | nguồn chính — cửa sổ kỳ + a11y |
| S8 | Bộ luật tổng hợp học phí/doanh thu | client lib | nguồn chính — quy tắc tiền |
| S9 | Test đơn vị bộ luật tổng hợp | test | R1 64 kiểm định |
| S10 | Test trang Doanh thu | test | KPI + ghi nhận + chặn vai |
| S11 | Ánh xạ hóa đơn bản chụp → client | client lib | mốc phát hành ISO → ms |
| S12 | Kiểu dữ liệu client + định dạng tiền | client lib | Invoice.createdAt, định dạng VND |
| S13 | Bộ nạp bản chụp phía máy chủ | server loader | hóa đơn + mốc ISO + cổng vai |
| S14 | Bảng hóa đơn | db schema | thực thể dữ liệu nguồn |
| S15 | Hợp đồng dữ liệu dùng chung | api contract | dòng hóa đơn trên đường truyền |
| S16 | Định dạng mã/nhãn hóa đơn | client lib | mã ngắn trên bảng |
| S17 | Cổng route tài chính (client) | client lib | chặn vai thiếu quyền |
| S18 | Danh sách vai tài chính | role gate | teacher/owner/admin |
| S19 | Thanh điều hướng giáo viên | client component | mục "Doanh thu" + lọc vai |
| S20 | Tìm kiếm lệnh nhanh | client component | mục "Doanh thu" trong bảng chọn |
| S21 | Cấu hình cache truy vấn | client lib | tắt mọi tự làm mới nền |
| S22 | Bản ghi lệnh + nạp bản chụp (client) | client lib | làm mới sau ghi |
| S23 | Tiện ích ngày Việt Nam | client lib | "hôm nay" múi giờ VN |
| S24 | Provider dữ liệu ứng dụng | client lib | cổng nạp + bọc lỗi |
| S25 | E2E tổng hợp học phí hồ sơ học viên | e2e | dùng chung luật tiền (#347) |
| S26 | Plan biểu đồ doanh thu (#343) | plan doc | quyết định đã chốt |
| S27 | Nhật red-team plan #343 | plan journal | 3 lỗi nghiêm trọng đã bắt |
| S28 | Nhật cook #343 | plan journal | bài học triển khai |
| S29 | Hằng số cờ cụm ẩn | client lib | BIÊN GIỚI (c) — features.ts:7 |

### 0.2 Liên kết

- Nguồn chi tiết: [reverse-sources.md](reverse-sources.md)
- Khoảng trống & câu hỏi mở: [reverse-gaps.md](reverse-gaps.md)
- Bằng chứng thô: [_evidence.md](_evidence.md)
- Luồng: [srs/reports-reverse-flows.md](srs/reports-reverse-flows.md)
- Máy trạng thái: [srs/reports-reverse-states.md](srs/reports-reverse-states.md)
- Mô hình dữ liệu: [srs/reports-reverse-erd.md](srs/reports-reverse-erd.md)
- Use cases: [usecases/reports-reverse-usecase-index.md](usecases/reports-reverse-usecase-index.md)

### 0.3 Tài liệu nghiệp vụ hiện có

- Không có tài liệu feature riêng cho `reports` (plan reverse `existing_doc`
  rỗng cho slug này). ✅ docs/_reverse/reverse-plan.json (entry slug reports)
- Có plan triển khai đầy đủ (#343) với 3 quyết định đã chốt cùng người dùng và
  tiêu chí nghiệm thu: plans/261007-1628-tuition-revenue-stats/plan.md:28-33,
  :68-79. ✅ (nội dung plan)
- Có 2 nhật ký quy trình kèm theo: red-team bắt 3 lỗi nghiêm trọng (công thức
  tiền, serialize mốc phát hành, e2e selector sai app) —
  plans/journals/2026-10-08-plan-doanh-thu-issue-343-red-team-bt-3-critical-cng-thc-reve.md:15-21;
  nhật cook ghi bài học "store nạp bản chụp MỘT LẦN lúc login" —
  plans/journals/2026-10-08-cook-261007-1628-doanh-thu-chart-issue-343.md:16. ✅
- Lộ trình dự án ghi nhận nghiệm thu KPI học phí từ hóa đơn thật:
  docs/project-roadmap.md:62,64. ✅ (nội dung docs)
- Cả plan lẫn nhật ký đều tự tuyên bố "bản ghi lịch sử, không phải thẩm quyền
  bền vững" — đặc tả này không dùng chúng làm chuẩn hành vi, chỉ làm chứng cứ
  ý định. ✅ plans/journals/2026-10-08-cook-261007-1628-doanh-thu-chart-issue-343.md:23

## Mục 1 — Phạm vi

- Trong phạm vi (góc đọc/tổng hợp/hiển thị doanh thu):
  - Bốn thẻ chỉ số đầu trang Doanh thu: "Đã thu (VND)", "Còn phải thu (VND)",
    "Số hóa đơn" (kèm số đã thu đủ), "Chưa khớp". ✅
    apps/web/src/routes/_auth/tuition/index.tsx:109-131
  - Biểu đồ doanh thu cột kép theo cửa sổ Tháng/Quý/Năm, kỳ chọn sống trong
    địa chỉ trang. ✅ apps/web/src/components/tuition/revenue-chart.tsx:25-29,
    apps/web/src/routes/_auth/tuition/index.tsx:40-53
  - Bộ luật tiền dùng chung: đã thu từng hóa đơn, tổng đã thu/còn phải thu,
    xếp kỳ theo mốc phát hành múi giờ Việt Nam, đếm dữ liệu hỏng. ✅
    apps/web/src/lib/tuition-from-kernel.ts:21-48, 102-184
  - Quyền xem báo cáo tài chính: lọc mục điều hướng, chặn route, ẩn dữ liệu
    nguồn ở bản chụp. ✅ packages/auth/src/role.ts:75-87,
    apps/server/src/routes/snapshot.ts:348, apps/web/src/lib/use-finance-route-guard.ts:16-29
  - Giữ kỳ doanh thu khi sang chi tiết hóa đơn và về lại. ✅
    apps/web/src/routes/_auth/tuition/$invoiceId.tsx:33-43, 138-155
  - Tải riêng thư viện biểu đồ khỏi gói entry. ✅
    apps/web/src/routes/_auth/tuition/index.tsx:32-38
- Ngoài phạm vi (chỉ nhắc khi liên quan):
  - Ghi hóa đơn/thu tiền/chi tiết hóa đơn/sổ công nợ/giao dịch ngân hàng —
    feature tuition-invoicing (đã soạn). ✅
    docs/_reverse/tuition-invoicing/tuition-invoicing-reverse-spec.md (S1-S3)
  - Báo cáo tuần GV↔phụ huynh (bảng + route + trang bị ẩn) — cụm kernel khác,
    UI đặc tả tại parent-reports (đã soạn). ✅
    apps/server/src/routes/kernel.ts:3496; docs/_reverse/parent-reports/parent-reports-reverse-spec.md
  - Bảng chọn học phí trong hồ sơ học viên (app giáo viên) và màn học phí app
    học viên — feature student-tuition/hồ sơ; chỉ dùng chung luật tiền. ✅
    apps/e2e/specs/student-tuition-summary.spec.ts:5-14
  - Tổng hợp theo dòng tiền ngân hàng (cash-basis) — loại khỏi scope từ giai
    đoạn plan #343. ✅ plans/261007-1628-tuition-revenue-stats/plan.md:30-31, 56
  - Xuất file/in ấn/gửi báo cáo định kỳ/tổng hợp phía máy chủ — không tồn tại
    (negative-search #1, #5, #6 trong reverse-gaps.md).

## Mục 2 — Actor

- **Giáo viên có quyền tài chính (chủ trung tâm / quản trị / giáo viên)**: actor
  duy nhất xem được báo cáo — ba vai trong danh sách cho phép; mọi số trên trang
  derive từ bản chụp dữ liệu của tổ chức. ✅ packages/auth/src/role.ts:75-87;
  apps/web/src/routes/_auth/tuition/index.tsx:66-68
- **Trợ giảng / giáo viên phụ trách (vai không có quyền tài chính)**: không thấy
  mục "Doanh thu" trên thanh điều hướng lẫn bảng chọn lệnh; vào thẳng địa chỉ
  bị đưa về Tổng quan kèm câu chào chặn; máy chủ không gửi kèm hóa đơn trong
  bản chụp cho vai này. ✅ apps/web/src/components/layout/sidebar.tsx:128-145;
  apps/web/src/lib/use-finance-route-guard.ts:6,9-31;
  apps/server/src/routes/snapshot.ts:348
- **Phụ huynh / học viên**: KHÔNG có màn hình báo cáo doanh thu nào — thanh toán
  qua liên kết công khai là tính năng khác; app học viên không có màn doanh thu
  giáo viên. ✅ negative-search #7 trong reverse-gaps.md; 🟡 (định vị người
  dùng ngoài — có cần bản xem cho chủ trung tâm đa chi nhánh không — OQ-07)

## Mục 3 — Yêu cầu chức năng (FR)

| FR | Yêu cầu | Điều kiện / Giới hạn | Truy vết |
|---|---|---|---|
| FR-01 | Nhóm "Kinh doanh" trên thanh điều hướng có mục "Doanh thu" dẫn tới trang tiêu đề "Doanh thu", dòng mở đầu "Doanh thu · VietQR qua SePay" và dòng dẫn "Đã thu {số tiền}". | Mục điều hướng nằm cạnh "Công nợ"; tiêu đề trang trùng tên mục. | ✅ apps/web/src/components/layout/sidebar.tsx:109; apps/web/src/routes/_auth/tuition/index.tsx:94-97; test apps/web/src/components/layout/sidebar.test.tsx:45-59 |
| FR-02 | Chỉ vai trong danh sách tài chính (chủ trung tâm/quản trị/giáo viên) được xem: vai khác không thấy mục "Doanh thu" (cả bảng chọn lệnh), vào thẳng địa chỉ thì được đưa về Tổng quan kèm câu chào chặn một lần, và trang dừng render. | Câu chặn trích nguyên văn: "Bạn không có quyền xem Sổ công nợ" (nội dung nêu "Sổ công nợ" dù chặn cả trang Doanh thu — 🟡 OQ-09); ranh giới chính là ở DỮ LIỆU: máy chủ không gửi hóa đơn cho vai thiếu quyền. | ✅ packages/auth/src/role.ts:75-87; apps/web/src/lib/use-finance-route-guard.ts:6,9-31; apps/web/src/components/layout/sidebar.tsx:128-145; apps/web/src/components/command-search/search-index.ts:179-193; apps/server/src/routes/snapshot.ts:348; test apps/web/src/routes/_auth/tuition/index.test.tsx:152-178; test apps/web/src/components/layout/sidebar.test.tsx:76-90 |
| FR-03 | Bốn thẻ chỉ số đầu trang: "Đã thu (VND)" = tổng tiền đã thu; "Còn phải thu (VND)" = tổng còn thiếu (ô nổi màu đỏ khi còn lớn hơn 0); "Số hóa đơn" kèm dòng phụ "{N} đã thu đủ"; "Chưa khớp" = số hóa đơn chưa đủ tiền, dòng phụ "hóa đơn còn thiếu tiền". | Mọi số suy từ bản chụp dữ liệu tại thời điểm nạp, không có số cứng trong màn. | ✅ apps/web/src/routes/_auth/tuition/index.tsx:109-131 (luật đếm :69-74); chú thích :66-68; test apps/web/src/routes/_auth/tuition/index.test.tsx:66-101; e2e apps/e2e/specs/tuition-revenue-chart.spec.ts:158-165 |
| FR-04 | Luật tiền một hóa đơn: đã thu = đủ số tiền khi trạng thái "paid" (kể cả ghi nhận thủ công đang giữ số đã thu bằng 0); còn lại = phần nhỏ hơn giữa số đã ghi sổ và số tiền (chặn không vượt số tiền). Còn phải thu của hóa đơn chưa "paid" = số tiền trừ đã thu. | Một hàm duy nhất cho cả 3 nơi dùng (tổng trang, xếp kỳ biểu đồ, chi tiết) — không có bản tính thứ hai. | ✅ apps/web/src/lib/tuition-from-kernel.ts:21-33 (tổng :35-48); chú thích :22-27; test apps/web/src/lib/tuition-from-kernel.test.ts:483-502, 679-705 |
| FR-05 | Biểu đồ cột kép: cột nền "Phát hành" = tổng số tiền phát hành theo kỳ; cột đè "Đã thu" = tổng đã thu cùng kỳ theo luật FR-04; hai cột căn GIỮA slot (không xếp cạnh). | Cửa sổ cố định tính cả kỳ hiện tại: Tháng = 12 kỳ, Quý = 8 kỳ, Năm = 5 kỳ; kỳ rỗng vẫn chiếm slot 0/0; thứ tự cũ → mới. | ✅ apps/web/src/components/tuition/revenue-chart.tsx:214-229 (độ rộng cột :217,:225; màu :219,:227); apps/web/src/lib/tuition-from-kernel.ts:95-97, 121-159; test cửa sổ apps/web/src/lib/tuition-from-kernel.test.ts:562-585; e2e nhãn trục + legend apps/e2e/specs/tuition-revenue-chart.spec.ts:167-177 |
| FR-06 | Xếp kỳ theo MỐC PHÁT HÀNH hóa đơn (thời điểm tạo) theo ngày lịch Việt Nam; hóa đơn tạo lúc 00:00–07:00 giờ Việt Nam không bị nhầm sang kỳ của giờ quốc tế. | Căn cứ là kỳ phát hành, KHÔNG phải ngày giao dịch ngân hàng — quyết định chốt với người dùng từ #343. | ✅ apps/web/src/lib/tuition-from-kernel.ts:73-93, 102-111, 162-181; test biên múi giờ apps/web/src/lib/tuition-from-kernel.test.ts:610-644; plan plans/261007-1628-tuition-revenue-stats/plan.md:30-31; e2e seed giữa tháng apps/e2e/specs/tuition-revenue-chart.spec.ts:31-43 |
| FR-07 | Hóa đơn KHÔNG đọc được mốc phát hành (0 hoặc không phải số) bị LOẠI khỏi biểu đồ và ĐẾM vào số "bị bỏ qua"; số này hiện ra 3 kênh: câu tả biểu đồ cho trình đọc màn, cảnh báo ra console, và dòng chú thích dưới biểu đồ "(N hóa đơn bỏ qua do thiếu ngày)"; khi trống, câu rỗng kèm lời giải thích. Hóa đơn HỢP LỆ nhưng quá cũ ngoài cửa sổ bị loại có chủ ý — KHÔNG tính vào số bỏ qua. | Không bao giờ im lặng với chỉ số tài chính (nguyên tắc #343). | ✅ apps/web/src/lib/tuition-from-kernel.ts:107-110, 162-167, 175-178; apps/web/src/components/tuition/revenue-chart.tsx:114-121, 132-142, 180-183, 248-252; test apps/web/src/lib/tuition-from-kernel.test.ts:666-676 |
| FR-08 | Chọn kỳ bằng 3 nút "Tháng"/"Quý"/"Năm" (nhóm có nhãn "Kỳ doanh thu" cho trình đọc màn, mỗi nút đánh dấu bật/tắt); chọn xong địa chỉ trang đổi thành `?ky=…` bằng cách THAY THẾ lịch sử (không dồn lại khi bấm nhiều lần); giá trị lạ trong địa chỉ rơi về "Tháng" an toàn, không lỗi không điều hướng. | Kỳ là tham số địa chỉ DUY NHẤT của trang; mặc định "Tháng". | ✅ apps/web/src/components/tuition/revenue-chart.tsx:25-29, 146-170 (nhãn nhóm :151, dấu bật :156, mã nút :157); apps/web/src/routes/_auth/tuition/index.tsx:40-53, 64, 84-88; e2e apps/e2e/specs/tuition-revenue-chart.spec.ts:179-195, 198-209 |
| FR-09 | Khối biểu đồ được bọc nhãn ảnh cho trình đọc màn: "Biểu đồ doanh thu {cửa sổ}, đã thu tổng {số tiền}" kèm phần "...bỏ qua N hóa đơn..." khi có; nút chòn chuột hiện tên kỳ đầy đủ ("Tháng 10/2026" / "Quý 4/2026" / "Năm 2026") với hai dòng "Đã thu" và "Phát hành"; chú giải 2 mục "Phát hành"/"Đã thu"; hoạt ảnh tắt hoàn toàn. | Nhãn ảnh CHỈ bọc khối vẽ, KHÔNG bọc nhóm nút kỳ (nút phải focus được bên ngoài). | ✅ apps/web/src/components/tuition/revenue-chart.tsx:140-142 (nhãn ảnh), 37-48 (tên kỳ đầy đủ), 65-91 (nút chòn), 233-253 (chú giải), 150-152 + 186-189 (phân bọc), 220+228 (tắt hoạt ảnh); chú thích thiết kế :5-10 |
| FR-10 | Không có hóa đơn nào trong cửa sổ: khối biểu đồ thay bằng ô rỗng cao tối thiểu với câu "Chưa có hóa đơn nào trong {cửa sổ}." (kèm lời giải thích số bị bỏ qua nếu có); tổ chức trống hoàn toàn vẫn mở được trang và biểu đồ ở trạng thái rỗng. | Ô rỗng có mã kiểm thử riêng để e2e bám, không assert hình vẽ. | ✅ apps/web/src/components/tuition/revenue-chart.tsx:129-130, 173-184 (câu rỗng :179-183); e2e apps/e2e/specs/tuition-revenue-chart.spec.ts:198-209 |
| FR-11 | Thư viện biểu đồ tải thành gói riêng, chỉ trang Doanh thu tải nó — không nằm trong gói entry dùng chung mọi trang. | Tải trễ kèm ô chờ rỗng trong khi chờ. | ✅ apps/web/src/routes/_auth/tuition/index.tsx:32-38, 136-143 |
| FR-12 | Kỳ doanh thu đang chọn được GIỮ qua trang chi tiết hóa đơn: mở từ bảng mang theo kỳ trong địa chỉ; nút "← Doanh thu" trả về đúng kỳ; khi không có kỳ thì về mặc định "Tháng". | Hai route khai báo cùng bộ kiểm tham số kỳ (không chấp nhận giá trị lạ). | ✅ apps/web/src/routes/_auth/tuition/index.tsx:274-279; apps/web/src/routes/_auth/tuition/$invoiceId.tsx:33-43, 138, 147-155; chú thích #345 :33-34 |
| FR-13 | Số liệu báo cáo CHỈ đổi khi bản chụp dữ liệu được nạp lại (sau một lệnh ghi thành công qua bus lệnh, hoặc bấm thử lại thủ công) — không có tự làm mới theo lịch hay theo tiêu điểm cửa sổ; biểu đồ xếp lại kỳ ngay khi danh sách hóa đơn hoặc kỳ chọn đổi. | Hệ quả đã nghiệm thu: dữ liệu gieo sau lúc đăng nhập phải tải lại trang mới thấy (nhật cook, e2e); trang Doanh thu không khai báo tự làm mới theo lịch (negative-search #4 trong reverse-gaps.md). | ✅ apps/web/src/lib/query-client.ts:9-24; apps/web/src/lib/data-provider.tsx:101-108; apps/web/src/routes/_auth/tuition/index.tsx:79-82 (phụ thuộc nhớ lại :81); e2e apps/e2e/specs/tuition-revenue-chart.spec.ts:150-153; nhật plans/journals/2026-10-08-cook-261007-1628-doanh-thu-chart-issue-343.md:16 |
| FR-14 | KHÔNG có kênh báo cáo doanh thu nào khác: không trang báo cáo riêng, không tổng hợp phía máy chủ, không xuất tệp, không gửi báo cáo định kỳ, và trang Doanh thu không đọc dữ liệu cụm báo cáo tuần. | Mọi số đều derive phía client từ bản chụp (một nguồn duy nhất). | ✅ negative-search #1, #2, #3, #5, #6 trong reverse-gaps.md (lệnh + kết quả chạy thật) |

## Mục 4 — Yêu cầu phi chức năng (NFR)

| NFR | Yêu cầu | Truy vết |
|---|---|---|
| NFR-01 | Múi giờ Việt Nam xuyên suốt việc xếp kỳ: tách bộ phận ngày từ mốc thời gian bằng bộ định dạng cố định múi giờ, không bao giờ theo giờ máy hay giờ quốc tế (tránh lệch ranh ngày 7 giờ). | ✅ apps/web/src/lib/tuition-from-kernel.ts:73-93 (chú thích :80-83); cùng tiền lệ apps/web/src/lib/week-grid.ts:21-36 |
| NFR-02 | Trợ trợ trình đọc màn: khối vẽ là một ảnh có nhãn, nhóm chọn kỳ là một nhóm có nhãn riêng; mỗi nút có dấu bật/tắt; vòng focus hiển thị rõ. | ✅ apps/web/src/components/tuition/revenue-chart.tsx:140-142, 150-152, 156-157, 159-164; chú thích lý do :150, :187 |
| NFR-03 | Hiệu năng gói trang: thư viện vẽ (~100 kB nén) tách chunk riêng; chỉ mục xếp kỳ xây một lần mỗi lần dữ liệu/kỳ đổi (không quét lại trong render). | ✅ apps/web/src/routes/_auth/tuition/index.tsx:32-38 (chú thích #343); apps/web/src/routes/_auth/tuition/index.tsx:79-82; apps/web/src/lib/tuition-from-kernel.ts:118-120, 160 |
| NFR-04 | Không số cứng: mọi số trên trang derive từ bản chụp dữ liệu; không số liệu demo trong màn thật. | ✅ apps/web/src/routes/_auth/tuition/index.tsx:66-68; docs/project-roadmap.md:62 |
| NFR-05 | Chống im lặng với chỉ số tài chính: dữ liệu hỏng phải HIỆN (đếm + 3 kênh thông báo — FR-07), dữ liệu ngoài cửa sổ loại tường minh trong chú thích code. | ✅ apps/web/src/lib/tuition-from-kernel.ts:107-110, 175-178; apps/web/src/components/tuition/revenue-chart.tsx:132-142 |
| NFR-06 | Không có catalog i18n: mọi chữ người dùng thấy là chuỗi literal tại component (R2 — một nguồn duy nhất mỗi câu chữ). | ✅ negative-search #8 trong reverse-gaps.md (find rỗng) |
| NFR-07 | Địa chỉ trang là nguồn sự thật của kỳ: chia sẻ được, quay lại đúng kỳ, thay thế lịch sử không dồn bước; giá trị lạ an toàn về mặc định (không throw, không điều hướng). | ✅ apps/web/src/routes/_auth/tuition/index.tsx:40-53, 84-88; e2e apps/e2e/specs/tuition-revenue-chart.spec.ts:181-195 |
| NFR-08 | Bản chụp dữ liệu có kiểm hình dạng ở cả hai đầu: máy chủ serialize mốc phát hành thành chuỗi ISO tường minh (không bao giờ number hóa trên đường truyền); client phân tích ngược sang mili-giây và trả 0 khi hỏng để bộ xếp kỳ đếm được thay vì sập. | ✅ apps/server/src/routes/snapshot.ts:87-91; packages/api/src/contracts.ts:1786-1795; apps/web/src/lib/repos/invoices.ts:30-33; apps/web/src/lib/mock-data.ts:151-154 |

## Mục 5 — Quy tắc nghiệp vụ (BR)

- **BR-01.** Căn cứ doanh thu là KỲ PHÁT HÀNH hóa đơn, không phải ngày giao dịch
  ngân hàng — người dùng đã chốt từ #343 vì khớp tư duy "học phí tháng 9"; dòng
  tiền ngân hàng thuộc luồng đối soát khác. ✅
  plans/261007-1628-tuition-revenue-stats/plan.md:30-31, 56;
  apps/web/src/lib/tuition-from-kernel.ts:103-111 (🟡 khi nào cần lại cash-basis — OQ-02)
- **BR-02.** Một hóa đơn ghi nhận thủ công ("paid" nhưng sổ bằng 0) tính ĐỦ số
  tiền vào đã thu — trạng thái quyết định, không phải sổ; ngược lại hóa đơn
  chưa "paid" chỉ tính phần đã ghi sổ, chặn không vượt số tiền. ✅
  apps/web/src/lib/tuition-from-kernel.ts:21-33; test
  apps/web/src/lib/tuition-from-kernel.test.ts:483-542
- **BR-03.** Luật tiền là MỘT nguồn duy nhất cho mọi bề mặt (tổng trang, xếp kỳ
  biểu đồ, chi tiết hóa đơn, tổng hợp hồ sơ học viên) — sửa một nơi, mọi nơi
  đổi theo. ✅ apps/web/src/lib/tuition-from-kernel.ts:22-27; e2e dùng chung luật
  apps/e2e/specs/student-tuition-summary.spec.ts:5-14
- **BR-04.** Cửa sổ kỳ CỐ ĐỊNH tính cả kỳ hiện tại (12/8/5), kỳ rỗng vẫn chiếm
  slot — trục thời gian không co rút theo dữ liệu, người dùng đọc được "kỳ này
  chưa có tiền" thay vì mất cột. ✅ apps/web/src/lib/tuition-from-kernel.ts:95-97,
  121-159; test apps/web/src/lib/tuition-from-kernel.test.ts:562-585
  (🟡 nguồn con số 12/8/5 — OQ-08)
- **BR-05.** Quyền tài chính chặn Ở CẢ HAI TẦNG: dữ liệu (máy chủ không gửi hóa
  đơn trong bản chụp cho vai thiếu quyền) và giao diện (lọc mục điều hướng +
  đưa về Tổng quan) — tầng dữ liệu là ranh giới chính, tầng giao diện chỉ là
  thiện chí. ✅ apps/server/src/routes/snapshot.ts:348;
  apps/web/src/components/layout/sidebar.tsx:128-145;
  apps/web/src/lib/use-finance-route-guard.ts:16-31
- **BR-06.** Kỳ doanh thu sống trong địa chỉ trang, không có trạng thái riêng
  trong bộ nhớ ứng dụng — sang trang khác và quay lại bằng địa chỉ vẫn đúng kỳ;
  ghi lệnh nào cũng không đổi kỳ. ✅ apps/web/src/routes/_auth/tuition/index.tsx:40-53,
  84-88; apps/web/src/routes/_auth/tuition/$invoiceId.tsx:33-43
- **BR-07.** Cụm doanh thu và cụm báo cáo tuần TÁCH TUYỆT ĐỐI về dữ liệu: bảng
  báo cáo tuần không chứa tiền, route doanh thu không tồn tại, trang Doanh thu
  không đọc bảng báo cáo — điểm chung duy nhất là cùng nằm trong một bản chụp
  dữ liệu org. ✅ packages/db/src/schema/report.ts:8-35 (không cột tiền);
  negative-search #2, #3 trong reverse-gaps.md

## Mục 6 — Ma trận lỗi

Wording UI trích nguyên văn từ component (R2 — không có catalog i18n).

| Mã / tình huống | HTTP | Điều kiện | Wording / hiển thị | Truy vết |
|---|---|---|---|---|
| E-01 — vai thiếu quyền tài chính | — | Mở /tuition với vai ngoài danh sách | Đưa về Tổng quan + câu chào một lần: "Bạn không có quyền xem Sổ công nợ" | ✅ apps/web/src/lib/use-finance-route-guard.ts:6, 16-29; test apps/web/src/routes/_auth/tuition/index.test.tsx:152-178 |
| E-02 — giá trị kỳ lạ trong địa chỉ | — | `?ky=` không phải month/quarter/year | Rơi về cửa sổ Tháng, trang chạy bình thường (không crash, không điều hướng) | ✅ apps/web/src/routes/_auth/tuition/index.tsx:44-51, 64; e2e apps/e2e/specs/tuition-revenue-chart.spec.ts:198-209 |
| E-03 — tổ chức không có hóa đơn | — | Cửa sổ không có hóa đơn nào | "Chưa có hóa đơn nào trong {12 tháng gần nhất\|8 quý gần nhất\|5 năm gần nhất}." (+ lời giải thích số bị bỏ qua nếu có) | ✅ apps/web/src/components/tuition/revenue-chart.tsx:31-35, 173-184; e2e :198-209 |
| E-04 — mốc phát hành hỏng | — | Hóa đơn có mốc 0/không phải số | Loại khỏi biểu đồ + đếm; cảnh báo console "[revenue] bỏ qua N hóa đơn không đọc được ngày phát hành — không nằm trong biểu đồ doanh thu."; chú thích "(N hóa đơn bỏ qua do thiếu ngày)" | ✅ apps/web/src/lib/tuition-from-kernel.ts:162-167; apps/web/src/components/tuition/revenue-chart.tsx:132-138, 248-252; test apps/web/src/lib/tuition-from-kernel.test.ts:666-676 |
| E-05 — nạp bản chụp thất bại lần đầu | — | Lỗi mạng/máy chủ khi mở ứng dụng | Màn chặn lỗi toàn trang kèm nút thử lại (không vào trang Doanh thu với dữ liệu rỗng) | ✅ apps/web/src/lib/data-provider.tsx:78-81, 175 |
| E-06 — trang rỗng phía hóa đơn | — | Tổ chức chưa có hóa đơn nào | Bảng hóa đơn rỗng với lời mời tạo hóa đơn (thuộc màn chung — đặc tả tại tuition-invoicing) | ✅ apps/web/src/routes/_auth/tuition/index.tsx:243-254 (đặc tả đầy đủ ở docs/_reverse/tuition-invoicing/) |
| E-07 — vì sao nút chòn/hoạt ảnh không assert | — | e2e chủ trương KHÔNG assert hình học SVG | Chỉ assert chữ/nhãn/địa chỉ — tránh vỡ khi nâng thư viện vẽ | ✅ apps/e2e/specs/tuition-revenue-chart.spec.ts:16-18 |

## Mục 7 — Thước đo thành công

| SM | Thước đo | Bằng chứng |
|---|---|---|
| SM-01 | Vai tài chính mở /tuition thấy đủ: tiêu đề "Doanh thu", 4 KPI, biểu đồ, bảng hóa đơn; số KPI khớp luật tiền (1.500.000đ với hóa đơn mark-paid 1,5 triệu). | ✅ apps/e2e/specs/tuition-revenue-chart.spec.ts:117-165; apps/web/src/routes/_auth/tuition/index.test.tsx:66-101 |
| SM-02 | Toggle Quý đổi địa chỉ thành `?ky=quarter`, tập nhãn trục đổi từ T… sang Q…, nhãn tháng biến mất; bấm Tháng quay lại `?ky=month`. | ✅ apps/e2e/specs/tuition-revenue-chart.spec.ts:179-195 |
| SM-03 | `?ky=lạ` không sập: trang hiện, biểu đồ ở trạng thái rỗng có mã kiểm thử. | ✅ apps/e2e/specs/tuition-revenue-chart.spec.ts:198-209 |
| SM-04 | Biên múi giờ đúng: hóa đơn 23:30 VN ngày cuối tháng vào đúng kỳ đó; 05:00 VN đầu tháng (còn ngày trước theo giờ quốc tế) vào kỳ mới. | ✅ apps/web/src/lib/tuition-from-kernel.test.ts:610-644 |
| SM-05 | Quyền: vai thiếu quyền bị đưa về Tổng quan kèm câu chặn, trang không render; mục "Doanh thu" biến khỏi điều hướng. | ✅ apps/web/src/routes/_auth/tuition/index.test.tsx:152-178; apps/web/src/components/layout/sidebar.test.tsx:76-90 |
| SM-06 | 64 kiểm định đơn vị bảo vệ toàn bộ luật tổng hợp (tổng, luật tiền, cửa sổ, biên múi giờ, dữ liệu hỏng, sổ công nợ, tổng hợp hồ sơ). | ✅ apps/web/src/lib/tuition-from-kernel.test.ts:63-1470 (R1 — đếm ở reverse-gaps.md, mục R1) |
| SM-07 | Hóa đơn mark-paid thủ công hiện đúng tổng đã thu trên cả KPI và cột "Đã thu" cùng màn hình — hai số không lệch nhau (bảo đảm bởi luật một nguồn FR-04/BR-02; e2e bám giá trị KPI và chỉ kiểm thấy legend "Phát hành"/"Đã thu", không đọc giá trị cột). | ✅ apps/e2e/specs/tuition-revenue-chart.spec.ts:125-135, 158-177; luật chung FR-04/BR-02 |

## Mục 8 — Thực thể nghiệp vụ

| Thực thể | Vai trò nghiệp vụ | Truy vết |
|---|---|---|
| Hóa đơn học phí | THỰC THỂ DỮ LIỆU NGUỒN duy nhất của báo cáo: số tiền, trạng thái, số đã ghi sổ, mốc phát hành — quyền sở hữu dữ liệu thuộc feature hóa đơn; feature này chỉ ĐỌC bốn trường đó. | ✅ packages/db/src/schema/invoice.ts:28-48; apps/web/src/lib/repos/invoices.ts:5-34 |
| Kỳ doanh thu (Tháng/Quý/Năm) | LỰA CHỌN XEM sống trong địa chỉ trang — không có bản ghi dữ liệu, không lưu máy chủ. | ✅ apps/web/src/routes/_auth/tuition/index.tsx:40-53 (BR-06) |
| Kỳ xếp (bucket tháng/quý/năm) | ĐƠN VỊ TỔNG HỢP chỉ tồn tại trong bộ nhớ lúc tính — cửa sổ cố định, kỳ rỗng vẫn sinh slot 0/0. | ✅ apps/web/src/lib/tuition-from-kernel.ts:53-71, 121-159 |

Ranh giới: bảng báo cáo tuần (11 cột, không có cột tiền) và bảng ngân hàng nhận
xét nằm cùng module server nhưng KHÔNG phải thực thể của feature này; bảng hóa
đơn còn chứa cột thanh toán (mã chuyển khoản, liên kết công khai) thuộc luồng
thu tiền — không vẽ chi tiết ở đây. ✅ packages/db/src/schema/report.ts:9-35;
apps/server/src/routes/reporting/loaders.ts:32-62;
packages/db/src/schema/invoice.ts:43-44 (mô hình đầy đủ ở
docs/_reverse/tuition-invoicing/srs/tuition-invoicing-reverse-erd.md)

## Mục 9 — Luồng (danh mục)

Đặc tả đủ (sequence + flowchart) ở srs/reports-reverse-flows.md.

| F-id | Luồng | Một dòng |
|---|---|---|
| F1 | Mở trang Doanh thu | Điều hướng → cổng vai → bản chụp → 4 KPI + biểu đồ |
| F2 | Đổi kỳ xem | Bấm Tháng/Quý/Năm → địa chỉ đổi → xếp lại kỳ → nhãn trục đổi |
| F3 | Chặng dữ liệu vào biểu đồ | Bản chụp → ánh xạ hóa đơn (ISO→ms) → xếp kỳ giờ Việt Nam → cột kép |
| F4 | Dữ liệu đổi sau ghi | Tạo hóa đơn/ghi nhận thu (feature khác) → bus làm mới bản chụp → số và cột đổi theo |

## Mục 10 — Màn hình

- `/tuition` — trang "Doanh thu" (dùng chung với quản lý hóa đơn): đầu trang
  tiêu đề + dòng dẫn "Đã thu {số}" + nút tạo hóa đơn; lưới 2 cột — 4 thẻ chỉ số
  (trái) và thẻ biểu đồ (phải, mã kiểm thử `tuition-revenue-chart`); bên dưới là
  bảng gói học và bảng hóa đơn (ngoài góc đọc của spec này). Trong biểu đồ:
  hàng tiêu đề "Doanh thu" + nhóm 3 nút kỳ; khối cột hoặc ô rỗng; chú giải 2
  màu (+ chú thích số bị bỏ qua khi có). (S6, S7)
- `/tuition/$invoiceId` — chi tiết hóa đơn: nút "← Doanh thu" giữ kỳ đang chọn
  (kỳ giữ theo FR-12; màn thuộc tuition-invoicing). ✅
  apps/web/src/routes/_auth/tuition/$invoiceId.tsx:147-155
- Thanh điều hướng + bảng chọn lệnh: mục "Doanh thu" nhóm "Kinh doanh", ẩn theo
  vai (S19, S20).
- KHÔNG có màn "Báo cáo doanh thu" riêng — trang /reports (bị ẩn bởi cờ) thuộc
  cụm báo cáo tuần, không liên quan. ✅ apps/web/src/routes/_auth/reports.tsx:15-22

## Mục 11 — Ràng buộc

- Không endpoint tổng hợp doanh thu — mọi số derive phía client từ bản chụp
  dữ liệu org; quyết định "không thêm API" từ #343. ✅
  plans/261007-1628-tuition-revenue-stats/plan.md:52; negative-search #1 trong
  reverse-gaps.md
- Bản chụp dữ liệu là nguồn DUY NHẤT và không tự làm mới — số báo cáo cũ đi
  kèm rủi ro "stale" được chấp nhận có chủ đích (ghi lệnh mới làm mới). ✅
  apps/web/src/lib/query-client.ts:9-24; e2e :150-153
- Thư viện vẽ hoạt ảnh TẮT hoàn toàn theo chuẩn thiết kế (không entrance
  choreography). ✅ apps/web/src/components/tuition/revenue-chart.tsx:7-9, 220, 228
- e2e KHÔNG assert hình học SVG — chỉ chữ/nhãn/địa chỉ, chống vỡ khi nâng thư
  viện. ✅ apps/e2e/specs/tuition-revenue-chart.spec.ts:16-18
- Hai màu cột dùng token màu hệ thống sẵn có (chart-1 nền, chart-2 đè). ✅
  apps/web/src/components/tuition/revenue-chart.tsx:218-227
- Không có catalog i18n (R2). ✅ negative-search #8 trong reverse-gaps.md
- Cụm báo cáo tuần vẫn chạy ngầm trong cùng bản chụp (bảng + route sống) — mọi
  thay đổi phía báo cáo doanh thu KHÔNG được đụng vào module reporting. ✅
  apps/server/src/routes/kernel.ts:3496-3498; BR-07

## Mục 12 — Câu hỏi mở (OQ)

| OQ | Câu hỏi | Bối cảnh | Ảnh hưởng nếu sai |
|---|---|---|---|
| OQ-01 | Plan reverse gán nhầm 4/5 nguồn cụm nhắn tin tuần vào slug `reports` — có cần cập nhật lại docs/_reverse/reverse-plan.json (tách slug, sửa sources) để assembly sau không lặp nhầm? | 4 nguồn sai lệch đã xác minh; chỉ 1 nguồn thật; docs/_reverse đã có parent-reports riêng | Feature sau này đọc plan sẽ lại điều tra nhầm cụm; corpus trùng lặp giữa 2 slug |
| OQ-02 | Khi nào cần lại phương pháp theo dòng tiền ngân hàng (cash-basis) — plan #343 để dành làm phần tiếp theo, có còn đúng ưu tiên? | plan.md:30-31, 56; luồng giao dịch ngân hàng đã sống tại tuition-invoicing | Kết toán sai kỳ nếu người dùng kỳ vọng "tiền về tháng này" mà biểu đồ chỉ có "phát hành tháng này" |
| OQ-03 | Chú thích tại trang nói kỳ hiện tại "tự cập nhật khi polling snapshot" trong khi cấu hình truy vấn tắt MỌI tự làm mới nền — chú thích cũ hay còn kế hoạch polling? Mâu thuẫn chú thích ↔ code cần xử lý. | apps/web/src/routes/_auth/tuition/index.tsx:77-78 so với apps/web/src/lib/query-client.ts:9-24; CF-1 | Người maintain thêm polling tưởng có sẵn; hoặc kỳ hiện tại không cuộn đúng giao khi mở tab lâu |
| OQ-04 | Hóa đơn mốc phát hành hỏng (deploy skew) chỉ được đếm "bỏ qua" — có cần màn sửa dữ liệu mốc, hay chấp nhận mất khỏi biểu đồ vĩnh viễn? | FR-07; cơ chế dropped sinh ra cho lệch phiên triển khai | Doanh thu hụt số vĩnh viễn với dữ liệu cũ; không ai nhận ra ngoài dòng chú thích nhỏ |
| OQ-05 | KPI "Chưa khớp" (đếm hóa đơn chưa đủ tiền) trùng nghĩa với "Còn phải thu" (tổng tiền) — hai thẻ có cần gộp hay tách rõ ý nghĩa cho người dùng mới? | apps/web/src/routes/_auth/tuition/index.tsx:70-74, 126-130 | Hai số cùng hướng nhưng đơn vị khác nhau (số lượng vs tiền) gây nhầm khi đọc nhanh |
| OQ-06 | Mục menu đã đổi thành "Doanh thu" nhưng đường dẫn còn là `/tuition` (học phí) — có cần đổi đường dẫn cho khớp ngữ nghĩa, hay giữ để không vỡ liên kết/e2e? | sidebar.tsx:109; plans/261007-1628-tuition-revenue-stats/plan.md:50-52 | Liên kết ngoài/e2e vỡ nếu đổi; hoặc nghịch lý tên ↔ đường dẫn kéo dài |
| OQ-07 | Báo cáo doanh thu hiện chỉ phục vụ người dùng web giáo viên có quyền tài chính — chủ trung tâm đa chi nhánh/báo cáo cho cấp trên có cần bản xem riêng hay xuất tệp? | FR-14 (không xuất, không gửi); actor duy nhất (Mục 2) | Cụm bị đòi mở rộng đột xuất khi tổ chức lớn lên |
| OQ-08 | Nguồn hệ số cửa sổ 12 tháng / 8 quý / 5 năm — con số thỏa thuận lúc plan hay quy tắc nghiệp vụ? Có cần cấu hình theo tổ chức? | apps/web/src/lib/tuition-from-kernel.ts:95-97; plan.md:18-20 | Đổi cardless khó nếu tổ chức muốn xem dài hơn; hoặc cửa sổ dài gây chậm không cần thiết |
| OQ-09 | Câu chặn vai thiếu quyền nêu "Sổ công nợ" dù cũng chặn trang Doanh thu — có cần câu trung tính ("mục tài chính") cho đúng bối cảnh? | apps/web/src/lib/use-finance-route-guard.ts:6; E-01 | Người dùng trợ giảng nhận thông báo sai tên màn mình vừa bị chặn |
