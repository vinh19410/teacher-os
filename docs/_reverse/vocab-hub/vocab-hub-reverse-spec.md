---
feature: vocab-hub
type: reverse-srs
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
confidence_summary: "spec: ✅ 124 / 🔵 1 / 🟡 9; tổng toàn assembly: ✅ 291 / 🔵 4 / 🟡 23"
---

# vocab-hub — Đặc tả đảo ngược (reverse-SRS) — draft

Feature "vocab-hub" = cụm "Từ vựng" phía giáo viên: trang hub "/vocab" (2 tab
"Bộ từ vựng" / "Tiến độ"), quản trị bộ từ (tạo riêng / theo lớp, soạn từ, upload
âm thanh phát âm, xoá), thêm bộ từ từ thư viện dựng sẵn, gợi ý bộ từ cho học
viên (kèm thu hồi), và theo dõi tiến độ học từ vựng theo từng học viên. Việc
HỌC/ÔN của học viên trên các bộ từ này thuộc feature student-practice (đã đặc
tả riêng) — ở đây chỉ đặc tả dữ liệu đầu vào và mô hình tiếp cận.

> Quy ước nhãn — mỗi mệnh đề mang nhãn riêng: ✅ = khẳng định bởi code/test, có cite `path:line`; 🔵 = suy luận từ ≥2 bằng chứng code; 🟡 = phỏng đoán nghiệp vụ/why, bắt buộc kèm OQ tương ứng (Mục 12). Tên endpoint/hàm/bảng chỉ xuất hiện ở cột Truy vết và các file nguồn/evidence, không nằm trong mệnh đề FR/BR.

## Mục 0 — Nguồn soạn thảo (draft provenance)

- Soạn từ mã nguồn develop @ d6c0f6b5, đọc tĩnh, không chạy test, không chạy app,
  không sửa repo. ✅ (quy trình soạn)
- Plan reverse (docs/_reverse/reverse-plan.json) ghi slug này confidence HIGH,
  6 nguồn khai báo, `existing_doc` rỗng, không complexity flag. Kết quả điều tra
  thực tế MỞ RỘNG đáng kể so với 6 nguồn khai báo: cụm trải qua 4 lô phát triển
  (#359 → #361 → #363 → #366) với server + web + migration + seed + test đầy đủ.
  🔵 (bằng chứng gộp: reverse-sources.md S1..S52; 4 plan gốc còn trong plans/;
  runbook có 3 mục vận hành riêng cho migration 0037/0038/0039 —
  docs/production-release-runbook.md:899-924)
- Kiểm tra git status tại thời điểm soạn: KHÔNG file nguồn vocab nào đang dirty
  (chỉ .gitignore, biome.json và 1 test của feature khác). Chi tiết §R1 trong
  _evidence.md. ✅ (git status)
- Các số hiệu plan xuất hiện TRỰC TIẾP trong code: #359 (SRS game + CRUD giáo
  viên), #361 (thư viện dựng sẵn), #363 (hub độc lập + gợi ý), #366 (học viên
  học trọn khóa thư viện), #304 (release train). ✅
  packages/db/src/schema/vocab.ts:15,35,90; packages/api/src/contracts.ts:3090-3094
- Phân định ranh giới NGHIÊM NGẶT:
  - Học/ôn từ của học viên (Learn/Review, accept/dismiss gợi ý, provision card,
    proxy audio thư viện 5 MB) thuộc student-practice — route học viên được gắn
    vào app học viên, không nằm trong kernel giáo viên. ✅
    apps/server/src/routes/student.ts:90,2407; apps/e2e/specs/vocab-srs.spec.ts:50-665
  - Thư viện đề thi IELTS của admin (cùng chữ "library") là feature khác (#413) —
    chỉ trùng nhau ở từ đặt tên. ✅ docs/tech-debt.md:121 (bảng route apps/admin)
  - `docs/srs-spec.md` được trích trong chú thích schema nhưng FILE KHÔNG TỒN TẠI
    trong repo — negative-search #1 trong reverse-gaps.md. 🟡 (nguồn chuẩn thuật
    toán — OQ-01)

### 0.1 Bảng tài nguyên S (đầy đủ ở reverse-sources.md)

| S-id | Tài nguyên | Loại |
|---|---|---|
| S1 | Schema 4 bảng học tập (vocab_deck/word/card/review_log) | db schema |
| S2 | Schema 3 bảng thư viện (course/deck/word) | db schema |
| S3 | Hợp đồng Zod + mã lỗi + dòng bản chụp | api package |
| S4 | Route quản trị từ vựng giáo viên (CRUD + audio + gợi ý + tiến độ) | server code |
| S5 | Route thư viện dựng sẵn (duyệt + nhân bản) | server code |
| S6 | Kernel giáo viên (CSRF + mount) | server code |
| S7 | Bộ lập bản chụp (decks + suggestions pending) | server code |
| S8 | Bootstrap app (chặn role, allowlist email) | server code |
| S9 | Route học viên (ranh giới — mount) | server code |
| S10 | Bộ nạp bộ từ tiếp cận của học viên | server code |
| S11 | Kho media + lỗi lệch độ lớn | server code |
| S12 | Trang hub "Từ vựng" | client route |
| S13 | Bọc tab "Bộ từ vựng" (chế độ hub) | client component |
| S14 | Danh sách bộ từ dùng chung hub/lớp | client component |
| S15 | Hộp soạn từ vựng | client component |
| S16 | Dòng từ (3 ô + audio + nút) | client component |
| S17 | Hộp "Thêm từ thư viện" 2 bước | client component |
| S18 | Hộp gợi ý / thu hồi gợi ý | client component |
| S19 | Tab "Tiến độ" | client component |
| S20 | Ánh xạ lệnh → API (client) | client lib |
| S21 | Kiểu hành động ghi (client) | client lib |
| S22 | Bộ giảm sắc store (no-op với vocab) | client lib |
| S23 | Điều hướng giáo viên (sidebar) | client component |
| S24 | Test điều hướng | test |
| S25 | Tìm kiếm lệnh ⌘K | client component |
| S26 | Danh sách route hợp lệ cho service worker | client lib |
| S27 | Breadcrumb shell | client component |
| S28 | Trang chi tiết lớp (tab Từ vựng) | client route |
| S29 | Migration 0036 — 4 bảng học tập | migration |
| S30 | Migration 0037 — 3 bảng thư viện + 2 cột | migration |
| S31 | Migration 0038 — bộ từ độc lập + gợi ý | migration |
| S32 | Migration 0039 — card đa hình wordId | migration |
| S33 | Migration 0040 — thêm mô tả bài học thư viện | migration |
| S34 | Seed thư viện (20/968/10160) | seed |
| S35 | Runbook vận hành (3 mục vocab) | docs |
| S36 | Tech debt (bảng route) | docs |
| S37 | Test route giáo viên | test |
| S38 | Test route thư viện | test |
| S39 | Test schema/migration vocab | test |
| S40 | Test seed thư viện | test |
| S41 | Test hub + gợi ý (web) | test |
| S42 | Test hộp thư viện (web) | test |
| S43 | e2e hub + gợi ý | e2e |
| S44 | e2e nhân bản thư viện | e2e |
| S45 | e2e SRS học viên (ranh giới) | e2e |
| S46 | Plan reverse meta | plan meta |
| S47 | Plan #359 | plan doc |
| S48 | Plan #361 | plan doc |
| S49 | Plan #363 | plan doc |
| S50 | Plan #366 | plan doc |
| S51 | Route học viên vocab (ranh giới) | server code |
| S52 | Hướng dẫn seed + gate giấy phép | docs |

### 0.2 Liên kết

- Nguồn chi tiết: [reverse-sources.md](reverse-sources.md)
- Khoảng trống & câu hỏi mở: [reverse-gaps.md](reverse-gaps.md)
- Bằng chứng thô: [_evidence.md](_evidence.md)
- Luồng: [srs/vocab-hub-reverse-flows.md](srs/vocab-hub-reverse-flows.md)
- Máy trạng thái: [srs/vocab-hub-reverse-states.md](srs/vocab-hub-reverse-states.md)
- Mô hình dữ liệu: [srs/vocab-hub-reverse-erd.md](srs/vocab-hub-reverse-erd.md)
- Use cases: [usecases/vocab-hub-reverse-usecase-index.md](usecases/vocab-hub-reverse-usecase-index.md)

### 0.3 Tài liệu nghiệp vụ hiện có

- Không có tài liệu feature riêng cho vocab-hub (plan reverse `existing_doc`
  rỗng cho slug này). ✅ docs/_reverse/reverse-plan.json (entry slug vocab-hub)
- Có TÀI LIỆU VẬN HÀNH chi tiết: runbook có 3 mục riêng — migration 0037
  (deploy order + release train + seed 20/968/10160 kèm gate giấy phép PROD),
  migration 0038 (recreate bảng + diễn tập + backup + off-hours + thứ tự deploy
  3 bước), migration 0039 (bỏ khóa ngoại word_id + backup + release train). ✅
  docs/production-release-runbook.md:899-924
- Hướng dẫn seed + gate giấy phép PROD nằm ở tài liệu riêng của seed. ✅
  packages/db/scripts/README-seed-vocab-library.md:1-63 (S52)
- 4 plan gốc của các lô phát triển còn nguyên trong plans/. ✅ S47-S50
- `docs/srs-spec.md` được schema trích như đặc tả thuật toán (§1, §5) và plan
  #363 viện dẫn — file không tồn tại. 🟡 (OQ-01) ✅
  packages/db/src/schema/vocab.ts:85,127; plans/261019-0323-vocab-independent-hub/plan.md:69

## Mục 1 — Phạm vi

- Trong phạm vi:
  - Trang hub "/vocab": kicker thống kê, 2 tab "Bộ từ vựng" / "Tiến độ". ✅
    apps/web/src/routes/_auth/vocab/index.tsx:16-40
  - Quản trị bộ từ: tạo (riêng / theo lớp), danh sách với huy hiệu nguồn, soạn
    từ (thêm/sửa/xoá từng từ), upload âm thanh phát âm, xoá bộ từ. ✅
    apps/web/src/components/vocab/vocab-deck-list.tsx:102-309;
    apps/server/src/routes/vocab-teacher.ts:135-275,654-749,751-880
  - Thư viện dựng sẵn: duyệt khóa/bài/từ (toàn cục), nhân bản vào hub hoặc lớp
    với trần dữ liệu và báo cáo trùng. ✅ apps/server/src/routes/vocab-library.ts:47-364
  - Gợi ý bộ từ cho học viên: gửi (idempotent), thu hồi (mềm), lịch sử theo bộ
    từ. ✅ apps/server/src/routes/vocab-teacher.ts:277-496
  - Tiến độ theo học viên: bộ từ tiếp cận, phân bố 5 cấp độ, đến hạn hôm nay,
    hoạt động 7 ngày theo giờ Việt Nam. ✅ apps/server/src/routes/vocab-teacher.ts:498-652
- Ngoài phạm vi (chỉ nhắc khi liên quan): hành động học/ôn của học viên — Learn/
  Review, accept/dismiss gợi ý, chấm điểm, lập lịch lặp lại (thuộc
  student-practice, xem F6/SM-02); proxy audio thư viện 5 MB phía học viên;
  ngân hàng đề thi IELTS của admin; tính đa ngôn ngữ nội dung bộ từ (cột ngôn
  ngữ luôn giá trị mặc định — OQ-11).

## Mục 2 — Actor

- **Giáo viên (chủ tổ chức/thành viên web)**: actor duy nhất của toàn bộ màn
  hình trong feature. Mọi route đòi phiên đăng nhập; học viên và admin bị chặn
  ngay từ tầng bootstrap của app giáo viên. ✅
  apps/server/src/routes/vocab-teacher.ts:84-85 (và mọi route);
  apps/server/src/routes/vocab-library.ts:48-49 (và mọi route);
  apps/server/src/app.ts:224-241; test 401 đủ 4 endpoint thư viện
  apps/server/src/routes/vocab-library.test.ts:211-237
- **Học viên**: KHÔNG phải actor của feature này — chỉ là ĐỐI TƯỢNG của gợi ý
  (phải cùng tổ chức) và của trang tiến độ. Mọi hành động phía học viên thuộc
  student-practice. ✅ apps/server/src/routes/vocab-teacher.ts:357-377,507-514;
  apps/server/src/routes/student.ts:90,2407
- **Chủ sở hữu hệ thống (seed/ops)**: nạp dữ liệu thư viện 20 khóa / 968 bài /
  10.160 từ; PROD bị chặn cơ học tới khi có xác nhận quyền dùng nội dung bằng
  văn bản. ✅ packages/db/src/seed/vocab-library.ts:7-11;
  docs/production-release-runbook.md:903

## Mục 3 — Yêu cầu chức năng (FR)

| FR | Yêu cầu | Điều kiện / Giới hạn | Truy vết |
|---|---|---|---|
| FR-01 | Mục "Từ vựng" luôn xuất hiện trên điều hướng giáo viên, nhóm "IELTS"; địa chỉ /vocab là route hợp lệ; mục này KHÔNG bị gắn công tắc ẩn/hiện như một số cụm khác. | Không có biến điều kiện nào chặn mục; tìm kiếm nhanh ⌘K dùng chung danh sách điều hướng nên cũng tìm thấy mục này. | ✅ apps/web/src/components/layout/sidebar.tsx:88-105 (mục :103); apps/web/src/routes-matcher.ts:33; negative-search #9 trong reverse-gaps.md; test apps/web/src/components/layout/sidebar.test.tsx:161,172 |
| FR-02 | Trang hub mở đầu bằng tiêu đề "Từ vựng" và dòng thống kê dạng "{n} BỘ TỪ · {n} RIÊNG · {n} GỢI Ý CHỜ" — số bộ từ là tổng của tổ chức, số riêng là các bộ không gắn lớp, số gợi ý chờ lấy từ dữ liệu gợi ý còn chờ trong bản chụp. | Hai tab: "Bộ từ vựng" (mặc định) và "Tiến độ"; chuyển tab là trạng thái cục bộ, không đổi địa chỉ. | ✅ apps/web/src/routes/_auth/vocab/index.tsx:16-36 |
| FR-03 | Tab "Bộ từ vựng" (hub) liệt kê TOÀN BỘ bộ từ của tổ chức: mỗi dòng có tên bộ, huy hiệu nguồn ("Riêng" hoặc "Lớp {tên}"), huy hiệu "Thư viện" nếu bộ được nhân bản từ thư viện, huy hiệu "{n} chờ" nếu đang có gợi ý chờ cho bộ đó, dòng phụ "{n} từ · {mã ngôn ngữ}"; mỗi dòng 3 nút: "Gợi ý", "Soạn từ vựng", "Xoá"; đầu mục có nhãn "Từ vựng SRS" và 2 nút "Thêm từ thư viện" / "Tạo bộ từ". | Dữ liệu đọc từ bản chụp kernel (không gọi API danh sách riêng); số gợi ý chờ gom theo bộ từ. | ✅ apps/web/src/components/vocab/vocab-hub-decks.tsx:3-10; apps/web/src/components/vocab/vocab-deck-list.tsx:102-131,178-191,202-218,36-64,66-91 |
| FR-04 | Ở trang chi tiết lớp, cùng danh sách được tái sử dụng nhưng CHỈ hiện bộ từ thuộc lớp đó (không hiện bộ riêng); câu trạng thái rỗng và lời dẫn tạo bộ từ khác nhau giữa 2 chế độ. | Chế độ xác định bởi tham số lớp truyền vào; hub = không truyền/không có giá trị. | ✅ apps/web/src/components/vocab/vocab-deck-list.tsx:96-115,196-199,246-250; apps/web/src/routes/_auth/classes/$classId.tsx:26,315-322 |
| FR-05 | Tạo bộ từ qua hộp "Tạo bộ từ vựng mới": 1 ô tiêu đề (gợi ý "Ví dụ: Topic 1: Environment"); nút gửi bị vô hiệu khi tiêu đề trắng hoặc đang lưu; ở hub tạo bộ RIÊNG (không gắn lớp), ở lớp tạo bộ gắn lớp đó; lời dẫn hộp khác nhau theo chế độ. | Tạo thành công (dữ liệu làm mới về) thì xoá ô tiêu đề và đóng hộp; tạo THẤT BẠI thì hộp giữ nguyên, KHÔNG có thông báo lỗi nào — 🟡 (OQ-03). Máy chủ đòi lớp (nếu có) phải cùng tổ chức, không thì 404. | ✅ apps/web/src/components/vocab/vocab-deck-list.tsx:133-161,222-257; server apps/server/src/routes/vocab-teacher.ts:135-174 (kiểm tra lớp :142-156); test apps/web/src/components/vocab/vocab-hub.test.tsx:21 (thân lệnh có đích rỗng) |
| FR-06 | Xoá bộ từ qua hộp xác nhận "Xoá bộ từ vựng?" với lời cảnh báo nêu rõ: bộ từ + toàn bộ từ vựng + tiến độ học của học sinh trên bộ bị xoá vĩnh viễn, LỊCH SỬ ÔN TẬP KHÔNG MẤT; thành công → thông báo "Đã xoá bộ từ "{tên}"." | Máy chủ xoá TRONG MỘT lô nghi thức: thẻ học (trừ thẻ trỏ từ mượn thư viện) → gợi ý → từ → bộ từ; tuyệt đối giữ nhật ký ôn tập; bộ từ lạ/khác tổ chức → 404. | ✅ apps/web/src/components/vocab/vocab-deck-list.tsx:163-173,259-287; server apps/server/src/routes/vocab-teacher.ts:208-275 (chú thích doctrine :209-212, bảo vệ từ mượn :246-250); test apps/server/src/routes/vocab-teacher.test.ts:146 |
| FR-07 | Soạn từ vựng qua hộp "Soạn từ vựng": tải danh sách từ CỦA BỘ bằng lời gọi riêng mỗi lần mở (không dùng bản chụp); cho thêm nhiều dòng nháp liên tiếp (mỗi dòng 3 ô: "Từ vựng", "IPA", "Nghĩa tiếng Việt"); mỗi dòng có nút riêng (nháp → "Thêm", đã lưu → "Lưu"); nút "+ Thêm từ" nhân dòng mới; tải lỗi → thông báo và nút "Thử lại". | Dòng nháp chỉ sống trong phiên mở hộp (không bền); sửa/xoá dòng đã lưu gọi thẳng máy chủ và tải lại danh sách sau mỗi lần. | ✅ apps/web/src/components/vocab/vocab-deck-editor.tsx:11-16,30-54,83,147-157,163-175,195 (nhãn 3 ô do vocab-word-row.tsx:45,60,75 render) |
| FR-08 | Kiểm tra trước khi lưu một dòng từ: từ vựng bắt buộc — bỏ trống → "Từ vựng không được để trống." | Hợp đồng chặt phía máy chủ: từ 1-200 ký tự (bỏ khoảng trắng 2 đầu), IPA tối đa 200, nghĩa tối đa 500, thứ tự là số nguyên không âm; từ chối trường lạ. | ✅ apps/web/src/components/vocab/vocab-deck-editor.tsx:74-101 (thông báo :78); hợp đồng packages/api/src/contracts.ts:3179-3197 |
| FR-09 | Xoá từng từ: dòng nháp xoá tại chỗ; từ đã lưu được xoá qua máy chủ bằng MỘT lô (thẻ học của từ đó trừ thẻ trỏ từ mượn thư viện, rồi xoá từ); từ lạ/khác tổ chức → 404. | Không có hộp xác nhận riêng cho xoá từ (khác xoá bộ từ). | ✅ apps/web/src/components/vocab/vocab-deck-editor.tsx:103-117; server apps/server/src/routes/vocab-teacher.ts:714-749 (bảo vệ từ mượn :743); test apps/server/src/routes/vocab-teacher.test.ts:336 |
| FR-10 | Upload âm thanh phát âm cho TỪNG từ đã lưu: thả/chọn file âm thanh trên dòng từ (nhận audio/*, trần 50 MB, gợi ý "MP3/M4A/WAV · tối đa 50 MB"); gửi thẳng bytes tới máy chủ; thành công thì server tự sinh khóa lưu trữ dạng vocab/{tổ chức}/{từ}/{ngẫu nhiên} và ghi vào từ; KHÔNG bao giờ nhận khóa từ máy khách. | Máy chủ đòi khai báo độ lớn (411 nếu thiếu), chặn file rỗng (400), quá 50 MB (413), sai kiểu trong 9 loại cho phép (415); độ lớn đọc được phải khớp khai báo (400 nếu lệch); khóa cũ bị xoá sau khi ghi khóa mới; lỗi phía client → "Không upload được file âm thanh phát âm." | ✅ apps/web/src/components/vocab/vocab-deck-editor.tsx:119-141 (thông báo :136); apps/web/src/components/vocab/vocab-word-row.tsx:92-99; server apps/server/src/routes/vocab-teacher.ts:751-840 (411 :764-771, 400 :772-774,811-814, 413 :775-777, 415 :779-791, khóa :816, lệch độ lớn :821-823, xoá khóa cũ :835-837); chú thích red-team F3 hợp đồng packages/api/src/contracts.ts:3175-3177; trần 50 MB — hằng dùng chung của Speaking (#305) được vocab tái sử dụng: packages/api/src/contracts.ts:2420-2423, apps/server/src/routes/vocab-teacher.ts:775, apps/web/src/components/vocab/vocab-word-row.tsx:94; test 415 + mẫu khóa apps/server/src/routes/vocab-teacher.test.ts:146,237 |
| FR-11 | Dòng từ có file âm thanh thì hiện nhãn "Đã có audio" — tính theo CẢ hai nguồn: file đã upload (khóa lưu trữ) hoặc URL âm thanh từ thư viện (từ được nhân bản). | Phát audio phía giáo viên đi qua endpoint đọc của máy chủ; từ lạ → 404; chưa có file → 404. | ✅ apps/web/src/components/vocab/vocab-word-row.tsx:87-91; server apps/server/src/routes/vocab-teacher.ts:842-880 (404 :862-875); test apps/web/src/components/vocab/vocab-library-dialog.test.tsx:320 (URL thư viện + không khóa vẫn hiện nhãn) |
| FR-12 | Gợi ý bộ từ cho học viên: hộp gợi ý mở từ nút "Gợi ý" của dòng bộ từ; chọn 1 học viên trong tổ chức (mặc định học viên đầu tiên), ghi chú tuỳ chọn tối đa 500 ký tự; gửi xong → "Đã gửi gợi ý bộ từ vựng cho học viên."; lời dẫn giải thích học viên sẽ thấy bộ từ trong mục "Gợi ý cho bạn" trên cổng học viên (không bắt buộc). | Máy chủ đòi bộ từ VÀ học viên cùng tổ chức (404 nếu sai); gửi LẠI khi đang chờ hoặc đã được chấp nhận → trả về chính giá trị đã có (không tạo mới); gửi lại khi đã bị ẩn → bật lại thành đang chờ với ghi chú/người gợi ý/thời điểm mới; đua tranh giá trị duy nhất → tra lại và trả kết quả có sẵn. | ✅ apps/web/src/components/vocab/vocab-suggest-dialog.tsx:96-107,150-171 (thông báo :164),218-221; server apps/server/src/routes/vocab-teacher.ts:339-454 (không tạo mới :397-400, bật lại :401-413, đua tranh :440-453); hợp đồng packages/api/src/contracts.ts:3379-3387 |
| FR-13 | Thu hồi gợi ý: nút "Thu hồi" trên mỗi dòng lịch sử chưa "Đã ẩn" (cả đang chờ LẪN đã
  "Đã chấp nhận" — xem OQ-06); xong → "Đã thu hồi gợi ý bộ từ vựng."; thu hồi là XÓA MỀM — chỉ đổi trạng thái thành ẩn, GIỮ nguyên thời điểm phản hồi; gợi ý lạ/khác tổ chức → 404. | Không có xoá cứng gợi ý từ phía giáo viên; gợi ý chỉ bị xoá cứng khi bộ từ bị xoá. | ✅ apps/web/src/components/vocab/vocab-suggest-dialog.tsx:68-79 (nút :77,173-188, thông báo :182); server apps/server/src/routes/vocab-teacher.ts:456-496 (chú thích soft flip :484-487); test apps/server/src/routes/vocab-teacher.test.ts:453 |
| FR-14 | Lịch sử gợi ý trong hộp: tải FRESH từ máy chủ mỗi lần mở (kể cả khi bản chụp chưa làm mới) để đúng trạng thái thực; mỗi dòng gồm học viên, ghi chú, trạng thái ("Đang chờ" / "Đã chấp nhận" / "Đã ẩn"), thời điểm phản hồi ("Lúc …"); rỗng → "Chưa gợi ý bộ từ này cho học viên nào."; tổ chức không có học viên → "Chưa có học viên nào trong trung tâm." | Trạng thái lạ từ máy chủ được quy về "Đang chờ" (bộ đệm an toàn). | ✅ apps/web/src/components/vocab/vocab-suggest-dialog.tsx:84-91,102-107,120-142; nhãn :10-14; rỗng :282-285; không học viên :222-225; bộ đệm server apps/server/src/routes/vocab-teacher.ts:320-323 |
| FR-15 | Thư viện dựng sẵn là danh mục ĐỌC-THUẦN dùng chung mọi tổ chức: duyệt khóa học (kèm số bài), duyệt bài trong khóa (kèm số từ), xem trước từ của bài (phân trang tối đa 50 mỗi lượt, mặc định 20); mọi endpoint đòi đăng nhập; khóa/bài lạ → 404 đúng mã riêng. | Danh mục không gắn tổ chức — giáo viên tổ chức nào cũng đọc được cùng một dữ liệu; thứ tự theo trường sắp xếp có sẵn. | ✅ apps/server/src/routes/vocab-library.ts:33-43 (chú thích),47-81,83-141,143-202 (trần phân trang :21-24,168-174); test apps/server/src/routes/vocab-library.test.ts:211-334 (đọc chéo tổ chức :266-270, 401 :211-237) |
| FR-16 | Thêm từ thư viện qua hộp 2 bước: bước 1 duyệt 20 khóa học (tìm theo tên/mô tả/đích), bước 2 duyệt bài trong khóa (tìm kiếm trễ 300 ms, chọn nhiều bằng ô kiểm); chọn "theo lượt" — mỗi lượt tối đa 50 bài và tổng (bài + từ) tối đa 500; vượt trần thì chặn gửi và hiện cảnh báo "Vượt giới hạn 1 lượt (tối đa {n} bộ và tổng số bộ + từ ≤ {m}). Vui lòng bỏ chọn bớt bài."; chọn nhanh cả lượt bị tràn → "Đã chọn tối đa {n} bài cho 1 lượt — còn {k} bài, hãy thêm tiếp ở lượt sau."; gửi trùng bài trong cùng lượt → 400; lớp lạ → 404; bài lạ → 404. | Trần được máy chủ tự kiểm lại độc lập với client (422); hộp reset toàn bộ trạng thái mỗi lần mở. | ✅ apps/web/src/components/vocab/vocab-library-dialog.tsx:14-24 (trần :13-14 + trễ :15),105-118 (reset),120-146 (trễ + lọc),157-159 (vượt trần),196-234 (chọn theo lượt, thông báo :229),306-314 (cảnh báo footer); server apps/server/src/routes/vocab-library.ts:204-292 (trùng :221-230, lớp :234-245, trần :246-257,281-292); test apps/server/src/routes/vocab-library.test.ts:336-436 |
| FR-17 | Kết quả nhân bản: máy chủ chèn bộ từ MỚI (khóa ngẫu nhiên, giữ liên kết nguồn về bài thư viện, ngôn ngữ mặc định "en") và từ mới (chép từ/IPA/nghĩa/URL âm thanh; KHÔNG chép khóa) trong MỘT lô; trả về 201 kèm {id bộ đầu, số bài đã thêm, danh sách bài trùng}; bài TRÙNG (đã nhân bản trước đó vào cùng đích) chỉ được BÁO CÁO trong danh sách trùng, KHÔNG chặn — việc nhân bản lại vẫn chèn bản sao mới. 🟡 (chủ đích cho phép nhân bản lại — OQ-05) | Client phản ứng theo 4 loại kết quả: thành-có-làm-mới → thông báo "Đã thêm {n} bộ từ." / "Đã thêm {n} bộ từ vào lớp." (kèm "(k bài đã có trong hub từ trước)" / "(k bài đã có trong lớp từ trước)" nếu trùng) và đóng hộp; thành-chưa-làm-mới → "Đã lưu nhưng chưa xác nhận danh sách — vui lòng tải lại trang."; thất bại → "Không thể thêm bộ từ ({lý do})."; không rõ kết quả → "Không rõ kết quả mạng — hãy kiểm tra danh sách bộ từ trước khi thử lại."; bài đã có trong đích được dán chip "Đã có trong hub" / "Đã có trong lớp" ngay trong danh sách chọn. | ✅ server apps/server/src/routes/vocab-library.ts:294-364 (báo cáo trùng :294-312, chèn :314-354, trả về :356-363); client apps/web/src/components/vocab/vocab-library-dialog.tsx:236-293 (4 loại),33-48,519-528 (chip); test apps/server/src/routes/vocab-library.test.ts:438-541 (nhân bản lại báo trùng :510-526),543-588 (đích hub, trùng qua đích rỗng) |
| FR-18 | Bản chụp kernel phơi dữ liệu vocab cho web: danh sách bộ từ toàn tổ chức (mã, lớp, tên, ngôn ngữ, số từ TÍNH TỪ dữ liệu thật, thời điểm tạo, liên kết nguồn thư viện) và danh sách gợi ý CHỈ trạng thái đang chờ; trường gợi ý là TUỲ CHỌN trong hợp đồng để bản chụp cũ/mới đọc được nhau. | Số từ trên danh sách không lưu cột mà đếm lúc lập bản chụp. | ✅ apps/server/src/routes/snapshot.ts:386-410 (gợi ý chỉ pending :396-410),833-848; hợp đồng packages/api/src/contracts.ts:1946-1947,3120-3135 |
| FR-19 | Đổi tên bộ từ: đường máy chủ và khai báo hành động phía client ĐỀU TỒN TẠI nhưng KHÔNG có màn hình nào gọi — người dùng không thể đổi tên bộ từ sau khi tạo từ bất kỳ UI nào. 🟡 (đường chết: bỏ hay làm UI — OQ-02) | Hợp đồng cho phép đổi tên (1-200 ký tự) và tuỳ chọn ngôn ngữ; bộ từ lạ → 404. | ✅ server apps/server/src/routes/vocab-teacher.ts:176-206; khai báo client apps/web/src/lib/data-actions.ts:298-302; ánh xạ apps/web/src/lib/repos/kernel.ts:317-321; negative-search #2 trong reverse-gaps.md |
| FR-20 | Tiến độ theo học viên: chọn 1 học viên (bắt buộc) → trả về TẤT CẢ bộ từ học viên đó có thể tiếp cận, mỗi bộ gồm: nguồn (lớp / gợi ý / thư viện), tên lớp/khóa, tổng số từ, phân bố theo 5 cấp độ nhớ (chỉ đếm thẻ đang ôn), số từ đến hạn TRƯỚC HẾT HÔM NAY giờ Việt Nam, số thẻ mới/chưa học, số thẻ đã ôn, thời điểm học gần nhất; kèm chuỗi hoạt động 7 ngày (số lượt + số đúng mỗi ngày, kể cả ngày 0 lượt). | Thiếu học viên → 400; học viên lạ/khác tổ chức → 404; bộ tiếp cận = các lớp đang học (ghi danh hiệu lực) ∪ gợi ý ĐÃ ĐƯỢC CHẤP NHẬN ∪ các khóa thư viện mà học viên ĐÃ có thẻ; trùng bộ thì ưu tiên nguồn lớp > gợi ý > thư viện. | ✅ apps/server/src/routes/vocab-teacher.ts:498-652 (400 :501-504, 404 :507-514, hôm nay VN :516-527, cửa sổ 7 ngày :525-527, phân bố :601-637, hoạt động :569-599,642-649); mô hình tiếp cận apps/server/src/lib/vocab-provision.ts:72-108,110-247 (ưu tiên :200-238); hợp đồng packages/api/src/contracts.ts:3422-3466 |
| FR-21 | Tab "Tiến độ" hiển thị: bộ lọc học viên (theo tên/SĐT/email), mỗi bộ từ 1 khối với huy hiệu nguồn ("Lớp {tên}" hoặc "Lớp học"; "Khóa {tên}" hoặc "Thư viện"; "Gợi ý"), dòng "Đang học {x}/{tổng} từ · Chưa học {n} từ" (kèm " · Học gần nhất {ngày}" nếu có), nhãn "Đến hạn hôm nay: {n}", dải 5 cột "Cấp 1".."Cấp 5"; phần tổng có 3 chỉ số, mục "Hoạt động 7 ngày (giờ Việt Nam)", mục "Bộ từ vựng của học viên"; tổ chức không có học viên → "Chưa có học viên nào trong trung tâm để theo dõi tiến độ."; học viên chưa có bộ từ → "Học viên chưa có bộ từ vựng nào (chưa vào lớp có bộ từ hoặc chưa nhận gợi ý)."; tải lỗi → nút thử lại. | Tiến độ gọi endpoint riêng (không qua bản chụp) và phân tích lại bằng hợp đồng; đổi học viên thì tải lại. | ✅ apps/web/src/components/vocab/vocab-progress-tab.tsx:33-108 (huy hiệu :38-46, dòng trạng thái :47-53, đến hạn :57-68, dải cấp :71-108),129-138 (bộ lọc),156-186 (tải riêng + phân tích hợp đồng),188-221 (rỗng :217),284-390 (tổng + hoạt động :332, bộ từ :364-371) |
| FR-22 | Mọi ghi dữ liệu vocab đi qua cùng một cơ chế: client phát hành hành động có kiểu → ánh xạ thành lời gọi POST đúng đường → thành công thì TẢI LẠI toàn bộ bản chụp; store cục bộ KHÔNG tự biến đổi dòng vocab nào (8 kiểu hành động, tất cả đều no-op trong bộ giảm sắc). | 4 loại kết quả đồng nhất: refreshed / committed / definite-failure / outcome-unknown — màn hình ứng xử theo từng loại (FR-05, FR-17). | ✅ apps/web/src/lib/data-actions.ts:293-344; ánh xạ apps/web/src/lib/repos/kernel.ts:310-352; no-op apps/web/src/lib/data-store-reducer.ts:361-362 (mặc định trả nguyên trạng thái) |
| FR-23 | RANH GIỚI học viên: chấp nhận/từ chối gợi ý, học Learn/Review, tự sinh thẻ khi mở bộ, nghe audio thư viện (proxy 5 MB) là hành vi của student-practice; feature này chỉ bảo đảm đầu vào — bộ từ trong bản chụp, gợi ý trạng thái chờ, và mô hình tiếp cận dùng chung (lớp hiệu lực ∪ gợi ý chấp nhận ∪ thư viện có thẻ). | Route học viên gắn ngoài kernel giáo viên; dùng chung bộ predicate tiếp cận với tiến độ giáo viên. | ✅ apps/server/src/routes/student.ts:90,2407; apps/server/src/routes/vocab.ts:861 (mã lỗi phía học viên); apps/server/src/lib/vocab-provision.ts:72-108 (predicate dùng chung, chú thích 5 điểm gọi); e2e ranh giới apps/e2e/specs/vocab-srs.spec.ts:50-665 |

## Mục 4 — Yêu cầu phi chức năng (NFR)

| NFR | Yêu cầu | Truy vết |
|---|---|---|
| NFR-01 | Mọi lời gọi vocab đòi phiên đăng nhập; thiếu phiên → 401 đồng nhất trên cả 16 endpoint (4 thư viện + 12 nhóm giáo viên). | ✅ apps/server/src/routes/vocab-library.ts:49,85,145,206; apps/server/src/routes/vocab-teacher.ts:85,137,178,215,279,341,458,500,656,716,757,844; test apps/server/src/routes/vocab-library.test.ts:211-237 |
| NFR-02 | Phòng chống CSRF ở tầng kernel: ghi (POST/PUT/PATCH/DELETE) chỉ nhận khi Origin nằm trong danh sách cho phép (403) và thân POST phải là JSON (415); route vocab được mount SAU tầng này nên được bảo vệ như mọi lệnh ghi kernel. | ✅ apps/server/src/routes/kernel.ts:186-206; mount apps/server/src/routes/kernel.ts:3515-3520 (chú thích #359 chỉ 1 mount duy nhất) |
| NFR-03 | Hợp đồng dữ liệu chặt `.strict()`: từ chối trường lạ ở MỌI schema vocab; mã lỗi tập trung trong một bảng hằng; tiền tố định danh thư viện (libcourse-/libdeck-/libword-) bị cấm dùng làm định danh do client cung cấp (không phân biệt hoa thường). | ✅ packages/api/src/contracts.ts:3102-3116,3137-3138,3140-3156 (refine tiền tố :3144-3149),3179-3197; chú thích release train :3090-3095; test tiền tố apps/server/src/routes/vocab-teacher.test.ts:708 |
| NFR-04 | Trần dữ liệu một lượt ghi: audio 50 MB (khớp trần media dùng chung); nhân bản 50 bài / 500 bộ+từ; ghi chú gợi ý 500 ký tự; từ 200 ký tự; nghĩa 500 ký tự. | ✅ packages/api/src/contracts.ts:2423,3303-3309 (deckIds tối đa 50),3379-3387; apps/server/src/routes/vocab-library.ts:21-22; test 422 apps/server/src/routes/vocab-library.test.ts:378-436 |
| NFR-05 | Mô hình đọc-ghi một hướng: màn hình đọc từ bản chụp (một lần lấy toàn bộ), ghi qua hành động rồi tải lại bản chụp; chống lệch số giữa client và máy chủ; tiến độ là ngoại lệ có chủ đích (endpoint riêng vì dữ liệu theo học viên, không nằm trong bản chụp org). | ✅ apps/web/src/lib/repos/kernel.ts:310-352,380-381; apps/web/src/lib/data-store-reducer.ts:361-362; apps/web/src/components/vocab/vocab-progress-tab.tsx:156-178; bản chụp apps/server/src/routes/snapshot.ts:386-410 |
| NFR-06 | Chỉ mục dữ liệu: bộ từ theo tổ chức / lớp / nguồn thư viện; từ theo bộ; thẻ duy nhất mỗi (học viên, từ) + tra theo (học viên, đến hạn) + theo từ; gợi ý theo tổ chức + (học viên, trạng thái) + duy nhất (học viên, bộ); nhật ký theo (học viên, thời điểm). | ✅ packages/db/src/schema/vocab.ts:46-50,81,119-123,151-156,192-202; packages/db/src/schema/vocab-library.ts:48,82 |
| NFR-07 | Không có catalog i18n: mọi chữ người dùng thấy là chuỗi literal tại component (R2 — một nguồn duy nhất mỗi câu chữ). | ✅ negative-search #5 trong reverse-gaps.md (find rỗng) |
| NFR-08 | Tìm kiếm trong hộp thư viện phải chống gõ-liên-tục: trễ 300 ms trước khi lọc danh sách bài. | ✅ apps/web/src/components/vocab/vocab-library-dialog.tsx:14-15,120-129 |
| NFR-09 | Thao tác xoá không dựa vào cascade của cơ sở dữ liệu (PRAGMA khóa ngoại theo kết nối): server luôn xoá tường minh nhiều bảng trong MỘT lô; test dựng môi trường tắt khóa ngoại để chứng minh. | ✅ apps/server/src/routes/vocab-teacher.ts:209-212 (chú thích doctrine); packages/db/src/schema/vocab.ts:18-20; test apps/server/src/routes/vocab-teacher.test.ts:94-95,146 |

## Mục 5 — Quy tắc nghiệp vụ (BR)

- **BR-01.** Mọi dữ liệu vocab thuộc đúng một tổ chức: bộ từ gắn tổ chức người
  tạo; bộ gắn lớp thì lớp phải cùng tổ chức; mọi tra cứu bộ từ/gợi ý/từ/thẻ
  đều kèm điều kiện tổ chức. ✅ apps/server/src/routes/vocab-teacher.ts:142-156,194-196,220-232,283-293,346-377,507-514,661-673,721-735,794-809,852-860; test chéo tổ chức apps/server/src/routes/vocab-teacher.test.ts:401
- **BR-02.** Bộ từ có 2 dạng: RIÊNG (không gắn lớp — tạo từ hub, huy hiệu
  "Riêng", chỉ hiện ở hub) và THEO LỚP (gắn đúng 1 lớp, chỉ hiện ở trang lớp
  đó). ✅ apps/web/src/components/vocab/vocab-deck-list.tsx:104-115,202-206;
  migration 0038 cho phép lớp rỗng packages/db/src/migrations/0038_wise_blizzard.sql:26-40;
  test apps/web/src/components/vocab/vocab-hub.test.tsx:21
- **BR-03.** Định danh do client cung cấp không được mang tiền tố dành riêng cho
  thư viện (libcourse-/libdeck-/libword-, không phân biệt hoa thường); khóa âm
  thanh do máy chủ sinh, client không bao giờ truyền. ✅
  packages/api/src/contracts.ts:3137-3138,3144-3149,3183-3190;
  apps/server/src/routes/vocab-teacher.ts:816; test tiền tố
  apps/server/src/routes/vocab-teacher.test.ts:708
- **BR-04.** URL âm thanh của từ chỉ được ghi bởi luồng nhân bản từ thư viện
  (URL CDN có sẵn); giáo viên không thể nhập/dán URL âm thanh từ bất kỳ màn
  hình nào; file tự upload chỉ ghi khóa lưu trữ. ✅
  packages/db/src/schema/vocab.ts:55-59 (chú thích #361);
  apps/server/src/routes/vocab-library.ts:338-351 (chép URL, khóa rỗng);
  FR-10/FR-11. 🟡 (phụ thuộc CDN ngoài + gate giấy phép — OQ-08)
- **BR-05.** Xoá bộ từ: xoá tường minh thẻ (trừ thẻ trỏ từ mượn libword-*) →
  gợi ý → từ → bộ từ trong MỘT lô; NHẬT KÝ ÔN TẬP được giữ nguyên để bảo toàn
  chuỗi ngày/streak và thống kê retention của học viên. ✅
  apps/server/src/routes/vocab-teacher.ts:208-275; chú thích bảng
  packages/db/src/schema/vocab.ts:18-20,130-131; 🟡 (thẻ/nhật ký mồ côi sau khi
  bộ mất — OQ-10)
- **BR-06.** Mỗi cặp (học viên, bộ từ) có TỐI ĐA MỘT gợi ý (ràng buộc duy nhất):
  gửi khi đang chờ/đã chấp nhận → không tạo mới (idempotent); gửi khi đã ẩn →
  bật lại thành đang chờ với ghi chú/người gợi ý/thời điểm mới và XOÁ thời điểm
  phản hồi; thu hồi → chỉ đổi thành ẩn, giữ thời điểm phản hồi. ✅
  packages/db/src/schema/vocab.ts:159-164 (chú thích),198-201;
  apps/server/src/routes/vocab-teacher.ts:397-413,484-487; test
  apps/server/src/routes/vocab-teacher.test.ts:453
- **BR-07.** Bản chụp giáo viên chỉ phơi gợi ý ĐANG CHỜ; gợi ý đã chấp nhận/đã
  ẩn không xuất hiện (đếm "GỢI Ý CHỜ" và huy hiệu "{n} chờ" đều căn theo đó);
  lịch sử đầy đủ xem qua lời gọi riêng của hộp gợi ý. ✅
  apps/server/src/routes/snapshot.ts:396-410;
  apps/web/src/routes/_auth/vocab/index.tsx:26-27;
  apps/web/src/components/vocab/vocab-deck-list.tsx:125-131;
  apps/web/src/components/vocab/vocab-suggest-dialog.tsx:84-91
- **BR-08.** Thư viện là danh mục toàn cục chỉ-đọc với định danh suy ra từ dữ
  liệu gốc (libcourse-/libdeck-/libword-<số>) để nạp lại idempotent; nhân bản
  tạo BẢN SAO thuộc tổ chức (giữ liên kết nguồn); xoá bản sao không ảnh hưởng
  thư viện; quy mô chuẩn: 20 khóa / 968 bài / 10.160 từ. ✅
  packages/db/src/schema/vocab-library.ts:4-9,24-29,51-57;
  apps/server/src/routes/vocab-library.ts:314-354;
  packages/db/src/seed/vocab-library.ts:7-11; test
  apps/server/src/routes/vocab-library.test.ts:528-540 (xoá bản sao)
- **BR-09.** Trần nhân bản mỗi lượt: tối đa 50 bài và tổng (bài + từ) tối đa
  500 — máy chủ kiểm 2 lần (trước và sau khi đếm từ thật) và từ chối 422;
  trùng bài trong cùng lượt bị chặn 400; bài đã nhân bản vào cùng đích CHỈ báo
  cáo, không chặn. ✅ apps/server/src/routes/vocab-library.ts:21-22,220-230,246-257,281-292,294-312;
  test apps/server/src/routes/vocab-library.test.ts:336-436,510-526
- **BR-10.** Âm thanh phát âm: 9 kiểu tệp cho phép (mpeg, mp3, mp4, x-m4a, aac,
  wav, x-wav, webm, ogg); bắt buộc khai báo độ lớn; độ lớn đọc được phải khớp
  khai báo; khóa lưu trữ gắn tổ chức; ghi khóa mới xong xoá file cũ. ✅
  apps/server/src/routes/vocab-teacher.ts:41-51,764-791,816,821-823,835-837;
  apps/server/src/lib/media-store.ts:36-40
- **BR-11.** Thẻ học trỏ từ mượn thư viện (libword-*) là BẤT XÂM với mọi thao
  tác giáo viên: xoá từ và xoá bộ từ đều loại trừ thẻ libword-* khỏi phạm vi
  xoá — học viên giữ tiến độ trên khóa thư viện bất kể giáo viên xoá bộ nhân
  bản. ✅ apps/server/src/routes/vocab-teacher.ts:246-250,737-747; chú thích đa
  hình packages/db/src/schema/vocab.ts:88-90; migration 0039
  packages/db/src/migrations/0039_ambiguous_prowler.sql:1-6
- **BR-12.** Mốc thời gian tiến độ tính theo giờ Việt Nam (+07:00): "hôm nay"
  và "đến hạn" theo cuối ngày +07:00; cửa sổ hoạt động là 7 ngày liên tiếp kết
  thúc hôm nay (hôm nay − 6); gom lượt học vào ngày theo giờ Việt Nam bất kể
  máy chủ chạy múi giờ nào. ✅ apps/server/src/routes/vocab-teacher.ts:516-527,569-599;
  công cụ ngày dùng chung @teacher-os/api/vietnam-date (import :16)
- **BR-13.** Máy chủ giáo viên KHÔNG BAO GIỜ tạo/sửa thẻ học hay nhật ký ôn tập
  — tiến độ giáo viên là tổng hợp chỉ-đọc của dữ liệu học viên đã có; thẻ chỉ
  sinh lười ở phía học viên theo ràng buộc duy nhất (học viên, từ). ✅
  negative-search #6 trong reverse-gaps.md (0 hit insert thẻ/nhật ký ở route
  giáo viên); chú thích sinh lười packages/db/src/schema/vocab.ts:86-87
- **BR-14.** Tương thích phát hành: toàn bộ schema vocab `.strict()` và có
  trường mới → server + web + student PHẢI đi cùng một release train; trường
  gợi ý trong bản chụp là tuỳ chọn để bản chụp mới không làm vỡ bundle cũ. ✅
  packages/api/src/contracts.ts:3090-3095,1946-1947;
  docs/production-release-runbook.md:902,906-914,916-924

## Mục 6 — Ma trận lỗi

Wording UI trích nguyên văn từ component (R2 — không có catalog i18n).

| Mã / tình huống | HTTP | Điều kiện | Wording / hiển thị | Truy vết |
|---|---|---|---|---|
| E-01 — chưa đăng nhập | 401 | Thiếu phiên trên mọi endpoint vocab (giáo viên + thư viện) | (API thuần) | ✅ apps/server/src/routes/vocab-library.ts:49,85,145,206; apps/server/src/routes/vocab-teacher.ts:85,137,178,215,279,341,458,500,656,716,757,844; test apps/server/src/routes/vocab-library.test.ts:211-237 |
| E-02 — Origin không cho phép | 403 | Lệnh ghi từ nguồn ngoài danh sách (tầng kernel chung) | (API thuần) | ✅ apps/server/src/routes/kernel.ts:191-195 |
| E-03 — sai kiểu nội dung | 415 | POST mà thân không phải JSON (tầng kernel chung) | (API thuần) | ✅ apps/server/src/routes/kernel.ts:196-204 |
| E-04 — học viên vào app giáo viên | 403 | Phiên role student gọi bootstrap tổ chức | (API thuần, mã ACCOUNT) | ✅ apps/server/src/app.ts:224-231 |
| E-05 — admin vào app giáo viên | 403 | Phiên role admin (#413) | (API thuần, mã ACCOUNT) | ✅ apps/server/src/app.ts:233-241 |
| E-06 — email không trong danh sách / chưa xác thực | 403 | TEACHER_EMAILS đặt và email ngoài allowlist hoặc chưa verify | (API thuần, mã ACCOUNT) | ✅ apps/server/src/app.ts:245-266 |
| E-07 — thân JSON hỏng / thân không hợp lệ | 400 | Thân không phân tích được JSON, hoặc vi phạm schema `.strict()` (thiếu/thừa trường, tiêu đề > 200, ghi chú > 500, deckIds > 50, tiền tố dành riêng...) | (API thuần) | ✅ apps/server/src/routes/vocab-teacher.ts:64-81; apps/server/src/routes/vocab-library.ts:208-218; packages/api/src/contracts.ts:3140-3156,3379-3387,3303-3309 |
| E-08 — lớp không thuộc tổ chức | 404 | Tạo bộ từ / nhân bản vào lớp của tổ chức khác | (API thuần) | ✅ apps/server/src/routes/vocab-teacher.ts:142-156; apps/server/src/routes/vocab-library.ts:234-245; test apps/server/src/routes/vocab-teacher.test.ts:401, apps/server/src/routes/vocab-library.test.ts:350-359 |
| E-09 — bộ từ không tồn tại | 404 | Đọc từ / đổi tên / xoá / xem gợi ý / gửi gợi ý / soạn từ / upload / nghe audio với bộ từ lạ hoặc khác tổ chức (mã VOCAB_DECK_NOT_FOUND) | (API thuần) | ✅ apps/server/src/routes/vocab-teacher.ts:95-100,199-204,227-232,288-293,369-374,668-673; test apps/server/src/routes/vocab-teacher.test.ts:401 |
| E-10 — học viên không tồn tại | 404 | Gửi gợi ý / xem tiến độ với học viên lạ hoặc khác tổ chức | (API thuần) | ✅ apps/server/src/routes/vocab-teacher.ts:375-377,512-514 |
| E-11 — thiếu học viên trong truy vấn tiến độ | 400 | Gọi tiến độ không kèm học viên | (API thuần) | ✅ apps/server/src/routes/vocab-teacher.ts:501-504 |
| E-12 — từ không tồn tại | 404 | Xoá từ / upload audio với từ lạ hoặc khác tổ chức (mã VOCAB_WORD_NOT_FOUND) | (API thuần) | ✅ apps/server/src/routes/vocab-teacher.ts:730-735,804-809 |
| E-13 — gợi ý không tồn tại | 404 | Thu hồi gợi ý lạ hoặc khác tổ chức (mã VOCAB_SUGGESTION_NOT_FOUND) | (API thuần) | ✅ apps/server/src/routes/vocab-teacher.ts:474-482; test apps/server/src/routes/vocab-teacher.test.ts:453 |
| E-14 — thiếu kho media | 503 | PUT/GET audio khi máy chủ không cấu hình kho lưu trữ | (API thuần) | ✅ apps/server/src/routes/vocab-teacher.ts:759-762,846-849 |
| E-15 — thiếu khai báo độ lớn audio | 411 | PUT audio không có Content-Length hợp lệ | (API thuần) | ✅ apps/server/src/routes/vocab-teacher.ts:764-771 |
| E-16 — file âm thanh rỗng | 400 | PUT audio với độ lớn 0 hoặc thân rỗng | (API thuần) | ✅ apps/server/src/routes/vocab-teacher.ts:772-774,811-814 |
| E-17 — file âm thanh quá lớn | 413 | PUT audio vượt 50 MB | (API thuần) | ✅ apps/server/src/routes/vocab-teacher.ts:775-777; packages/api/src/contracts.ts:2423 |
| E-18 — kiểu âm thanh không cho phép | 415 | Content-Type ngoài 9 loại cho phép (mã VOCAB_INVALID_AUDIO) | (API thuần) | ✅ apps/server/src/routes/vocab-teacher.ts:41-51,779-791; test apps/server/src/routes/vocab-teacher.test.ts:237 |
| E-19 — độ lớn lệch thực tế | 400 | Số byte đọc được khác Content-Length khai báo | (API thuần) | ✅ apps/server/src/routes/vocab-teacher.ts:819-825; apps/server/src/lib/media-store.ts:36-40 |
| E-20 — chưa có âm thanh | 404 | Nghe audio của từ chưa upload hoặc object đã mất (mã VOCAB_AUDIO_NOT_FOUND) | (API thuần) | ✅ apps/server/src/routes/vocab-teacher.ts:862-875 |
| E-21 — trùng bài trong 1 lượt nhân bản | 400 | Danh sách bài có phần tử lặp (mã LIBRARY_CLONE_DUPLICATE_DECK) | (API thuần) | ✅ apps/server/src/routes/vocab-library.ts:220-230; test apps/server/src/routes/vocab-library.test.ts:337-348 |
| E-22 — khóa thư viện không tồn tại | 404 | Duyệt bài của khóa lạ (mã LIBRARY_COURSE_NOT_FOUND) | (API thuần) | ✅ apps/server/src/routes/vocab-library.ts:95-103; test apps/server/src/routes/vocab-library.test.ts:272-279 |
| E-23 — bài thư viện không tồn tại | 404 | Xem trước từ / nhân bản với bài lạ (mã LIBRARY_DECK_NOT_FOUND) | (API thuần) | ✅ apps/server/src/routes/vocab-library.ts:158-166,265-273; test apps/server/src/routes/vocab-library.test.ts:311-318,361-375 |
| E-24 — vượt trần nhân bản | 422 | > 50 bài, hoặc tổng bài + từ > 500 (mã LIBRARY_CLONE_TOO_LARGE) | (API thuần; client chặn trước bằng E-29) | ✅ apps/server/src/routes/vocab-library.ts:246-257,281-292; test apps/server/src/routes/vocab-library.test.ts:378-436 |
| E-25 — đua tranh ghi gợi ý (lý thuyết) | 500 | Tạo gợi ý đụng ràng buộc duy nhất nhưng tra lại không thấy dòng (bảo vệ kiểu) | (API thuần) | ✅ apps/server/src/routes/vocab-teacher.ts:440-453 (không có test kích hoạt — GAP-2) |
| E-26 — client: tạo bộ từ thất bại im lặng | — | Lệnh tạo không về trạng thái làm-mới (mất mạng / máy chủ từ chối) | KHÔNG có thông báo — hộp giữ nguyên, không đóng | ✅ apps/web/src/components/vocab/vocab-deck-list.tsx:150-160; 🟡 (chủ đích? — OQ-03) |
| E-27 — client: từ vựng bỏ trống | — | Bấm Thêm/Lưu khi ô từ trắng | "Từ vựng không được để trống." | ✅ apps/web/src/components/vocab/vocab-deck-editor.tsx:74-101 (:78) |
| E-28 — client: upload audio thất bại | — | Máy chủ từ chối / lỗi mạng | "Không upload được file âm thanh phát âm." | ✅ apps/web/src/components/vocab/vocab-deck-editor.tsx:119-141 (:136) |
| E-29 — client: chặn vượt trần chọn thư viện | — | Chọn vượt 50 bài / 500 bộ+từ | Nút xác nhận vô hiệu + "Vượt giới hạn 1 lượt (tối đa {n} bộ và tổng số bộ + từ ≤ {m}). Vui lòng bỏ chọn bớt bài." tại footer; chọn nhanh tràn → "Đã chọn tối đa {n} bài cho 1 lượt — còn {k} bài, hãy thêm tiếp ở lượt sau." | ✅ apps/web/src/components/vocab/vocab-library-dialog.tsx:157-159,229,306-314; test apps/web/src/components/vocab/vocab-library-dialog.test.tsx:226 |
| E-30 — client: kết quả nhân bản bất định | — | Thành nhưng không làm mới được / không rõ kết quả mạng | "Đã lưu nhưng chưa xác nhận danh sách — vui lòng tải lại trang." / "Không rõ kết quả mạng — hãy kiểm tra danh sách bộ từ trước khi thử lại." | ✅ apps/web/src/components/vocab/vocab-library-dialog.tsx:266-273,286-292 |
| E-31 — trạng thái rỗng | — | Hub chưa có bộ từ / lớp chưa có bộ từ / học viên chưa có bộ / hộp gợi ý chưa có lịch sử / tổ chức không có học viên | "Chưa có bộ từ vựng nào. Tạo bộ từ mới hoặc thêm từ thư viện để gợi ý cho học viên." / "Chưa có bộ từ vựng nào cho lớp này. Tạo bộ từ để học sinh học và ôn tập theo 5 cấp độ trí nhớ." / "Học viên chưa có bộ từ vựng nào (chưa vào lớp có bộ từ hoặc chưa nhận gợi ý)." / "Chưa gợi ý bộ từ này cho học viên nào." / "Chưa có học viên nào trong trung tâm." và "Chưa có học viên nào trong trung tâm để theo dõi tiến độ." | ✅ apps/web/src/components/vocab/vocab-deck-list.tsx:194-199; apps/web/src/components/vocab/vocab-progress-tab.tsx:217,364-371; apps/web/src/components/vocab/vocab-suggest-dialog.tsx:222-225,282-285 |

## Mục 7 — Thước đo thành công

| SM | Thước đo | Bằng chứng |
|---|---|---|
| SM-01 | Điều hướng: mục "Từ vựng" nằm nhóm "IELTS" và tìm được qua ⌘K; /vocab là route hợp lệ cho service worker. | ✅ apps/web/src/components/layout/sidebar.test.tsx:161,172; apps/web/src/routes-matcher.ts:33 |
| SM-02 | Hub hiện bộ riêng + bộ lớp với huy hiệu đúng; trang lớp chỉ hiện bộ của lớp; tạo từ hub gửi đích rỗng. | ✅ apps/web/src/components/vocab/vocab-hub.test.tsx:21 |
| SM-03 | Gợi ý idempotent: 201 lần đầu → 200 cùng định danh khi gọi lại; thu hồi giữ thời điểm phản hồi; gửi lại sau ẩn → về trạng thái chờ; xoá bộ xoá sạch gợi ý không mồ côi. | ✅ apps/server/src/routes/vocab-teacher.test.ts:453 (suite gợi ý) |
| SM-04 | Xoá bộ giữ nguyên nhật ký ôn tập; thẻ + từ + gợi ý bị xoá sạch trong một lô. | ✅ apps/server/src/routes/vocab-teacher.test.ts:146 (kịch bản xoá hàng loạt) |
| SM-05 | Thư viện: đủ 4 endpoint 401 khi chưa đăng nhập; 404 đúng mã cho khóa/bài lạ; 400 trùng lượt; 422 vượt trần (2 dạng). | ✅ apps/server/src/routes/vocab-library.test.ts:211-237,239-334,336-376,378-436 |
| SM-06 | Nhân bản: 201 {số bài, danh sách trùng rỗng}; bản chụp hiện liên kết nguồn + số từ; tổ chức khác thấy 0; nhân bản lại báo đúng bài trùng; xoá bản sao không hại thư viện; đích hub (không lớp) phát hiện trùng qua điều kiện lớp rỗng. | ✅ apps/server/src/routes/vocab-library.test.ts:438-541,543-588 |
| SM-07 | Tiến độ: nguồn đúng ("suggested" / "library" kèm tên khóa), phân bố cấp và gom ngày theo giờ Việt Nam; thẻ trỏ từ mượn đúng bảng thư viện. | ✅ apps/server/src/routes/vocab-teacher.test.ts:453,708 |
| SM-08 | Schema/migration: diễn tập 0038 và 0039 đúng trình tự recreate + ràng buộc duy nhất còn nguyên + dọn thẻ mồ côi cũ. | ✅ packages/db/src/schema/vocab.test.ts:14,200,219 |
| SM-09 | Seed thư viện đúng quy mô khai báo (20/968/10160) và idempotent khi chạy lại. | ✅ packages/db/src/seed/vocab-library.test.ts:34-553 (7 kịch bản); packages/db/src/seed/vocab-library.ts:7-11 |
| SM-10 | Âm thanh: sai kiểu MIME bị chặn 415; khóa ghi đúng mẫu vocab/{tổ chức}/{từ}/{ngẫu nhiên}. | ✅ apps/server/src/routes/vocab-teacher.test.ts:146,237 |

## Mục 8 — Thực thể nghiệp vụ

| Thực thể | Vai trò nghiệp vụ | Truy vết |
|---|---|---|
| Bộ từ vựng (vocab_deck) | Đơn vị quản trị của giáo viên: tên + ngôn ngữ + đích (lớp hoặc riêng) + liên kết nguồn nếu nhân bản từ thư viện | ✅ packages/db/src/schema/vocab.ts:14-51 |
| Mục từ (vocab_word) | Từ vựng trong bộ: từ + IPA + nghĩa + âm thanh (khóa tự upload hoặc URL thư viện) + thứ tự | ✅ packages/db/src/schema/vocab.ts:53-82 |
| Thẻ ghi nhớ (vocab_card) | Trạng thái SRS 5 cấp độ của MỘT học viên trên MỘT từ; định danh từ là đa hình (từ của giáo viên hoặc từ mượn thư viện) | ✅ packages/db/src/schema/vocab.ts:84-124 |
| Nhật ký ôn tập (vocab_review_log) | Lịch sử học bất biến (kèm bản chụp từ + nghĩa tại thời điểm ghi); sống sót khi bộ từ bị xoá | ✅ packages/db/src/schema/vocab.ts:126-157 |
| Gợi ý bộ từ (vocab_suggestion) | Liên kết giáo viên → học viên → bộ từ với trạng thái chờ/đã chấp nhận/đã ẩn + ghi chú + hai mốc thời gian | ✅ packages/db/src/schema/vocab.ts:159-203 |
| Khóa thư viện (vocab_library_course) | Khóa từ vựng dựng sẵn toàn cục (tên/mô tả/đích) | ✅ packages/db/src/schema/vocab-library.ts:4-22 |
| Bài học thư viện (vocab_library_deck) | Bài học mẫu trong khóa (kèm ảnh + mô tả thêm sau) | ✅ packages/db/src/schema/vocab-library.ts:24-49; packages/db/src/migrations/0040_deep_oracle.sql:1 |
| Từ mẫu thư viện (vocab_library_word) | Từ mẫu giàu dữ liệu (loại từ, 2 câu ví dụ, ảnh, URL âm thanh) | ✅ packages/db/src/schema/vocab-library.ts:51-83 |
| Tổ chức / Lớp / Học viên / Người dùng (tham chiếu) | Phạm vi sở hữu và đối tượng của gợi ý + tiến độ | ✅ packages/db/src/schema/vocab.ts:9-12,26-31,100-102,170-181 |

Ranh giới: route học viên và bảng ghi danh (enrollment) thuộc
feature học viên/student-practice — chỉ vẽ tối thiểu ở ERD. ✅
apps/server/src/routes/student.ts:90,2407; apps/server/src/lib/vocab-provision.ts:72-108

## Mục 9 — Luồng (danh mục)

Đặc tả đủ (sequence + flowchart) ở srs/vocab-hub-reverse-flows.md.

| F-id | Luồng | Một dòng |
|---|---|---|
| F1 | Vào hub từ vựng | Điều hướng → kicker thống kê → 2 tab → danh sách bộ từ theo chế độ |
| F2 | Tạo / xoá bộ từ vựng | Hộp tạo (đích hub/lớp) và hộp xoá (lô nghi thức giữ nhật ký) |
| F3 | Soạn từ vựng + âm thanh phát âm | Hộp soạn: dòng nháp → lưu/xoá từng từ → upload audio 9 MIME/50 MB |
| F4 | Thêm bộ từ từ thư viện | Hộp 2 bước → chọn theo lượt (trần 50/500) → nhân bản → 4 loại kết quả |
| F5 | Gợi ý / thu hồi gợi ý | Hộp gợi ý: lịch sử tươi → gửi idempotent → thu hồi mềm |
| F6 | Xem tiến độ học viên | Chọn học viên → bộ tiếp cận 3 nguồn → 5 cấp + đến hạn + hoạt động 7 ngày |

## Mục 10 — Màn hình

- `/vocab` — trang "Từ vựng": kicker thống kê + 2 tab (S12). Tab "Bộ từ vựng"
  dùng S13→S14; tab "Tiến độ" dùng S19.
- Hộp "Tạo bộ từ vựng mới" và hộp "Xoá bộ từ vựng?" — 2 hộp gắn trong S14.
- Hộp "Soạn từ vựng" (S15) với các dòng từ S16 (3 ô + dropzone audio + nút).
- Hộp "Thêm từ thư viện" 2 bước (S17).
- Hộp gợi ý / thu hồi gợi ý (S18).
- `/classes/:classId` — tab "Từ vựng" tái dùng S14 ở chế độ lớp (S28).
- Không có breadcrumb riêng cho /vocab trong cấu hình shell (negative-search #8).

## Mục 11 — Ràng buộc

- MỘT mount duy nhất `/api/kernel/vocab*` trên kernel giáo viên — mount trùng
  `/api/vocab/*` đã bị bỏ để không mở bề mặt thừa (#359). ✅
  apps/server/src/routes/kernel.ts:3515-3520; negative-search #3
- Học viên và admin bị chặn ngay tầng bootstrap app giáo viên (không bao giờ
  tạo được phiên tổ chức). ✅ apps/server/src/app.ts:224-241
- Chống CSRF ở tầng kernel (Origin 403 + JSON 415) bao phủ mọi lệnh ghi vocab
  vì route mount sau middleware. ✅ apps/server/src/routes/kernel.ts:186-206
- Không dựa vào cascade khóa ngoại khi xoá (PRAGMA theo kết nối) — xoá tường
  minh trong một lô; doctrine ghi ở cả schema lẫn route. ✅
  packages/db/src/schema/vocab.ts:18-20; apps/server/src/routes/vocab-teacher.ts:209-212
- Release train server + web + student cho mọi thay đổi schema/hợp đồng vocab
  (chú thích #304/#361/#363 và 3 mục runbook). ✅
  packages/api/src/contracts.ts:3090-3095; docs/production-release-runbook.md:899-924
- Múi giờ nghiệp vụ: ngày/đến hạn/hoạt động theo giờ Việt Nam. ✅ BR-12
- Không i18n catalog (R2); chữ literal tại component. ✅ negative-search #5
- Danh sách bộ từ của giáo viên không phân trang/không lọc phía máy chủ — bản
  chụp trả toàn bộ tổ chức. 🟡 (quy mô — OQ-04) ✅ negative-search #4
- Thư viện là dữ liệu seed ngoài mã: PROD bị chặn nạp tới khi có xác nhận giấy
  phép bằng văn bản; staging tự nạp qua pipeline deploy. ✅
  docs/production-release-runbook.md:903; packages/db/scripts/README-seed-vocab-library.md:1-63

## Mục 12 — Câu hỏi mở (OQ)

| OQ | Câu hỏi | Bối cảnh | Ảnh hưởng nếu sai |
|---|---|---|---|
| OQ-01 | `docs/srs-spec.md` (đặc tả thuật toán SRS §1/§5) bị trích trong schema và plan nhưng không tồn tại — nguồn chuẩn thuật toán 5 cấp độ nằm ở đâu, có cần phục hồi tài liệu? | packages/db/src/schema/vocab.ts:85,127; plans/261019-0323-vocab-independent-hub/plan.md:69; negative-search #1 | Người bảo trì không tra được thuật toán gốc; nhánh phát triển mới lệch chuẩn |
| OQ-02 | Đường đổi tên bộ từ: server + hành động client đầy đủ nhưng không UI nào gọi — giữ làm mục tiêu tương lai hay gỡ bỏ? | FR-19; negative-search #2 | Đường chết tích tụ; người dùng không thể sửa tên sai sau khi tạo |
| OQ-03 | Tạo bộ từ thất bại KHÔNG có thông báo (khác hẳn các luồng khác đều có toast) — chủ ý im lặng hay thiếu sót phản hồi? | FR-05, E-26; vocab-deck-list.tsx:150-160 so với editor/library-dialog đều có thông báo | Người dùng tưởng bấm hụt, bấm lại tạo trùng; hoặc lệch chuẩn UX vô chủ đích |
| OQ-04 | Bản chụp trả TOÀN BỘ bộ từ của tổ chức không phân trang (kicker cũng đếm gợi ý chờ toàn tổ chức) — tổ chức vài trăm bộ từ có còn dùng được? | FR-02, FR-18, negative-search #4 | Trang hub chậm khi quy mô tăng; số liệu kicker mất ý nghĩa |
| OQ-05 | Nhân bản lại bài đã có CHỈ báo cáo trùng, vẫn chèn bản sao mới — chủ đích "tạo lại từ đầu" hay nên chuyển sang cập nhật bản đã có? | FR-17, BR-09; test :510-526 | Bản sao trùng tích tụ trong hub; giáo viên khó phân biệt bản nào chuẩn |
| OQ-06 | Giáo viên thu hồi gợi ý ĐÃ ĐƯỢC CHẤP NHẬN vẫn được (đổi thành ẩn, mất quyền truy cập bên học viên) — có cần chặn hoặc cảnh báo riêng không? (mã lỗi "đã chấp nhận" chỉ tồn tại ở phía học viên) | FR-13, FR-23; apps/server/src/routes/vocab.ts:861 | Học viên mất bộ đang học mà không có rào xác nhận; hoặc chặn oan nghiệp vụ thu hồi |
| OQ-07 | Ghi chú gợi ý (tối đa 500 ký tự) hiển thị cho học viên thế nào và nội dung khuyến khích là gì? (phía giáo viên chỉ có ô nhập) | FR-12; student-practice đặc tả phần hiển thị | Ghi chú viết tùy tiện gây hiểu lầm; hoặc trường tồn mà không ai đọc |
| OQ-08 | URL âm thanh thư viện là CDN ngoài (hotlink) — độ sẵn sàng/bản quyền do ai chịu? (seed PROD đã có gate giấy phép, nhưng khi chạy thật phụ thuộc CDN sống) | BR-04; runbook :903; test dùng URL mochidemy | Audio thư viện chết hàng loạt nếu CDN gỡ; rủi ro pháp lý nội dung |
| OQ-09 | /vocab không có breadcrumb trong cấu hình shell trong khi các trang khác có — chủ ý hay bỏ sót? | Mục 10; negative-search #8 | Điều hướng nhất quán kém; người dùng mất ngữ cảnh |
| OQ-10 | Sau khi xoá bộ từ, nhật ký ôn tập vẫn giữ mã bộ đã mất và thẻ của bộ bị xoá — nghiệp vụ streak/retention phía học viên tính gì trên dữ liệu mồ côi này? | BR-05; packages/db/src/schema/vocab.ts:130-131 | Streak tính sai/dư; hoặc hợp lệ nhưng không ai biết ý nghĩa |
| OQ-11 | Cột ngôn ngữ của bộ từ luôn giá trị mặc định "en" (tạo/nhân bản đều vậy; chỉ đường đổi tên cho phép sửa) — có lộ trình đa ngôn ngữ thật không? | BR-02, FR-19; vocab-library.ts:331-332 | UI hiển thị "{n} từ · en" vô nghĩa nếu mở rộng ngôn ngữ khác |
