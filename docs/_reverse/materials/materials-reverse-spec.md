---
feature: materials
type: reverse-srs
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
confidence_summary: "spec: ✅ 141 / 🔵 3 / 🟡 2; tổng toàn assembly: ✅ 243 / 🔵 7 / 🟡 7"
---

# materials — Đặc tả đảo ngược (reverse-SRS) — draft

Feature "materials" = "Ngân hàng tài liệu" của tổ chức: trang "Tài liệu" (cây thư
mục + danh sách tài liệu file/liên kết/audio-video), bộ dialog quản trị (thư mục,
liên kết, upload, sửa, xóa), khối server `/api/materials/*` và khối "tài liệu của
buổi học" `/api/classes/:classId/sessions/:date/materials` (gắn/gỡ/tải thẳng vào
buổi, kèm tài liệu suy từ giáo trình), cùng đường đọc-only cho học viên. File tải
lên stream thẳng vào bucket riêng `materials` với kiểm nhiều lớp (MIME → đuôi
file → magic bytes → trần dung lượng).

> Quy ước nhãn — mỗi mệnh đề mang nhãn riêng: ✅ = khẳng định bởi code/test, có
> cite `path:line`; 🔵 = suy luận từ ≥2 bằng chứng code; 🟡 = phỏng đoán nghiệp
> vụ/why, bắt buộc kèm OQ tương ứng (Mục 12). Toàn bộ nhãn không nằm trong câu
> trích nguyên văn của người dùng. Tên endpoint/hàm/bảng/cột chỉ xuất hiện ở cột
> Truy vết và các file nguồn/evidence, không nằm trong mệnh đề FR/BR.

## Mục 0 — Nguồn soạn thảo (draft provenance)

- Soạn từ mã nguồn develop @ d6c0f6b5, đọc tĩnh, không chạy test, không sửa code.
- Plan reverse ghi feature này confidence HIGH, 3 nguồn, complexity flags
  `media` + `async`. Kết quả điều tra xác nhận complexity: bề mặt thật rộng hơn
  3 nguồn kế hoạch — thêm bộ hợp đồng riêng, repo client, 5 component dialog/
  item/picker, kho object (R2 adapter + peek stream), đường học viên, quyền RBAC
  riêng, 2 migration, bộ test server 2590 dòng và 4 spec e2e. 🔵 (bằng chứng gộp:
  reverse-sources.md S1..S30; plan docs/_reverse/reverse-plan.json entry slug
  materials)
- complexity_flag: media (upload byte thô stream vào bucket, kiểm magic-byte
  trước khi lưu, phục vụ Range cho audio/video) và async (dọn object nền sau lỗi
  ghi DB, debounce tìm kiếm 300ms, invalidation cụm query sau ghi). ✅
  apps/server/src/routes/materials.ts:154-159, apps/web/src/routes/_auth/materials/index.tsx:170-178
- Nhận diện nhánh chính: route server tự gắn gate quyền đọc/ghi riêng (#646 —
  tách khỏi quyền chấm bài), mọi truy vấn lọc theo tổ chức của phiên. ✅
  apps/server/src/routes/materials.ts:139-174; packages/auth/src/role.ts:144-177
- Plan-ref trong comment code của nguồn chính (grep thấy thật): #645 (×7),
  #646 (×6), #647 (×2), #658 (×5), #655 (×12), #662 (×11), #676 (×2) trên 8 file
  nguồn (materials.ts, schema, contracts, repos, dialogs, file-response,
  student-materials, session-curriculum). Refs #644, #659, #663 chỉ xuất hiện
  trong tên thư mục plans/ và workflow audit (ngoài ra #659 có trong comment test
  materials.test.ts:1654 và #663 trong comment tooling audit
  packages/db/src/audit/orphan-materials.ts:3,26,421,608 — đều không phải logic
  runtime của feature)
  — không gắn nhãn xác minh, không dùng ✅/🔵/🟡 cho câu này.
- Phân định ranh giới NGHIÊM NGẶT để không trộn feature khác:
  - Quản lý nội dung giáo trình (thêm/sửa bài học, gỡ tài liệu khỏi bài) thuộc
    feature Syllabus: route ghi `syllabus_lesson_material` nằm ở module
    syllabus-content, picker dùng chung chỉ là thành phần mượn. ✅
    apps/server/src/routes/syllabus-content-routes.ts:63-109,312-349;
    apps/web/src/components/modals/add-lesson-modal.tsx:3,70-73
  - Tạo buổi học kèm chọn tài liệu và bảng kế thừa tài liệu từ template thuộc
    feature Lớp học/Giáo trình (form tạo buổi gửi materialIds lên hợp đồng
    khác). ✅ plans/261109-pick-materials-session-create/plan.md:1;
    apps/web/src/components/modals/add-class-session-modal.tsx:1-3,165
  - Dời/hoãn buổi học kéo theo dòng liên kết tài liệu thuộc feature Lịch/
    Nghỉ lễ: route holidays xóa/dời `lesson_material` khi apply shift. ✅
    apps/server/src/routes/holidays.ts:377-381; packages/db/src/schema/material.ts:96-98
  - App học viên (danh sách + mở file tài liệu buổi học) thuộc feature học viên
    — feature này chỉ đặc tả API đọc và projection an toàn. ✅
    apps/student/src/components/class/lesson-materials.tsx:1-60
  - Kho audio thư viện đề (admin) và kho đề nhập AI DÙNG CHUNG interface kho
    object + adapter R2 nhưng là bucket/binding riêng — cross-ref, không thuộc
    feature. ✅ apps/server/src/lib/media-store.ts:1-6; apps/server/src/index.ts:111-137;
    packages/infra/alchemy.run.ts:195-209

### 0.1 Bảng tài nguyên S (đầy đủ ở reverse-sources.md)

> Lưu ý đánh số: S1–S29 khớp 1:1 với reverse-sources.md; từ S30 trở đi bảng
> dưới là NHÓM TÓM TẮT (S30 = S30+S31 gộp; S31 = S32; S32 = S34; S33 = S35;
> S34 = S36–S39; S35 = S40; S41–S43 không tóm tắt ở đây). Khi truy vết theo
> S-id, dùng bảng ở reverse-sources.md làm chuẩn.

| S-id | Tài nguyên | Loại |
|---|---|---|
| S1 | Route server ngân hàng + buổi học | server code |
| S2 | Schema 4 bảng (thư mục, tài liệu, 2 bảng liên kết) | db schema |
| S3 | Trang "Tài liệu" | client route |
| S4 | Hợp đồng Zod + allowlist MIME + magic bytes | api package |
| S5 | Repo client (fetch/mutation + ánh xạ lỗi) | client lib |
| S6 | Bộ dialog (thư mục/liên kết/upload/sửa/xóa) | client component |
| S7 | Dòng tài liệu dùng chung + nút mở/tải | client component |
| S8 | Picker ngân hàng (duyệt + chips) | client component |
| S9 | Select chọn thư mục | client component |
| S10 | Dựng cây thư mục phía client | client lib |
| S11 | Phục vụ file (Range/CSP/disposition) | server lib |
| S12 | Interface kho object | server lib |
| S13 | Adapter R2 | server lib |
| S14 | Đọc sớm đầu stream (magic byte) | server lib |
| S15 | Resolve tài liệu giáo trình theo buổi | server lib |
| S16 | Route đọc-only học viên | server code |
| S17 | Vai trò đọc/ghi tài liệu | auth lib |
| S18 | Mount route trên kernel (CSRF chung) | server code |
| S19 | Khai báo deps + mount học viên | server code |
| S20 | Nối binding R2 ở entry | server code |
| S21 | Bucket `materials` trong hạ tầng | infra |
| S22 | Migration tạo 3 bảng tài liệu | migration |
| S23 | Migration tạo bảng liên kết giáo trình | migration |
| S24 | Test server (35 test) | test |
| S25 | Test trang web (15 test) | test |
| S26 | Test hợp đồng (15 test) | test |
| S27 | Test phục vụ file (5 test) | test |
| S28 | Test mapping giáo trình (9 test) | test |
| S29 | Modal tài liệu buổi học | client component |
| S30 | Test picker (5) + test modal buổi (5) | test |
| S31 | Test UI học viên (7 test) | test |
| S32 | Điều hướng + allowlist route | client component |
| S33 | Bản chụp kernel (links giáo trình) | server code |
| S34 | 4 spec e2e (5 test) | e2e |
| S35 | Workflow audit mồ côi (#663) | ci workflow |

### 0.2 Liên kết

- Nguồn chi tiết: [reverse-sources.md](reverse-sources.md)
- Khoảng trống & câu hỏi mở: [reverse-gaps.md](reverse-gaps.md)
- Bằng chứng thô: [_evidence.md](_evidence.md)
- Luồng: [srs/materials-reverse-flows.md](srs/materials-reverse-flows.md)
- Máy trạng thái: [srs/materials-reverse-states.md](srs/materials-reverse-states.md)
- Mô hình dữ liệu: [srs/materials-reverse-erd.md](srs/materials-reverse-erd.md)
- Use cases: [usecases/materials-reverse-usecase-index.md](usecases/materials-reverse-usecase-index.md)

### 0.3 Tài liệu nghiệp vụ hiện có

- Không có tài liệu nghiệp vụ `.md` riêng cho feature (plan reverse `existing_doc`
  rỗng cho slug materials). ✅ docs/_reverse/reverse-plan.json (entry slug materials,
  existing_doc null)
- Nghiệp vụ được ghi trực tiếp trong comment code tiếng Việt của schema và route
  (quy tắc xóa, bucket holiday, guard nguyên tử). ✅ packages/db/src/schema/material.ts:16-23,50-56,93-98
- Cụm plan phát triển nằm trong plans/: #644 (khối gốc), #645/#658/#662 (nghỉ
  lễ + buổi manual), #646 (thư mục + quyền), #647 (e2e upload học viên), #655
  (tài liệu giáo trình), #663 (audit mồ côi), #676 (magic bytes). ✅ ls plans/
  (10 thư mục materials-*); docs/_reverse/reverse-plan.json

## Mục 1 — Phạm vi

- Trong phạm vi:
  - Trang "Tài liệu": cây thư mục, tìm kiếm/lọc (q, loại, thư mục) sống trong
    URL, danh sách với số buổi dùng, nút mở/tải/sửa/xóa theo quyền. ✅
    apps/web/src/routes/_auth/materials/index.tsx:58-63,217-501
  - Bộ dialog: tạo thư mục (con/gốc), đổi tên, di chuyển, xóa thư mục; thêm
    liên kết; tải file lên; sửa tài liệu; xóa tài liệu (kèm cảnh báo không hoàn
    tác). ✅ apps/web/src/components/materials/material-dialogs.tsx:118-574
  - Server ngân hàng: danh sách/chi tiết, tạo liên kết, upload file (stream,
    kiểm 4 lớp), sửa metadata, xóa (chặn khi đang dùng), phục vụ file (Range,
    CSP), CRUD thư mục với guard nguyên tử chống vòng/quá sâu/đua. ✅
    apps/server/src/routes/materials.ts:794-1203
  - Tài liệu của buổi học: xem (direct + từ giáo trình), gắn từ ngân hàng, gỡ,
    tải thẳng vào buổi (batch nguyên tử), guard buổi nghỉ lễ đã-dời. ✅
    apps/server/src/routes/materials.ts:1205-1386; apps/web/src/components/class-detail/session-materials-modal.tsx:36-283
  - Đường học viên đọc-only: danh sách + mở file, projection không cột riêng
    của giáo viên, chặn theo đăng ký active. ✅ apps/server/src/routes/student-materials.ts:29-222
  - Quyền: đọc gồm trợ giảng, ghi không gồm trợ giảng; UI ẩn nút ghi với vai
    chỉ-đọc. ✅ packages/auth/src/role.ts:144-177; apps/web/src/routes/_auth/materials/index.test.tsx:412-449
- Ngoài phạm vi (chỉ nhắc khi liên quan): soạn nội dung giáo trình và gỡ tài
  liệu khỏi bài học (Syllabus); tạo buổi học kèm tài liệu (Lớp học); dời buổi
  kéo tài liệu (Lịch/Nghỉ lễ); giao diện học viên (feature học viên); kho audio
  thư viện đề (admin); audit mồ côi chỉ là công cụ vận hành (S40, S41).

## Mục 2 — Actor

- **Giáo viên có quyền ghi (giáo viên / chủ trung tâm / quản trị / giáo viên
  đứng lớp)**: toàn bộ thao tác ghi — thư mục, liên kết, upload, sửa, xóa, gắn
  /gỡ tài liệu buổi học. ✅ packages/auth/src/role.ts:151-173;
  apps/server/src/routes/materials.ts:161-170
- **Trợ giảng (ta)**: chỉ đọc/mở/chọn từ ngân hàng — bị chặn 403 khi ghi; UI
  ẩn mọi nút ghi và hiện bản sao chỉ-đọc. ✅ packages/auth/src/role.ts:157,175-177;
  apps/web/src/routes/_auth/materials/index.test.tsx:412-449
- **Học viên**: KHÔNG thao tác được ngân hàng (403 qua gate vai) — chỉ đọc
  danh sách/mở file tài liệu của buổi mình có đăng ký active, qua đường API
  học viên riêng. ✅ apps/server/src/routes/materials.test.ts:399-508;
  apps/server/src/routes/student-materials.ts:29-35,73-130
- **Vai lạ/chưa đăng nhập**: 401 khi thiếu phiên; vai ngoài danh sách → 403. ✅
  apps/server/src/routes/materials.ts:161-168

## Mục 3 — Yêu cầu chức năng (FR)

| FR | Yêu cầu | Điều kiện / Giới hạn | Truy vết |
|---|---|---|---|
| FR-01 | Mục "Tài liệu" nhóm "Giảng dạy" trên điều hướng dẫn tới /materials, LUÔN hiển thị (không có cờ tắt cho feature); địa chỉ /materials nằm trong danh sách route hợp lệ của service worker. | Feature sống hoàn toàn, khác các cụm hoãn dùng hằng tĩnh. | ✅ apps/web/src/components/layout/sidebar.tsx:72-78; apps/web/src/routes-matcher.ts:35 |
| FR-02 | Trang "Tài liệu" có tiêu đề "Tài liệu" + lead mô tả ("Ngân hàng tài liệu dùng chung của trung tâm…"); 2 nút "Thêm liên kết" và "Tải file lên" CHỈ render khi người xem có quyền ghi. | Không có quyền → không có nút hành động nào ở đầu trang. | ✅ apps/web/src/routes/_auth/materials/index.tsx:219-240; test ẩn nút với ta apps/web/src/routes/_auth/materials/index.test.tsx:412-449 |
| FR-03 | Bộ lọc (từ khóa, loại, thư mục) sống trong URL (?q=&kind=&folderId=) để tải lại/chia sẻ giữ nguyên; giá trị lạ chuẩn hóa về mặc định; từ khóa đẩy lên URL sau khi ngừng gõ 300ms; từ khóa đổi từ phía URL (back/forward) đồng bộ xuống ô nhập. | Trích sâu tối đa 100 ký tự; từ khóa trắng → bỏ lọc. | ✅ apps/web/src/routes/_auth/materials/index.tsx:58-63,72-98,161-178; test debounce :204-220 |
| FR-04 | Panel thư mục bên trái: mục "Tất cả tài liệu", mục "Chưa xếp thư mục", rồi cây thư mục thụt lề theo cấp (kẹp để không tràn panel); có quyền ghi + đang chọn 1 thư mục → 3 thao tác "Đổi tên" / "Di chuyển" / "Xóa thư mục"; "Thư mục mới" tạo con ngay trong thư mục đang xem. | Cây dựng phía client từ danh sách phẳng; thư mục kẹt vòng lịch sử được đưa về gốc để không biến mất. | ✅ apps/web/src/routes/_auth/materials/index.tsx:503-665,454-463; apps/web/src/lib/material-folders.ts:13-62 |
| FR-05 | Ô tìm kiếm ("Tìm theo tiêu đề, mô tả hoặc tên file…") + nhóm chip "Loại tài liệu" (Tất cả / File / Liên kết / Audio/Video) kèm badge đếm; đếm tính phía client trên danh sách đã lọc theo từ khóa + thư mục; chọn chip ghi loại lên URL. | Lọc loại thực hiện phía client; danh sách vẫn lấy theo từ khóa + thư mục từ server. | ✅ apps/web/src/routes/_auth/materials/index.tsx:105-113,142-150,193-208,265-286; test :176-191 |
| FR-06 | Mỗi dòng tài liệu: icon theo loại, tiêu đề, mô tả (tối đa 2 dòng), dòng meta ("định dạng · dung lượng" cho file/audio-video; tên miền cho liên kết), đường dẫn thư mục "Cha / Con" khi đang xem tất cả, nhãn "Dùng ở N buổi" (N = số buổi đang gắn) hoặc "Chưa dùng ở buổi nào", nút mở/tải theo loại (liên kết mở tab mới; audio/video có "Phát" inline + "Tải xuống"; tài liệu chỉ "Tải xuống"), nút "Sửa"/"Xóa" khi có quyền ghi. | Nhãn "Dùng ở N buổi" chỉ đếm buổi học thật, KHÔNG đếm lượt gắn trên giáo trình (sai lệch hiển thị — OQ-02). | ✅ apps/web/src/routes/_auth/materials/index.tsx:387-449; apps/web/src/components/materials/material-item.tsx:48-60,67-107; cột đếm apps/server/src/routes/materials.ts:67-68 |
| FR-07 | Trạng thái trang: đang tải "Đang tải tài liệu…"; lỗi "Không tải được danh sách tài liệu." + nút "Thử lại"; rỗng không lọc: "Chưa có tài liệu nào" + mô tả theo quyền + 2 nút hành động (quyền ghi); rỗng có lọc: "Không có tài liệu nào phù hợp với bộ lọc."; thư mục trong URL không còn tồn tại: "Thư mục này không còn tồn tại." + nút "Xem tất cả tài liệu"; có bộ lọc: nút "Xóa bộ lọc". | Thư mục lỗi tương tự: "Không tải được thư mục." + "Thử lại"; rỗng cây: mô tả theo quyền. | ✅ apps/web/src/routes/_auth/materials/index.tsx:185-191,302-328,330-385,599-616 |
| FR-08 | Danh sách phía máy chủ: trả tài liệu của tổ chức phiên; nhận từ khóa (tối đa 100 ký tự — vượt → 400), loại (giá trị lạ → 400), thư mục (giá trị "root" = chưa xếp); sắp mới-sửa trước; tìm kiếm không phân biệt hoa-thường TIẾNG VIỆT trên tiêu đề/mô tả/tên file gốc (lọc sau truy vấn vì lowercase của SQLite chỉ hạ ASCII). Chi tiết 1 tài liệu: id lạ/org khác → 404 MATERIAL_NOT_FOUND. | Lọc thư mục "root" map thành điều kiện cha-rỗng. | ✅ apps/server/src/routes/materials.ts:989-1030,1032-1041; test tiếng Việt apps/server/src/routes/materials.test.ts:1443-1457 |
| FR-09 | Danh sách thư mục: trả phẳng toàn bộ thư mục của tổ chức, sắp theo tên rồi id; client tự dựng cây. | Không phân trang (kho thư mục theo org nhỏ). | ✅ apps/server/src/routes/materials.ts:205-211,794-798; apps/web/src/lib/material-folders.ts:19-62 |
| FR-10 | Tạo liên kết: nhận tiêu đề (1–200 sau trim), mô tả (tối đa 1000), URL http/https tuyệt đối (tối đa 2000, chặn javascript:/data:), thư mục đích phải thuộc tổ chức (không → 404 FOLDER_NOT_FOUND); thành công trả 201 kèm view đầy đủ. | Kiểm URL bằng bộ phân tích URL thật — không regex tay. | ✅ packages/api/src/material-contracts.ts:332-341,348-353,388-396; apps/server/src/routes/materials.ts:1043-1065; test URL apps/server/src/routes/materials.test.ts:775-852 |
| FR-11 | Tải file lên ngân hàng (byte thô qua PUT, không multipart, thư mục trên query): kho chưa cấu hình → 503 MATERIALS_DISABLED; kiểm header Content-Type/Content-Length — MIME ngoài danh sách → 415, quá trần (tài liệu 25 MiB / audio-video 95 MiB) → 413 kèm maxBytes, size không hợp lệ → 400; tên file từ header riêng được làm sạch và đuôi phải khớp MIME (415); đọc sớm tối đa 64 byte đầu stream kiểm chữ ký nhị phân, lệch → 415; stream thẳng vào kho với key `<orgId>/<mã tài liệu>`; tiêu đề ban đầu = tên file; ghi DB lỗi → dọn object vừa ghi (nền), thư mục bị xóa giữa chừng → 404; thành công 201. | Kích thước thực lệch khai báo → 400 (kho đếm byte thật, không tin header). | ✅ apps/server/src/routes/materials.ts:302-432,1067-1098; hàm kiểm dùng chung packages/api/src/material-contracts.ts:303-330; test apps/server/src/routes/materials.test.ts:853-970,2029-2302 |
| FR-12 | Sửa tài liệu: chỉ nhận tiêu đề/mô tả/thư mục, từng trường tùy chọn nhưng phải có ít nhất 1; thư mục lạ → 404; ghi đè mốc cập nhật; KHÔNG cho sửa loại, URL, object sau khi tạo. | "nothing to update" bị từ chối 400 bởi hợp đồng. | ✅ packages/api/src/material-contracts.ts:398-413; apps/server/src/routes/materials.ts:1100-1133 |
| FR-13 | Xóa tài liệu: đang gắn buổi học HOẶC bài giáo trình → 409 MATERIAL_IN_USE kèm CẢ HAI số để người dùng biết chỗ gỡ; loại file/audio-video cần kho để xóa object — thiếu kho → 503 (không xóa row, tránh object mồ côi không ai dọn); xóa dòng TRƯỚC, xóa object SAU (lỗi xóa object chỉ ghi log, không trả lỗi); FK chặn giữa chừng (vừa bị gắn) → đếm lại và trả 409 nghiệp vụ. | Thứ tự ngược (object trước) sẽ để row trỏ object đã mất — bị cấm. | ✅ apps/server/src/routes/materials.ts:270-286,1135-1180; comment thiết kế :139-150; test apps/server/src/routes/materials.test.ts:1076-1113 |
| FR-14 | Mở/tải file: stream từ kho, hỗ trợ MỘT dải Range (206 kèm Content-Range; Range không thoả → 416); audio/video mở trực tiếp trong tab mới (inline) trừ khi ép tải về (?download=1); tài liệu luôn attachment; chỉ phục vụ đúng MIME đã lưu trong danh sách cho phép (khác → application/octet-stream) kèm nosniff và CSP khóa; tên file gốc encode theo RFC 8187. | Header cố định: no-referrer, cô lập opener, cache riêng tư không lưu. | ✅ apps/server/src/lib/material-file-response.ts:14-112; apps/server/src/routes/materials.ts:1182-1203; test apps/server/src/lib/material-file-response.test.ts:1-184 |
| FR-15 | Tạo thư mục: tên 1–100 sau trim, không chứa ký tự điều khiển; cha rỗng = gốc; trùng tên cùng cha → 409 FOLDER_NAME_TAKEN; cha lạ/chéo tổ chức/quá sâu/vòng → chặn NGAY TRONG câu INSERT nguyên tử (recursive guard), lỗi đọc lại trạng thái phân loại thành 404/400 FOLDER_CYCLE/400 FOLDER_TOO_DEEP; thua race 2 lần → 409 "concurrent folder conflict". | Độ sâu tối đa 5 cấp (gốc = cấp 1). | ✅ apps/server/src/routes/materials.ts:677-771,800-855; hợp đồng packages/api/src/material-contracts.ts:355-372; test apps/server/src/routes/materials.test.ts:509-774 |
| FR-16 | Đổi tên và/hoặc di chuyển thư mục: không đổi gì → trả nguyên trạng thái; di chuyển vào chính nó/con cháu hoặc chu trình cũ → 400 FOLDER_CYCLE; tổng độ sâu sau chuyển vượt 5 → 400 FOLDER_TOO_DEEP; guard SQL nguyên tử chạy TẠI thời điểm UPDATE (chặn cha bị xóa/chéo org giữa chừng), thua race thì đọc lại và phân loại; trùng tên vị trí mới → 409; thư mục kẹt vòng lịch sử được cho phép chuyển ra ngoài để tự phục hồi. | Rename và move gộp một endpoint, mỗi trường tùy chọn. | ✅ apps/server/src/routes/materials.ts:677-792,857-950; test đồng thời apps/server/src/routes/materials.test.ts:618-774 |
| FR-17 | Xóa thư mục: chỉ xóa được thư mục RỖNG (không con, không tài liệu) — còn mục → 409 FOLDER_NOT_EMPTY; FK chặn khi có mục mới chen giữa lúc kiểm và lúc xóa → kiểm lại, vẫn còn → 409. | Xóa tổ chức thì cascade dọn cả cây trong một câu (FK cha no action — cây chỉ xóa được khi rỗng). | ✅ apps/server/src/routes/materials.ts:952-985; packages/db/src/schema/material.ts:16-23; test apps/server/src/routes/materials.test.ts:509-586 |
| FR-18 | Danh sách tài liệu của buổi: đòi lớp thuộc tổ chức (404 CLASS_NOT_FOUND), ngày đúng định dạng (400) và ngày đó là buổi có thật (dòng bài học hoặc buổi thủ công của lớp 0 học viên — không → 404 SESSION_NOT_FOUND); trả `items` (gắn trực tiếp, sắp theo vị trí) + `curriculumMaterials` (tài liệu giáo trình của buổi N ↔ bài N, đã loại trùng với direct — direct ưu tiên); KHÔNG chặn buổi nghỉ lễ cho GET để modal đang mở vẫn render. | Buổi holiday toàn phần vẫn trả được danh sách. | ✅ apps/server/src/routes/materials.ts:552-653,1207-1230; apps/server/src/lib/session-curriculum-materials.ts:113-174; test apps/server/src/routes/materials.test.ts:1579-1595,2550-2590 |
| FR-19 | Gắn tài liệu vào buổi: chặn khi cả ngày là buổi nghỉ lễ (409 SESSION_HOLIDAY) và khi ngày đã-dời-lễ còn sót buổi thủ công (gắn ở đây là tạo mồ côi — buổi thật nằm ở ngày mới; 409); tài liệu phải tồn tại trong tổ chức (404); đã gắn → 409 ALREADY_ATTACHED; vị trí = kế tiếp trong buổi; guard CASE trên cột ngày chặn race áp-dời giữa chừng (lỗi map về 409/404 nghiệp vụ, không 500); thành công 201 trả dòng view kèm vị trí. | Gắn là lặp-an toàn: lệnh trùng không tạo dòng đôi. | ✅ apps/server/src/routes/materials.ts:434-550,1232-1293; test apps/server/src/routes/materials.test.ts:1028-1075,1486-2028 |
| FR-20 | Tải file thẳng vào buổi: như upload ngân hàng (FR-11) nhưng tạo CẢ tài liệu trong ngân hàng LẪN liên kết buổi trong MỘT batch nguyên tử — lỗi làm cả hai biến mất kèm dọn object; file luôn về thư mục được chọn trên query. | Buổi holiday/đã-dời chặn như attach; 201 trả item. | ✅ apps/server/src/routes/materials.ts:1295-1356; test apps/server/src/routes/materials.test.ts:1114-1155,1551-1559 |
| FR-21 | Gỡ tài liệu khỏi buổi: KHÔNG đòi còn dòng bài học (liên kết mồ côi sau khi buổi bị xóa vẫn gỡ được — điều kiện để xóa tài liệu), nhưng VẪN chặn buổi nghỉ lễ (tài liệu đang dời theo shift, không phải liên kết mồ côi); chưa gắn → 404 NOT_ATTACHED; thành công 200. | resolveSession dùng chung nhưng chế độ lỏng hơn attach/upload. | ✅ apps/server/src/routes/materials.ts:1358-1386; test apps/server/src/routes/materials.test.ts:1458-1485,1560-1578,1934-1950 |
| FR-22 | Học viên đọc danh sách tài liệu buổi: đòi có đăng ký ACTIVE trong lớp (tổ chức đang chọn) và chính đăng ký đó có dòng bài học ở ngày đó — không thoả → 404 (chống dò id); payload KHÔNG có cột riêng của giáo viên (key object, người tạo, thư mục, số buổi dùng); trả items + curriculumMaterials cùng hình dạng projection an toàn. | 404 thay 403 — cùng ngữ nghĩa đường lớp học viên. | ✅ apps/server/src/routes/student-materials.ts:29-130; apps/student/lib projection packages/api/src/material-contracts.ts:476-497; test apps/server/src/routes/materials.test.ts:1156-1426 |
| FR-23 | Học viên mở/tải file: kho thiếu → 503; tài liệu phải thuộc buổi (hoặc thuộc bài giáo trình ánh xạ buổi — vẫn mở/tải được dù không có dòng liên kết); projection trả file không thêm trường riêng của giáo viên; Range/download như FR-14. | Sai id/ngoài buổi → 404. | ✅ apps/server/src/routes/student-materials.ts:132-219; test apps/server/src/routes/materials.test.ts:1237-1426 |
| FR-24 | Client kiểm file TRƯỚC khi gửi bằng CÙNG hàm thuần với máy chủ: MIME do trình duyệt báo phải thuộc danh sách (rỗng/octet-stream thì suy theo đuôi file — Windows hay báo rỗng, Safari báo alias m4a); sai hoặc quá trần → thông báo ngay, KHÔNG gửi byte nào. | Upload là byte thô PUT kèm tên file encode trong header. | ✅ apps/web/src/lib/repos/materials.ts:7-9,216-271; packages/api/src/material-contracts.ts:141-173; test chặn trước apps/web/src/routes/_auth/materials/index.test.tsx:274-291 |
| FR-25 | Mọi lỗi API ánh xạ MỘT câu tiếng Việt theo mã nghiệp vụ (kèm số buổi/số bài cho lỗi đang-dùng, kèm trần dung lượng cho lỗi quá-lớn); 401 → đưa về đăng nhập lại; lỗi 404/409 hoặc vòng/quá-sâu thư mục → tự tải lại cây (dữ liệu máy đã cũ); ghi thành công → toast + làm mới CẢ CỤM query ngân hàng; lỗi mạng → "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.". | Wording trích nguyên văn trong repo (không có catalog i18n). | ✅ apps/web/src/lib/repos/materials.ts:141-214; apps/web/src/components/materials/material-dialogs.tsx:36-75 |
| FR-26 | Quyền ghi trên UI đọc từ vai trong bản chụp kernel (mặc định coi là giáo viên khi thiếu dữ liệu); vai chỉ-đọc thấy: không nút ghi, dialog không mount, modal buổi khóa chế độ chọn, bản sao rỗng riêng. | Cùng hàm quyền với server — một nguồn. | ✅ apps/web/src/lib/repos/materials.ts:470-490; apps/web/src/components/class-detail/session-materials-modal.tsx:50-58; packages/auth/src/role.ts:171-177 |

## Mục 4 — Yêu cầu phi chức năng (NFR)

| NFR | Yêu cầu | Truy vết |
|---|---|---|
| NFR-01 | Mọi đường tài liệu đòi phiên đăng nhập: thiếu phiên → 401 đồng nhất TRƯỚC khi phân quyền. | ✅ apps/server/src/routes/materials.ts:161-172 |
| NFR-02 | Phân quyền đọc/ghi TÁCH RIÊNG khỏi quyền chấm bài (đổi chính sách chấm không làm trôi quyền học liệu); allowlist nghiêm ngặt, vai lạ bị chặn. | ✅ packages/auth/src/role.ts:144-177 |
| NFR-03 | Lệnh ghi JSON qua tầng CSRF chung của kernel (Origin trong danh sách cho phép, thân phải JSON) — route mount sau middleware này. | ✅ apps/server/src/routes/kernel.ts:3494; apps/server/src/routes/materials.ts:176-203 |
| NFR-04 | Hợp đồng Zod `.strict()` — thừa trường bị từ chối; mọi giới hạn độ dài là hằng dùng chung 1:1 client/server. | ✅ packages/api/src/material-contracts.ts:28-33,343-420; apps/web/src/lib/repos/materials.ts:7-9 |
| NFR-05 | Upload không đệm toàn bộ file vào RAM: đọc sớm ≤ 64 byte rồi stream với backpressure; kho đếm byte thật, lệch khai báo thì hủy và không để lại object dở. | ✅ apps/server/src/lib/peek-stream.ts:1-17; apps/server/src/lib/media-store.ts:20-33,43-74; apps/server/src/lib/r2-media-store.ts:1-9 |
| NFR-06 | Chỉ mục dữ liệu: tài liệu theo (tổ chức, thư mục) và (tổ chức, loại); thư mục (tổ chức, cha) + DUY NHẤT (tổ chức, cha-coalesce, tên); liên kết buổi khóa chính (lớp, ngày, tài liệu) + chỉ mục theo tài liệu và theo tổ chức; liên kết giáo trình khóa chính (bài, tài liệu) + 2 chỉ mục. | ✅ packages/db/src/schema/material.ts:40-47,83-90,119-127,156-164; packages/db/src/migrations/0066_class_materials.sql:19-54; 0068_salty_impossible_man.sql:13-14 |
| NFR-07 | An toàn phục vụ file: nosniff + CSP sandbox (tài liệu khóa cứng; media cho phép nạp stream cùng origin nhưng TUYỆT ĐỐI không script), no-referrer, cache riêng tư; MIME chỉ từ danh sách cho phép. | ✅ apps/server/src/lib/material-file-response.ts:14-34,81-97 |
| NFR-08 | Mốc thời gian tự sinh ở tầng DB (giờ hệ thống dạng mili-giây), không do client gửi. | ✅ packages/db/src/schema/material.ts:36-38,76-81; packages/db/src/migrations/0066_class_materials.sql:12,34-35 |
| NFR-09 | Dọn dẹp hậu lỗi chạy NỀN (không chặn phản hồi); lỗi nền chỉ ghi log. | ✅ apps/server/src/routes/materials.ts:154-159; deps apps/server/src/app.ts:115-121 |
| NFR-10 | Không có catalog i18n: mọi chữ người dùng là literal tiếng Việt tại component (R2 — một nguồn duy nhất mỗi câu chữ). | ✅ negative-search R3 — reverse-gaps.md §Negative-search #3 |
| NFR-11 | Bucket-semantics buổi nghỉ lễ là HỢP ĐỒNG 6 BỀ MẶT phải đồng bộ (2 hàm đọc, 2 call-site guard, nhánh trong resolveSession, bản sao phía client) — drift giữa các bề mặt là bug lặng. | ✅ apps/server/src/routes/materials.ts:477-486,536-543 |

## Mục 5 — Quy tắc nghiệp vụ (BR)

- **BR-01.** Mọi tài liệu/thư mục/liên kết thuộc đúng một tổ chức; mọi truy vấn
  lọc theo tổ chức của phiên; id của tổ chức khác trả 404 (không tiết lộ sự tồn
  tại), áp cho cả id tài liệu lẫn id thư mục/lớp. ✅
  apps/server/src/routes/materials.ts:139-150; test cách ly
  apps/server/src/routes/materials.test.ts:971-1027
- **BR-02.** Đọc gồm các vai giáo viên/chủ/quản trị/giáo viên-đứng-lớp và trợ
  giảng; ghi chỉ 4 vai đầu — trợ giảng bị 403 khi ghi; quyền tài liệu tách
  độc lập khỏi quyền chấm bài (#646). ✅ packages/auth/src/role.ts:144-177;
  test apps/server/src/routes/materials.test.ts:399-508
- **BR-03.** Tên thư mục duy nhất trong cùng một cha (kể cả gốc — so sánh
  coalesce cha-rỗng); trùng → 409, kể cả khi đua hai lệnh tạo cùng lúc. ✅
  packages/db/src/schema/material.ts:17-20,42-46; apps/server/src/routes/materials.ts:226-248,848-854;
  migration packages/db/src/migrations/0066_class_materials.sql:1-4,54
- **BR-04.** Cây thư mục tối đa 5 cấp và không được có vòng: kiểm bằng guard
  recursive NGUYÊN TỬ tại thời điểm ghi (không kiểm-then-ghi); dữ liệu hỏng có
  vòng lịch sử được tính như quá sâu và được cho chuyển ra ngoài để tự phục hồi. ✅
  apps/server/src/routes/materials.ts:99-137,677-710
- **BR-05.** Thư mục chỉ xóa được khi rỗng — phải chuyển/xóa mục bên trong
  trước; xóa tổ chức cascade dọn cả cây. ✅ apps/server/src/routes/materials.ts:952-985;
  packages/db/src/schema/material.ts:21-23
- **BR-06.** Tài liệu chỉ có 3 loại và hình dạng dữ liệu bị khóa bằng CHECK ở
  tầng DB: liên kết phải có URL và KHÔNG có object; file/audio-video phải có
  object và KHÔNG có URL; loại không đổi sau khi tạo (không có đường sửa). ✅
  packages/db/src/schema/material.ts:69,86-89; migration 0066_class_materials.sql:38;
  negative-search #4 trong reverse-gaps.md
- **BR-07.** Chỉ 10 định dạng được lưu và phục vụ lại: PDF, PNG/JPG/WEBP,
  DOCX/PPTX/XLSX (loại tài liệu), MP3/M4A/MP4 (audio-video); MIME lưu dạng chuẩn
  hóa; MIME lạ bị chặn từ tầng header. ✅ packages/api/src/material-contracts.ts:35-62,303-330
- **BR-08.** Ba lớp kiểm nhận dạng file: đuôi file phải khớp MIME khai báo; 64
  byte đầu phải khớp chữ ký nhị phân của định dạng (chặn giả mạo HTML, polyglot,
  container ISO-BMFF lạ); kích thước thực phải đúng khai báo. ✅
  packages/api/src/material-contracts.ts:115-301; apps/server/src/routes/materials.ts:355-399;
  test apps/server/src/routes/materials.test.ts:2029-2302
- **BR-09.** Trần dung lượng: tài liệu 25 MiB; audio-video 95 MiB — nằm chủ ý
  DƯỚI trần thân yêu cầu 100 MB của edge để client chặn trước khi đụng trang
  lỗi không-CORS (#647). ✅ packages/api/src/material-contracts.ts:18-26
- **BR-10.** Object lưu private với key `<orgId>/<mã tài liệu>`; ghi DB lỗi →
  dọn object; xóa thì xóa ROW TRƯỚC rồi mới xóa object — có thể để lại file mồ
  côi trong bucket nhưng KHÔNG BAO GIỜ để row trỏ object đã mất. ✅
  apps/server/src/routes/materials.ts:139-150,401-431,1150-1178
- **BR-11.** Tài liệu đang gắn (buổi học thật hoặc bài giáo trình) không xóa
  được — 409 nêu CẢ HAI số (#655); đếm trên cả hai bảng liên kết. ✅
  apps/server/src/routes/materials.ts:265-286,1139-1168;
  test apps/server/src/routes/materials.test.ts:2303-2549
- **BR-12.** Tài liệu gắn vào buổi theo cặp (lớp, ngày) — KHÔNG theo từng dòng
  bài học; dời buổi (đổi ngày) kéo theo ngày ở liên kết; vị trí hiển thị tăng
  dần, gắn mới nằm cuối. ✅ packages/db/src/schema/material.ts:93-99,109;
  apps/server/src/routes/materials.ts:655-657; test dời kéo theo
  apps/server/src/routes/materials.test.ts:1427-1442
- **BR-13.** Bucket nghỉ lễ: ngày TOÀN nghỉ lễ chặn gắn/tải/gỡ (409) — trừ GET;
  ngày TRỘN nghỉ + thường vẫn thao tác được; buổi thủ công của lớp 0 học viên
  được coi là buổi thật; ngày đã-dời-lễ còn buổi thủ công chặn gắn/tải (gắn ở
  ngày cũ là tạo mồ côi) nhưng VẪN cho gỡ. ✅ apps/server/src/routes/materials.ts:434-550,1237-1250,1358-1371;
  test apps/server/src/routes/materials.test.ts:1486-2028
- **BR-14.** Tài liệu giáo trình trên buổi là CHỈ-ĐỌC (nhãn "Từ giáo trình") —
  thêm/gỡ phải làm ở giáo trình của lớp; khi trùng với tài liệu direct, chỉ
  hiện một lần (direct ưu tiên). ✅ apps/server/src/routes/materials.ts:1218-1229;
  apps/web/src/components/class-detail/session-materials-modal.tsx:255-276;
  apps/server/src/lib/session-curriculum-materials.ts:113-123
- **BR-15.** Cột riêng của giáo viên (key object, người tạo, thư mục, số buổi
  dùng) KHÔNG BAO GIỜ chiếu sang đường học viên — projection riêng đã lọc sẵn. ✅
  packages/db/src/schema/material.ts:52-55; packages/api/src/material-contracts.ts:476-497;
  apps/server/src/routes/student-materials.ts:76-88
- **BR-16.** Học viên chỉ đọc được buổi của lớp có đăng ký ACTIVE và có dòng
  bài học ngày đó; lệch mọi điều kiện → 404 (chống dò id), không trả 403. ✅
  apps/server/src/routes/student-materials.ts:29-71; test
  apps/server/src/routes/materials.test.ts:1156-1236
- **BR-17.** Liên kết ngoài chỉ nhận URL http/https tuyệt đối — chặn
  javascript:, data:, file:; kiểm lại ở server bất kể client. ✅
  packages/api/src/material-contracts.ts:332-341; test
  apps/web/src/routes/_auth/materials/index.test.tsx:318-341
- **BR-18.** Tìm kiếm gộp chữ hoa-thường TIẾNG VIỆT ("Đề" khớp "đề") — thực
  hiện lọc sau truy vấn bằng chuẩn hóa NFC + locale vi vì lowercase của SQLite
  chỉ hạ ASCII; chấp nhận lọc trong bộ nhớ vì kho theo tổ chức đủ nhỏ. ✅
  apps/server/src/routes/materials.ts:1015-1026; test
  apps/server/src/routes/materials.test.ts:1443-1457
- **BR-19.** Kiểm upload là MỘT hàm thuần dùng chung client/server: client chặn
  trước khi gửi (tiết kiệm băng thông, tránh trang lỗi edge), server kiểm lại
  ĐỘC LẬP trên header + stream. ✅ packages/api/src/material-contracts.ts:4-9,309-313;
  apps/web/src/lib/repos/materials.ts:224-260

## Mục 6 — Ma trận lỗi

Wording UI trích nguyên văn từ `materialErrorMessage` + dialog (R2 — không có
catalog i18n).

| Mã / tình huống | HTTP | Điều kiện | Wording / hiển thị | Truy vết |
|---|---|---|---|---|
| E-01 — chưa đăng nhập | 401 | Thiếu phiên trên mọi đường tài liệu | (API thuần); client → đưa về đăng nhập lại | ✅ apps/server/src/routes/materials.ts:163; apps/web/src/components/materials/material-dialogs.tsx:55-59 |
| E-02 — vai không đủ quyền | 403 | Đọc khi thiếu vai đọc / ghi khi thiếu vai ghi | "Bạn không có quyền thực hiện thao tác này." | ✅ apps/server/src/routes/materials.ts:165-168; apps/web/src/lib/repos/materials.ts:210; test apps/server/src/routes/materials.test.ts:399-508 |
| E-03 — sai kiểu nội dung JSON | 415 | Lệnh JSON mà thân không phải application/json | (API thuần) | ✅ apps/server/src/routes/materials.ts:182-191 |
| E-04 — thân JSON hỏng | 400 | Thân không phân tích được | (API thuần) | ✅ apps/server/src/routes/materials.ts:192-197 |
| E-05 — thân không hợp lệ | 400 | Thiếu/thừa trường (strict), vượt độ dài, tên có ký tự điều khiển, URL không phải http/https, không có gì để sửa | "Dữ liệu không hợp lệ. Kiểm tra lại rồi thử lại." | ✅ apps/server/src/routes/materials.ts:198-202; packages/api/src/material-contracts.ts:343-420; apps/web/src/lib/repos/materials.ts:211-212 |
| E-06 — tham số danh sách/ngày sai | 400 | Từ khóa > 100 ký tự, loại lạ, ngày không đúng định dạng | (API thuần) | ✅ apps/server/src/routes/materials.ts:991-996,563-565 |
| E-07 — tài liệu không tồn tại | 404 | Chi tiết/sửa/xóa/gắn/mở file với id lạ hoặc chéo org | "Tài liệu không còn tồn tại — có thể đã bị xóa." | ✅ apps/server/src/routes/materials.ts:1039,1129,1140,1252; apps/web/src/lib/repos/materials.ts:147-148 |
| E-08 — thư mục không tồn tại | 404 | Cha/đích thư mục lạ, bị xóa giữa chừng | "Thư mục không còn tồn tại — có thể đã bị xóa." | ✅ apps/server/src/routes/materials.ts:296-299,764,866,940,1092-1095; apps/web/src/lib/repos/materials.ts:149-150 |
| E-09 — trùng tên thư mục | 409 | Cùng tên trong cùng cha (kể cả gốc) | "Đã có thư mục cùng tên ở vị trí này. Hãy chọn tên khác." | ✅ apps/server/src/routes/materials.ts:814-816,881-883,945-947; apps/web/src/lib/repos/materials.ts:153-154 |
| E-10 — thư mục không rỗng | 409 | Xóa thư mục còn con/tài liệu | "Thư mục còn thư mục con hoặc tài liệu. Hãy chuyển hoặc xóa chúng trước." | ✅ apps/server/src/routes/materials.ts:972,981; apps/web/src/lib/repos/materials.ts:151-152 |
| E-11 — tạo vòng thư mục | 400 | Di chuyển vào chính nó/con cháu | "Không thể chuyển thư mục vào chính nó hoặc thư mục con của nó." | ✅ apps/server/src/routes/materials.ts:766,785-787; apps/web/src/lib/repos/materials.ts:157-158 |
| E-12 — quá sâu | 400 | Tạo con ở cấp 5 / tổng độ sâu sau chuyển > 5 | "Cây thư mục tối đa 5 cấp — không thể đặt thư mục sâu hơn." | ✅ apps/server/src/routes/materials.ts:767-769,788-790; apps/web/src/lib/repos/materials.ts:155-156 |
| E-13 — đua ghi thư mục | 409 | Guard nguyên tử fail 2 lần, không phân loại được | (API thuần "concurrent folder conflict") | ✅ apps/server/src/routes/materials.ts:843,927 |
| E-14 — tài liệu đang dùng | 409 | Còn gắn buổi học và/hoặc bài giáo trình | "Tài liệu đang được dùng ở N buổi học…" / "…ở N bài trong giáo trình…" / "…cả hai" (kèm số) | ✅ apps/server/src/routes/materials.ts:1143-1149; apps/web/src/lib/repos/materials.ts:159-178; test apps/server/src/routes/materials.test.ts:2513-2549 |
| E-15 — đã gắn | 409 | Gắn trùng tài liệu vào cùng buổi | "Tài liệu này đã được gắn vào buổi học." | ✅ apps/server/src/routes/materials.ts:1288; apps/web/src/lib/repos/materials.ts:183-184 |
| E-16 — chưa gắn | 404 | Gỡ tài liệu không có trong buổi | "Tài liệu không còn gắn với buổi học này." | ✅ apps/server/src/routes/materials.ts:1383; apps/web/src/lib/repos/materials.ts:185-186 |
| E-17 — lớp không tồn tại | 404 | Lớp lạ/chéo org trên đường buổi | "Không tìm thấy lớp học." | ✅ apps/server/src/routes/materials.ts:566-572; apps/web/src/lib/repos/materials.ts:179-180 |
| E-18 — buổi không tồn tại | 404 | Ngày không có bài học/buổi thủ công; học viên thiếu điều kiện | "Buổi học không còn tồn tại — có thể đã được dời hoặc xóa." | ✅ apps/server/src/routes/materials.ts:594-612; apps/server/src/routes/student-materials.ts:75; apps/web/src/lib/repos/materials.ts:181-182 |
| E-19 — buổi nghỉ lễ | 409 | Gắn/tải/gỡ trên ngày toàn-nghỉ-lễ hoặc đã-dời còn buổi thủ công | "Buổi này là buổi nghỉ lễ đã dời lịch — không gắn tài liệu được." | ✅ apps/server/src/routes/materials.ts:575-580,1248-1250,1307-1309; apps/web/src/lib/repos/materials.ts:199-203 |
| E-20 — file không hợp lệ | 400 | Size không nguyên/dương, stream lệch khai báo, thiếu tên file | "File không hợp lệ hoặc rỗng. Hãy chọn file khác." | ✅ apps/server/src/routes/materials.ts:353,364-367,386-392,413-415; apps/web/src/lib/repos/materials.ts:187-188 |
| E-21 — file quá lớn | 413 | Vượt trần 25 MiB / 95 MiB | "File quá lớn — tối đa {dung lượng}." | ✅ apps/server/src/routes/materials.ts:345-352; apps/web/src/lib/repos/materials.ts:189-194 |
| E-22 — định dạng không hỗ trợ | 415 | MIME lạ, đuôi lệch MIME, magic-byte lệch | "Định dạng chưa hỗ trợ. Chỉ nhận PDF, ảnh PNG/JPG/WEBP, DOCX/PPTX/XLSX, MP3/M4A/MP4." | ✅ apps/server/src/routes/materials.ts:339-343,368-374,393-399; apps/web/src/lib/repos/materials.ts:195-196 |
| E-23 — kho chưa cấu hình | 503 | Upload/mở file/xóa file khi thiếu binding bucket | "Kho file tài liệu đang tạm ngưng. Liên kết vẫn dùng được; thử tải file lại sau." | ✅ apps/server/src/routes/materials.ts:1070,1154-1155,1185; apps/web/src/lib/repos/materials.ts:197-198 |
| E-24 — lỗi upload phía máy chủ | 500 | Stream lỗi, kho lỗi, DB lỗi sau khi dọn | (API thuần "upload failed") | ✅ apps/server/src/routes/materials.ts:382-384,416-417,1096,1350 |
| E-25 — Range không thoả | 416 | Dải bytes ngoài dung lượng file | (API thuần "Range Not Satisfiable" + Content-Range */total) | ✅ apps/server/src/lib/material-file-response.ts:60-70; test apps/server/src/lib/material-file-response.test.ts (nhánh 416) |
| E-26 — học viên không có buổi | 404 | Học viên thiếu đăng ký active/bài học ngày đó | (API thuần "session not found") | ✅ apps/server/src/routes/student-materials.ts:75,141,177 |
| E-27 — kiểm tra form client | — | Tên thư mục rỗng/>100; tiêu đề rỗng; URL không http(s); chưa chọn file | "Nhập tên thư mục." / "Tên thư mục tối đa 100 ký tự." / "Nhập tiêu đề tài liệu." / "Liên kết phải bắt đầu bằng http:// hoặc https://." / "Chọn một file để tải lên." | ✅ apps/web/src/components/materials/material-dialogs.tsx:192-206,277-288,377-389,458-465 |
| E-28 — client chặn trước upload | — | File chọn sai định dạng/quá lớn/rỗng (không gửi byte nào) | Dùng lại câu của E-22/E-21/E-20 tại chỗ chọn file | ✅ apps/web/src/lib/repos/materials.ts:224-260; apps/web/src/components/materials/material-dialogs.tsx:368-375; test apps/web/src/routes/_auth/materials/index.test.tsx:274-291 |
| E-29 — client dự phòng | — | Mất mạng / lỗi không có mã | "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại." / "Không lưu được — vui lòng thử lại." | ✅ apps/web/src/lib/repos/materials.ts:142-143,213 |

## Mục 7 — Thước đo thành công

| SM | Thước đo | Bằng chứng |
|---|---|---|
| SM-01 | Cổng quyền: ẩn danh 401, học viên 403, trợ giảng đọc được nhưng ghi 403. | ✅ apps/server/src/routes/materials.test.ts:399-508 |
| SM-02 | Thư mục: tạo/đổi tên/di chuyển/xóa chỉ-khi-rỗng với trùng tên chặn đúng. | ✅ apps/server/src/routes/materials.test.ts:509-586 |
| SM-03 | Trần 5 cấp giữ vững khi tạo lẫn di chuyển. | ✅ apps/server/src/routes/materials.test.ts:587-617 |
| SM-04 | Đua ghi thư mục: vòng/quá-sâu/trùng-tên chặn nguyên tử, không bao giờ 500, cập nhật bộ phận bị loại (#646). | ✅ apps/server/src/routes/materials.test.ts:618-774 |
| SM-05 | Liên kết: kiểm URL + lọc danh sách theo từ khóa/loại/thư mục. | ✅ apps/server/src/routes/materials.test.ts:775-852 |
| SM-06 | Upload: danh sách trắng, trần dung lượng, key đúng `<orgId>/<id>`, tải về kèm Range 206 và 416. | ✅ apps/server/src/routes/materials.test.ts:853-970 |
| SM-07 | Cách ly tổ chức: org khác 404 trên mọi đường theo-id. | ✅ apps/server/src/routes/materials.test.ts:971-1027 |
| SM-08 | Buổi: gắn, trùng 409, thứ tự vị trí, gỡ không mất tài liệu. | ✅ apps/server/src/routes/materials.test.ts:1028-1075 |
| SM-09 | Xóa bị chặn khi đang dùng; object-xóa-lỗi vẫn nhất quán DB. | ✅ apps/server/src/routes/materials.test.ts:1076-1113 |
| SM-10 | Upload vào buổi tạo trọn bộ tài liệu + liên kết (batch). | ✅ apps/server/src/routes/materials.test.ts:1114-1155 |
| SM-11 | Học viên: đúng lớp-đăng-ký-đọc-được; người khác bị chặn; tài liệu giáo trình không trùng id (#655). | ✅ apps/server/src/routes/materials.test.ts:1156-1426 |
| SM-12 | Dời buổi kéo tài liệu theo ngày mới. | ✅ apps/server/src/routes/materials.test.ts:1427-1442 |
| SM-13 | Tìm kiếm khớp tiếng Việt không phân biệt hoa-thường. | ✅ apps/server/src/routes/materials.test.ts:1443-1457 |
| SM-14 | Liên kết mồ côi sau xóa buổi vẫn gỡ được. | ✅ apps/server/src/routes/materials.test.ts:1458-1485 |
| SM-15 | Guard nghỉ-lễ 3 lớp (#645/#658/#662): chặn mutating, cho GET, ngày trộn cho gắn, buổi thủ công dùng được, bucket đã-shift chặn gắn/tải nhưng cho gỡ. | ✅ apps/server/src/routes/materials.test.ts:1486-2028 |
| SM-16 | Đuôi file phải khớp MIME và magic-byte chặn giả mạo trước khi lưu (#676). | ✅ apps/server/src/routes/materials.test.ts:2029-2302 |
| SM-17 | Xóa nêu cả hai nguồn đang-dùng; danh sách buổi có tài liệu giáo trình + loại trùng (#655). | ✅ apps/server/src/routes/materials.test.ts:2303-2590 |
| SM-18 | Trang web: lọc URL, debounce 300ms, đếm loại, chặn upload trước khi gửi, câu lỗi đang-dùng, ta chỉ-đọc, thư mục vòng tự phục hồi. | ✅ apps/web/src/routes/_auth/materials/index.test.tsx:138-449 (15 test) |
| SM-19 | Hợp đồng: schema, allowlist MIME, magic, URL an toàn, suy MIME từ đuôi. | ✅ packages/api/src/material-contracts.test.ts:1-466 (15 test) |
| SM-20 | Phục vụ file: Range 206, 416, inline media, attachment, CSP. | ✅ apps/server/src/lib/material-file-response.test.ts:1-184 (5 test) |
| SM-21 | Mapping buổi N ↔ bài N: đúng index lịch, holiday không chiếm số, ngoài lịch/triệu-vượt trả rỗng. | ✅ apps/server/src/lib/session-curriculum-materials.test.ts:1-417 (9 test) |
| SM-22 | e2e trình duyệt: vòng đời ngân hàng; tạo-buổi-kèm-tài liệu (2); upload thật + CORS + phát media + học viên đa-org; bộ ảnh màn hình #655. | ✅ apps/e2e/specs/material-bank.spec.ts:25; apps/e2e/specs/materials-at-session-create.spec.ts:43,84; apps/e2e/specs/material-upload-student.spec.ts:66; apps/e2e/specs/655-screenshots.spec.ts:69 |
| SM-23 | UI học viên: danh sách đọc-only, mở/tải file, icon theo loại. | ✅ apps/student/src/components/class/lesson-materials.test.tsx:1-171 (7 test) |

R1 tổng hợp: 101 test đang hoạt động trong 9 file test của feature + 4 spec e2e
(5 test). Quét `.skip/.only/.todo` trên toàn bộ → 0 hit (negative-search #7).

## Mục 8 — Thực thể nghiệp vụ

| Thực thể | Vai trò nghiệp vụ | Truy vết |
|---|---|---|
| Ngân hàng tài liệu (tài liệu) | Đơn vị trung tâm: tiêu đề + mô tả + một trong 3 hình thái (file / liên kết / audio-video); metadata kỹ thuật riêng của giáo viên; mốc tạo/cập nhật | ✅ packages/db/src/schema/material.ts:50-91 |
| Thư mục | Cây phân loại dùng chung cả tổ chức, sâu tối đa 5, tên duy nhất theo cha | ✅ packages/db/src/schema/material.ts:16-48 |
| Liên kết buổi học | "Tài liệu này dùng ở buổi (lớp, ngày) đó" — khóa (lớp, ngày, tài liệu), vị trí sắp thứ tự | ✅ packages/db/src/schema/material.ts:93-127 |
| Liên kết bài giáo trình | "Tài liệu này nằm trong bài N của giáo trình" — khóa (bài, tài liệu); suy ra tài liệu buổi theo buổi N ↔ bài N | ✅ packages/db/src/schema/material.ts:129-164 |
| Tham chiếu: tổ chức / lớp / bài giáo trình | Chủ sở hữu và bối cảnh gắn; chỉ vẽ tối thiểu ở ERD | ✅ packages/db/src/schema/material.ts:12-14 |

Ranh giới: bảng audio thư viện đề, kho đề nhập AI, kho bài nói — DÙNG interface
kho object nhưng bucket/binding riêng; bảng bộ đề tự học có cột trùng tên
"material" nhưng là chữ "tài liệu tham khảo" trong bộ đề, không liên kết bảng
tài liệu. ✅ packages/infra/alchemy.run.ts:195-209; packages/db/src/schema/study-pack.ts:14

## Mục 9 — Luồng (danh mục)

Đặc tả đủ ở srs/materials-reverse-flows.md.

| F-id | Luồng | Một dòng |
|---|---|---|
| F1 | Duyệt và tìm kiếm ngân hàng | Bộ lọc URL → server lọc org → lọc tiếng Việt → cây + danh sách + đếm |
| F2 | Tải file lên | Client kiểm trước → PUT byte thô → header/đuôi/magic → stream vào kho → ghi DB (lỗi thì dọn object) |
| F3 | Quản lý thư mục | Tạo/đổi tên/di chuyển/xóa với guard nguyên tử chống trùng/vòng/quá-sâu |
| F4 | Tài liệu của buổi học | Xem direct + từ giáo trình; gắn/gỡ/tải thẳng với guard nghỉ-lễ |
| F5 | Mở/tải file tài liệu | Cookie phiên → Range → 206/416 → CSP + inline/attachment |
| F6 | Xóa tài liệu | Chặn đang-dùng → xóa row trước → xóa object sau |
| F7 | Học viên đọc tài liệu buổi | Đăng ký active + bài học ngày đó → projection an toàn → mở file |

## Mục 10 — Màn hình

- `/materials` — trang "Tài liệu": PageHead (tiêu đề + lead + 2 nút), panel thư
  mục trái, thẻ tìm kiếm + chip loại + dòng đếm + "Xóa bộ lọc", danh sách tài
  liệu, 5 dialog (thư mục, liên kết, upload, sửa, xóa) (S3, S6).
- Modal "Tài liệu buổi {tên}" — trong trang chi tiết lớp: danh sách đã gắn +
  mục "Từ giáo trình", "Chọn từ ngân hàng" (duyệt), "Tải lên mới" (S29).
- Bộ chọn tài liệu trong form tạo buổi / thêm-sửa bài học (#655): chips đã
  chọn + duyệt ngân hàng + upload nhanh về gốc (S8) — thuộc feature Lớp học/
  Syllabus, mượn component.
- Ứng dụng học viên — mục tài liệu trong buổi học: danh sách đọc-only + mở/tải
  (S32) — thuộc feature học viên.

## Mục 11 — Ràng buộc

- Kho object là TÙY CHỌN TRIỂN KHAI: thiếu binding bucket thì mọi đường file
  (upload/mở/xóa-file) trả 503 với mã riêng, còn liên kết và metadata vẫn hoạt
  động; production dùng R2, e2e dùng đĩa, unit test dùng Map. ✅
  apps/server/src/routes/materials.ts:48-54,1070; apps/server/src/index.ts:125-129;
  apps/server/src/lib/media-store.ts:1-6
- Bucket `materials` khai báo riêng trong hạ tầng, mount vào biến môi trường
  cho worker. ✅ packages/infra/alchemy.run.ts:195-209
- Trần 95 MiB audio-video bị khóa bởi trần thân yêu cầu edge 100 MB — chỉ tăng
  khi cả staging và prod lên gói Business (≥ 200 MB) (#647). ✅
  packages/api/src/material-contracts.ts:20-26
- Ngày buổi học định danh cứng dạng yyyy-mm-dd nghiêm ngặt; mọi đường buổi đi
  qua bộ phân tích ngày chung. ✅ apps/server/src/routes/materials.ts:562-565
- Không có catalog i18n (R2): chữ người dùng là literal tiếng Việt. ✅
  negative-search trong reverse-gaps.md
- Audit mồ côi liên kết (#663) là workflow chạy THỦ CÔNG đọc-only trên dữ liệu
  thật, không tự động chạy. ✅ .github/workflows/audit-663.yml:1-22

## Mục 12 — Câu hỏi mở (OQ)

| OQ | Câu hỏi | Bối cảnh | Ảnh hưởng nếu sai |
|---|---|---|---|
| OQ-01 | Cột "người tạo" được lưu bắt buộc nhưng không bao giờ hiển thị hay dùng để phân quyền — ý định truy xuất (hiển thị ai tải lên, hạn chế sửa theo người tạo, hay chỉ audit)? | FR-06 không có chỗ nào hiện người tạo; mọi vai ghi ngang quyền | Thiếu tính năng "ai tải lên" mà tổ chức mong đợi; hoặc giữ cột vô dụng |
| OQ-02 | Nhãn "Dùng ở N buổi" chỉ đếm buổi học thật, không đếm lượt gắn trên giáo trình — giáo viên có thể thấy "Chưa dùng ở buổi nào" trong khi xóa bị chặn vì giáo trình; có cần gộp số hoặc nhãn riêng? | FR-06 vs BR-11; xóa vẫn đếm cả hai nguồn | Nhãn gây hiểu lầm "không ai dùng" trước khi xóa bị chặn |
| OQ-03 | Trần 25 MiB cho tài liệu: nguồn gốc con số; có kế hoạch nâng theo gói edge như audio-video (#647 chỉ nói trần 95 MiB)? | BR-09; comment chỉ giải thích trần media | File PDF/DOCX lớn bị chặn oan; hoặc trần lỏng hơn cần thiết |
| OQ-04 | Không có hạn mức số lượng/dung lượng tài liệu theo tổ chức — bucket chia sẻ; có cần hạn mức để một org không lấp đầy bucket? | negative-search #9; BR-09 chỉ chặn từng file | Chi phí bucket tăng không kiểm soát khi một org tải hàng loạt |
| OQ-05 | Xóa tài liệu không hoàn tác (dialog nói thẳng "Không thể hoàn tác") và không có thùng rác/soft-delete — nghiệp vụ có cần khôi phục trong 30 ngày? | BR-10 xóa cứng; negative-search #8 | Xóa nhầm file bài giảng mất vĩnh viễn |
| OQ-06 | Liên kết không được kiểm tra còn sống (chỉ kiểm hình thức http/https lúc tạo) — có cần kiểm định kỳ hay cảnh báo khi mở? | BR-17; không có job kiểm | Liên kết chết tồn tại vĩnh viễn trong ngân hàng |
| OQ-07 | Thư mục dùng chung mọi giáo viên trong tổ chức, không có quyền riêng theo thư mục — ý định khi tổ chức nhiều giáo viên-xe-buýt? | Comment schema "dùng chung cho mọi giáo viên trong org"; BR-02 chỉ phân vai toàn cục | Xung đột sắp xếp khi nhiều giáo viên cùng dùng một cây |
| OQ-08 | Nhãn "Copy theo bài của buổi" trong modal buổi học có đủ rõ cho giáo viên về quy tắc buổi N ↔ bài N (bị ảnh hưởng khi lịch dời/holiday không chiếm số)? | BR-14; FR-18; comment mapping ở module suy tài liệu | Giáo viên không hiểu sao tài liệu "tự xuất hiện/mất đi" theo buổi |
| OQ-09 | Audit mồ côi liên kết (#663) chỉ chạy workflow thủ công — có cần lịch định kỳ hoặc cảnh báo tự động khi số mồ côi vượt ngưỡng? | Ràng buộc Mục 11; S35 | Mồ côi tích lũy âm thầm sau mỗi lần áp-dời lỗi |
