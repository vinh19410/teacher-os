---
feature: study-pack
type: reverse-srs
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
confidence_summary: "spec: ✅ 106 / 🔵 4 / 🟡 6; tổng toàn assembly (spec + sources + gaps + evidence + srs + usecases): ✅ 319 / 🔵 4 / 🟡 17"
---

# study-pack — Đặc tả đảo ngược (reverse-SRS) — draft

Feature "study-pack" trong tài liệu này = bộ bài tập tự học ghép theo từng ngày
(bộ đề) cho giáo viên: tạo/sửa bộ đề từ ngân hàng đề của trung tâm, nhận bản sao
từ thư viện hệ thống, gán bộ đề cho lớp theo lịch ngày + khung giờ trong ngày,
và máy học viên nhận bài đúng giờ mở bài. Phía console quản trị có một nửa đối
xứng (soạn bộ đề hệ thống) nhưng đã đặc tả trong feature admin-library — tài
liệu này chỉ trỏ ngược, không soạn lại.

> Quy ước nhãn — mỗi mệnh đề mang nhãn riêng: ✅ = khẳng định bởi code/test, có cite `path:line`; 🔵 = suy luận từ ≥2 bằng chứng code; 🟡 = phỏng đoán nghiệp vụ/why, bắt buộc kèm OQ tương ứng (Mục 12).
> Tên endpoint/hàm/bảng chỉ xuất hiện ở cột Truy vết và các file nguồn/evidence, không nằm trong mệnh đề FR/BR.

## Mục 0 — Nguồn soạn thảo (draft provenance)

- Soạn từ mã nguồn develop @ d6c0f6b5, đọc tĩnh, không chạy test/app; không chỉnh
  sửa bất kỳ tệp nào của repo (kể cả docs/_reverse). Lưu ý provenance: HEAD thực
  tế của working tree là 1 merge sau d6c0f6b5; toàn bộ tệp phạm vi giống hệt
  d6c0f6b5, chỉ contracts.ts thêm 2 dòng ở đoạn #675 (ngoài phạm vi) làm trôi
  +2 số dòng từ dòng ~1970 trở đi — mọi cite trong tài liệu này đã kiểm trên
  working tree (chi tiết _evidence.md §Provenance).
- Phạm vi gồm BỐN khối: (A) kho bộ đề của giáo viên (CRUD + nhân bản bản sao hệ
  thống); (B) gán bộ đề vào lớp (vật hoá nội dung, tính lịch theo ngày, sinh bài
  giao + mục tiêu học viên); (C) máy mở bài thời điểm đọc + bù bài cho học viên
  muộn; (D) màn theo dõi tiến độ nộp theo bộ đề trên trang lớp.
- complexity_flag: state-machine (pack draft↔ready; lượt gán active↔cancelled;
  bài giao chưa mở↔đã mở↔đã huỷ-dọn); concurrency (gán song song, nhân bản song
  song, huỷ giữa chừng — xử lý bằng khoá duy nhất + đọc lại); multi-role (hai
  nhóm vai đọc/ghi mượn từ khối chấm bài); scheduling (lịch thuần dùng chung
  client/server, bỏ ngày nghỉ lớp).

### Plan-ref trong comment code (grep -n "#<số>" từng tệp phạm vi)

| Tệp phạm vi | Hệ số ref | Chi tiết |
|---|---|---|
| apps/server/src/routes/study-pack.ts | 0 | không có comment #<số> nào |
| apps/server/src/lib/study-pack-clone.ts | 2 | #574 (:30), #366 RT-F2 (:34) |
| apps/server/src/lib/study-pack-assign.ts | 0 | không có comment #<số> nào |
| packages/db/src/schema/study-pack.ts | 4 | #533 (:14, :46, :79, :110) |
| packages/db/src/migrations/0060_study_pack.sql | 0 | không có comment #<số> nào |
| packages/api/src/contracts.ts (đoạn 4456-4801) | 1 | #533 (:4456); các ref khác trong tệp thuộc feature khác |
| apps/web/src/routes/_auth/assignments/packs.tsx | 0 | không có comment #<số> nào |
| apps/web/src/components/classes/class-study-pack-section.tsx | 0 | không có comment #<số> nào |
| apps/web/src/lib/repos/study-pack.ts | 0 | không có comment #<số> nào |
| apps/e2e/specs/study-pack.spec.ts | 0 | không có comment #<số>; con số "533" chỉ xuất hiện trong dữ liệu thử nghiệm và đường dẫn ảnh plan (:34, :69-75) |
| Tệp test (R1) | 6 | study-pack.test.ts:78 (#533); study-pack-assign.test.ts:412 (#554); study-pack-migration.test.ts:61, :305 (#533), :283 (#554); class-study-pack-section.test.tsx:261 (#554); kernel.test.ts:6712 (#572) |

Số #533 (bộ đề tự học) và #554 (bảo toàn mã mục / chống song song) là hai kế
hoạch được code tự nhận diện; #574 và #366 chỉ dính ở comment trần kỹ thuật D1.
Không có tệp phạm vi nào trỏ plan qua số ngoài danh sách này. ✅ apps/server/src/lib/study-pack-clone.ts:30-35, packages/db/src/schema/study-pack.ts:14, apps/server/src/routes/study-pack.test.ts:78

### 0.1 Bảng tài nguyên S (tóm tắt — bảng đầy đủ 37 id ở reverse-sources.md)

| S-id | Path | Vai trò |
|---|---|---|
| S1 | apps/server/src/routes/study-pack.ts | 8 route bộ đề/gán lớp + cổng vai trò + JSON guard |
| S2 | apps/server/src/lib/study-pack-clone.ts | kiểm nguồn mục + vật hoá đề + view pack |
| S3 | apps/server/src/lib/study-pack-assign.ts | gán lớp: lịch + bài giao + mục tiêu + huỷ + bù |
| S4 | packages/db/src/schema/study-pack.ts | 4 bảng: bài tập / bộ đề / mục bộ / lượt gán |
| S5 | packages/db/src/migrations/0060_study_pack.sql | sinh 4 bảng + library_ref + dọn #526 |
| S7 | packages/api/src/contracts.ts (đoạn 4456-4801) | hợp đồng Zod + view DTO bộ đề |
| S8 | apps/web/src/routes/_auth/assignments/packs.tsx | màn kho bộ đề của giáo viên |
| S9 | apps/web/src/components/classes/class-study-pack-section.tsx | màn gán + tiến độ trên trang lớp |
| S11 | apps/e2e/specs/study-pack.spec.ts | e2e trọn tuyến tạo→gán→mở bài→học viên muộn |
| S12 | apps/server/src/routes/study-pack.test.ts | 4 test API (R1) |

### 0.2 Liên kết

- Nguồn chi tiết: [reverse-sources.md](reverse-sources.md)
- Khoảng trống & câu hỏi mở: [reverse-gaps.md](reverse-gaps.md)
- Bằng chứng thô: [_evidence.md](_evidence.md)
- Luồng: [srs/study-pack-reverse-flows.md](srs/study-pack-reverse-flows.md)
- Máy trạng thái: [srs/study-pack-reverse-states.md](srs/study-pack-reverse-states.md)
- Mô hình dữ liệu: [srs/study-pack-reverse-erd.md](srs/study-pack-reverse-erd.md)
- Use cases: [usecases/study-pack-reverse-usecase-index.md](usecases/study-pack-reverse-usecase-index.md)

### 0.3 Tài liệu nghiệp vụ hiện có

- Cây `docs/` không có tài liệu feature cho phạm vi này (chỉ corpus reverse của
  các feature khác). ✅ (find docs -iname "*study-pack*" -not -path "*_reverse*" → rỗng)
- Kế hoạch gốc #533 NẰM TRONG repo: `plans/261101-1357-533-study-pack-scheduled-release/`
  gồm `plan.md` (115 dòng, S32), 5 tệp phase (S33-S37) và `screenshots/` khớp đường
  dẫn ảnh e2e. ✅ apps/e2e/specs/study-pack.spec.ts:34; ✅ plans/261101-1357-533-study-pack-scheduled-release/plan.md:29 (trần giới hạn), :27 (bỏ thông báo chủ động), :42 (non-goal V1), :63 (bỏ qua ngày nghỉ), :89-90 (RT-4/RT-5)
- Kế hoạch là tài liệu thi công, không phải đặc tả sản phẩm: ghi cách làm và một
  số quyết định, nhưng không giải thích hết lý do nghiệp vụ — các vì sao còn mở
  liệt kê ở Mục 12. Có một chỗ kế hoạch lệch code (hằng số chunk nhân bản đề:
  kế hoạch 4 — code 3), ghi ở reverse-gaps.md §GAP.

## Mục 1 — Phạm vi

- Khối A — kho bộ đề của giáo viên: xem danh sách theo hai phạm vi (của trung
  tâm / thư viện hệ thống), xem chi tiết từng mục theo ngày, tạo/sửa/xoá bộ đề
  từ ngân hàng đề của trung tâm, nhân bản bản sao từ bộ hệ thống. ✅ apps/server/src/routes/study-pack.ts:75-376
- Khối B — gán bộ đề vào lớp: chọn bộ sẵn sàng, ngày bắt đầu, giờ mở/giờ hạn;
  hệ thống vật hoá từng mục thành đề của trung tâm, tính lịch ngày bỏ qua ngày
  nghỉ lớp, sinh bài giao + mục tiêu cho học viên đang học; gán lặp an toàn. ✅ apps/server/src/routes/study-pack.ts:397-422, apps/server/src/lib/study-pack-assign.ts:194-510
- Khối C — mở bài thời điểm đọc + bù bài muộn: học viên chỉ thấy bài khi tới giờ
  mở (kiểm lúc đọc, không có bộ định giờ); học viên kích hoạt vào lớp muộn được
  bù mục tiêu cho bài còn hạn. ✅ apps/server/src/lib/assignment-visibility.ts:1-16, apps/server/src/lib/study-pack-assign.ts:573-623
- Khối D — theo dõi tiến độ: trang lớp liệt kê từng bài theo ngày với trạng thái
  mở/chưa mở, số đã nộp / tổng, số nộp trễ; huỷ bộ đề với luật dọn dữ liệu. ✅ apps/server/src/lib/study-pack-assign.ts:628-908, apps/web/src/components/classes/class-study-pack-section.tsx:287-377
- Ngoài phạm vi (chỉ nhắc khi liên quan): soạn bộ đề hệ thống và kho bài tập
  thư viện (admin-library); màn học viên làm bài/nộp bài (student-quiz); kho đề
  gốc (assignments); ngày nghỉ lớp (feature holidays — chỉ dùng đọc); thông báo
  cho học viên khi mở bài (không tồn tại trong feature này — Mục 12 Negative).

## Mục 2 — Actor

- **Giáo viên / chủ trung tâm / quản trị trung tâm**: thao tác toàn bộ kho bộ đề
  và gán lớp. Đọc danh sách/chi tiết được mở cho nhóm vai rộng (gồm trợ giảng);
  mọi thao tác ghi yêu cầu nhóm vai hẹp hơn (không gồm trợ giảng). ✅ apps/server/src/routes/study-pack.ts:78, apps/server/src/routes/study-pack.ts:123, packages/auth/src/role.ts:105-142; test ma trận apps/server/src/routes/study-pack.test.ts:280-379
- **Trợ giảng**: chỉ xem được danh sách/chi tiết và tiến độ; bị chặn 403 trên mọi
  thao tác ghi. ✅ packages/auth/src/role.ts:110-117, apps/server/src/routes/study-pack.ts:42-44
- **Học viên**: không thao tác gì trên bộ đề; chỉ tiêu thụ bài giao đã vật hoá,
  hiện dần theo giờ mở bài. 🔵 (không route học viên nào đọc bảng bộ đề — Negative
  searches NS5; cổng đọc bài của học viên lọc qua bộ lọc thời điểm mở) apps/server/src/routes/student.ts:1354-1383, apps/server/src/lib/assignment-visibility.ts:4-16
- **Admin nội dung (console quản trị)**: soạn bộ đề hệ thống + kho bài tập thư
  viện — đầu vào của khối A phía hệ thống; đặc tả ở admin-library, giao điểm chỉ
  là bản sao nhân bản xuống trung tâm. ✅ apps/server/src/routes/admin-library.ts:1214-1241 (chỉ trỏ)

## Mục 3 — Yêu cầu chức năng (FR)

| FR | Yêu cầu | Điều kiện / Giới hạn | Truy vết |
|---|---|---|---|
| FR-01 | Mọi route của feature yêu cầu phiên đăng nhập; thiếu phiên bị chặn 401 với mã "unauthorized" trước khi tới nghiệp vụ. | Áp cho cả đọc lẫn ghi, 8/8 route. | ✅ apps/server/src/routes/study-pack.ts:38-40, apps/server/src/routes/study-pack.ts:77, apps/server/src/routes/study-pack.ts:102, apps/server/src/routes/study-pack.ts:122, apps/server/src/routes/study-pack.ts:165, apps/server/src/routes/study-pack.ts:235, apps/server/src/routes/study-pack.ts:271, apps/server/src/routes/study-pack.ts:380, apps/server/src/routes/study-pack.ts:399, apps/server/src/routes/study-pack.ts:426 |
| FR-02 | Đọc (danh sách, chi tiết, xem lớp) yêu cầu nhóm vai "rà chấm" gồm giáo viên/chủ/quản trị/giáo viên đứng lớp/trợ giảng; không đủ → 403 "forbidden". | Vai rỗng/lạ rơi khỏi danh sách → bị chặn. | ✅ apps/server/src/routes/study-pack.ts:42-44, apps/server/src/routes/study-pack.ts:78, apps/server/src/routes/study-pack.ts:103, apps/server/src/routes/study-pack.ts:381, packages/auth/src/role.ts:110-117, packages/auth/src/role.ts:140-142; test apps/server/src/routes/study-pack.test.ts:280-379 |
| FR-03 | Ghi (tạo/sửa/xoá/nhân bản/gán/huỷ) yêu cầu nhóm vai "chốt bài" hẹp hơn — không gồm trợ giảng. | Hai nhóm vai là allowlist nghiêm ngặt, mặc định chặn. | ✅ packages/auth/src/role.ts:105-110, packages/auth/src/role.ts:123-138, apps/server/src/routes/study-pack.ts:123, apps/server/src/routes/study-pack.ts:166, apps/server/src/routes/study-pack.ts:236, apps/server/src/routes/study-pack.ts:272, apps/server/src/routes/study-pack.ts:400, apps/server/src/routes/study-pack.ts:428 |
| FR-04 | Thân yêu cầu phải JSON: sai kiểu nội dung → 415 "content-type must be application/json"; JSON hỏng → 400 "invalid json"; sai hình/trường lạ → 400 "invalid body" (lý do chi tiết của hợp đồng không rời server). | Mọi route ghi qua một cửa đọc thân duy nhất. | ✅ apps/server/src/routes/study-pack.ts:46-73; hợp đồng .strict() packages/api/src/contracts.ts:4493, packages/api/src/contracts.ts:4506, packages/api/src/contracts.ts:4706 |
| FR-05 | Danh sách bộ đề trả gộp bộ của trung tâm và toàn bộ bộ hệ thống đã sẵn sàng, sắp mới cập nhật trước; kèm đếm ngày, đếm mục, phạm vi, trạng thái, mã nguồn nhân bản. | Bộ hệ thống chưa sẵn sàng không lộ cho giáo viên. | ✅ apps/server/src/routes/study-pack.ts:75-98 (phạm vi 84-89, thứ tự 90-94), apps/server/src/lib/study-pack-clone.ts:812-833 (scope 823, trạng thái 826), apps/server/src/lib/study-pack-clone.ts:835-862 |
| FR-06 | Chi tiết bộ đề chỉ mở cho bộ cùng trung tâm hoặc bộ hệ thống đã sẵn sàng; còn lại → 404 "study pack not found". Kèm toàn bộ mục theo ngày + vị trí + ghi chú và metadata nguồn. | Mục nguồn đã biến mất vẫn hiển thị, dữ liệu rỗng thay vì lỗi. | ✅ apps/server/src/routes/study-pack.ts:100-118, apps/server/src/lib/study-pack-clone.ts:864-900 (dự phòng 888-892), apps/server/src/lib/study-pack-clone.ts:211-237 |
| FR-07 | Tạo bộ đề của trung tâm: nhập tiêu đề, mô tả, trạng thái, danh sách mục; kiểm toàn bộ nguồn trước khi ghi; ghi bộ + mục trong một lô; trả 201 kèm chi tiết. | Mã bộ sinh ngẫu nhiên; luôn thuộc trung tâm của phiên. | ✅ apps/server/src/routes/study-pack.ts:120-161 (kiểm 129-132, lô 136-150, 201 160) |
| FR-08 | Loại nguồn của mục chỉ nhận 3 giá trị hợp đồng: đề trung tâm, part đề thư viện, bài tập thư viện; giá trị khác → 422 "invalid sourceKind". | Chặn trước khi truy DB. | ✅ apps/server/src/lib/study-pack-clone.ts:364-375, packages/api/src/contracts.ts:4466-4471 |
| FR-09 | Bộ hệ thống không được tham chiếu đề của trung tâm → 422 "system pack cannot reference org_prompt". | Chỉ có ý nghĩa khi soạn phía console (org rỗng); giáo viên không tạo được bộ hệ thống. | ✅ apps/server/src/lib/study-pack-clone.ts:376-382; test apps/server/src/lib/study-pack-clone.test.ts:230-289 |
| FR-10 | Mỗi nguồn phải đạt đủ ba lớp điều kiện: tồn tại trong phạm vi đúng (404 riêng từng loại), đang sẵn sàng (422), kỹ năng nằm trong danh sách hỗ trợ; riêng đề trung tâm kèm Writing bị chặn riêng. | Part đề nghe từ thư viện bị chặn bằng thông điệp riêng ("yet"). | ✅ apps/server/src/lib/study-pack-clone.ts:444-483, apps/server/src/lib/study-pack-clone.ts:521-561, apps/server/src/lib/study-pack-clone.ts:594-626 |
| FR-11 | Trần bộ đề: ngày trong khoảng 1-366, tối đa 10 mục mỗi ngày, tối đa 200 mục mỗi bộ, không trùng mục trong cùng ngày; bộ "ready" cần ít nhất 1 mục. | Kiểm ở hợp đồng trước khi tới route; UI kiểm trước bằng thông điệp tiếng Việt riêng. | ✅ packages/api/src/contracts.ts:4480-4484, packages/api/src/contracts.ts:4486-4493, packages/api/src/contracts.ts:4507-4537; test apps/server/src/study-pack-migration.test.ts:306-388; UI apps/web/src/routes/_auth/assignments/packs.tsx:229-263 |
| FR-12 | Sửa bộ đề của trung tâm: chỉ sửa được bộ cùng trung tâm; thay trọn danh sách mục; mục giữ nguyên (cùng ngày + loại nguồn + mã nguồn) GIỮ mã cũ, mục mới nhận mã mới. | Ghi bằng lô: cập nhật bộ + xoá hết mục + chèn lại với mã giữ. | ✅ apps/server/src/routes/study-pack.ts:163-231 (map tuple 186-200, lô 202-220), apps/server/src/lib/study-pack-clone.ts:902-940; test apps/server/src/routes/study-pack.test.ts:714-926 |
| FR-13 | Xoá bộ đề của trung tâm bị chặn 409 "study pack is referenced by class assignments" khi còn bất kỳ lượt gán lớp nào (kể cả lượt đã huỷ); xoá được thì dọn bộ + mục trong một lô. | Đếm lượt gán không lọc trạng thái. | ✅ apps/server/src/routes/study-pack.ts:248-267; test apps/server/src/routes/study-pack.test.ts:635-656 |
| FR-14 | Nhân bản bộ hệ thống về trung tâm: chỉ nhận bộ hệ thống đang sẵn sàng; mỗi trung tâm giữ một bản sao mỗi bộ (lần gọi sau trả lại chính bản sao đó, mã 201); chèn song song thắng thua bằng khoá duy nhất rồi đọc lại. | Bản sao giữ nguyên tiêu đề/mô tả/trạng thái và toàn bộ mục (loại nguồn + mã nguồn + ghi chú). | ✅ apps/server/src/routes/study-pack.ts:269-376 (bản sao có sẵn 290-302, chống đua 348-365); test apps/server/src/routes/study-pack.test.ts:280-379, apps/server/src/routes/study-pack.test.ts:657-713 |
| FR-15 | Gán bộ đề cho lớp: chọn bộ đang sẵn sàng (của trung tâm hoặc hệ thống), ngày bắt đầu dạng ISO hợp lệ, giờ mở mặc định "06:00", giờ hạn mặc định "17:00", giờ hạn phải sau giờ mở. | UI chỉ cho chọn bộ sẵn sàng và mở hộp thoại với giá trị mặc định hôm nay. | ✅ packages/api/src/contracts.ts:4689-4716, apps/server/src/routes/study-pack.ts:397-422, apps/web/src/components/classes/class-study-pack-section.tsx:154-161, apps/web/src/components/classes/class-study-pack-section.tsx:385-430 |
| FR-16 | Gán lặp cùng bộ trên lớp đang chạy: cùng lịch (ngày + giờ mở + giờ hạn) → không tạo gì mới, trả lại danh sách hiện có với mã 200; khác lịch → 409 "study pack already active on class". | Mặc định chỉ một lượt đang chạy mỗi cặp lớp-bộ. | ✅ apps/server/src/lib/study-pack-assign.ts:221-254, packages/db/src/schema/study-pack.ts:142-144; test apps/server/src/lib/study-pack-assign.test.ts:287-411 |
| FR-17 | Khi gán: bộ phải đang sẵn sàng và có ít nhất một mục; từng mục thư viện được vật hoá thành đề ready của trung tâm kèm mã tham chiếu thư viện, chèn trùng được bỏ qua rồi đọc lại theo mã tham chiếu (gọi nhiều lần không nhân bản đề). | Đề trung tâm (nguồn org_prompt) dùng thẳng mã cũ, không vật hoá lại. | ✅ apps/server/src/lib/study-pack-assign.ts:292-313, apps/server/src/lib/study-pack-clone.ts:636-810 (chèn 756-759, đọc lại 761-782); test apps/server/src/lib/study-pack-clone.test.ts:290-358 |
| FR-18 | Lịch theo ngày: ngày thứ n của bộ rơi vào ngày liên tiếp tính từ ngày bắt đầu, tự nhảy qua mọi ngày nghỉ đã khai của lớp; mỗi ngày bị nhảy kèm tên ngày nghỉ để hiển thị. | Bộ luật lịch là hàm thuần, dùng lại cho xem trước phía màn hình. | ✅ apps/server/src/lib/study-pack-assign.ts:47-79, apps/server/src/lib/study-pack-assign.ts:366-377, apps/web/src/components/classes/class-study-pack-section.tsx:41-72; test apps/server/src/lib/study-pack-assign.test.ts:270-286, apps/web/src/components/classes/class-study-pack-section.test.tsx:134-147 |
| FR-19 | Mỗi mục bộ đề trở thành một bài giao của lớp: mã bài ghép từ mã lượt gán + mã mục; ngày hạn là ngày lịch của ngày đó; giờ mở/giờ hạn quy về thời điểm tuyệt đối theo múi giờ Việt Nam; ghi chú mục đi kèm bài. | Bài giao gắn mã lượt gán để truy ngược bộ. | ✅ apps/server/src/lib/study-pack-assign.ts:81-96, apps/server/src/lib/study-pack-assign.ts:379-417 (lịch 390-392), packages/api/src/vietnam-date.ts:99 |
| FR-20 | Mọi học viên đang học của lớp nhận một mục tiêu cho mỗi bài giao; mã mục tiêu ghép từ mã bài + mã học viên; chèn trùng bị bỏ qua; với lượt gán dùng lại, chỉ bổ sung mục tiêu cho bài chưa qua hạn. | Học viên tính từ danh sách đăng ký đang học của lớp (không trùng). | ✅ apps/server/src/lib/study-pack-assign.ts:271-283, apps/server/src/lib/study-pack-assign.ts:408-417, apps/server/src/lib/study-pack-assign.ts:421-437, apps/server/src/lib/study-pack-assign.ts:98-103, apps/server/src/lib/study-pack-assign.ts:450-455 |
| FR-21 | Huỷ bộ đề trên lớp: chuyển lượt gán thành đã huỷ kèm thời điểm huỷ (giữ thời điểm cũ nếu huỷ lại); xoá mọi bài CHƯA tới giờ mở và chưa ai làm (kèm mục tiêu); giữ nguyên bài đã mở hoặc đã có lượt làm. | Điều kiện xoá kiểm cả bài giao lẫn mục tiêu theo mốc thời điểm. | ✅ apps/server/src/lib/study-pack-assign.ts:140-192, apps/server/src/lib/study-pack-assign.ts:521-566 |
| FR-22 | Gán chạy đua với huỷ: nếu lượt gán bị huỷ giữa chừng, hệ thống dọn sạch dữ liệu vừa tạo theo mốc huỷ (không giữ lại nửa bài) và trả 409 "study pack was cancelled". | Kiểm ngay sau khi chèn và cả khi chèn lỗi; mốc dọn là thời điểm huỷ nếu có. | ✅ apps/server/src/lib/study-pack-assign.ts:457-503; test apps/server/src/lib/study-pack-assign.test.ts:412-618 |
| FR-23 | Học viên chỉ thấy bài khi đã tới giờ mở (bài giao tay không khai giờ mở thì thấy ngay) — kiểm tra tại thời điểm đọc, gồm cả cổng đọc đề để làm bài; đọc thẳng trước giờ → 404. | Không có bộ định giờ hay hàng đợi nào đổi trạng thái bài. | ✅ apps/server/src/lib/assignment-visibility.ts:4-16, apps/server/src/routes/student.ts:1375-1383; e2e apps/e2e/specs/study-pack.spec.ts:259-264, apps/e2e/specs/study-pack.spec.ts:296-314 |
| FR-24 | Học viên kích hoạt vào lớp muộn được bù mục tiêu cho mọi bài của bộ đang chạy còn hạn (hạn > bây giờ); bài giao thông thường không thuộc phạm vi bù. | Bù chạy ở ba đường kích hoạt đăng ký (đã active, vừa flip, đường đua). | ✅ apps/server/src/lib/study-pack-assign.ts:573-623, apps/server/src/routes/enrollment-activation.ts:697, apps/server/src/routes/enrollment-activation.ts:748, apps/server/src/routes/enrollment-activation.ts:769; test apps/server/src/kernel.test.ts:6712-6737; e2e apps/e2e/specs/study-pack.spec.ts:316-333 |
| FR-25 | Trang lớp hiển thị từng bài theo ngày học với: trạng thái đã mở/chưa đến giờ, số đã nộp / tổng mục tiêu, số nộp trễ; sắp theo ngày rồi vị trí trong ngày; ngày không còn bài hiển thị dòng rỗng riêng. | Ngày học suy từ mã mục; thiếu dữ kiện thì suy ngược từ lịch dự phòng. | ✅ apps/server/src/lib/study-pack-assign.ts:808-901 (trạng thái 833, đếm 835-854, sắp 876-881), apps/web/src/components/classes/class-study-pack-section.tsx:321-375 |
| FR-26 | Số "đã nộp" ưu tiên thời điểm nộp thật từ lượt làm bài; thời điểm ghi trên mục tiêu chỉ là dự phòng khi không có lượt làm. | Nộp trễ so với thời điểm hạn tuyệt đối của bài. | 🔵 apps/server/src/lib/study-pack-assign.ts:756-773, apps/server/src/lib/study-pack-assign.ts:788-798; e2e khẳng định 1/2 sau khi một học viên nộp apps/e2e/specs/study-pack.spec.ts:327-333 |

## Mục 4 — Yêu cầu phi chức năng (NFR)

| NFR | Yêu cầu | Truy vết |
|---|---|---|
| NFR-01 | Hợp đồng yêu cầu khép (.strict()): trường lạ bị từ chối thay vì bỏ qua; route gộp mọi lỗi hợp đồng về một mã 400. | ✅ packages/api/src/contracts.ts:4493, packages/api/src/contracts.ts:4506, packages/api/src/contracts.ts:4706, apps/server/src/routes/study-pack.ts:68-71 |
| NFR-02 | Mọi truy vấn/chèn theo mảng chia lô theo trần 100 tham số của D1: in-array 50, chèn mục bộ 10, chèn đề vật hoá 3, chèn bài giao 8, chèn mục tiêu 15, tối đa 50 câu lệnh mỗi lần gọi lô; hằng số có test chốt. | ✅ apps/server/src/lib/study-pack-clone.ts:30-35, apps/server/src/lib/study-pack-assign.ts:31-36, apps/server/src/lib/study-pack-assign.ts:105-115; test apps/server/src/lib/study-pack-clone.test.ts:221-229 |
| NFR-03 | Ghi nhiều bảng chạy trong một lô (bộ + mục; lượt gán + bài + mục tiêu; huỷ + dọn) thay vì từng câu rời. | ✅ apps/server/src/routes/study-pack.ts:136-150, apps/server/src/routes/study-pack.ts:202-220, apps/server/src/routes/study-pack.ts:260-265, apps/server/src/lib/study-pack-assign.ts:564, apps/server/src/lib/study-pack-assign.ts:439-455 |
| NFR-04 | Idempotency dựa trên khoá duy trì trong DB + chèn-bỏ-qua-xung-đột + đọc lại, không dựa khoá ứng dụng. | ✅ packages/db/src/schema/study-pack.ts:71-74, packages/db/src/schema/study-pack.ts:95-100, packages/db/src/schema/study-pack.ts:142-144, apps/server/src/lib/study-pack-clone.ts:756-759, apps/server/src/lib/study-pack-assign.ts:316-331 |
| NFR-05 | Bộ luật lịch là một hàm thuần dùng chung: server tính bài giao, màn hình tính xem trước — cùng đầu vào cho cùng kết quả (kèm giới hạn an toàn phía màn). | ✅ apps/server/src/lib/study-pack-assign.ts:43-79, apps/web/src/components/classes/class-study-pack-section.tsx:41-72; test apps/server/src/lib/study-pack-assign.test.ts:270-286, apps/web/src/components/classes/class-study-pack-section.test.tsx:134-147 |
| NFR-06 | Giờ mở/giờ hạn quy về thời điểm tuyệt đối theo múi giờ Việt Nam (UTC+7) qua bộ chuyển đổi dùng chung; ngày làm việc theo lịch Việt Nam. | ✅ apps/server/src/lib/study-pack-assign.ts:391-392, packages/api/src/vietnam-date.ts:27-46, packages/api/src/vietnam-date.ts:99 |
| NFR-07 | Mã lỗi là chuỗi hợp đồng trả thẳng trong JSON; wording tiếng Việt ghim trong component phía web; repo không có catalogue i18n. | ✅ apps/server/src/routes/study-pack.ts:38-44, apps/web/src/lib/repos/study-pack.ts:27-39; Negative searches NS2 (reverse-gaps.md) |
| NFR-08 | Màn hình bộ đề dùng được ở ba khổ (1440/768/375) không tràn ngang — e2e kiểm bằng đo scrollWidth kèm ảnh lưu theo plan. | ✅ apps/e2e/specs/study-pack.spec.ts:14-40, apps/e2e/specs/study-pack.spec.ts:187, apps/e2e/specs/study-pack.spec.ts:209 |

## Mục 5 — Quy tắc nghiệp vụ (BR)

- **BR-01.** Bộ đề hệ thống là tài sản dùng chung ngoài mọi trung tâm; nhân bản
  về trung tâm thì bản sao thuộc trung tâm và mỗi trung tâm có tối đa một bản sao
  mỗi bộ hệ thống. ✅
  packages/db/src/schema/study-pack.ts:53-55, packages/db/src/schema/study-pack.ts:71-74, apps/server/src/routes/study-pack.ts:84-89, apps/server/src/routes/study-pack.ts:290-302
- **BR-02.** Nội dung chưa sẵn sàng không bao giờ vào lộ trình học: bộ phải
  "ready" khi gán, và từng nguồn bên trong phải "ready". ✅
  apps/server/src/lib/study-pack-assign.ts:292-294, apps/server/src/lib/study-pack-clone.ts:453-459, apps/server/src/lib/study-pack-clone.ts:544-550, apps/server/src/lib/study-pack-clone.ts:603-609
- **BR-03.** Bộ đề hỗ trợ 4 kỹ năng (đọc/nghe/ngữ pháp/từ vựng) cho đề của trung
  tâm; part của đề thư viện chỉ nhận kỹ năng đọc — part nghe thư viện bị chặn
  bằng thông điệp riêng ("yet"); kỹ năng ngoài danh sách bị chặn. ✅
  packages/api/src/contracts.ts:4458-4463, apps/server/src/lib/study-pack-clone.ts:460-466, apps/server/src/lib/study-pack-clone.ts:530-543 (lộ trình nghe 🟡 OQ-05)
- **BR-04.** Đề trung tâm kèm phần Writing không được đưa vào bộ đề (bộ đề chỉ
  chứa bài tự chấm một phần); màn soạn lọc sẵn các đề này khỏi danh sách chọn. ✅
  apps/server/src/lib/study-pack-clone.ts:467-473, apps/web/src/routes/_auth/assignments/packs.tsx:91-100
- **BR-05.** Lộ trình theo ngày liên tiếp từ ngày bắt đầu, tự bỏ qua ngày nghỉ
  đã khai của lớp; ngày nghỉ là dữ liệu của tổ chức gắn phạm vi lớp (feature
  khác), bộ đề chỉ tiêu thụ. ✅
  apps/server/src/lib/study-pack-assign.ts:47-79, apps/server/src/lib/study-pack-assign.ts:366-377, apps/server/src/routes/holidays.ts:166-171 (sở hữu ngày nghỉ 🟡 OQ-06)
- **BR-06.** Khung giờ trong ngày (giờ mở/giờ hạn) áp đều cho mọi ngày của bộ;
  giờ hạn phải sau giờ mở; cùng quy về múi giờ Việt Nam. ✅
  packages/api/src/contracts.ts:4703-4714, apps/server/src/lib/study-pack-assign.ts:390-392 (múi giờ 🟡 OQ-07)
- **BR-07.** Một bộ chỉ chạy với một lịch trên một lớp: đang chạy thì gán lại
  đúng lịch là không-op, gán lịch khác bị chặn; sau khi huỷ được gán lại tự do
  (kể cả lịch mới). ✅
  packages/db/src/schema/study-pack.ts:109-114, packages/db/src/schema/study-pack.ts:142-144, apps/server/src/lib/study-pack-assign.ts:221-254
- **BR-08.** Huỷ không xoá dấu vết đã phát sinh cho học viên: bài đã mở hoặc đã
  có lượt làm được giữ nguyên; chỉ bài chưa mở và chưa ai làm bị dọn. ✅
  apps/server/src/lib/study-pack-assign.ts:140-192, apps/server/src/lib/study-pack-assign.ts:516-520 (chính sách huỷ 🟡 OQ-08)
- **BR-09.** Dữ liệu đang được dùng thì không xoá: bộ đề còn lượt gán lớp (kể cả
  lượt đã huỷ) không xoá được — cùng luật cho kho của giáo viên và kho hệ thống. ✅
  apps/server/src/routes/study-pack.ts:248-258, apps/server/src/routes/admin-library.ts:1223-1233
- **BR-10.** Sửa bộ đề không đứt tiến độ: mã mục giữ theo khóa ngày+nguồn; mã
  bài giao suy ra từ mã mục nên giữ nguyên qua các lượt gán lại; học viên đang
  làm không mất bài. ✅
  apps/server/src/lib/study-pack-clone.ts:902-940, apps/server/src/lib/study-pack-assign.ts:81-96; test apps/server/src/routes/study-pack.test.ts:714-926
- **BR-11.** Học viên không bao giờ đọc bảng bộ đề: mọi nội dung đến học viên qua
  bài giao đã vật hoá của lớp; cổng đọc của học viên chỉ chạm bảng bài giao. 🔵
  apps/server/src/routes/student.ts:1354-1383; Negative searches NS5 (reverse-gaps.md)
- **BR-12.** Mở bài là đặc tính thời điểm đọc của hệ thống: không có bộ định giờ,
  hàng đợi hay tác vụ nền nào đổi trạng thái bài; hai nơi ghi thời điểm mở là
  lượt gán và công cụ e2e. 🔵
  apps/server/src/lib/assignment-visibility.ts:4-7, apps/e2e/src/boot.ts:216-220; Negative searches NS1/NS2 (reverse-gaps.md)

## Mục 6 — Ma trận lỗi

Mã lỗi giữ nguyên giá trị hợp đồng (chuỗi trả thẳng trong JSON). Wording UI trích
nguyên văn từ component. "Thô" = chuỗi máy chưa qua wording.

| Mã / tình huống | HTTP | Điều kiện | Wording / hiển thị | Truy vết |
|---|---|---|---|---|
| E-01 — chưa đăng nhập | 401 | Thiếu phiên trên mọi route | "unauthorized" (thô) | ✅ apps/server/src/routes/study-pack.ts:38-40 |
| E-02 — thiếu vai trò đọc | 403 | Phiên không thuộc nhóm vai rà chấm | "forbidden" (thô) | ✅ apps/server/src/routes/study-pack.ts:42-44, apps/server/src/routes/study-pack.ts:78, apps/server/src/routes/study-pack.ts:103, apps/server/src/routes/study-pack.ts:381 |
| E-03 — thiếu vai trò ghi | 403 | Phiên không thuộc nhóm vai chốt bài (trợ giảng bị chặn ở đây) | "forbidden" (thô) | ✅ apps/server/src/routes/study-pack.ts:123, apps/server/src/routes/study-pack.ts:428, packages/auth/src/role.ts:105-110 |
| E-04 — sai kiểu nội dung | 415 | Ghi với Content-Type khác JSON | "content-type must be application/json" (thô) | ✅ apps/server/src/routes/study-pack.ts:52-61 |
| E-05 — JSON hỏng | 400 | Thân không parse được | "invalid json" (thô) | ✅ apps/server/src/routes/study-pack.ts:62-67 |
| E-06 — thân sai hình | 400 | Không qua hợp đồng (trường lạ, trần vượt, thiếu trường) | "invalid body" (thô, gộp mọi lý do) | ✅ apps/server/src/routes/study-pack.ts:68-71 |
| E-07 — bộ đề không thấy | 404 | ID lạ, bộ của trung tâm khác, hoặc bộ hệ thống chưa sẵn sàng | "study pack not found" (thô) | ✅ apps/server/src/routes/study-pack.ts:108-114, apps/server/src/routes/study-pack.ts:177-179, apps/server/src/routes/study-pack.ts:244-247, apps/server/src/routes/study-pack.ts:286-288, apps/server/src/lib/study-pack-assign.ts:213-219 |
| E-08 — lớp không thấy | 404 | ID lớp lạ hoặc lớp khác trung tâm | "class not found" (thô) | ✅ apps/server/src/routes/study-pack.ts:385-391, apps/server/src/routes/study-pack.ts:430-437, apps/server/src/lib/study-pack-assign.ts:201-207 |
| E-09 — bộ đang được gán | 409 | Xoá bộ khi còn lượt gán lớp (kể cả đã huỷ) | "study pack is referenced by class assignments" (thô); UI: "Không thể xoá bộ đề đã gán cho lớp học." | ✅ apps/server/src/routes/study-pack.ts:248-258, apps/web/src/routes/_auth/assignments/packs.tsx:216-222; test apps/server/src/routes/study-pack.test.ts:635-656 |
| E-10 — loại nguồn lạ | 422 | sourceKind ngoài 3 giá trị hợp đồng | "invalid sourceKind" (thô) | ✅ apps/server/src/lib/study-pack-clone.ts:364-375 |
| E-11 — bộ hệ thống trỏ đề trung tâm | 422 | org rỗng nhưng mục là đề trung tâm | "system pack cannot reference org_prompt" (thô) | ✅ apps/server/src/lib/study-pack-clone.ts:376-382 |
| E-12 — đề trung tâm không thấy | 404 | Mã đề không thuộc trung tâm | "org_prompt not found" (thô) | ✅ apps/server/src/lib/study-pack-clone.ts:444-452 |
| E-13 — đề trung tâm chưa sẵn sàng | 422 | Đề đang nháp | "org_prompt must be ready" (thô) | ✅ apps/server/src/lib/study-pack-clone.ts:453-459 |
| E-14 — kỹ năng không hỗ trợ | 422 | Kỹ năng đề/bài ngoài 4 kỹ năng bộ đề | "skill <kỹ-năng> is not supported in study packs" (thô) | ✅ apps/server/src/lib/study-pack-clone.ts:460-466, apps/server/src/lib/study-pack-clone.ts:610-616 |
| E-15 — đề kèm Writing | 422 | Đề trung tâm có phần Writing đính kèm | "hybrid prompt cannot be used in study packs" (thô) | ✅ apps/server/src/lib/study-pack-clone.ts:467-473 |
| E-16 — part thư viện không thấy | 404 | Mã part lạ | "library_test_part not found" (thô) | ✅ apps/server/src/lib/study-pack-clone.ts:521-529 |
| E-17 — part nghe thư viện | 422 | Part thuộc đề nghe | "listening library parts are not supported in study packs yet" (thô) | ✅ apps/server/src/lib/study-pack-clone.ts:530-536 |
| E-18 — part kỹ năng lạ | 422 | Part không thuộc đề đọc | "skill <kỹ-năng> is not supported for library_test_part" (thô) | ✅ apps/server/src/lib/study-pack-clone.ts:537-543 |
| E-19 — part thuộc đề nháp | 422 | Đề cha chưa sẵn sàng | "library_test_part must belong to a ready test" (thô) | ✅ apps/server/src/lib/study-pack-clone.ts:544-550 |
| E-20 — bài tập không thấy | 404 | Mã bài tập thư viện lạ | "library_exercise not found" (thô) | ✅ apps/server/src/lib/study-pack-clone.ts:594-602 |
| E-21 — bài tập chưa sẵn sàng | 422 | Bài tập thư viện đang nháp | "library_exercise must be ready" (thô) | ✅ apps/server/src/lib/study-pack-clone.ts:603-609 |
| E-22 — vật hoá hụt | 422 | Sau chèn, đọc lại không thấy đề tương ứng mục | "failed to materialize study pack prompt" (thô) | ✅ apps/server/src/lib/study-pack-clone.ts:787-797 |
| E-23 — trùng lượt chạy khác lịch | 409 | Gán bộ đang chạy với lịch khác | "study pack already active on class" (thô); UI: "Bộ đề này đang chạy trên lớp với lịch khác." | ✅ apps/server/src/lib/study-pack-assign.ts:245-251, apps/server/src/lib/study-pack-assign.ts:357-361, apps/web/src/components/classes/class-study-pack-section.tsx:205-206 |
| E-24 — bộ chưa sẵn sàng khi gán | 422 | Gán bộ đang nháp | "study pack is not ready" (thô) | ✅ apps/server/src/lib/study-pack-assign.ts:292-294 |
| E-25 — bộ rỗng khi gán | 422 | Bộ sẵn sàng nhưng không còn mục nào | "study pack has no items" (thô) | ✅ apps/server/src/lib/study-pack-assign.ts:306-308 |
| E-26 — vật hoá hụt khi gán | 422 | Mục không có đề/ký mã tương ứng sau vật hoá | "missing materialized prompt for study pack item" (thô) | ✅ apps/server/src/lib/study-pack-assign.ts:383-389 |
| E-27 — bộ vừa bị huỷ | 409 | Lượt gán đụng huỷ giữa chừng; cũng trả khi gán lại trên lượt đã huỷ qua đường đua | "study pack was cancelled" (thô); UI: "Bộ đề này vừa bị huỷ. Vui lòng kiểm tra lại danh sách." | ✅ apps/server/src/lib/study-pack-assign.ts:485-489, apps/web/src/components/classes/class-study-pack-section.tsx:197-204; test apps/server/src/lib/study-pack-assign.test.ts:412-618 |
| E-28 — lượt huỷ không thấy | 404 | Huỷ mã lượt gán lạ / khác lớp | "class study pack not found" (thô) | ✅ apps/server/src/lib/study-pack-assign.ts:528-540 |
| E-29 — tạo hụt | 500 | Chèn xong đọc lại không thấy bộ | "study pack creation failed" (thô) | ✅ apps/server/src/routes/study-pack.ts:156-158 |
| E-30 — nhân bản hụt | 500 | Chèn xong đọc lại không thấy bản sao | "study pack clone failed" (thô) | ✅ apps/server/src/routes/study-pack.ts:367-373 |
| E-31 — học viên đọc trước giờ | 404 | Cổng đề/làm bài kiểm thời điểm mở | "assignment not found" (thô) | ✅ apps/server/src/routes/student.ts:1375-1383; e2e apps/e2e/specs/study-pack.spec.ts:259-264 |
| E-32 — UI soạn bộ đề | (chặn trước) | Kiểm tại chỗ, không gửi request | "Vui lòng nhập tiêu đề bộ đề." / "Bộ đề Sẵn sàng cần có ít nhất 1 bài tập." / "Vui lòng chọn một bài tập sẵn sàng." / "Ngày học phải từ 1 đến 366." / "Bộ đề tối đa 200 bài tập." / "Mỗi ngày tối đa 10 bài tập (Ngày N)." / "Bài tập này đã có trong ngày đã chọn." / "Không tìm thấy bài tập đã chọn." | ✅ apps/web/src/routes/_auth/assignments/packs.tsx:229-263, apps/web/src/routes/_auth/assignments/packs.tsx:288-295 |
| E-33 — UI gán bộ đề | (chặn trước) | Kiểm tại chỗ trong hộp thoại gán | "Vui lòng chọn một bộ đề sẵn sàng." / "Ngày bắt đầu không hợp lệ." / "Giờ hạn nộp phải sau giờ mở bài." | ✅ apps/web/src/components/classes/class-study-pack-section.tsx:166-177 |
| E-34 — UI lỗi chung | (toast) | Mọi lỗi mạng/server khi lưu/xem/nhân bản/gán/huỷ | "Không lưu được bộ đề. Vui lòng kiểm tra lại dữ liệu." / "Không tải được danh sách bộ đề. Vui lòng thử lại." / "Không tải được chi tiết bộ đề." / "Không tải được chi tiết bộ đề hệ thống." / "Không thể nhân bản bộ đề. Vui lòng thử lại." / "Không thể gán bộ đề." / "Không thể huỷ bộ đề. Vui lòng thử lại." / "Không tải được dữ liệu bộ đề của lớp. Vui lòng thử lại." | ✅ apps/web/src/routes/_auth/assignments/packs.tsx:108-109, apps/web/src/routes/_auth/assignments/packs.tsx:177, apps/web/src/routes/_auth/assignments/packs.tsx:190, apps/web/src/routes/_auth/assignments/packs.tsx:203-204, apps/web/src/routes/_auth/assignments/packs.tsx:319-321, apps/web/src/components/classes/class-study-pack-section.tsx:123-124, apps/web/src/components/classes/class-study-pack-section.tsx:207-210, apps/web/src/components/classes/class-study-pack-section.tsx:223-224 |

## Mục 7 — Thước đo thành công

- Một giáo viên đi trọn tuyến: tạo 2 đề (ngữ pháp + đọc) → lập bộ 2 ngày → gán
  cho lớp → học viên thấy đúng bài ngày 1 (không thấy ngày 2) → nộp bài ngày 1 →
  mở bài ngày 2 → học viên muộn vào lớp nhận bài còn hạn. ✅
  apps/e2e/specs/study-pack.spec.ts:62-334 (một test e2e duy nhất đi hết tuyến)
- Bài mở đúng giờ mà không cần bộ định giờ: dịch thời điểm mở trong dữ liệu là
  đủ, cổng đọc phản ứng ngay lập tức. ✅
  apps/e2e/specs/study-pack.spec.ts:296-314 (bình luận "without any cron tick")
- Sửa bộ đề đã gán không làm rơi bài học viên đang làm; gán lại không nhân đôi
  bài. ✅ apps/server/src/routes/study-pack.test.ts:714-926
- Không phát sinh thông báo/EMAIL nào cho học viên khi mở bài — trải nghiệm "học
  viên chủ động vào xem" là chủ đích hay thiếu sót chưa làm? (không gắn nhãn xác
  minh) 🟡 (OQ-09)
- Hai học viên cùng lớp thấy cùng số bài và không cản trở nhau khi giáo viên sửa
  bộ giữa chừng. 🟡 (kỳ vọng suy từ BR-10; không thấy tài liệu nêu chỉ số — OQ-10)

## Mục 8 — Thực thể nghiệp vụ

- **Bài tập thư viện** (study_pack_exercise): kho bài lẻ 3 kỹ năng với trạng
  thái riêng — đầu vào của bộ đề hệ thống; giáo viên không soạn trực tiếp. ✅
  packages/db/src/schema/study-pack.ts:17-43 (trạng thái :31)
- **Bộ đề tự học** (study_pack): tiêu đề + mô tả + trạng thái nháp/sẵn sàng +
  mã nguồn nhân bản; bộ hệ thống có tổ chức rỗng, bản sao trung tâm có tổ chức. ✅
  packages/db/src/schema/study-pack.ts:49-76
- **Mục bộ đề** (study_pack_item): ngày + vị trí + loại nguồn + mã nguồn + ghi
  chú; khoá duy nhất theo bộ+ngày+loại nguồn+mã nguồn chống trùng mục trong ngày. ✅
  packages/db/src/schema/study-pack.ts:81-107
- **Lượt gán bộ đề vào lớp** (class_study_pack): chụp tiêu đề + ngày bắt đầu +
  khung giờ + trạng thái đang chạy/đã huỷ + thời điểm huỷ; khoá riêng cho lượt
  đang chạy cho phép gán lại sau huỷ. ✅
  packages/db/src/schema/study-pack.ts:115-146
- **Đề đã vật hoá** (assignment_prompt, feature assignments): mục nguồn thư viện
  được chụp thành đề của trung tâm với mã tham chiếu thư viện, khoá duy nhất
  theo tổ chức+mã tham chiếu; đề trung tâm dùng thẳng không chụp lại. ✅
  packages/db/src/migrations/0060_study_pack.sql:7-8, apps/server/src/lib/study-pack-clone.ts:632-640, apps/server/src/lib/study-pack-clone.ts:688-751
- **Bài giao + mục tiêu** (class_assignment + class_assignment_target, feature
  assignments): đầu ra gán bộ đề — thêm hai cột thời điểm mở và mã lượt gán bộ
  đề để lộ trình học gắn vào máy giao bài sẵn có. ✅
  packages/db/src/migrations/0060_study_pack.sql:4-6, packages/db/src/schema/class-assignment.ts:38-47, apps/server/src/lib/study-pack-assign.ts:395-417

## Mục 9 — Luồng (danh mục)

Đặc tả đủ (sequence + activity) ở srs/study-pack-reverse-flows.md.

| F-id | Luồng | Một dòng |
|---|---|---|
| F1 | Xem danh sách bộ đề | Hai phạm vi (của tôi / hệ thống) + thẻ đếm ngày/mục |
| F2 | Tạo / sửa bộ đề của trung tâm | Chọn đề sẵn sàng theo ngày, chặn trần + trùng |
| F3 | Nhân bản bộ hệ thống | Idempotent, chống đua bằng khoá duy nhất |
| F4 | Gán bộ đề cho lớp | Vật hoá + lịch ngày + bài giao + mục tiêu + chống đua |
| F5 | Học viên nhận bài theo giờ mở | Cổng thời điểm đọc, không bộ định giờ |
| F6 | Huỷ bộ đề trên lớp | Dọn bài chưa mở chưa ai làm, giữ phần đã phát sinh |
| F7 | Học viên muộn vào lớp | Bù mục tiêu cho bài còn hạn của bộ đang chạy |
| F8 | Xem tiến độ nộp | Bảng bài theo ngày: đã mở/chưa, nộp/tổng, nộp trễ |
| F9 | Xoá bộ đề của trung tâm | Chặn 409 khi còn lượt gán |

## Mục 10 — Màn hình

- `/assignments/packs` ("Bộ đề tự học" trong mục Bài tập): thẻ chuyển phạm vi
  "Bộ đề của tôi"/"Thư viện hệ thống", thẻ bộ đề (nhãn Sẵn sàng/Nháp, "N ngày ·
  M bài tập"), hành động theo phạm vi (Sửa/Xoá vs Xem chi tiết/Nhân bản về trung
  tâm), hộp thoại tạo/sửa (tiêu đề, mô tả, trạng thái, thêm bài theo ngày kèm
  ghi chú, danh sách bài đã chọn), hộp thoại xem chi tiết bộ hệ thống. ✅
  apps/web/src/routes/_auth/assignments/packs.tsx:38-40, apps/web/src/routes/_auth/assignments/packs.tsx:337-347, apps/web/src/routes/_auth/assignments/packs.tsx:349-389, apps/web/src/routes/_auth/assignments/packs.tsx:505-730
- `/assignments`: nút dẫn "Bộ đề tự học" sang trang kho bộ đề. ✅
  apps/web/src/routes/_auth/assignments/index.tsx:276-287
- Trang lớp, tab "Buổi học & luyện tập" → chuyển chế độ "Bộ đề tự học": danh sách
  bộ đang chạy (nhãn Đang chạy/Đã huỷ, ngày bắt đầu + khung giờ), bảng bài theo
  ngày (Ngày — ngày, bài, kỹ năng, trạng thái mở, tiến độ nộp), nút "Gán bộ đề"
  mở hộp thoại (chọn bộ sẵn sàng, ngày bắt đầu, giờ mở/giờ hạn, xem trước lịch
  bỏ qua ngày nghỉ), nút "Huỷ bộ đề" trên bộ đang chạy. ✅
  apps/web/src/routes/_auth/classes/$classId.tsx:312, apps/web/src/routes/_auth/classes/$classId.tsx:340-366, apps/web/src/components/classes/class-study-pack-section.tsx:230-319, apps/web/src/components/classes/class-study-pack-section.tsx:379-478
- Cổng học viên (cross-ref): dòng bài "Làm bài: <tên đề>" chỉ xuất hiện khi tới
  giờ mở; trước giờ cả tên đề cũng không hiện. ✅
  apps/student/src/components/overview/assignment-row.tsx:67-71, apps/e2e/specs/study-pack.spec.ts:254-257

## Mục 11 — Ràng buộc màn hình

- Không tràn ngang ở ba khổ chuẩn review (1440/768/375); e2e đo scrollWidth ở từng
  khổ và chụp ảnh theo plan khi bật cờ. ✅
  apps/e2e/specs/study-pack.spec.ts:14-40, apps/e2e/specs/study-pack.spec.ts:187, apps/e2e/specs/study-pack.spec.ts:209
- Bộ chuyển phạm vi dùng fieldset + aria-label "Phạm vi bộ đề" với nút aria-pressed; số đếm bộ đề là vùng aria-live "polite". ✅
  apps/web/src/routes/_auth/assignments/packs.tsx:349-388
- Lỗi form hiển thị bằng vùng role="alert"; nút xoá mục kèm aria-label riêng nêu
  tên đề + ngày; danh sách mục trong hộp thoại cuộn trong khung cao giới hạn. ✅
  apps/web/src/routes/_auth/assignments/packs.tsx:615-646, apps/web/src/routes/_auth/assignments/packs.tsx:639, apps/web/src/routes/_auth/assignments/packs.tsx:650-654
- Xem trước lịch gán hiển thị "Xem trước lịch mở bài (N ngày học)", dòng ngày nghỉ
  bị bỏ qua kèm tên, mỗi dòng "Ngày n → ngày (giờ mở – giờ hạn)"; cuộn trong khung. ✅
  apps/web/src/components/classes/class-study-pack-section.tsx:432-454
- Nhãn trạng thái giữ nguyên vựng hợp đồng qua lớp wording: ready→"Sẵn sàng",
  draft→"Nháp", active→"Đang chạy", cancelled→"Đã huỷ", mở bài "Đã mở"/"Chưa đến
  giờ". ✅
  apps/web/src/routes/_auth/assignments/packs.tsx:438-443, apps/web/src/components/classes/class-study-pack-section.tsx:297-302, apps/web/src/components/classes/class-study-pack-section.tsx:352-359

## Mục 12 — Câu hỏi mở (OQ)

| OQ | Câu hỏi | Liên quan |
|---|---|---|
| OQ-01 | Vì sao cổng quyền bộ đề tái dùng hai nhóm vai của khối chấm bài thay vì nhóm quyền học liệu riêng đã tồn tại? | Mục 2, FR-02/FR-03 |
| OQ-02 | Trạng thái nháp của bộ đề có kịch bản dùng thật không, khi màn soạn mặc định "Sẵn sàng"? | BR-02, SM-01 |
| OQ-03 | Căn cứ các trần 366 ngày / 10 mục ngày / 200 mục / ghi chú 2000 ký tự? | FR-11 |
| OQ-04 | Vì sao màn soạn của giáo viên chỉ cho chọn đề trung tâm, dù hợp đồng nhận cả hai nguồn thư viện? | F2, FR-08 |
| OQ-05 | Lộ trình hỗ trợ part nghe thư viện (thông điệp "yet")? | BR-03, E-17 |
| OQ-06 | Ai sở hữu và duy trì ngày nghỉ lớp dùng cho lịch bộ đề? | BR-05 |
| OQ-07 | Múi giờ Việt Nam cố định có nằm trong tầm nhìn đa khu vực? | NFR-06, BR-06 |
| OQ-08 | Huỷ bộ đề có cần tuỳ chọn "dọn cả bài đã mở" hoặc thông báo học viên? | BR-08, FR-21 |
| OQ-09 | Kế hoạch đã chủ động bỏ thông báo khi mở bài (plan.md:27) — V2 có cần kênh thông báo cho học viên? | Mục 7, F5 |
| OQ-10 | Kỳ vọng khi giáo viên sửa bộ giữa chừng: học viên đang làm giữ nguyên tới đâu? | BR-10, Mục 7 |
| OQ-11 | Nhân bản trùng trả 201 như bản mới — người tiêu dùng có cần phân biệt "vừa tạo" với "đã có sẵn"? | FR-14, F3 |
