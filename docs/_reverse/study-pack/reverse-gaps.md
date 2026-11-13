---
feature: study-pack
type: reverse-gaps
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# reverse-gaps — study-pack

> Quy ước nhãn — mỗi mệnh đề mang nhãn riêng: 🟡 đánh dấu câu hỏi mở (vì sao / ai / quyết định nghiệp vụ) —
> bắt buộc xử lý từng mục trước khi nâng đặc tả lên trạng thái duyệt. Các mục GAP là khoảng trống phát hiện được bằng đọc code; các mục INF là
suy diễn có căn cứ (chưa phải ý định đã tuyên bố); NS là tìm kiếm phủ định đã
chạy thật với kết quả ghi nguyên văn.

## 1. Câu hỏi mở (OQ)

### OQ-01 — Vì sao cổng quyền bộ đề tái dùng hai nhóm vai của khối chấm bài? 🟡

- Bối cảnh: mọi route đọc bộ đề/gán lớp mở bằng `canReviewGrade`, mọi route ghi
  (tạo/sửa/xoá/nhân bản/gán/huỷ) mở bằng `canPublishGrade`; `ta` bị chặn ghi với
  403. ✅ apps/server/src/routes/study-pack.ts:78, :103 (đọc), :123 (ghi); định
  nghĩa hai nhóm nằm ở gói xác thực với chú thích nói về "chốt trả bài" và
  "lưu bản nháp chấm bài". ✅ packages/auth/src/role.ts:105-142
- Kế hoạch thi công cũng ghi đúng cách dùng này mà không nêu lý do chọn nhóm.
  ✅ plans/261101-1357-533-study-pack-scheduled-release/phase-03-pack-library-and-org-api.md:66
- Vì sao cần hỏi: tổ chức đã có nhóm vai riêng cho học liệu trung tâm (phía
  admin-library); bộ đề org lại mượn cờ của chấm bài. Nếu sau này tách quyền
  "quản lý học liệu" khỏi "chấm bài", toàn bộ cổng bộ đề sẽ đổi meaning mà
  không đổi code.
- Cần quyết định: giữ mượn cờ chấm bài làm chủ đích lâu dài, hay lập nhóm vai
  học liệu riêng cho phase sau.

### OQ-02 — Trạng thái nháp của bộ đề có kịch bản dùng thật không? 🟡

- Bối cảnh: bảng `study_pack` mặc định `status = 'draft'`; hợp đồng nhận cả hai
  giá trị. ✅ packages/db/src/schema/study-pack.ts:58, packages/api/src/contracts.ts:4499-4503
- Nhưng màn soạn mặc định "Sẵn sàng" ngay khi mở form (được đặt lại mỗi lần mở form, không phải sau lưu);
  danh sách chọn vẫn offering "Nháp". ✅ apps/web/src/routes/_auth/assignments/packs.tsx:75, :134, :538-541
- Gán lớp chỉ nhận bộ `ready`; nhân bản chỉ nhận bộ hệ thống `ready`. ✅
  apps/server/src/lib/study-pack-assign.ts:213-219; ✅ apps/server/src/routes/study-pack.ts:87
- Kế hoạch liệt kê trạng thái trong form nhưng không mô tả luồng dùng nháp.
  ✅ plans/261101-1357-533-study-pack-scheduled-release/phase-05-ui-and-e2e.md:51
- Vì sao cần hỏi: nếu không ai soạn nháp, trạng thái chỉ là rác schema; nếu có
  luồng "soạn dở để đồng nghiệp xem", thì cần ràng buộc hiển thị (ai thấy nháp
  của ai) mà đặc tả chưa ghi.
- Cần quyết định: giữ nháp làm luồng thật (kèm quy tắc hiển thị trong org) hay
  hạ thành chi tiết kỹ thuật.

### OQ-03 — Căn cứ của các trần 366 ngày / 10 mục mỗi ngày / 200 mục / ghi chú 2000 ký tự? 🟡

- Bối cảnh: bốn trần nằm trong hợp đồng (ba hằng :4480-4482; trần ghi chú 2000 là inline `.max(2000)` :4491). ✅ packages/api/src/contracts.ts:4480-4482, :4491
- Kế hoạch ghi các trị đã chốt và một căn cứ kỹ thuật cho trần 200 (trần 100
  biến bind của D1 khi vật hoá/gán). ✅ plans/261101-1357-533-study-pack-scheduled-release/plan.md:29, :89 (RT-4)
- Vì sao cần hỏi: 366 (một năm trọn kể cả năm nhuận) và 10 mục/ngày không thấy
  căn cứ nào trong code hay kế hoạch; đây là trần sản phẩm ảnh hưởng trực tiếp
  tới người dùng.
- Cần quyết định: xác nhận các trần là quyết định sản phẩm cuối, hay cần nới
  theo phản hồi người dùng.

### OQ-04 — Vì sao màn soạn của giáo viên chỉ cho chọn đề trung tâm, dù hợp đồng nhận cả hai nguồn? 🟡

- Bối cảnh: hợp đồng mục bộ đề khai hai nguồn (`org_prompt` và
  `library_test_part`), phía server kiểm chặt cả hai nhánh. ✅
  packages/api/src/contracts.ts:4466-4471, :4486-4493; ✅ apps/server/src/lib/study-pack-clone.ts:364-375
- Nhưng bộ lọc đề trên màn soạn của giáo viên chỉ lấy đề `org_prompt` đủ điều
  kiện. ✅ apps/web/src/routes/_auth/assignments/packs.tsx:91-100
- Đề thư viện vẫn vào bộ đề org theo đường khác: nhân bản bộ hệ thống giữ nguyên
  con trỏ nguồn thư viện. ✅ apps/server/src/routes/study-pack.ts:269-302; ✅ plans/261101-1357-533-study-pack-scheduled-release/phase-03-pack-library-and-org-api.md:71
- Vì sao cần hỏi: đây là khoảng hẹp giữa hợp đồng và UI — chủ đích (đề trung tâm
  chỉ đi qua nhân bản) hay chưa làm (thiếu bộ chọn thư viện).
- Cần quyết định: khoá UI theo chủ đích, hay mở bộ chọn thư viện ở phase sau.

### OQ-05 — Lộ trình hỗ trợ part nghe của thư viện hệ thống? 🟡

- Bối cảnh: kỹ năng `listening` nằm trong danh sách kỹ năng được phép của bộ đề,
  nhưng part nghe từ thư viện hệ thống bị từ chối khi gán/nhân bản với thông
  báo "listening library parts are not supported in study packs yet". ✅
  packages/api/src/contracts.ts:4458-4463; ✅ apps/server/src/lib/study-pack-clone.ts:530-536
- Kế hoạch ghi đây là chặn chủ đích của V1 (RT-5). ✅ plans/261101-1357-533-study-pack-scheduled-release/plan.md:90
- Vì sao cần hỏi: chữ "yet" hứa hẹn phase sau nhưng không có phase kế tiếp nào
  trong repo nhận việc này.
- Cần quyết định: thời điểm và phạm vi hỗ trợ part nghe (kèm yêu cầu audio player
  học viên đã nêu trong RT-5).

### OQ-06 — Ai sở hữu và duy trì ngày nghỉ lớp dùng để tính lịch bộ đề? 🟡

- Bối cảnh: lịch gán nhảy qua các ngày nghỉ lấy theo tổ chức và theo phạm vi
  lớp. ✅ apps/server/src/routes/holidays.ts:166-171; ✅ apps/server/src/lib/study-pack-assign.ts:366-377
- Kế hoạch mô tả cơ chế bỏ qua ngày nghỉ nhưng không nói ai nhập dữ liệu ngày
  nghỉ và chu kỳ cập nhật. ✅ plans/261101-1357-533-study-pack-scheduled-release/plan.md:63
- Vì sao cần hỏi: lịch mở bài của cả lớp lệ thuộc dữ liệu này; nếu tổ chức không
  nhập, lịch tràn vào ngày nghỉ thật và giáo viên phải huỷ-gán lại (V1 không có
  sửa lịch).
- Cần quyết định: owner dữ liệu ngày nghỉ (admin tổ chức?) và quy trình duyệt
  trước kỳ học.

### OQ-07 — Múi giờ Việt Nam cố định có nằm trong tầm nhìn đa khu vực? 🟡

- Bối cảnh: mọi phép tính ngày/giờ của lịch bộ đề (ngày bắt đầu, giờ mở, giờ
  hạn, "hôm nay") chạy cố định theo múi giờ Việt Nam. ✅
  packages/api/src/vietnam-date.ts:27-46, :99; ✅ apps/server/src/lib/study-pack-assign.ts:390-392; hợp đồng nhận ngày và giờ dạng văn bản. ✅ packages/api/src/contracts.ts:4703-4714
- Tìm trong toàn bộ kế hoạch #533 không thấy câu nào nói về múi giờ (kết quả
  rỗng — NS7b dưới đây).
- Vì sao cần hỏi: tổ chức/lớp có học viên ở múi giờ khác sẽ thấy "đến hạn" lệch
  so với đồng hồ địa phương; đây là quyết định sản phẩm, không phải chi tiết kỹ
  thuật.
- Cần quyết định: chốt múi giờ tổ chức làm mặc định dài hạn, hay ghi vào lộ
  trình đa múi giờ.

### OQ-08 — Huỷ bộ đề có cần tuỳ chọn "dọn cả bài đã mở" hoặc thông báo học viên? 🟡

- Bối cảnh: huỷ xoá mọi mục tiêu và bài giao của bộ đề chưa tới giờ mở tính tới
  thời điểm huỷ và chưa bị ai làm; bài đã mở (dù chưa ai làm) và bài có ít nhất
  một lần làm bài được giữ lại nguyên vẹn. Khi gán và
  huỷ đan xen, đường dọn dẹp chỉ xóa bài chưa mở tính tới thời điểm huỷ. ✅
  apps/server/src/lib/study-pack-assign.ts:140-192 (hai nhánh cắt theo thời điểm),
  :457-492 (kiểm sau lỗi ghi), :521-566 (huỷ).
- Kế hoạch chốt V1: muốn đổi lịch thì "huỷ rồi gán lại", không sửa lịch; và bỏ
  thông báo chủ động. ✅ plans/261101-1357-533-study-pack-scheduled-release/plan.md:27, :42
- Vì sao cần hỏi: với bài đã mở nhưng chưa ai làm, huỷ GIỮ lại bài (chỉ gỡ bài chưa tới giờ mở)
  nên học viên vẫn thấy bài mà không có báo trước — cần cân nhắc có nên thêm
  tuỳ chọn dọn sâu.
- Cần quyết định: có cần cảnh báo trước khi huỷ, tuỳ chọn "giữ bài đã mở", hoặc
  thông báo cho học viên có bài bị gỡ.

### OQ-09 — Kế hoạch đã chủ động bỏ thông báo khi mở bài — V2 có cần kênh thông báo? 🟡

- Bối cảnh: học viên thấy bài mở khi mở ứng dụng; không có thông báo in-app hay
  email nào trên toàn bộ đường mở bài. ✅ (kết quả NS4 — không có mã thông báo
  nào trong ba tệp nghiệp vụ của feature); kế hoạch ghi rõ quyết định bỏ thông
  báo chủ động và liệt kê vào non-goal. ✅ plans/261101-1357-533-study-pack-scheduled-release/plan.md:27, :43
- Kiểm chứng vết cũ: mã thông báo `self_study_released` của kế hoạch bị gỡ
  (#526 cũ) chỉ còn trong tệp kiểm migration với vai trò xác nhận ĐÃ gỡ. ✅
  apps/server/src/study-pack-migration.test.ts:165, :167
- Vì sao cần hỏi: quyết định bỏ thông báo là chủ đích có ghi chép, nên câu hỏi
  không còn là "chủ đích hay chưa làm" mà là "V2 có đảo ngược không".
- Cần quyết định: giữ "học viên tự thấy" làm trải nghiệm cuối cùng, hay đưa
  thông báo mở bài vào lộ trình.

### OQ-10 — Kỳ vọng khi giáo viên sửa bộ đề giữa chừng? 🟡

- Bối cảnh: xoá bộ đề bị chặn khi đã từng gán cho lớp (409), nhưng SỬA bộ đề thì
  không có rào chặn tương tự — route sửa không tham chiếu lượt gán nào. ✅
  apps/server/src/routes/study-pack.ts:248-258 (409 khi xoá), :163-231 (sửa —
  không có kiểm tra lượt gán).
- Hệ quả theo cấu trúc dữ liệu: bài giao sinh ra NGAY LÚC GÁN nên sửa mục của bộ
  đề chỉ ảnh hưởng các lần GÁN SAU; lớp đang chạy giữ nguyên bài cũ. ✅
  apps/server/src/lib/study-pack-assign.ts:310-313 (vật hoá lúc gán); kế hoạch
  chốt đổi lịch phải "huỷ rồi gán lại". ✅ plans/261101-1357-533-study-pack-scheduled-release/plan.md:42
- Vì sao cần hỏi: giáo viên sửa bộ đề đang chạy sẽ không thấy tác động gì trên
  lớp hiện hành — dễ hiểu nhầm "đã sửa cho lớp"; ngược lại nếu mong muốn là "sửa
  lan tới lớp đang chạy" thì hành vi hiện tại sai nhu cầu.
- Cần quyết định: chốt ngữ nghĩa "sửa chỉ áp dụng lần gán sau" và hiển thị cảnh
  báo khi sửa bộ đề đã gán.

### OQ-11 — Nhân bản trùng trả 201 như bản mới — có cần phân biệt "vừa tạo" với "đã có sẵn"? 🟡

- Bối cảnh: nhân bản bộ hệ thống về org chạy lại khi đã có bản sao sẽ trả lại
  chính bản sao cũ với mã 201 và cờ idempotent, không phân biệt hai trường hợp.
  ✅ apps/server/src/routes/study-pack.ts:290-302
- Kế hoạch yêu cầu "nhân bản idempotent" nhưng không nói hình thức phản hồi khi
  trùng. ✅ plans/261101-1357-533-study-pack-scheduled-release/phase-03-pack-library-and-org-api.md:71, :76
- Vì sao cần hỏi: người dùng bấm "Nhân bản về trung tâm" lần hai sẽ thấy thông
  báo thành công như lần đầu mà không biết bản sao đã tồn tại từ trước (kèm tiêu
  đề cũ dù bộ hệ thống gốc có thể đã đổi tên).
- Cần quyết định: giữ 201 không phân biệt, hay trả mã khác/cờ "đã có sẵn" để UI
  đổi câu thông báo.

## 2. Khoảng trống (GAP)

### GAP-01 — Kế hoạch lệch code ở hằng số chunk nhân bản đề

- Kế hoạch chốt `D1_PROMPT_CLONE_INSERT_CHUNK = 4` (tính 22 cột × 4 = 88 bind ≤
  100) ở cả bảng quyết định red-team và mô tả phase 3. ✅
  plans/261101-1357-533-study-pack-scheduled-release/plan.md:89; ✅ plans/261101-1357-533-study-pack-scheduled-release/phase-03-pack-library-and-org-api.md:38, :50
- Code dùng 3. ✅ apps/server/src/lib/study-pack-clone.ts:31
- Tác động: không sai chức năng (3 × 22 = 66 bind vẫn dưới trần), nhưng tài liệu
  kế hoạch không còn khớp chuẩn đoán khi đối chiếu sự cố D1.
- Xử lý đề xuất: cập nhật kế hoạch hoặc ghi chú lệch số ngay trong kế hoạch; đặc
  tả này lấy CODE làm chuẩn (3).

### GAP-02 — Sửa bộ đề đã gán không có rào chặn, chỉ xoá mới có 409

- Xoá bộ đề bị chặn khi đã từng được gán cho lớp. ✅
  apps/server/src/routes/study-pack.ts:248-258, câu thoại UI khớp hợp đồng. ✅
  apps/web/src/routes/_auth/assignments/packs.tsx:216-227
- Sửa bộ đề (cùng tiêu đề/mô tả/mục) không kiểm tra lượt gán. ✅
  apps/server/src/routes/study-pack.ts:163-231
- Hệ quả: liên quan trực tiếp OQ-10; kể cả khi chốt ngữ nghĩa "sửa áp dụng lần
  gán sau", thiếu cảnh báo UI là khoảng trống trải nghiệm.

### GAP-03 — Từ vựng lỗi thân yêu cầu của hợp đồng chưa được khoá bằng kiểm thử

- Hợp đồng mang các thông điệp cụ thể (ví dụ "at least one item is required
  when status is ready" :4512, "at most ${MAX_PACK_ITEMS_PER_DAY} items per day"
  :4532). ✅
  packages/api/src/contracts.ts:4508-4535
- Nhưng qua cửa đọc thân yêu cầu, mọi lỗi JSON/Zod đều gộp về hai chuỗi cố định
  "invalid json" / "invalid body". ✅ apps/server/src/routes/study-pack.ts:46-73
- Tìm trong tệp kiểm API của feature không có case nào cho 415/400 đường thân
  yêu cầu. ✅ (kết quả NS1b — grep 415/invalid trong study-pack.test.ts: rỗng)
- Hệ quả: ai đổi cửa đọc thân yêu cầu sẽ vô tình phá hợp đồng mà kiểm thử không
  báo.

### GAP-04 — E2E chưa phủ huỷ và nhân bản

- E2E trọn tuyến duy nhất của feature đi từ tạo → gán → mở bài → dịch thời gian
  → học viên vào muộn; không có bước huỷ hay nhân bản. ✅
  apps/e2e/specs/study-pack.spec.ts:62-334 (tìm "cancel|Huỷ|Nhân bản": rỗng — NS1c)
- Phủ của huỷ hiện chỉ nằm ở kiểm đơn và kiểm component. ✅
  apps/server/src/lib/study-pack-assign.test.ts (khối test huỷ); ✅
  apps/web/src/components/classes/class-study-pack-section.test.tsx
- Hệ quả: rủi ro hồi quy cao nhất của feature (mất bài học viên khi huỷ-dọn) chỉ
  được bảo vệ ở tầng đơn vị, không có lưới e2e.

## 3. Suy diễn có căn cứ (INF)

Mục này là suy luận kỹ thuật từ code — ghi để người đọc đỡ phải dựng lại; KHÔNG
phải ý định nghiệp vụ đã tuyên bố.

- INF-01: Học viên không bao giờ đọc thẳng các bảng bộ đề — toàn bộ đường học
  viên chỉ thấy `class_assignment` qua bộ lọc thời điểm mở; các bảng
  `study_pack*` chỉ thuộc tầng soạn/gán. Dựa vào: NS5 (student.ts không có dấu
  vết studyPack) và cổng 404 trước giờ trên đường làm bài. ✅
  apps/server/src/routes/student.ts:1354-1383, :918
- INF-02: "Mở bài đúng giờ" là lọc lúc ĐỌC, không phải chạy nền: có đúng MỘT nơi
  ghi `available_at` trong code sản phẩm (lúc gán); không có cron, không có
  job cập nhật trạng thái. Dựa vào: NS2 và tuyên bố thiết kế trong kế hoạch. ✅
  apps/server/src/lib/study-pack-assign.ts:391-404; ✅ plans/261101-1357-533-study-pack-scheduled-release/plan.md:19
- INF-03: Mã bài giao suy từ cặp (lượt-gán, mục-bộ-đề) nên việc gán lại trên cùng
  một lượt gán không nhân đôi bài và không mất tiến độ; ngược lại huỷ rồi gán lại
  tạo lượt gán MỚI, mã bài mới — tiến độ cũ không hồi về lớp mới. Dựa vào:
  hàm dựng mã tất định + tái dùng lượt gán active + unique một lượt active mỗi
  cặp lớp-bộ. ✅ apps/server/src/lib/study-pack-assign.ts:81-86, :221-254; ✅
  packages/db/src/schema/study-pack.ts:142-144

## 4. Tìm kiếm phủ định (NS) — đã chạy thật

Môi trường lệnh: repo tại /root/projects/teacher-os, nhánh develop, HEAD
8277bfb4. `grep` ở đây là ugrep KHÔNG tôn trọng gitignore nên mọi lệnh cộng sẵn
`--exclude-dir=node_modules --exclude-dir=dist` khi quét rộng.

- NS1 — Dấu hiệu kiểm thử bị bỏ qua (only/skip/todo/xit/xdescribe) trong 6 tệp
  kiểm của feature:
  `grep -rnE "\.(only|skip|todo)\(|\bxit\(|\bxdescribe\(" apps/server/src/routes/study-pack.test.ts apps/server/src/lib/study-pack-assign.test.ts apps/server/src/lib/study-pack-clone.test.ts apps/server/src/study-pack-migration.test.ts apps/web/src/components/classes/class-study-pack-section.test.tsx apps/e2e/specs/study-pack.spec.ts`
  → 0 dòng, exit 1. R1 sạch.
- NS1b — Case kiểm cho cửa đọc thân yêu cầu: `grep -n "invalid body\|invalid
  json\|415" apps/server/src/routes/study-pack.test.ts` → 0 dòng, exit 1 (cơ sở
  GAP-03).
- NS1c — Huỷ/nhân bản trong e2e: `grep -c "cancel\|Huỷ\|Nhân bản"
  apps/e2e/specs/study-pack.spec.ts` → 0, exit 1 (cơ sở GAP-04).
- NS2 — Nơi ghi `available_at` của `class_assignment` trong code sản phẩm:
  `grep -rn "availableAt" apps/server/src --include="*.ts"` lọc bỏ test → chỉ
  họ hàng đọc/ánh xạ (student.ts:871/:918, study-pack-assign.ts:165/:660/:674/:827-828/:833/:863, assignment-visibility.ts:13-14) và
  đúng MỘT chỗ gán giá trị khi tạo bài: study-pack-assign.ts:391, :404. Ngoài sản
  phẩm: công cụ e2e dịch giờ (apps/e2e/src/boot.ts:218-250, có nhãn "#533
  E2E-only helper") và cột mới trong migration (0060_study_pack.sql:4). Không có
  cron/job nền nào ghi cột này.
- NS3 — Xoá mềm trong feature: `grep -rn "deletedAt\|deleted_at"
  apps/server/src/lib/study-pack-clone.ts apps/server/src/lib/study-pack-assign.ts
  packages/db/src/schema/study-pack.ts apps/server/src/routes/study-pack.ts` →
  0 dòng, exit 1. Feature chỉ xoá cứng, có rào 409.
- NS4 — Thông báo trong feature: `grep -rn "notif"
  apps/server/src/lib/study-pack-assign.ts apps/server/src/lib/study-pack-clone.ts
  apps/server/src/routes/study-pack.ts` → 0 dòng, exit 1. Và
  `grep -rn "self_study_released" apps packages --include="*.ts" --exclude-dir=node_modules --exclude-dir=dist`
  → chỉ 2 dòng còn lại trong apps/server/src/study-pack-migration.test.ts:165,
  :167 (vai trò xác nhận ĐÃ gỡ mã cũ của #526).
- NS5 — Học viên chạm bảng bộ đề: `grep -c "studyPack"
  apps/server/src/routes/student.ts` → 0, exit 1.
- NS6 — Nơi ghi `org_id = NULL` ngoài thư viện admin: `grep -rln
  "isNull(studyPack.orgId)\|orgId: null" apps/server/src --include="*.ts"` lọc
  bỏ test và admin-library → chỉ apps/server/src/routes/study-pack.ts, và hai
  chỗ đó đều là ĐỌC (lọc danh sách hệ thống) tại :87, :282, không phải ghi.
  Chỉ route admin-library tạo bộ đề hệ thống.
- NS7 — Tài liệu kế hoạch trong repo:
  `ls plans/261101-1357-533-study-pack-scheduled-release` → plan.md, 5 tệp
  phase-01..05, screenshots/ (3 ảnh khớp tên e2e ghi ở :34). Đồng thời
  `git ls-tree d6c0f6b5 --name-only -- plans/261101-1357-533-study-pack-scheduled-release/`
  → đủ 7 mục; `git diff --stat d6c0f6b5 HEAD -- <thư mục>` → rỗng (không đổi
  giữa hai commit).
- NS7b — Múi giờ trong kế hoạch: `grep -rni "múi giờ\|timezone\|UTC+7\|Asia/Ho_Chi"
  plans/261101-1357-533-study-pack-scheduled-release/*.md` → 0 dòng (cơ sở
  OQ-07).
- R2 — Danh mục đa ngữ: `find apps/web apps/student -iname "*locale*" -o -iname
  "*i18n*" -o -iname "*translation*"` (bỏ node_modules) → 0 kết quả;
  `grep -rn "i18n\|useTranslation"` trên 3 tệp UI của feature → 0 dòng. Toàn bộ
  chuỗi hiển thị là tiếng Việt gắn cứng trong code (vô định hoá bằng trích dẫn
  nguyên văn ở spec Mục 10-11).
