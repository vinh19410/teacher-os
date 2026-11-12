---
type: reverse-srs
feature: student-classes
status: draft
updated: "2026-11-12"
confidence_summary: "✅83 🔵1 🟡15 (trong spec; toàn bộ 11 file: ✅206 🔵3 🟡24 — đếm theo luật batch sau audit) — OQ 8"
---

# student-classes — Đặc tả đảo ngược: cổng học viên — lớp đã ghi danh

## 0. Truy vết nguồn & độ tin cậy

- Tài liệu này là **bản draft CHƯA duyệt**, sinh bằng phân tích ngược (reverse engineering) từ mã nguồn branch `develop` (commit `d6c0f6b5`). Nó mô tả lại hành vi hệ thống như code đang thể hiện, không phải đặc tả sản phẩm ban đầu.
- Phạm vi: góc nhìn HỌC VIÊN về lớp đã ghi danh — xem danh sách lớp của mình, mở chi tiết một lớp (lịch buổi, giáo viên, thẻ thông tin, bạn học, bài tập gắn với lớp). Không tái lập nghiệp vụ quản trị lớp phía app giáo viên (đã có bộ `docs/_reverse/classes/`).
- Mọi nhãn độ tin cậy trong bộ tài liệu này tuân theo quy ước dưới đây; khi một dòng bảng có nhiều nhãn thì mỗi mệnh đề gắn nhãn riêng.
- Nhãn Ưu tiên (P1/P2/P3) trong Mục 3 và Mức độ trong Mục 6 là **phân loại của nhà phân tích** phục vụ trật tự đọc, không phải dữ liệu trích từ code.

> Nhãn: ✅ chắc chắn (code khẳng định: validator/hằng/guard/enum/migration/chuỗi lỗi) · 🔵 suy đoán (≥2 chỗ code hậu thuẫn) · 🟡 cần xác nhận (vì sao/mục tiêu/priority → OQ).

### 0.1 Bảng nguồn

| ID | Nguồn | Vai trò trong tái lập |
|----|-------|------------------------|
| S1 | apps/server/src/routes/student-class.ts | Helper chuyên cho lớp học viên: nạp giáo viên tổ chức, tính Buổi tới, chuyển đổi dòng dữ liệu thành bản ghi lớp, sắp thứ tự buổi legacy |
| S2 | apps/server/src/routes/student.ts | Route học viên: cổng phiên/vai trò, danh sách lớp trong tổng quan, chi tiết lớp |
| S3 | apps/server/src/routes/student-classmates.ts | Route danh sách bạn cùng lớp (roster thu gọn) |
| S4 | apps/server/src/routes/student-class.test.ts | Test đơn vị helper lớp học viên |
| S5 | apps/server/src/routes/student-classmates.test.ts | Test đơn vị roster: hình dạng dữ liệu, ký hiệu tên, các nhánh từ chối |
| S6 | apps/server/src/student.test.ts | Test tích hợp server: payload chi tiết, luật 404, thứ tự buổi legacy, Buổi tới |
| S7 | apps/server/src/role-gates.test.ts | Test chắn vai trò giáo viên trên cổng học viên |
| S8 | apps/e2e/specs/student-class-detail.spec.ts | E2E trang chi tiết lớp: nội dung, điều hướng, bàn phím, trạng thái |
| S9 | apps/e2e/specs/student-classmates.spec.ts | E2E danh sách bạn: số thẻ, ký hiệu bạn, riêng tư |
| S10 | apps/student/src/routes/_auth/classes/ (index.tsx, $classId.tsx) + apps/student/src/routes/_auth/route.tsx + apps/student/src/components/layout/student-page-gate.tsx | Route SPA học viên: trang danh sách, trang chi tiết, chắn phiên |
| S11 | apps/student/src/components/class/ (class-detail-view.tsx, class-info-card.tsx, class-lesson-list.tsx, classmates-tab.tsx, class-assignment-table.tsx, lesson-materials.tsx, ring-stat.tsx, teacher-avatar.tsx + 3 file test: class-lesson-list, classmates-tab, lesson-materials) | Toàn bộ thành phần hiển thị trang lớp |
| S12 | apps/student/src/components/overview/class-card.tsx + student-error-view.tsx | Card lớp ở trang danh sách/tổng quan; các màn lỗi cổng học viên |
| S13 | apps/student/src/lib/repos/student.ts + lib/assignment-status.ts + lib/vietnam-display-date.ts | Lớp đọc dữ liệu phía client (truy vấn, cache), suy trạng thái bài tập, định dạng ngày VN |
| S14 | packages/api/src/contracts.ts | Hợp đồng API học viên: schema lớp, buổi, bài tập, roster, mã lỗi |
| S15 | packages/db/src/schema/ (class.ts, enrollment.ts, lesson.ts, membership.ts) + migrations 0001/0002/0010/0022/0045 | Mô hình dữ liệu: lớp, ghi danh, buổi học, thành viên tổ chức |
| S16 | packages/api/src/vietnam-date.ts + packages/api/src/format-schedule.ts + apps/server/src/lib/assignment-visibility.ts | Hạ tầng chung: thời gian VN, định dạng lịch tuần, lọc bài tập tới hạn |
| S17 | apps/server/src/app.ts | Gắn sub-app học viên vào API chính, bỏ qua bootstrap chung |
| S18 | docs/_reverse/classes/classes-reverse-spec.md | Bộ đặc tả phía admin dùng đối chiếu ranh giới ở Mục 0.3 (không phải nguồn hành vi) |

### 0.2 Tài liệu thành phần

- `reverse-sources.md` — bản đồ nguồn chi tiết kèm range dòng (type: reverse-source-map).
- `reverse-gaps.md` — khoảng trống, quét âm tính, ranh giới bàn giao (type: reverse-gaps).
- `_evidence.md` — bằng chứng từng endpoint, validation, mã lỗi, chuỗi hiển thị nguyên văn (type: reverse-evidence).
- `srs/student-classes-reverse-flows.md` — 4 luồng nghiệp vụ, mỗi luồng có sơ đồ trình tự + sơ đồ khối (type: reverse-srs-flows).
- `srs/student-classes-reverse-states.md` — các nhóm trạng thái hiển thị và vòng đời (type: reverse-srs-states).
- `srs/student-classes-reverse-erd.md` — mô hình thực thể phục vụ góc nhìn học viên (type: reverse-srs-erd).
- `usecases/student-classes-reverse-usecase-index.md` + `usecases/uc-01-xem-chi-tiet-lop-hoc.md`, `usecases/uc-02-xem-ban-cung-lop.md`, `usecases/uc-03-mo-bai-tap-tu-trang-lop.md` — 3 tình huống sử dụng full-dressed (type: reverse-usecase-index / reverse-usecase).

### 0.3 Khác biệt với bộ `classes` (phía admin)

- Bộ `classes` tái lập nghiệp vụ quản trị lớp của app giáo viên: tạo lớp, cảnh báo trùng lịch, giáo trình, học phí, thêm học viên. Bộ này KHÔNG lặp lại các nội dung đó; chỉ mượn mô hình dữ liệu chung để giải thích điều học viên nhìn thấy.
- Cùng một mô hình "giáo viên gắn tổ chức": phía admin đã ghi nhận bảng lớp không có cột giáo viên, giáo viên của lớp = membership 'teacher' sớm nhất của tổ chức (docs/_reverse/classes/classes-reverse-spec.md:31); phía học viên helper nạp giáo viên cũng nói rõ giả định này và hẹn chuyển sang cột trên lớp khi có giáo viên theo lớp (apps/server/src/routes/student-class.ts:57-62). ✅
- Phân chia ranh giới: mọi thao tác ghi (tạo/sửa lớp, điểm danh, chấm bài, thêm học viên) thuộc phía admin hoặc feature khác; feature này chỉ ĐỌC — trang lớp không có nút ghi nào ngoài liên kết mở bài tập và liên kết thư điện tử cho giáo viên (apps/student/src/lib/repos/student.ts:396-445 chỉ chứa truy vấn đọc cho lớp; apps/student/src/components/class/class-detail-view.tsx:230-363). ✅
- Khác biệt bề mặt: app admin chạy trên apps/web với snapshot dùng chung; cổng học viên chạy trên apps/student với hợp đồng API riêng, tự chịu phiên và auto-provision hồ sơ (apps/server/src/routes/student.ts:124-210). ✅

## 1. Scope

**Trong phạm vi feature `student-classes`:**

- Xem danh sách lớp đã ghi danh trong tổ chức đang chọn, gồm cả ghi danh chưa kích hoạt (card hiển thị khác nhau).
- Mở chi tiết một lớp đã kích hoạt: thẻ thông tin (giáo viên, thời lượng, khung giờ, Buổi tới), vòng tiến độ 4 ô, banner việc cần làm, 4 tab: Hành trình học, Bài tập, Giáo trình, Bạn cùng lớp.
- Suy luận hiển thị "Buổi tới" và "Đã kết thúc" theo thời gian Việt Nam (server và client tự tính, không lưu DB).
- Danh sách bạn cùng lớp thu gọn, riêng tư (không email, không band, không điểm).
- Danh sách bài tập của riêng lớp này (đã tới hạn) với liên kết mở bài.
- Liên kết "Nhắn giáo viên" mở trình soạn thư của thiết bị.

**Ngoài phạm vi (ranh giới — xem reverse-gaps.md §4):**

| Ranh giới | Thuộc feature khác | Dấu hiệu trong code |
|-----------|--------------------|---------------------|
| Tham gia lớp (kích hoạt ghi danh) | enrollment-lifecycle | apps/server/src/routes/student.ts:1300-1324; nút "Tham gia lớp" apps/student/src/components/overview/class-card.tsx:99-123 ✅ |
| Làm bài / xem nhận xét | student-quiz | bản ghi làm bài và điểm được nối vào bảng bài tập ở apps/server/src/routes/student-class.ts:145-207 |
| Tài liệu đính kèm buổi học | student-materials | apps/student/src/components/class/class-lesson-list.tsx:204-211 chỉ nêu có tài liệu |
| Trang lịch toàn khoá | student-schedule | apps/server/src/routes/student.ts:1116-1239 |
| Tổng quan portal (feed, tiến độ chung) | student-overview (chưa có bộ) | apps/student/src/components/overview/class-card.tsx dùng ở trang chủ |
| Nguồn gốc trạng thái buổi (điểm danh, huỷ, nghỉ) | attendance | apps/server/src/routes/student.ts:1069-1094 chỉ đọc theo ghi danh |
| Quản trị lớp phía giáo viên | classes | docs/_reverse/classes/classes-reverse-spec.md |

## 2. Actors & Stakeholders

| Actor | Loại | Quan tâm / hành vi | Truy cập | Nguồn | Nhãn |
|-------|------|--------------------|----------|-------|------|
| Học viên đã kích hoạt | người (chính) | Xem lớp của mình, theo dõi buổi tới, mở bài tập, xem bạn học | Đầy đủ trang danh sách + chi tiết | S2 — apps/server/src/routes/student.ts:1048-1063 | ✅ |
| Học viên chờ kích hoạt | người | Chỉ thấy card lớp ở danh sách với nút tham gia; mở chi tiết bị từ chối như lớp không tồn tại | Card không có liên kết; API trả 404 | S12 — apps/student/src/components/overview/class-card.tsx:55-68; S6 — apps/server/src/student.test.ts:840-846 | ✅ |
| Giáo viên (chủ tổ chức) | người | Bị chặn khỏi cổng học viên với mã lỗi riêng | Màn lỗi, không vào được trang nào | S14 — packages/api/src/contracts.ts:1979-1998; S7 — apps/server/src/role-gates.test.ts:190-217 | ✅ |
| Khách chưa đăng nhập | người | Chưa có phiên | Chuyển hướng về đăng nhập; API trả 401 | S10 — apps/student/src/routes/_auth/route.tsx:4-13; S6 — apps/server/src/student.test.ts:909-914 | ✅ |
| Hệ thống xác thực hồ sơ | hệ thống | Tự tạo hồ sơ học viên khi email khớp lần đầu vào cổng | Nền của mọi request | S2 — apps/server/src/routes/student.ts:148-175 | ✅ |
| Giáo viên (như đối tượng hiển thị) | dữ liệu | Tên + email giáo viên hiện trên thẻ thông tin để học viên liên hệ | Chỉ đọc | S1 — apps/server/src/routes/student-class.ts:57-75; S11 — apps/student/src/components/class/class-info-card.tsx:150-154 | ✅ |

## 3. Functional Requirements (FR)

Ghi chú chung: chữ "tổ chức đang chọn" là tổ chức học viên đã chọn trong cổng (header truy vấn hoặc tham số tổ chức — chi tiết ở _evidence.md §2). Nhãn Ưu tiên là phân loại nhà phân tích.

| ID | Tên | Nội dung nghiệp vụ | Ưu tiên | Nguồn | Nhãn |
|----|-----|--------------------|---------|-------|------|
| FR-sc-001 | Danh sách lớp của tôi | Cổng hiển thị MỌI ghi danh của học viên trong tổ chức đang chọn, kể cả ghi danh chưa kích hoạt, sắp theo thời điểm tạo lớp tăng dần rồi theo định danh lớp. | P1 | S2 — apps/server/src/routes/student.ts:983-991 (không lọc trạng thái); S6 — apps/server/src/student.test.ts:767-781 | ✅ |
| FR-sc-002 | Card lớp theo trạng thái ghi danh | Ghi danh đã kích hoạt: cả card là một liên kết mở chi tiết lớp. Ghi danh chờ kích hoạt: card KHÔNG có liên kết, hiển thị nhãn "Chờ kích hoạt" và nút "Tham gia lớp" (thao tác kích hoạt thuộc ranh giới enrollment-lifecycle); khi đang gửi hiển thị "Đang xử lý…". | P1 | S12 — apps/student/src/components/overview/class-card.tsx:55-68, :99-123, :207-215; S8 — apps/e2e/specs/student-class-detail.spec.ts:133-139 | ✅ |
| FR-sc-003 | Mở chi tiết chỉ khi đã kích hoạt | Hệ thống chỉ trả chi tiết lớp khi học viên có ghi danh ĐÃ KÍCH HOẠT của chính mình trong tổ chức đang chọn. Lớp thuộc tổ chức khác, lớp chưa ghi danh, ghi danh chưa kích hoạt: đều trả kết quả "không tìm thấy lớp" như nhau (không phân biệt nguyên nhân cho người gọi). | P1 | S2 — apps/server/src/routes/student.ts:1048-1063; S6 — apps/server/src/student.test.ts:840-856 | ✅ |
| FR-sc-003a | 404 thay cho 403 (ý đồ) | Việc trả cùng một kết quả "không tìm thấy" cho mọi trường hợp không đủ quyền là chủ ý che sự tồn tại của lớp với học viên ngoài lớp — bình luận code tại cả hai route và thông điệp màn hình đều gộp ba nguyên nhân vào một câu. | P2 | S2 — apps/server/src/routes/student.ts:1048-1049; S3 — apps/server/src/routes/student-classmates.ts:24-30; S11 — apps/student/src/components/class/class-detail-view.tsx:372 | 🔵 |
| FR-sc-004 | Nội dung chi tiết lớp | Trang chi tiết gồm: tên lớp, ngày khai giảng, lịch tuần (định dạng chuẩn hoặc văn bản cũ nguyên văn), giáo viên, toàn bộ buổi học CỦA CHÍNH học viên này (lọc theo ghi danh, không theo lớp), tổng số buổi, số buổi đã xong, ngày bắt đầu, và danh sách bài tập của riêng lớp này. | P1 | S2 — apps/server/src/routes/student.ts:1069-1106; S6 — apps/server/src/student.test.ts:793-838 | ✅ |
| FR-sc-005 | Giáo viên hiển thị | Giáo viên hiển thị là membership vai trò 'teacher' SỚM NHẤT của tổ chức (quy ước một giáo viên mỗi tổ chức). Nếu tổ chức không có giáo viên nào thì trường giáo viên rỗng và ô trên thẻ hiện câu thay thế "Chưa có thông tin giáo viên." — ô vẫn hiện, không ẩn. | P1 | S1 — apps/server/src/routes/student-class.ts:57-75; S6 — apps/server/src/student.test.ts:783-791; S11 — apps/student/src/components/class/class-info-card.tsx:150-154 | ✅ (cơ chế) + 🟡 (giả định 1 GV/org còn đúng không) → OQ-1 |
| FR-sc-006 | Buổi tới của lớp | "Buổi tới" là buổi có ngày từ hôm nay (giờ Việt Nam) trở đi mà CHƯA qua giờ kết thúc (ngày + giờ bắt đầu + thời lượng phút). Buổi hôm nay vừa đúng phút kết thúc tính như ĐÃ kết thúc. Giờ kết thúc lệch định dạng thì coi là CHƯA kết thúc (không đoán). Lớp cũ không có ngày buổi thì KHÔNG có Buổi tới. Predicate không nhìn trạng thái buổi. | P1 | S1 — apps/server/src/routes/student-class.ts:77-117 (đặc biệt :110-112); S6 — apps/server/src/student.test.ts:1658-1683, :1699-1731 | ✅ |
| FR-sc-007 | Thứ tự buổi khi thiếu ngày | Nếu mọi buổi đều có ngày: giữ thứ tự truy vấn. Nếu có buổi thiếu ngày (lớp legacy): nhóm các buổi theo cặp ngày+giờ (slot), trong mỗi slot sắp theo bậc trạng thái (đã diễn ra/vắng trước, rồi đã huỷ, rồi sắp tới), và các slot xen kẽ nhau theo vùng lồng nhau. | P2 | S1 — apps/server/src/routes/student-class.ts:236-278; S6 — apps/server/src/student.test.ts:858-907 | ✅ |
| FR-sc-008 | Trạng thái hiển thị của buổi | Mỗi buổi hiển thị một trạng thái: "Đã học", "Sắp tới", "Vắng", "Đã huỷ", hoặc với buổi nghỉ lễ dời lịch: "Nghỉ lễ — Đã dời lịch". Riêng buổi có ngày nhưng đã qua giờ kết thúc (trừ nghỉ lễ) hiển thị thêm "Đã kết thúc" — trạng thái này do client tự suy theo thời gian, không lưu trong dữ liệu. Buổi nghỉ lễ/huỷ không hiện tài liệu kèm. | P1 | S11 — apps/student/src/components/class/class-lesson-list.tsx:13-49, :57-67; test — apps/student/src/components/class/class-lesson-list.test.tsx:29-83; S8 — apps/e2e/specs/student-class-detail.spec.ts:155-166 | ✅ |
| FR-sc-009 | Cắm mốc "Buổi tới" trong danh sách | Đúng một buổi được cắm huy hiệu "Buổi tới" (buổi kế tiếp học viên chưa học, tính cả buổi bù) và đánh dấu bằng thuộc tính aria-current cho trình đọc màn hình. | P1 | S11 — apps/student/src/components/class/class-lesson-list.tsx:69-85, :197-203; test :48-64; S8 — apps/e2e/specs/student-class-detail.spec.ts:155-166 | ✅ |
| FR-sc-010 | Thẻ thông tin lớp | Thẻ hiển thị: ô Giáo viên (luôn hiện, rỗng có câu thay thế), thời lượng kho tính theo tháng (chia 30,4 ngày, làm tròn gần nhất, tối thiểu 1; thiếu ngày đầu/cuối thì ẩn ô này), khung giờ học, và dòng "Buổi tới: …" kèm ngày/thứ (và chủ đề) khi có buổi tới; giờ nằm ở mục "khung giờ học" riêng. | P1 | S11 — apps/student/src/components/class/class-info-card.tsx:39-56, :150-154, :166-188 | ✅ |
| FR-sc-011 | Vòng tiến độ 4 ô | Bốn ô số: đã học, tổng buổi, nghỉ lễ, còn lại. Ngày nghỉ lễ KHÔNG bị trừ khỏi tổng buổi (chỉ được loại khỏi phần tính còn lại). | P2 | S11 — apps/student/src/components/class/class-detail-view.tsx:66-105 (đặc biệt :83-85) | ✅ |
| FR-sc-012 | Banner việc cần làm | Khi lớp còn bài chưa làm, hiện banner đếm số bài với câu dẫn "Bạn còn {todo.length} bài chưa làm trong {className}" kèm câu động viên "Giáo viên đang chờ bài của bạn. Cùng hoàn thành nhé." và nút "Làm ngay". | P1 | S11 — apps/student/src/components/class/class-detail-view.tsx:107-162 (chuỗi tại :146, :149, :157) | ✅ |
| FR-sc-013 | Tab Giáo trình | Liệt kê chương trình theo nhóm chủ đề; bỏ qua ngày nghỉ lễ; một chủ đề được đánh hoàn thành khi mọi buổi của chủ đề đó đã học. Tab tự nhóm từ dữ liệu buổi, KHÔNG đọc giáo trình gốc của lớp. | P2 | S11 — apps/student/src/components/class/class-detail-view.tsx:164-228 | ✅ (cơ chế) + 🟡 (đủ so với giáo trình gốc không) → OQ-3 |
| FR-sc-014 | Bạn cùng lớp — dữ liệu thu gọn | Danh sách bạn chỉ gồm 4 trường: định danh, tên, ký hiệu 2 chữ cái, và ký hiệu "bạn" cho chính học viên. KHÔNG có email, không band điểm, không học phí, không điểm số. Sắp theo tên tăng dần rồi định danh học viên. Người chờ kích hoạt không xuất hiện trong danh sách. | P1 | S3 — apps/server/src/routes/student-classmates.ts:59-78; S14 — packages/api/src/contracts.ts:2222-2232; S5 — apps/server/src/routes/student-classmates.test.ts:174-204; S9 — apps/e2e/specs/student-classmates.spec.ts:121-135 | ✅ |
| FR-sc-015 | Ký hiệu 2 chữ cái | Ký hiệu là 2 chữ cái đầu của 2 từ CUỐI tên (ví dụ "Phạm Bảo Ngọc" → "BN"); tên một từ lấy 1 chữ cái ("Minh" → "M"); tên rỗng cho "?". | P2 | S3 — apps/server/src/routes/student-classmates.ts:17-22; S5 — apps/server/src/routes/student-classmates.test.ts:228-232 | ✅ |
| FR-sc-016 | Tab Bài tập của lớp | Chỉ hiện bài tập ĐÃ TỚI HẠN (không có ngày mở, hoặc ngày mở <= bây giờ). Bảng gồm 4 cột: Bài tập (tên), Hạn, Trạng thái (nhãn suy ra — 11 nhãn: "Điểm: …" / "Điểm: … · Nộp trễ" / "Đã chấm" / "Đã chấm · Nộp trễ" / "Đã nộp" / "Đã nộp — Đang chờ giáo viên chấm" / "Đã nộp · Trễ hạn" / "Đã nộp trễ — Đang chờ giáo viên chấm" / "Quá hạn" / "Sắp đến hạn" / "Chưa nộp"), và Hành động ("Nhận xét" / "Xem lại" / "Làm ngay"); điểm chỉ xuất hiện trong nhãn "Điểm: …", không có cột lớp/kỹ năng/thời điểm nộp. Liên kết mở bài CHỈ tạo cho bài thuộc lớp này; bài gán ngoài lớp chỉ xem. | P1 | S1 — apps/server/src/routes/student-class.ts:145-233; S16 — apps/server/src/lib/assignment-visibility.ts:8-16; S11 — apps/student/src/components/class/class-assignment-table.tsx:22-115; S13 — apps/student/src/lib/assignment-status.ts:119-256 | ✅ |
| FR-sc-017 | Nhắn giáo viên | Nút "Nhắn giáo viên" trên đầu trang mở trình soạn thư của thiết bị với địa chỉ thư điện tử của giáo viên; khi lớp không có giáo viên thì không tạo liên kết. | P3 | S11 — apps/student/src/components/class/class-detail-view.tsx:273-281; S8 — apps/e2e/specs/student-class-detail.spec.ts:148-153 | ✅ (cơ chế) + 🟡 (chỉ mailto, chưa có nhắn tin trong app) → OQ-6 |
| FR-sc-018 | Danh sách lớp rỗng | Khi học viên chưa ghi danh lớp nào, trang danh sách hiện câu trống "Bạn chưa tham gia lớp học nào". | P3 | S10 — apps/student/src/routes/_auth/classes/index.tsx:69-74 | ✅ |

## 4. Non-Functional Requirements (NFR)

| ID | Tên | Nội dung | Nguồn | Nhãn |
|----|-----|----------|-------|------|
| NFR-sc-001 | Cô lập tổ chức | Mọi truy vấn lớp, buổi, bài tập, bạn học đều gắn điều kiện tổ chức đang chọn; không có đường đọc chéo tổ chức. | S2 — apps/server/src/routes/student.ts:1048-1063; S3 — apps/server/src/routes/student-classmates.ts:42-57; S5 — apps/server/src/routes/student-classmates.test.ts:213-216 | ✅ |
| NFR-sc-002 | Chắn vai trò trước cổng | Tài khoản giáo viên bị chặn ở lớp giữa cổng với mã lỗi riêng, trước khi tới bất kỳ route lớp nào. | S2 — apps/server/src/routes/student.ts:506-516; S7 — apps/server/src/role-gates.test.ts:190-235 | ✅ |
| NFR-sc-003 | Riêng tư danh sách lớp | Hợp đồng roster khóa cứng 4 trường (kiểm tra bằng test so khớp bộ khóa); không rò rỉ dữ liệu liên hệ hay học vụ khác. | S14 — packages/api/src/contracts.ts:2222-2232; S5 — apps/server/src/routes/student-classmates.test.ts:196-204 | ✅ |
| NFR-sc-004 | Chịu triển khai lệch pha | Client tự cứu dữ liệu lớp thiếu trường mới (định danh ghi danh rỗng, trạng thái coi như đã kích hoạt, giáo viên rỗng) để trang không sập khi server cũ/cũ hơn trả thiếu trường. | S14 — packages/api/src/contracts.ts:2121-2142 (khối tự cứu tại :2137-2140) | ✅ |
| NFR-sc-005 | Một nguồn thời gian Việt Nam | Mọi phép tính "Buổi tới", "Đã kết thúc", "hôm nay" dùng chung bộ hàm múi giờ UTC+7 của gói hợp đồng; server và client cùng quy ước nan→false khi thời gian hỏng. | S16 — packages/api/src/vietnam-date.ts:69-76 (vietnamSessionEndMs, NaN→null); S13 — apps/student/src/lib/vietnam-display-date.ts:2-42; S1 — apps/server/src/routes/student-class.ts:110-112 | ✅ |
| NFR-sc-006 | Đọc nhẹ, cache ngắn | Chi tiết lớp và danh sách bạn dùng cache 60 giây phía client; danh sách bạn CHỈ được gọi khi tab tương ứng đang mở. | S13 — apps/student/src/lib/repos/student.ts:396-402, :438-445 | ✅ |
| NFR-sc-007 | Một cổng phiên chung | Cả trang lớp và trang bạn học đi qua cùng chuỗi chắn phiên/vai trò gắn ở cấp nhóm route; phần khởi tạo chung của API được cho qua với nhóm học viên để tự chắn riêng. | S17 — apps/server/src/app.ts:206-218, :433-437; S2 — apps/server/src/routes/student.ts:500-545; S6 — apps/server/src/student.test.ts:909-914 | ✅ |
| NFR-sc-008 | Tiếp cận | Mốc "Buổi tới" có aria-current; thao tác card và tab dùng được bằng bàn phím (tiêu điểm hiện rõ); badge trạng thái là text, không chỉ màu. | S8 — apps/e2e/specs/student-class-detail.spec.ts:143-147, :155-166, :320-324 | ✅ |

## 5. Business Rules

| ID | Luật | Nội dung | Áp dụng ở đâu | Nguồn | Nhãn |
|----|------|----------|---------------|-------|------|
| BR-sc-001 | Một ghi danh mỗi cặp học viên–lớp | Dữ liệu chặn trùng bằng ràng buộc duy nhất trên cặp lớp–học viên trong từng tổ chức. | Ghi (ranh giới enrollment-lifecycle); đọc ở trang này | S15 — packages/db/src/schema/enrollment.ts:40-43 (uniqueIndex enrollment_class_student_uq); migration 0001_opposite_loki.sql:21-34 | ✅ |
| BR-sc-002 | Vòng đời ghi danh 2 trạng thái | Ghi danh đi từ trạng thái chờ kích hoạt sang đã kích hoạt; giá trị mặc định trong dữ liệu chỉ tồn tại để điền cho dòng cũ trong migration, code mới luôn ghi trạng thái tường minh. | Mọi guard trang này | S14 — packages/api/src/contracts.ts:1615-1616; S15 — packages/db/src/schema/enrollment.ts:30-33; migration 0022_neat_quicksilver.sql:1 | ✅ |
| BR-sc-003 | Chỉ ghi danh đã kích hoạt mở được nội dung | Chi tiết lớp và danh sách bạn cùng yêu cầu ghi danh đã kích hoạt của chính học viên; chờ kích hoạt bị từ chối giống như không có ghi danh. | FR-sc-003, FR-sc-014 | S2 — apps/server/src/routes/student.ts:1048-1063; S3 — apps/server/src/routes/student-classmates.ts:42-57; S5 — apps/server/src/routes/student-classmates.test.ts:207-211; S6 — apps/server/src/student.test.ts:840-846 | ✅ |
| BR-sc-004 | Giáo viên là thuộc tính tổ chức | Không có cột giáo viên trên lớp; giáo viên hiển thị cho học viên = membership 'teacher' sớm nhất của tổ chức. Mô hình này chia sẻ với phía admin. | FR-sc-005, FR-sc-010 | S1 — apps/server/src/routes/student-class.ts:57-75; S15 — packages/db/src/schema/membership.ts:11-24; docs/_reverse/classes/classes-reverse-spec.md:31 | ✅ (hiện trạng) + 🟡 (sẽ chuyển giáo viên theo lớp) → OQ-1 |
| BR-sc-005 | Ranh giới "kết thúc" tính theo phút | Buổi đúng tại phút kết thúc coi như ĐÃ kết thúc (so sánh "còn hơn bây giờ thì chưa kết thúc"); thời gian hỏng coi như CHƯA kết thúc ở cả server lẫn client. | FR-sc-006, FR-sc-008 | S1 — apps/server/src/routes/student-class.ts:110-112; S6 — apps/server/src/student.test.ts:1709-1717 | ✅ |
| BR-sc-006 | Trạng thái buổi theo từng học viên | Buổi được lọc theo ghi danh (không theo lớp) nên trạng thái riêng như "vắng" là của chính học viên; lớp legacy thiếu ngày được sắp lại ở bước riêng. | FR-sc-004, FR-sc-007 | S2 — apps/server/src/routes/student.ts:1069-1094; S6 — apps/server/src/student.test.ts:793-838 | ✅ |
| BR-sc-007 | Bài tập chỉ hiện khi tới hạn | Bộ lọc dùng chung: không có ngày mở hoặc ngày mở <= bây giờ; áp cho cả danh sách tổng quan lẫn trong trang lớp. | FR-sc-016 | S16 — apps/server/src/lib/assignment-visibility.ts:8-16; S1 — apps/server/src/routes/student-class.ts:145-207 | ✅ |
| BR-sc-008 | Nghỉ lễ không trừ tổng | Ngày nghỉ lễ được đếm riêng và không bị trừ khỏi tổng buổi của vòng tiến độ. | FR-sc-011 | S11 — apps/student/src/components/class/class-detail-view.tsx:83-85 | ✅ |
| BR-sc-009 | Lịch tuần hai hình dạng | Lịch dạng chuẩn (mã `{days,start,end}`) được dựng thành "T2 & T5 · 18:30–20:00"; lịch dạng văn bản cũ hiển thị nguyên văn không biến đổi. | FR-sc-004, FR-sc-010 | S16 — packages/api/src/format-schedule.ts:17-49; S1 — apps/server/src/routes/student-class.ts:119-139 | ✅ |
| BR-sc-010 | Nhiều tổ chức — bọc theo tổ chức chọn | Tổ chức lấy từ tiêu đề yêu cầu với tham số dự phòng; mọi truy vấn chặn theo tổ chức đó, đổi tổ chức giữa chừng làm trang lớp rơi vào "không tìm thấy". | FR-sc-003, E-sc-008 | S2 — apps/server/src/routes/student.ts:177-189; S10 — apps/student/src/routes/_auth/classes/$classId.tsx:51-53; S5 — apps/server/src/routes/student-classmates.test.ts:213-216 | ✅ |
| BR-sc-011 | Tự tạo hồ sơ khi lần đầu vào cổng | Nếu thư điện tử khớp một hồ sơ chưa nối, hệ thống tự nối/tạo trước khi cho đi tiếp; thất bại thì trả mã chưa liên kết. (Nghiệp vụ chi tiết thuộc ranh giới auth-student-signup.) | Nền mọi request cổng | S2 — apps/server/src/routes/student.ts:148-175, :191-199 | ✅ |
| BR-sc-012 | Không giới hạn số buổi trả về | Chi tiết lớp trả toàn bộ buổi của ghi danh, không phân trang/không mốc giới hạn. | FR-sc-004 | S2 — apps/server/src/routes/student.ts:1069-1094 (không có giới hạn trong truy vấn — quét âm tính) | ✅ |
| BR-sc-013 | Roster chỉ 2 trường dữ liệu gốc | Truy vấn chỉ lấy định danh và tên; mọi trường khác (ký hiệu, "bạn") suy ra tại chỗ phục vụ hiển thị. | FR-sc-014, FR-sc-015 | S3 — apps/server/src/routes/student-classmates.ts:59-78 | ✅ |
| BR-sc-014 | Buổi tới không nhìn trạng thái | Predicate server (Buổi tới của lớp trên thẻ thông tin) bỏ qua trạng thái; nhưng huy hiệu "Buổi tới" trên dải Hành trình học do client tính CHỈ chọn buổi `upcoming` — buổi nghỉ lễ không bao giờ được cắm mốc huy hiệu. | FR-sc-006, FR-sc-009 | S1 — apps/server/src/routes/student-class.ts:77-82 (bình luận "không lọc status"); S11 — apps/student/src/components/class/class-lesson-list.test.tsx:66-83 | ✅ (hiện trạng) + 🟡 (cố ý hay cần loại nghỉ lễ) → OQ-7 |

## 6. Error Matrix

Mã lỗi và HTTP giữ nguyên như "từ vựng hợp đồng"; chuỗi hiển thị trích nguyên văn (R2 — không có catalogue đa ngôn ngữ).

| ID | Tình huống | Mã / HTTP | Bề mặt học viên | Nguồn | Test | Nhãn |
|----|-----------|-----------|-----------------|-------|------|------|
| E-sc-001 | Chưa đăng nhập hoặc hết phiên khi gọi API cổng | 401 UNAUTHORIZED | Trang SPA chuyển hướng về đăng nhập trước khi gọi; API vẫn tự chặn 401 nếu gọi thẳng | S2 — apps/server/src/routes/student.ts:127-129, :502-504; S10 — apps/student/src/routes/_auth/route.tsx:4-13 | S6 — apps/server/src/student.test.ts:909-914 | ✅ |
| E-sc-002 | Thư điện tử chưa xác thực | 403 STUDENT_EMAIL_UNVERIFIED | Màn lỗi "Email chưa được xác thực" | S2 — apps/server/src/routes/student.ts:130-138, :529-537; S12 — apps/student/src/components/overview/student-error-view.tsx:109-114 | S7 — apps/server/src/role-gates.test.ts:225-238 (nhánh role trống) | ✅ |
| E-sc-003 | Tài khoản chưa nối hồ sơ học viên (auto-provision thất bại) | 403 STUDENT_NOT_LINKED | Màn "Tài khoản chưa được liên kết" (không chuyển hướng); chuyển hướng onboarding chỉ xảy ra khi hồ sơ đã nối nhưng chưa hoàn tất onboarding (`onboardingCompletedAt == null`) | S2 — apps/server/src/routes/student.ts:191-199; S12 — apps/student/src/components/overview/student-error-view.tsx:105-108; S10 — apps/student/src/routes/_auth/classes/$classId.tsx:29-40 | S6 — apps/server/src/student.test.ts (nhánh lỗi cổng) | ✅ |
| E-sc-004 | Tài khoản giáo viên mở cổng học viên | 403 ACCOUNT_TEACHER_ROLE | Màn lỗi dành riêng cho giáo viên bị chặn | S14 — packages/api/src/contracts.ts:1979-1998; S2 — apps/server/src/routes/student.ts:506-516; S12 — apps/student/src/components/overview/student-error-view.tsx:99-104 | S7 — apps/server/src/role-gates.test.ts:190-217 | ✅ |
| E-sc-005 | Lớp không tồn tại / chưa ghi danh / ghi danh chờ / tổ chức khác | 404 "class not found" | Màn "Không tìm thấy lớp" với câu giải thích gộp "Lớp này không tồn tại, bạn chưa tham gia, hoặc thuộc tổ chức khác." và nút "Về trang chủ" | S2 — apps/server/src/routes/student.ts:1063; S6 — apps/server/src/student.test.ts:840-856; S11 — apps/student/src/components/class/class-detail-view.tsx:365-379 | S8 — apps/e2e/specs/student-class-detail.spec.ts:209-217 | ✅ |
| E-sc-006 | Danh sách bạn: cùng các nguyên nhân E-sc-005 | 404 "class not found" | Khối lỗi trong tab với "Không tải được danh sách lớp" | S3 — apps/server/src/routes/student-classmates.ts:42-57; S11 — apps/student/src/components/class/classmates-tab.tsx:43-51 | S5 — apps/server/src/routes/student-classmates.test.ts:207-226 | ✅ |
| E-sc-007 | Dữ liệu chi tiết lớp không qua kiểm định hình dạng phía client | lỗi phân tích hợp đồng | Trang lỗi chung "Không thể truy cập cổng học viên" | S13 — apps/student/src/lib/repos/student.ts:187-218 (phân tích tại :217); S12 — apps/student/src/components/overview/student-error-view.tsx:82-86 | — (không có test riêng cho nhánh này) | ✅ |
| E-sc-008 | Đổi tổ chức giữa lúc trang lớp đang mở | 404 như E-sc-005 | Cùng màn "Không tìm thấy lớp" (bình luận code nêu đúng kịch bản này) | S10 — apps/student/src/routes/_auth/classes/$classId.tsx:51-53 | — | ✅ |
| E-sc-009 | Lớp kích hoạt nhưng chưa có học viên nào khác trong roster | — | Khối trống "Lớp chưa có học viên nào" + "Khi có bạn mới ghi danh, danh sách sẽ hiện tại đây." | S11 — apps/student/src/components/class/classmates-tab.tsx:54-62 | S9 — apps/e2e/specs/student-classmates.spec.ts:121-135 | ✅ |
| E-sc-010 | Lỗi bất định khi tải danh sách bạn (mạng/server) | — | "Không tải được danh sách lớp" + "Vui lòng thử lại sau ít phút." | S11 — apps/student/src/components/class/classmates-tab.tsx:43-51 | apps/student/src/components/class/classmates-tab.test.tsx:65-74 | ✅ |
| E-sc-011 | Roster đang tải | — | "Đang tải danh sách lớp…" | S11 — apps/student/src/components/class/classmates-tab.tsx:35-41 | apps/student/src/components/class/classmates-tab.test.tsx:25-42 | ✅ |

## 7. Success Criteria

Chưa có bộ chỉ số thành công chính thức cho cổng học viên trong mã nguồn; các chỉ số dưới đây là đề xuất của nhà phân tích. 🟡 → OQ-8

- Chỉ số đề xuất: tỉ lệ phiên học viên mở ít nhất một tab trong trang lớp; tỉ lệ click "Làm ngay" từ banner/tab Bài tập; số lần hỏng phân tích hợp đồng (E-sc-007) bằng 0; số sự cố lộ dữ liệu trong roster bằng 0. 🟡 → OQ-8
- Điều kiện nghiệm thu kiểm thử hiện có (đo được ngay): toàn bộ test đơn vị + E2E nêu ở _evidence.md §1/§2 chạy xanh trong CI. ✅ [negative-search: không có test skip/todo/only trong phạm vi — apps/e2e/specs/student-class-detail.spec.ts:1-348, apps/e2e/specs/student-classmates.spec.ts:1-137, apps/server/src/student.test.ts:1-2015]

## 8. Data Entities (tóm tắt — chi tiết ở srs/student-classes-reverse-erd.md)

| Thực thể | Vai trò với góc nhìn học viên | Trường được đọc | Nguồn | Nhãn |
|----------|-------------------------------|-----------------|-------|------|
| Lớp học | Đối tượng chính của trang | Tên, mức độ, loại, kỹ năng, hình thức, lịch tuần, tổng buổi, số buổi đã xong, trạng thái, ngày khai giảng, ghi chú, học phí (không hiện trên trang này) | S15 — packages/db/src/schema/class.ts:10-41 | ✅ |
| Ghi danh | Cầu nối học viên–lớp và điều vào cửa | Cặp học viên–lớp, tổ chức, trạng thái vòng đời | S15 — packages/db/src/schema/enrollment.ts:11-47 | ✅ |
| Buổi học | Dải "Hành trình học" và cắm mốc Buổi tới | Ngày (được phép trống), thứ, giờ, thời lượng, chủ đề, trạng thái chung, trạng thái riêng của học viên, ghi chú điểm danh (chỉ giáo viên) | S15 — packages/db/src/schema/lesson.ts:46-77; migration 0010_fantastic_karma.sql:1, 0045_aspiring_thena.sql:1-2 | ✅ |
| Thành viên tổ chức | Nguồn tên+email giáo viên | Vai trò (mặc định 'teacher' chỉ là giá trị gốc của dữ liệu cũ) | S15 — packages/db/src/schema/membership.ts:11-24 | ✅ |
| Bài tập của lớp + mục tiêu theo học viên | Dải "Bài tập" trong trang lớp | Tên bài, hạn, hạn chót tuyệt đối, thời điểm nộp của học viên, kỹ năng đề, phần Writing | S1 — apps/server/src/routes/student-class.ts:145-233 | ✅ |
| Bản ghi làm bài | Nguồn điểm và thời điểm chốt trả bài | Điểm 4 tiêu chí, thời điểm chấm, trạng thái lần làm | S1 — apps/server/src/routes/student-class.ts:145-207 | ✅ |

## 9. Flows (tóm tắt — chi tiết ở srs/student-classes-reverse-flows.md)

| ID | Luồng | Bản chất | Nhánh quyết định chính |
|----|-------|----------|------------------------|
| F1 | Mở trang chi tiết lớp từ danh sách | Điều hướng + chuỗi chắn phiên/vai trò/ghi danh | Đã kích hoạt? · Phiên? · Có ghi danh active trong tổ chức? |
| F2 | Xem "Bạn cùng lớp" | Truy vấn khi mở tab, roster thu gọn | Tab mở? · Roster rỗng? · Lỗi? |
| F3 | Xem "Hành trình học" và suy luận Buổi tới / Đã kết thúc | Tính toán hiển thị theo giờ VN ở cả server lẫn client | Mọi buổi có ngày? · Đã qua giờ kết thúc? · Nghỉ lễ? |
| F4 | Xem & mở bài tập từ trang lớp | Lọc tới hạn + suy nhãn trạng thái + liên kết có điều kiện | Bài tới hạn? · Có đường mở bài? |

## 10. Screens (tóm tắt — code có UI thật, apps/student)

- **Trang danh sách lớp** (apps/student/src/routes/_auth/classes/index.tsx:59-92): lưới card lớp; trống → "Bạn chưa tham gia lớp học nào". ✅
- **Trang chi tiết lớp** (apps/student/src/components/class/class-detail-view.tsx:230-363): đầu trang tên lớp + trạng thái + nút "Nhắn giáo viên"; thẻ thông tin; vòng tiến độ 4 ô; banner việc cần làm; 4 tab "Hành trình học / Bài tập / Giáo trình / Bạn cùng lớp" (hằng tab tại class-detail-view.tsx:50-55). ✅
- **Tab Hành trình học** (apps/student/src/components/class/class-lesson-list.tsx:108-215): danh sách buổi theo ngày VN, huy hiệu "Buổi tới", tài liệu kèm (trừ nghỉ lễ/huỷ); trống → "Chưa có buổi học" / "Giáo viên chưa xếp lịch buổi học cho lớp này." ✅
- **Tab Bài tập** (apps/student/src/components/class/class-assignment-table.tsx:44-115): bảng bài tập, cột thao tác; trống → "Chưa có bài tập nào" / "Giáo viên chưa giao bài tập nào cho bạn." ✅
- **Tab Giáo trình** (apps/student/src/components/class/class-detail-view.tsx:164-228): nhóm chủ đề với dấu hoàn thành. ✅
- **Tab Bạn cùng lớp** (apps/student/src/components/class/classmates-tab.tsx:64-73): lưới thẻ tên + ký hiệu 2 chữ cái + "(bạn)". ✅
- **Màn "Không tìm thấy lớp"** (apps/student/src/components/class/class-detail-view.tsx:365-379): "Không tìm thấy lớp" + câu gộp nguyên nhân + "Về trang chủ". ✅
- **Các màn lỗi cổng học viên** (apps/student/src/components/overview/student-error-view.tsx:82-118): mặc định, giáo viên bị chặn, chưa liên kết, email chưa xác thực, hồ sơ mơ hồ. ✅
- **Card lớp ở danh sách/tổng quan** (apps/student/src/components/overview/class-card.tsx:55-123): card liên kết cho ghi danh kích hoạt; nhãn "Chờ kích hoạt" + nút "Tham gia lớp" cho ghi danh chờ; thanh tiến độ dùng tổng buổi/đã xong của lớp. ✅

## 11. Constraints, Dependencies & Assumptions

| ID | Ràng buộc | Nội dung | Nguồn | Nhãn |
|----|-----------|----------|-------|------|
| SC-sc-01 | Ngôn ngữ | Toàn bộ giao diện tiếng Việt; chuỗi hiển thị lấy nguyên văn tại chỗ phát sinh (không có catalogue đa ngôn ngữ trong repo). | S11 — apps/student/src/components/class/* (các hằng chuỗi); quy tắc R2 | ✅ |
| SC-sc-02 | Múi giờ | Mọi phép tính thời gian dùng múi giờ Việt Nam (UTC+7) qua bộ hàm dùng chung; không dùng múi giờ máy người dùng cho logic Buổi tới. | S16 — packages/api/src/vietnam-date.ts:95-110 | ✅ |
| SC-sc-03 | Chỉ đọc | Trang lớp không có thao tác ghi nào; hai thao tác có tính chất "đi tiếp" (tham gia lớp, mở bài) thuộc ranh giới feature khác. | S13 — apps/student/src/lib/repos/student.ts:396-445; S12 — apps/student/src/components/overview/class-card.tsx:99-123 | ✅ |
| SC-sc-04 | Dữ liệu lớp cũ | Lớp/buổi thiếu ngày (kỷ nguyên trước lịch tự sinh) phải vẫn hiển thị được: sắp lại theo slot, không có Buổi tới, trạng thái suy tại client. | S1 — apps/server/src/routes/student-class.ts:236-278; S14 — packages/api/src/contracts.ts:2187-2199 | ✅ |
| SC-sc-05 | Bề mặt dữ liệu khóa cứng | Trang bạn cùng lớp chỉ tiêu thụ 4 trường đã khóa trong hợp đồng; việc thêm trường phải đổi hợp đồng + test trước. | S14 — packages/api/src/contracts.ts:2222-2232; S5 — apps/server/src/routes/student-classmates.test.ts:196-204 | ✅ |
| SC-sc-06 | Phụ thuộc | Phụ thuộc feature/xrange khác: enrollment-lifecycle (kích hoạt), student-quiz (làm bài), student-materials (tài liệu), attendance (nguồn trạng thái buổi), auth-student-signup (hồ sơ). Chưa có bộ đặc tả riêng cho student-overview/student-schedule/student-materials/student-quiz (xem reverse-gaps.md §4). | reverse-gaps.md §4 | ✅ |

## 12. Open Questions

| ID | Câu hỏi | Vì sao mở | Nhãn |
|----|---------|-----------|------|
| OQ-1 | Giả định "một giáo viên mỗi tổ chức" (membership 'teacher' sớm nhất) còn đúng không; khi nào chuyển sang giáo viên theo từng lớp như bình luận code đã hẹn? Ảnh hưởng trực tiếp ô "Giáo viên" và nút "Nhắn giáo viên". | Code tự ghi nhận đây là giả định tạm (apps/server/src/routes/student-class.ts:57-62); phía admin cũng đang ở cùng mô hình (docs/_reverse/classes/classes-reverse-spec.md:31). | 🟡 |
| OQ-2 | Card lớp ở danh sách/tổng quan dùng tổng buổi/đã xong lưu sẵn trên lớp (cột kế thừa), trong khi trang chi tiết tính "Buổi tới"/"Đã kết thúc" theo thời gian thực #395 — hai nguồn số liệu này khi nào hợp nhất? | Hai cơ chế song song: apps/student/src/components/overview/class-card.tsx:244-265 so với apps/server/src/routes/student-class.ts:77-117. | 🟡 |
| OQ-3 | Tab Giáo trình tự nhóm theo chủ đề từ buổi học, không đọc giáo trình gốc của lớp — có cần hiển thị theo giáo trình thật (mô tả, mục tiêu) không? | apps/student/src/components/class/class-detail-view.tsx:164-228 chỉ dùng dữ liệu buổi. | 🟡 |
| OQ-4 | Lớp hình thức Online nhưng cổng học viên không có đường liên kết buổi trực tuyến nào (buổi có cột `zoom` phía giáo viên nhưng không trả qua hợp đồng học viên) — học viên vào buổi bằng cách nào? | Quét âm tính: không có trường liên kết hội họp trong schema lớp (packages/db/src/schema/class.ts:10-41) và không có chuỗi liên kết hội họp trong app học viên (reverse-gaps.md §3). | 🟡 |
| OQ-5 | Trang lớp hiện thuần chỉ đọc — nghiệp vụ phía học viên như xin nghỉ buổi, rời lớp, đề nghị dời lịch có nằm trong lộ trình không? | Không có thao tác ghi nào từ apps/student/src/components/class/*; ranh giới đặt ở reverse-gaps.md §4. | 🟡 |
| OQ-6 | "Nhắn giáo viên" chỉ mở trình soạn thư ngoài thiết bị — có cần nhắn tin trong app (kèm lịch sử) không? | apps/student/src/components/class/class-detail-view.tsx:273-281 chỉ dựng đường thư điện tử. | 🟡 |
| OQ-7 | Buổi tới server (dòng thẻ thông tin) không loại nghỉ lễ; còn huy hiệu trong danh sách đã loại (chỉ `upcoming`). Câu hỏi còn đúng cho dòng "Buổi tới: …" trên thẻ, không còn đúng cho danh sách buổi. Cố ý hay cần loại cùng quy tắc hiển thị "Nghỉ lễ"? | apps/server/src/routes/student-class.ts:77-82 so với apps/student/src/components/class/class-lesson-list.tsx:13-49 (nhãn nghỉ lễ). | 🟡 |
| OQ-8 | Bộ chỉ số thành công cho cổng học viên (Mục 7) là đề xuất nhà phân tích — cần PO chốt chỉ số và ngưỡng. | Không tìm thấy định nghĩa chỉ số trong repo. | 🟡 |
