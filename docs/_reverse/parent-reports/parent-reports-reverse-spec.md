---
feature: parent-reports
type: reverse-srs
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
confidence_summary: "spec: ✅ 77 / 🔵 2 / 🟡 4; tổng toàn assembly: ✅ 134 / 🔵 6 / 🟡 13"
---

# parent-reports — Đặc tả đảo ngược (reverse-SRS) — draft

Feature "parent-reports" = cụm "Phụ huynh — Báo cáo" phía giáo viên: trang
"Báo cáo phụ huynh" (danh sách báo cáo tuần đã gửi, chỉ số, nhật ký gửi tin nhắn)
và việc tạo/gửi báo cáo tuần cho phụ huynh qua modal. Toàn bộ cụm đang BỊ ẨN Khỏi UI
bởi một hằng số tĩnh; phần server, bảng dữ liệu và thành phần trang vẫn còn nguyên
và hoạt động được ngay khi bật lại.

> Quy ước nhãn — mỗi mệnh đề mang nhãn riêng: ✅ = khẳng định bởi code/test, có cite
> `path:line`; 🔵 = suy luận từ ≥2 bằng chứng code; 🟡 = phỏng đoán nghiệp vụ/why,
> bắt buộc kèm OQ tương ứng (Mục 12). Tên endpoint/hàm/bảng chỉ xuất hiện ở cột
> Truy vết và các file nguồn/evidence, không nằm trong mệnh đề FR/BR.

## Mục 0 — Nguồn soạn thảo (draft provenance)

- Soạn từ mã nguồn develop @ d6c0f6b5, đọc tĩnh, không chạy test, không sửa code.
- Plan reverse ghi feature này confidence LOW, 1 nguồn, complexity flag `flag-off`.
  Kết quả điều tra thực tế ĐIỀU CHỈNH nhận định ban đầu đó: đây KHÔNG phải feature
  "chưa có code".
  Backend (route tạo + danh sách, bảng dữ liệu, hợp đồng), trang web, modal tạo, và
  bộ test đều có thật từ issue #173; cụm chỉ bị CHE ĐIỂN VÀO UI từ issue #210 bằng
  hằng số tĩnh. 🔵 (bằng chứng gộp: reverse-sources.md S1..S33; plan
  plans/260921-0347-hide-parent-reports-cluster/plan.md:8-22; docs/codebase-summary.md:61;
  docs/project-overview-pdr.md:21)
- complexity_flag: flag-off (UI cluster gated by static constant) — giữ nguyên định
  danh này, bổ sung pattern "honest-empty-state" ở trang (không phải state-machine).
- Phân định ranh giới NGHIÊM NGẶT để không trộn feature khác:
  - Ngân hàng nhận xét (comment_bank) dùng chung module server nhưng phục vụ cụm
    Chấm bài — không thuộc feature này. ✅ apps/web/src/components/modals/grade-modal.tsx:116
  - Chuông thông báo (notif) ở topbar và màn "Nhật ký thông báo" — feature riêng
    (#454). ✅ plans/260921-0347-hide-parent-reports-cluster/plan.md:43
  - Thẻ thông tin "Phụ huynh" (tên/SĐT) ở hồ sơ học viên là dữ liệu hồ sơ, không phải
    tính năng báo cáo. ✅ apps/web/src/routes/_auth/students/$studentId.tsx:282-287;
    packages/db/src/schema/student.ts:29-30

### 0.1 Bảng tài nguyên S (đầy đủ ở reverse-sources.md)

| S-id | Tài nguyên | Loại |
|---|---|---|
| S1 | Hằng số cờ cụm (lib/features.ts) | client lib |
| S2 | Trang "Báo cáo phụ huynh" | client route |
| S3 | Modal tạo báo cáo tuần | client component |
| S4 | Điều hướng giáo viên (sidebar) | client component |
| S5 | Shell chung — lọc mục bị tắt | ui package |
| S6 | Tìm kiếm lệnh ⌘K | client component |
| S7 | Breadcrumb shell | client component |
| S8 | Trang hồ sơ học viên (điểm vào thứ 2) | client route |
| S9 | Danh sách route hợp lệ cho service worker | client lib |
| S10 | Kiểu hành động ghi (client) | client lib |
| S11 | Ánh xạ hành động → API (client) | client lib |
| S12 | Bộ ánh xạ dòng báo cáo (client) | client lib |
| S13 | Bộ giảm sắc store (no-op với tạo báo cáo) | client lib |
| S14 | Kiểu dữ liệu báo cáo phía client | client lib |
| S15 | Trạng thái khởi tạo rỗng | client lib |
| S16 | Hợp đồng Zod tạo báo cáo + dòng snapshot | api package |
| S17 | Bảng báo cáo (schema) | db schema |
| S18 | Route server tạo + danh sách báo cáo | server code |
| S19 | Bộ nạp danh sách (loader) | server code |
| S20 | Mount route báo cáo trên kernel | server code |
| S21 | Migration tạo bảng báo cáo | migration |
| S22 | Migration thêm nội dung + kênh | migration |
| S23 | Migration template báo cáo (bảng setting đã mộ) | migration |
| S24 | Test server endpoint báo cáo | test |
| S25 | Test trang báo cáo + redirect cờ | test |
| S26 | Test modal tạo báo cáo | test |
| S27 | Test hồ sơ học viên với cờ bật | test |
| S28 | Test điều hướng bị chặn bởi cờ | test |
| S29 | Test ánh xạ lệnh tạo báo cáo | test |
| S30 | Schema bảng cài đặt đã mộ (tpl_report) | db schema |
| S31 | Tài liệu tổng kết mã nguồn (ví dụ cụm ẩn) | docs |
| S32 | Tài liệu nguyên tắc sản phẩm (deferred cluster) | docs |
| S33 | Plan hoãn cụm (#210) | plan doc |

### 0.2 Liên kết

- Nguồn chi tiết: [reverse-sources.md](reverse-sources.md)
- Khoảng trống & câu hỏi mở: [reverse-gaps.md](reverse-gaps.md)
- Bằng chứng thô: [_evidence.md](_evidence.md)
- Luồng: [srs/parent-reports-reverse-flows.md](srs/parent-reports-reverse-flows.md)
- Máy trạng thái: [srs/parent-reports-reverse-states.md](srs/parent-reports-reverse-states.md)
- Mô hình dữ liệu: [srs/parent-reports-reverse-erd.md](srs/parent-reports-reverse-erd.md)
- Use cases: [usecases/parent-reports-reverse-usecase-index.md](usecases/parent-reports-reverse-usecase-index.md)

### 0.3 Tài liệu nghiệp vụ hiện có

- Không có tài liệu feature riêng cho parent-reports (plan reverse `existing_doc` rỗng
  cho slug này). ✅ docs/_reverse/reverse-plan.json (entry slug parent-reports, sources
  chỉ 1 file)
- Có 2 tài liệu dự án nhắc cụm này như ví dụ về cụm hoãn phát triển:
  docs/codebase-summary.md:61 và docs/project-overview-pdr.md:21. ✅ (nội dung docs)
- Có plan + phase hoãn cụm (#210) ghi rõ ý định "hoãn, không xóa" và hướng dẫn bật
  lại — lưu ý phần hướng dẫn liên quan trang Cài đặt đã LỆI THỜI vì trang Cài đặt
  đã bị xóa khỏi codebase (xem OQ-07, OQ-10). ✅
  plans/260921-0347-hide-parent-reports-cluster/plan.md:59-63 (hướng dẫn) + negative-search
  "settings.tsx không tồn tại" trong reverse-gaps.md
- Plan gốc của tính năng gửi báo cáo tuần là issue #173 (comment trong hợp đồng và
  route server); không thấy tài liệu nghiệp vụ #173 trong repo. 🟡 (số phận tài liệu
  gốc — OQ-01)

## Mục 1 — Phạm vi

- Trong phạm vi (code có thật, đang bị ẩn khỏi UI):
  - Trang "Báo cáo phụ huynh": 3 thẻ chỉ số, bảng báo cáo đã gửi, nhật ký gửi tin
    nhắn, trạng thái trung thực kết nối Zalo OA. ✅ apps/web/src/routes/_auth/reports.tsx:35-191
  - Tạo và gửi báo cáo tuần qua modal (từ trang báo cáo và từ hồ sơ học viên). ✅
    apps/web/src/components/modals/create-report-modal.tsx:1-142,
    apps/web/src/routes/_auth/students/$studentId.tsx:218-222
  - Server: tạo báo cáo + danh sách báo cáo theo tổ chức. ✅
    apps/server/src/routes/reporting/index.ts:54-103
  - Cơ chế ẩn cụm bằng hằng số tĩnh và chuyển hướng route. ✅
    apps/web/src/lib/features.ts:3-7, apps/web/src/routes/_auth/reports.tsx:15-22
- Ngoài phạm vi (chỉ nhắc khi liên quan): gửi tin thật qua Zalo OA/Email (chưa có
  tích hợp — kênh chỉ là thuộc tính mô tả); xác nhận "phụ huynh đã đọc" (không có
  nguồn ghi); ngân hàng nhận xét cho chấm bài; nhật ký thông báo (#454); mẫu báo cáo
  trong Cài đặt (trang đã bị xóa); khung nhìn báo cáo cho phụ huynh/học viên (không
  tồn tại — negative-search trong reverse-gaps.md).

## Mục 2 — Actor

- **Giáo viên (chủ tổ chức/thành viên web)**: actor duy nhất thao tác (xem trang,
  tạo/gửi báo cáo). Mọi route server đòi phiên đăng nhập; ghi qua kernel giáo viên.
  ✅ apps/server/src/routes/reporting/index.ts:30-34, apps/server/src/routes/reporting/index.ts:60-61;
  test 401 apps/server/src/kernel.test.ts:2746-2756
- **Phụ huynh**: KHÔNG có actor hệ thống — người nhận cuối của báo cáo qua kênh
  ngoài (Zalo OA/Email) nhưng kênh chưa được nối thật; phụ huynh không đăng nhập
  và không có màn hình nào. 🟡 (định vị người nhận — OQ-02) + negative-search
  (apps/student 0 hit, apps/landing 0 hit)
- **Học viên**: chỉ là đối tượng của báo cáo (mỗi báo cáo gắn đúng 1 học viên cùng
  tổ chức); app học viên không hiển thị báo cáo. ✅
  packages/db/src/schema/report.ts:16-18; negative-search apps/student 0 hit

## Mục 3 — Yêu cầu chức năng (FR)

Trạng thái mặc định hiện tại: cụm ẨN (cờ = false). Các FR dưới đây đặc tả hành vi
khi cụm được bật (và FR-01/FR-02 đặc tả chính cơ chế ẩn — phần duy nhất đang chạy).

| FR | Yêu cầu | Điều kiện / Giới hạn | Truy vết |
|---|---|---|---|
| FR-01 | Khi cờ cụm tắt: mục "Báo cáo" nhóm "Kinh doanh" trên thanh điều hướng và mục tương ứng trong tìm kiếm nhanh ⌘K KHÔNG xuất hiện. | Lọc tại nguồn danh sách mục, không phải ẩn bằng CSS; áp dụng cả cho ⌘K vì ⌘K dùng chung danh sách điều hướng. | ✅ apps/web/src/lib/features.ts:7; apps/web/src/components/layout/sidebar.tsx:117-122; packages/ui/src/components/app-shell/nav-group.tsx:207-209; apps/web/src/components/command-search/search-index.ts:180-183; test apps/web/src/components/layout/sidebar.test.tsx:178-184 |
| FR-02 | Khi cờ cụm tắt: vào thẳng địa chỉ /reports bị chuyển hướng về trang Tổng quan trước khi render. | Chuyển hướng chạy phía client (route vẫn nằm trong danh sách route hợp lệ cho service worker để trình duyệt kịp chuyển hướng). | ✅ apps/web/src/routes/_auth/reports.tsx:15-22; test apps/web/src/routes/_auth/reports.test.tsx:158-165; apps/web/src/routes-matcher.ts:13; test apps/web/src/routes-matcher.test.ts:24 |
| FR-03 | Trang "Báo cáo phụ huynh" mở đầu bằng tiêu đề "Báo cáo phụ huynh" và dòng trạng thái trung thực: tổng số báo cáo (hoặc "Chưa có báo cáo nào") kèm nhãn "Zalo OA: Chưa kết nối". | Không được có lời quảng cáo kênh ("Gửi qua Zalo OA") khi chưa kết nối — quyết định trung thực #172; trạng thái kết nối hiện là hằng chưa nối. | ✅ apps/web/src/routes/_auth/reports.tsx:38-42, apps/web/src/routes/_auth/reports.tsx:62-90; test apps/web/src/routes/_auth/reports.test.tsx:63-102 |
| FR-04 | Ba thẻ chỉ số: "Tổng báo cáo" (mọi trạng thái), "Đã gửi" (khác nháp), "Phụ huynh đã đọc" (có mốc đọc). | Hiện tại "Phụ huynh đã đọc" luôn 0 vì không có nguồn ghi mốc đọc — OQ-02. | ✅ apps/web/src/routes/_auth/reports.tsx:91-104; (không nguồn ghi) negative-search R3 trong reverse-gaps.md |
| FR-05 | Bảng "Báo cáo đã gửi" (tiêu đề mục kèm mô tả "Báo cáo tuần gửi phụ huynh qua Zalo OA") gồm 6 cột: "Học viên", "Chu kỳ", "Số buổi", "Trạng thái", "Gửi lúc", "Phụ huynh xem". | Nhãn trạng thái: "Đã đọc" / "Đã gửi" / "Nháp"; cột "Phụ huynh xem" hiện mốc đọc hoặc "Chưa mở"; danh sách rỗng thì hiện "Chưa có báo cáo nào được gửi." | ✅ apps/web/src/routes/_auth/reports.tsx:105-113, apps/web/src/routes/_auth/reports.tsx:115-158, apps/web/src/routes/_auth/reports.tsx:24-33, apps/web/src/routes/_auth/reports.tsx:145-153 |
| FR-06 | Mục "Nhật ký gửi tin nhắn": chỉ liệt kê báo cáo ĐÃ gửi (có mốc gửi); mỗi dòng gồm ngày-gửi, "Báo cáo tuần → {tên học viên}", mô tả "Zalo OA · Đã gửi" hoặc "Zalo OA · Phụ huynh đã mở {mốc}", kênh "Zalo OA"; mới nhất lên đầu. | Nháp KHÔNG được vào nhật ký (bảo vệ "không hiện tin chưa gửi" của #173); rỗng thì hiện "Chưa có nhật ký gửi tin nhắn." | ✅ apps/web/src/routes/_auth/reports.tsx:44-58, apps/web/src/routes/_auth/reports.tsx:160-187; comment server apps/server/src/routes/reporting/index.ts:56-58; bảo vệ tại reports.tsx:44-45; test :142-145 chỉ assert phần tích cực, chưa có assert phủ định cho nháp |
| FR-07 | Nút "+ Tạo báo cáo tuần" trên trang mở modal tạo báo cáo. | Một modal dùng chung cho mọi điểm vào. | ✅ apps/web/src/routes/_auth/reports.tsx:85-90, apps/web/src/routes/_auth/reports.tsx:188 |
| FR-08 | Modal "Tạo báo cáo tuần" có 4 trường: "Học viên" (danh sách học viên của tổ chức), "Chu kỳ" (gợi ý "VD: 01–07/09"), "Nội dung báo cáo" (ô dài, gợi ý "Nhập nội dung báo cáo..."), "Gửi qua" ("Zalo OA (Chưa kết nối)" mặc định, hoặc "Email"). | Trường tổ chức không có học viên thì hiện lựa chọn "Chưa có học viên" và chặn lưu (FR-09); tổ chức rỗng form mở với lựa chọn rỗng. | ✅ apps/web/src/components/modals/create-report-modal.tsx:17-23, apps/web/src/components/modals/create-report-modal.tsx:85-119; test apps/web/src/routes/_auth/reports.test.tsx:147-155 |
| FR-09 | Kiểm tra trước khi lưu: phải chọn học viên ("Chọn học viên trước khi lưu."); chu kỳ bắt buộc ("Nhập chu kỳ báo cáo (VD: 01–07/09)."); GỬI thì nội dung bắt buộc ("Nhập nội dung báo cáo trước khi gửi."); LƯU NHÁP cho phép nội dung rỗng. | Kiểm tra phía client trước, server kiểm tra lại độc lập (BR-04). | ✅ apps/web/src/components/modals/create-report-modal.tsx:26-39; test apps/web/src/components/modals/create-report-modal.test.tsx:99-114; server apps/server/src/routes/reporting/index.ts:69-70 |
| FR-10 | Hai hành động lưu: "Lưu nháp" và "Gửi báo cáo" — đều ghi xuống server; thành công thì xóa trắng chu kỳ/nội dung và đóng modal. | Trong lúc bận cả hai nút bị khóa để tránh ghi đôi. | ✅ apps/web/src/components/modals/create-report-modal.tsx:27, apps/web/src/components/modals/create-report-modal.tsx:70-73, apps/web/src/components/modals/create-report-modal.tsx:125-138; test apps/web/src/components/modals/create-report-modal.test.tsx:72-97 |
| FR-11 | Ghi thất bại xác định → giữ mở modal và GIỮ NGUYÊN nội dung đã gõ, thông báo "Không gửi được báo cáo — thử lại." hoặc "Không lưu được nháp — thử lại."; KHÔNG RÕ kết quả (mất mạng/lỗi máy chủ) → thông báo "Không chắc báo cáo đã lưu — kiểm tra danh sách trước khi thử lại." và không đóng modal. | Lý do giữ modal khi không rõ kết quả: tránh ghi đôi khi người dùng bấm lại mù quáng; nội dung đã gõ không bị mất. | ✅ apps/web/src/components/modals/create-report-modal.tsx:53-69; test apps/web/src/components/modals/create-report-modal.test.tsx:116-133, apps/web/src/components/modals/create-report-modal.test.tsx:135-149; phân loại kết quả apps/web/src/lib/repos/kernel.ts:393-421 |
| FR-12 | Tạo báo cáo phía máy chủ: đòi đăng nhập (401 nếu không); chỉ nhận đúng 5 trường khai báo (thừa/thiếu/sai loại đều từ chối 400); học viên phải tồn tại TRONG CÙNG tổ chức (400 nếu không); gửi không nội dung bị chặn 400; khi gửi thì ghi mốc "Gửi lúc" theo giờ Việt Nam định dạng ngày/tháng giờ:phút, khi lưu nháp thì mốc gửi rỗng; mốc "Phụ huynh xem" luôn rỗng lúc tạo; thành công trả 201 kèm mã báo cáo. | Mã báo cáo do máy chủ sinh ngẫu nhiên; số buổi ghi 0. | ✅ apps/server/src/routes/reporting/index.ts:54-101 (mốc giờ :42-52, số buổi :92, mốc gửi :93, mốc đọc :94); hợp đồng packages/api/src/contracts.ts:1298-1315; test apps/server/src/kernel.test.ts:2660-2756 |
| FR-13 | Danh sách báo cáo phía máy chủ: trả các báo cáo của tổ chức người xem, ghép học viên cùng tổ chức (dòng có quan hệ chéo tổ chức bị ẩn khỏi cả danh sách lẫn bản chụp dữ liệu), thứ tự cũ nhất trước. | Web ĐỌC danh sách qua bản chụp kernel (một lần lấy toàn bộ dữ liệu); endpoint danh sách rời tồn tại và dùng chung bộ nạp nhưng web không gọi — negative-search #11. | ✅ apps/server/src/routes/reporting/loaders.ts:9-30; apps/server/src/routes/reporting/index.ts:25-36; test apps/server/src/kernel.test.ts:2447-2458, apps/server/src/kernel.test.ts:2513-2544 |
| FR-14 | Từ hồ sơ học viên: nút "Tạo báo cáo" (hàng nút đầu trang) chỉ xuất hiện khi cụm bật; mở cùng modal với học viên đang xem được chọn sẵn. | Cả nút lẫn modal đều bọc trong cờ — không thể mở modal khi cờ tắt. | ✅ apps/web/src/routes/_auth/students/$studentId.tsx:28, apps/web/src/routes/_auth/students/$studentId.tsx:138, apps/web/src/routes/_auth/students/$studentId.tsx:218-222, apps/web/src/routes/_auth/students/$studentId.tsx:382-389; test apps/web/src/routes/_auth/students/$studentId.reports.test.tsx:17-47 |
| FR-15 | KHÔNG có hành động sửa, xóa, gửi lại, hay chuyển nháp→đã-gửi sau khi tạo; nội dung báo cáo cũng không xem lại được từ danh sách (không trang/m modal chi tiết). | Route máy chủ chỉ có lấy-danh-sách và tạo; client không có lệnh nào khác. | ✅ apps/server/src/routes/reporting/index.ts:54-103; apps/web/src/lib/data-actions.ts:95-106 (duy nhất một kiểu lệnh tạo); negative-search R3 trong reverse-gaps.md (OQ-05) |
| FR-16 | Cụm không tồn tại ở bất kỳ ứng dụng nào khác (app học viên, app landing/profile/admin) — báo cáo là công cụ của giáo viên trên web. | Quét toàn bộ các app khác: 0 kết quả. | ✅ negative-search R3 — reverse-gaps.md §Negative-search #2 (lệnh + 0 hit) |

## Mục 4 — Yêu cầu phi chức năng (NFR)

| NFR | Yêu cầu | Truy vết |
|---|---|---|
| NFR-01 | Mọi lời gọi lấy danh sách và tạo báo cáo đòi phiên đăng nhập; thiếu phiên → 401 đồng nhất. | ✅ apps/server/src/routes/reporting/index.ts:30-34, apps/server/src/routes/reporting/index.ts:60-61; test apps/server/src/kernel.test.ts:2746-2756 |
| NFR-02 | Phòng chống CSRF ở tầng kernel: ghi (tạo) chỉ nhận khi Origin nằm trong danh sách cho phép (403) và thân yêu cầu phải là JSON (415); route báo cáo được mount SAU tầng này nên được bảo vệ như mọi lệnh ghi kernel. | ✅ apps/server/src/routes/kernel.ts:185-206; ghi chú mount apps/server/src/routes/kernel.ts:3490-3491 |
| NFR-03 | Hợp đồng dữ liệu chặt: đúng 5 trường, từ chối trường lạ; độ dài chu kỳ ≤ 120 ký tự, nội dung ≤ 4000 ký tự. | ✅ packages/api/src/contracts.ts:1303-1315; test trường lạ + kênh lạ apps/server/src/kernel.test.ts:2732-2745 |
| NFR-04 | Mốc "Gửi lúc" theo múi giờ Việt Nam (Asia/Ho_Chi_Minh), định dạng ngày/tháng giờ:phút khớp định dạng hiển thị của nhật ký; tránh lệch ngày khi máy chủ chạy UTC. | ✅ apps/server/src/routes/reporting/index.ts:42-52 (chú thích giải thích) |
| NFR-05 | Trung thực kết quả ghi ở client: phân loại rõ thành-có-tải-lại / thành-chưa-tải-lại / thất-bại-xác-định / không-rõ-kết-quả; modal phản ứng đúng từng loại (FR-11). | ✅ apps/web/src/lib/repos/kernel.ts:393-421; apps/web/src/components/modals/create-report-modal.tsx:53-69 |
| NFR-06 | Tạo báo cáo KHÔNG tự biến đổi store cục bộ (số liệu đến từ bản chụp sau ghi) — chống lệch số giữa client và máy chủ. | ✅ apps/web/src/lib/data-store-reducer.ts:97-105 (chú thích #450/#508) |
| NFR-07 | Chỉ mục dữ liệu: (tổ chức, thời điểm tạo, mã) và (học viên) — phục vụ danh sách theo tổ chức và lọc theo học viên. | ✅ packages/db/src/schema/report.ts:31-34; packages/db/src/migrations/0005_mature_sasquatch.sql:37-38 |
| NFR-08 | Không có catalog i18n: mọi chữ người dùng thấy là chuỗi literal tại component (R2 — một nguồn duy nhất mỗi câu chữ). | ✅ negative-search R3 — reverse-gaps.md §Negative-search #7 (find rỗng) |

## Mục 5 — Quy tắc nghiệp vụ (BR)

- **BR-01.** Mỗi báo cáo thuộc đúng một tổ chức và gắn đúng một học viên CÙNG tổ
  chức; xóa tổ chức hoặc học viên thì báo cáo theo bị xóa. ✅
  packages/db/src/schema/report.ts:12-18; test chéo tổ chức apps/server/src/kernel.test.ts:2523-2544,
  apps/server/src/kernel.test.ts:2716-2730
- **BR-02.** Trạng thái báo cáo chỉ có thể là: Nháp, Đã gửi, Đã đọc; khi TẠO chỉ được
  chọn Nháp hoặc Đã gửi — "Đã đọc" không thể đạt được bằng bất kỳ lời gọi hiện có
  (không nguồn ghi — xem OQ-02). ✅ packages/db/src/schema/report.ts:6,21;
  packages/api/src/contracts.ts:1309; negative-search R3 trong reverse-gaps.md
- **BR-03.** Mốc "Gửi lúc" chỉ được ghi khi báo cáo thật sự được gửi; nháp giữ mốc
  rỗng — nhật ký gửi tin nhắn không bao giờ hiện một tin chưa hề gửi đi. ✅
  apps/server/src/routes/reporting/index.ts:56-58 (chú thích #173), :93; test
  apps/server/src/kernel.test.ts:2682-2699
- **BR-04.** Cấm gửi báo cáo không có nội dung — kiểm tra ở CẢ client lẫn server
  (một lệnh gửi rỗng sẽ tạo dòng nhật ký cho tin không tồn tại). ✅
  packages/api/src/contracts.ts:1298-1314; apps/web/src/components/modals/create-report-modal.tsx:36-39;
  test apps/server/src/kernel.test.ts:2701-2714, apps/web/src/components/modals/create-report-modal.test.tsx:99-114
- **BR-05.** Kênh gửi (Zalo OA/Email) hiện chỉ là thuộc tính mô tả — CHƯA có tích
  hợp gửi thật; UI phải nói trung thực trạng thái chưa kết nối (#172), không được
  hứa hẹn tích hợp. ✅ packages/db/src/schema/report.ts:8,24-26 (chú thích "kênh chỉ
  là metadata"); apps/web/src/routes/_auth/reports.tsx:38-42; apps/web/src/components/modals/create-report-modal.tsx:114-119;
  test apps/web/src/routes/_auth/reports.test.tsx:79-81
- **BR-06.** "Số buổi" luôn ghi 0 lúc tạo — hiện chưa có logic nào tự đếm buổi học
  của tuần báo cáo. ✅ apps/server/src/routes/reporting/index.ts:92 (OQ-03)
- **BR-07.** Tổ chức không thấy báo cáo của tổ chức khác; dữ liệu quan hệ lỗi (báo
  cáo trỏ học viên khác tổ chức) bị ẩn thay vì lỗi. ✅
  apps/server/src/routes/reporting/loaders.ts:23-27; test apps/server/src/kernel.test.ts:2523-2544
- **BR-08.** Bản ghi báo cáo sống trong bảng dữ liệu thật (không phải mock): tạo qua
  API, đọc lại qua bản chụp kernel, tồn tại qua reload. ✅
  apps/server/src/kernel.test.ts:2460-2521 (chèn thẳng DB, reload, DTO hiển thị tường minh)

## Mục 6 — Ma trận lỗi

Wording UI trích nguyên văn từ component (R2 — không có catalog i18n).

| Mã / tình huống | HTTP | Điều kiện | Wording / hiển thị | Truy vết |
|---|---|---|---|---|
| E-01 — chưa đăng nhập | 401 | Thiếu phiên trên lấy danh sách / tạo | (API thuần) | ✅ apps/server/src/routes/reporting/index.ts:30-34,60-61; test apps/server/src/kernel.test.ts:2746-2756 |
| E-02 — Origin không cho phép | 403 | Lệnh ghi từ nguồn ngoài danh sách (tầng kernel chung) | (API thuần) | ✅ apps/server/src/routes/kernel.ts:190-194 |
| E-03 — sai kiểu nội dung | 415 | Ghi mà thân không phải JSON (tầng kernel chung) | (API thuần) | ✅ apps/server/src/routes/kernel.ts:195-202 |
| E-04 — thân JSON hỏng | 400 | Thân không phân tích được JSON | (API thuần) | ✅ apps/server/src/routes/reporting/index.ts:63-68 |
| E-05 — thân không hợp lệ | 400 | Thiếu/thừa trường, chu kỳ quá dài, nội dung quá 4000 ký tự, kênh lạ, trạng thái lạ | (API thuần) | ✅ apps/server/src/routes/reporting/index.ts:69-70; packages/api/src/contracts.ts:1303-1314; test apps/server/src/kernel.test.ts:2732-2745 |
| E-06 — gửi thiếu nội dung | 400 | Trạng thái "gửi" mà nội dung chỉ toàn khoảng trắng | (API thuần; client chặn trước bằng câu riêng E-09) | ✅ packages/api/src/contracts.ts:1312-1314; test apps/server/src/kernel.test.ts:2701-2714 |
| E-07 — học viên không hợp lệ | 400 | Học viên không tồn tại hoặc thuộc tổ chức khác | (API thuần) | ✅ apps/server/src/routes/reporting/index.ts:73-79; test apps/server/src/kernel.test.ts:2716-2730 |
| E-08 — xung đột ghi (lý thuyết) | 500 | Câu trả lời của lệnh chèn rỗng (bảo vệ kiểu, chưa thấy xảy ra) | (API thuần) | ✅ apps/server/src/routes/reporting/index.ts:97-99 (không có test — GAP-2) |
| E-09 — client: chưa chọn học viên | — | Bấm Lưu nháp/Gửi khi chưa chọn | "Chọn học viên trước khi lưu." | ✅ apps/web/src/components/modals/create-report-modal.tsx:28-31 |
| E-10 — client: thiếu chu kỳ | — | Chu kỳ chỉ toàn khoảng trắng | "Nhập chu kỳ báo cáo (VD: 01–07/09)." | ✅ apps/web/src/components/modals/create-report-modal.tsx:32-35 |
| E-11 — client: gửi thiếu nội dung | — | Gửi khi nội dung rỗng | "Nhập nội dung báo cáo trước khi gửi." | ✅ apps/web/src/components/modals/create-report-modal.tsx:36-39 |
| E-12 — client: gửi thất bại | — | Máy chủ từ chối | "Không gửi được báo cáo — thử lại." | ✅ apps/web/src/components/modals/create-report-modal.tsx:57-60; test :123-135 |
| E-13 — client: lưu nháp thất bại | — | Máy chủ từ chối | "Không lưu được nháp — thử lại." | ✅ apps/web/src/components/modals/create-report-modal.tsx:60-62 |
| E-14 — client: không rõ kết quả | — | Mất mạng / lỗi máy chủ sau khi gửi | "Không chắc báo cáo đã lưu — kiểm tra danh sách trước khi thử lại." | ✅ apps/web/src/components/modals/create-report-modal.tsx:64-68; test :137-149 |
| E-15 — trang rỗng | — | Tổ chức chưa có báo cáo | "Chưa có báo cáo nào" (kicker), "Chưa có báo cáo nào được gửi." (bảng), "Chưa có nhật ký gửi tin nhắn." (nhật ký) | ✅ apps/web/src/routes/_auth/reports.tsx:76-78, :110-113, :162-165; test apps/web/src/routes/_auth/reports.test.tsx:63-102 |
| E-16 — vào trang khi cờ tắt | — | Truy cập trực tiếp /reports | Chuyển hướng về trang Tổng quan (không có trang lỗi) | ✅ apps/web/src/routes/_auth/reports.tsx:15-22 |

## Mục 7 — Thước đo thành công

| SM | Thước đo | Bằng chứng |
|---|---|---|
| SM-01 | Khi cờ tắt: không mục "Báo cáo" trên điều hướng lẫn ⌘K; vào thẳng /reports về Tổng quan. | ✅ apps/web/src/components/layout/sidebar.test.tsx:178-184; apps/web/src/routes/_auth/reports.test.tsx:158-165 |
| SM-02 | Khi cờ bật: nút "Tạo báo cáo" ở hồ sơ học viên mở đúng modal với học viên đang xem được chọn sẵn. | ✅ apps/web/src/routes/_auth/students/$studentId.reports.test.tsx:19-47 |
| SM-03 | Gửi báo cáo (có nội dung) → dòng mới trạng thái "Đã gửi" có mốc gửi; lưu nháp → dòng "Nháp" mốc gửi rỗng, KHÔNG vào nhật ký. | ✅ apps/server/src/kernel.test.ts:2660-2699; apps/web/src/routes/_auth/reports.test.tsx:104-145 (mệnh đề "KHÔNG vào nhật ký" do mã reports.tsx:44-45 bảo đảm; test chỉ assert dòng sent xuất hiện) |
| SM-04 | Bảo vệ hợp đồng: gửi rỗng, kênh lạ, học viên chéo tổ chức, thiếu đăng nhập đều bị từ chối đúng mã lỗi. | ✅ apps/server/src/kernel.test.ts:2701-2756 |
| SM-05 | Cô lập tổ chức: tổ chức B không thấy báo cáo của tổ chức A; dòng quan hệ chéo tổ chức bị ẩn. | ✅ apps/server/src/kernel.test.ts:2447-2458, :2513-2544 |
| SM-06 | Trang rỗng trung thực (#172): có badge "Zalo OA: Chưa kết nối", KHÔNG có claim "Gửi qua Zalo OA", không còn dữ liệu demo cũ (#107). | ✅ apps/web/src/routes/_auth/reports.test.tsx:63-102 |
| SM-07 | Ghi thất bại không mất chữ đã gõ; không rõ kết quả thì không đóng modal. | ✅ apps/web/src/components/modals/create-report-modal.test.tsx:116-149 |
| SM-08 | "Phụ huynh đã đọc" phản ánh đúng người dùng đã mở tin. | 🟡 chưa có nguồn ghi mốc đọc — bất khả thi ở hiện tại (OQ-02) |

## Mục 8 — Thực thể nghiệp vụ

| Thực thể | Vai trò nghiệp vụ | Truy vết |
|---|---|---|
| Báo cáo tuần cho phụ huynh | Đơn vị duy nhất của feature: chu kỳ + nội dung giáo viên viết + kênh gửi dự định + trạng thái Nháp/Đã gửi/Đã đọc + mốc gửi/đọc | ✅ packages/db/src/schema/report.ts:8-35 |
| Học viên (tham chiếu) | Mỗi báo cáo nói về đúng 1 học viên cùng tổ chức; bảng học viên còn giữ tên/SĐT phụ huynh làm dữ liệu hồ sơ (thuộc feature học viên) | ✅ packages/db/src/schema/report.ts:16-18; packages/db/src/schema/student.ts:29-30 |
| Tổ chức (tham chiếu) | Phạm vi sở hữu dữ liệu; xóa tổ chức xóa theo báo cáo | ✅ packages/db/src/schema/report.ts:13-15 |

Ranh giới: bảng nhận xét dùng chung module server nhưng thuộc cụm Chấm bài; bảng
thông báo thuộc cụm Nhật ký thông báo — cả hai KHÔNG phải thực thể của feature này. ✅
apps/server/src/routes/reporting/index.ts:105-153; apps/server/src/routes/reporting/loaders.ts:32-62

## Mục 9 — Luồng (danh mục)

Đặc tả đủ (sequence + activity) ở srs/parent-reports-reverse-flows.md.

| F-id | Luồng | Một dòng |
|---|---|---|
| F1 | Cổng vào cụm (cơ chế cờ) | Cờ tắt → lọc điều hướng + chuyển hướng route; cờ bật → 3 điểm vào mở |
| F2 | Xem trang "Báo cáo phụ huynh" | Kicker trung thực → 3 KPI → bảng báo cáo → nhật ký gửi |
| F3 | Tạo và gửi báo cáo tuần | Modal 4 trường → kiểm tra → ghi qua server → bản chụp mới → đóng modal |

## Mục 10 — Màn hình

- `/reports` — trang "Báo cáo phụ huynh": kicker + badge kết nối, 3 KPI, bảng
  "Báo cáo đã gửi" 6 cột, mục "Nhật ký gửi tin nhắn", nút "+ Tạo báo cáo tuần" (S2).
  Hiện bị chuyển hướng về `/dashboard` (FR-02).
- `/students/:studentId` — hồ sơ học viên, điểm vào thứ hai: nút "Tạo báo cáo" ở
  hàng nút đầu trang (S8). Ẩn khi cờ tắt.
- Modal "Tạo báo cáo tuần" — 4 trường + 2 nút "Lưu nháp"/"Gửi báo cáo" (S3).

## Mục 11 — Ràng buộc

- Cụm bị chặn bởi MỘT hằng số tĩnh trong mã (không biến môi trường, không toggle
  runtime) — bật lại = đổi một dòng. ✅ apps/web/src/lib/features.ts:3-7;
  docs/project-overview-pdr.md:21
- Route /reports vẫn nằm trong danh sách route hợp lệ của service worker để chuyển
  hướng client hoạt động. ✅ apps/web/src/routes-matcher.ts:13; test
  apps/web/src/routes-matcher.test.ts:24
- Server, bảng dữ liệu, hợp đồng KHÔNG bị ảnh hưởng bởi cờ — luôn hoạt động; chỉ
  UI bị che. ✅ apps/server/src/routes/reporting/index.ts:54-103; test
  apps/server/src/kernel.test.ts:2660-2756 (test server chạy độc lập với cờ)
- Không có tích hợp gửi thật: chưa thấy mã kết nối Zalo OA/Email nào trên máy chủ. ✅
  negative-search R3 trong reverse-gaps.md (OQ-02, OQ-06)
- Bảng cài đặt workspace (chứa template báo cáo cũ) đã bị MỘ từ #321 — API/web
  đọc-ghi gỡ hết, giữ bảng chỉ để dữ liệu cũ không mất; feature KHÔNG được tái sử
  dụng bảng này. ✅ packages/db/src/schema/settings.ts:6-10, :23-26
- Không có catalog i18n (R2): chữ người dùng thấy là literal tại component. ✅
  negative-search trong reverse-gaps.md

## Mục 12 — Câu hỏi mở (OQ)

| OQ | Câu hỏi | Bối cảnh | Ảnh hưởng nếu sai |
|---|---|---|---|
| OQ-01 | Ý định hiện tại của chủ sản phẩm: cụm sẽ bật lại khi nào và với điều kiện gì (chờ kết nối Zalo OA thật, hay bật ngay để dùng như sổ ghi)? | Cụm hoãn từ #210 với lý do "hoãn phát triển"; backend #173 hoàn chỉnh; docs dự án gọi là "deferred cluster" | Lập kế hoạch sai hướng: xây tiếp tích hợp gửi trong khi nghiệp vụ chỉ cần sổ ghi, hoặc ngược lại |
| OQ-02 | "Phụ huynh đã đọc" sẽ lấy dữ liệu từ đâu? Schema đã chừa mốc đọc + trạng thái "Đã đọc" nhưng không có nguồn ghi — có kế hoạch webhook Zalo OA nào không? | FR-04, BR-02, BR-05; KPI luôn 0 | KPI chết chỉ số; hoặc kỳ vọng sai về khả năng xác nhận đọc |
| OQ-03 | Cột "Số buổi" luôn 0 lúc tạo — có cần tự đếm buổi theo tuần báo cáo (từ điểm danh), hay giáo viên không cần số này? | BR-06; bảng hiển thị vẫn dành cột cho nó | Cột hiển thị vô nghĩa; hoặc thiếu thông tin chuyên cần mà phụ huynh cần |
| OQ-04 | "Chu kỳ" là chuỗi tự do — có cần chuẩn hóa thành tuần cố định (tự sinh từ ngày) để gom báo cáo theo tuần? | placeholder "VD: 01–07/09"; hợp đồng chỉ giới hạn độ dài | Không gom/truy vấn theo tuần được; chu kỳ gõ sai định dạng |
| OQ-05 | Nháp hiện "một đi không quay lại": không sửa, không gửi tiếp, không xóa. Có cần vòng đời nháp→gửi hay cho phép xóa nháp sai? | FR-15; không endpoint cập nhật | Nháp lỗi tồn tại vĩnh viễn trong bảng; người dùng tạo lại gây trùng lặp |
| OQ-06 | Lựa chọn "Email" trong "Gửi qua": giữ cho lộ trình hay nên ẩn cho tới khi có tích hợp (để trung thực như Zalo OA)? | dropdown chỉ là metadata; Email không có nhãn "chưa kết nối" như Zalo OA | Người dùng tưởng Email gửi thật — mâu thuẫn với nguyên tắc trung thực #172 |
| OQ-07 | Mẫu báo cáo tuần (template cũ trong Cài đặt, bảng setting đã mộ #321): khi bật lại cụm, mẫu báo cáo sẽ sống ở đâu — bỏ hẳn, hay làm lại theo cách mới? | plan #210 gating cả phần Cài đặt nhưng trang Cài đặt đã bị xóa khỏi codebase | Hướng dẫn bật lại trong plan lỗi thời; người dùng nhớ nhầm tính năng "Mẫu báo cáo" còn tồn tại |
| OQ-08 | Giới hạn nội dung 4000 ký tự và chu kỳ 120 ký tự: nguồn gốc con số, có khớp giới hạn tin nhắn Zalo OA thực tế? | hợp đồng #173 | Báo cáo dài bị cắt khi gửi thật, hoặc giới hạn quá chặt |
| OQ-09 | Có cần xem lại nội dung báo cáo đã gửi (trang/modal chi tiết) không? Hiện nội dung chỉ tồn tại lúc soạn, danh sách không mở được. | FR-15; nội dung vẫn lưu trong DB | Không đối chiếu được đã gửi gì; tra cứu khi phụ huynh hỏi lại |
| OQ-10 | Hướng dẫn bật lại trong plan #210 (đổi kỳ vọng trang Cài đặt về 3 ô) đã lỗi thời vì trang Cài đặt bị xóa — có cần plan mới cho việc bật lại không? | plan:59-63 so với code hiện tại | Bật lại theo plan cũ sẽ fails test tưởng tượng; tốn công kiểm kê lại điểm vào |
