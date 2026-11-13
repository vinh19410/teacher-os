---
feature: admin-library
type: reverse-srs
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
confidence_summary: "spec: ✅ 120 / 🔵 5 / 🟡 4; tổng toàn assembly: ✅ 200 / 🔵 8 / 🟡 23"


---

# admin-library — Đặc tả đảo ngược (reverse-SRS) — draft

Feature "admin-library" trong tài liệu này = bàn làm việc phía console quản trị cho ba
khối dữ liệu dùng chung toàn hệ thống: (A) thư viện đề IELTS Reading/Listening (soạn
đề, part, nhóm câu, audio, xuất bản); (B) bài tập thư viện lẻ (reading/grammar/
vocabulary); (C) bộ đề tự học hệ thống (ghép bài theo ngày từ nguồn đã xuất bản) cùng
khâu sao chép xuống lớp. Người dùng cuối là admin soạn nội dung; học viên chỉ tiêu thụ
bản sao đã vật hóa ở các feature khác (student-quiz, student-practice, study-pack).

> Quy ước nhãn — mỗi mệnh đề mang nhãn riêng: ✅ = khẳng định bởi code/test, có cite `path:line`; 🔵 = suy luận từ ≥2 bằng chứng code; 🟡 = phỏng đoán nghiệp vụ/why, bắt buộc kèm OQ tương ứng (Mục 12). Tên endpoint/hàm/bảng chỉ xuất hiện ở cột Truy vết và các file nguồn/evidence, không nằm trong mệnh đề FR/BR.

## Mục 0 — Nguồn soạn thảo (draft provenance)

- Soạn từ mã nguồn develop @ d6c0f6b5, đọc tĩnh, không chạy test; không chỉnh sửa bất
  kỳ tệp nào của repo (kể cả docs/_reverse).
- Phạm vi gồm BA khối cùng feature: (A) thư viện đề IELTS #413 (phase 2-7: CRUD đề +
  part, nhóm câu #425, luật sẵn sàng #426, xem trước #433, audio thay-theo-CAS #305);
  (B) bài tập thư viện lẻ; (C) bộ đề tự học hệ thống #533 với luật bảo toàn mã mục
  #554 và khâu sao chép xuống lớp.
- Đặc biệt: tệp kiểm thử audio đang BỊ SỬA CHƯA COMMIT trong working tree (so với
  HEAD chỉ khác cỡ audio dữ liệu nền 4 → 16 ở 2 chỗ) — dùng bản working tree làm
  bằng chứng và ghi rõ ở _evidence.md §Working-tree; ý nghĩa thay đổi là câu hỏi mở
  OQ-13. 🟡
- complexity_flag: state-machine (đề draft↔ready, bài tập draft↔ready, nhóm câu
  lành↔hỏng); media/async (upload audio CAS + dọn object nền); multi-role (cổng
  admin khép kín).

### 0.1 Bảng tài nguyên S (đầy đủ ở reverse-sources.md)

| S-id | Path | Range | Vai trò |
|---|---|---|---|
| S1 | apps/server/src/routes/admin-library.ts | 1-1198 | 19 route thư viện + cổng admin + CSRF riêng |
| S2 | packages/api/src/library-contracts.ts | 1-548 | hợp đồng Zod đề/part + luật sẵn sàng |
| S3 | packages/db/src/schema/library-test.ts | 1-103 | 2 bảng đề + part |
| S4 | packages/db/src/schema/study-pack.ts | 1-146 | 4 bảng bài tập/bộ đề/gán lớp |
| S33 | apps/server/src/routes/admin-library.test.ts | 1-1656 | 29 test API (R1) |
| S34 | apps/server/src/routes/admin-library-audio.test.ts | 1-647 | 15 test audio (R1; working tree) |
| S35/S36 | apps/e2e/specs/admin-library-listening.spec.ts, admin-library-reading.spec.ts | 1-326, 1-824 | e2e soạn + xuất bản |

### 0.2 Liên kết

- Nguồn chi tiết: [reverse-sources.md](reverse-sources.md)
- Khoảng trống & câu hỏi mở: [reverse-gaps.md](reverse-gaps.md)
- Bằng chứng thô: [_evidence.md](_evidence.md)
- Luồng: [srs/admin-library-reverse-flows.md](srs/admin-library-reverse-flows.md)
- Máy trạng thái: [srs/admin-library-reverse-states.md](srs/admin-library-reverse-states.md)
- Mô hình dữ liệu: [srs/admin-library-reverse-erd.md](srs/admin-library-reverse-erd.md)
- Use cases: [usecases/admin-library-reverse-usecase-index.md](usecases/admin-library-reverse-usecase-index.md)

### 0.3 Tài liệu nghiệp vụ hiện có

- Không có tài liệu feature nào trong repo cho phạm vi này. ✅ (kiểm cây docs/)
- Mã nguồn dẫn chiếu plan theo số trong comment (chỉ các số có thật trong tệp):
  #413 (thư viện đề), #425 (nhóm câu hỏng — admin-library.ts:632-634,
  library-contracts.ts:64-65), #426 (luật nhóm/đáp án — library-contracts.ts:203),
  #533 (bài tập + bộ đề hệ thống — admin-library.ts:897, schema/study-pack.ts:14),
  #305 (hợp đồng thay audio của phần nói — admin-library.ts:75). #424, #433, #554
  không xuất hiện trong comment các tệp phạm vi — coi là định kế hoạch ngoài code,
  cần xác minh nguồn riêng (không gắn nhãn xác minh). ✅ apps/server/src/routes/admin-library.ts:66-79, apps/server/src/routes/admin-library.ts:632-634, packages/api/src/library-contracts.ts:64-65, packages/api/src/library-contracts.ts:203

## Mục 1 — Phạm vi

- Khối A — thư viện đề IELTS: danh sách + lọc + tìm đề; tạo đề nháp với khung part
  theo mẫu kỹ năng; sửa metadata đề; soạn nội dung từng part (đoạn văn/phiên âm bản,
  câu hỏi, nhóm câu, ngân hàng đáp án, ghim ảnh); phát hiện + xử lý nhóm câu hỏng;
  upload/thay/nghe/xóa audio part nghe; xuất bản/hạ ngược; xóa đề/part. ✅ apps/server/src/routes/admin-library.ts:404-895
- Khối B — bài tập thư viện lẻ: danh sách + lọc; tạo/sửa bài tập reading/grammar/
  vocabulary với trạng thái nháp/sẵn sàng; xóa có kiểm tra tham chiếu. ✅ apps/server/src/routes/admin-library.ts:898-1037
- Khối C — bộ đề tự học hệ thống: danh sách/chi tiết/tạo/sửa bộ ghép bài theo ngày
  từ part đề đọc + bài tập đã xuất bản; bảo toàn mã mục khi cập nhật; xóa có kiểm
  tra tham chiếu lớp; khâu giao lớp là sao chép nội dung (xem trước ở feature
  study-pack). ✅ apps/server/src/routes/admin-library.ts:1039-1195, apps/server/src/lib/study-pack-clone.ts:354-940
- Ngoài phạm vi (chỉ nhắc khi liên quan): màn học viên làm đề/bài (student-quiz,
  student-practice); giao bài của giáo viên (study-pack phía teacher); upload tài
  liệu dạy kèm (#676 — feature material); sinh mã nguồn đề từ file gốc; phân quyền
  chi tiết trong console (chỉ có cổng admin duy nhất).

## Mục 2 — Actor

- **Quản trị nội dung (admin)**: duy nhất một actor thao tác. Mọi route yêu cầu phiên
  đăng nhập với vai trò admin, email đã xác thực và email nằm trong danh sách admin
  cho phép; thiếu điều kiện nào cũng bị chặn trước khi tới nghiệp vụ. ✅ apps/server/src/lib/require-admin.ts:28-49; test ma trận vai trò apps/server/src/routes/admin-library.test.ts:130-164, apps/server/src/routes/admin-library-audio.test.ts:242-264
- **Quản trị hệ thống (vận hành)**: không hiện diện trên màn hình nhưng quyết định
  cấu hình — danh sách email admin và danh sách origin console; danh sách origin
  rỗng thì mọi thao tác ghi bị chặn hẳn (khép kín). ✅ apps/server/src/routes/admin-library.ts:87-89 (comment deps), apps/server/src/routes/admin-library.ts:383-388
- **Học viên**: không thao tác; chỉ dùng bản sao nội dung đã vật hóa sang bảng bài
  tập của lớp/kho luyện — không đọc thẳng bảng đề thư viện. 🔵 (không app học viên
  nào đọc bảng đề trực tiếp — _evidence.md §Negative searches; catalogue luyện đề
  đọc từ bảng vật hóa) apps/server/src/routes/student-practice.ts:44-90,
  packages/db/src/migrations/0060_study_pack.sql:7-8
- **Kho đối tượng (media store)**: bị động, có thể vắng mặt — vắng mặt thì mọi thao
  tác audio trả 503 với mã riêng, phần còn lại hoạt động bình thường. ✅ apps/server/src/routes/admin-library.ts:104-106, apps/server/src/routes/admin-library.ts:725, apps/server/src/routes/admin-library.ts:836, apps/server/src/routes/admin-library.ts:856

## Mục 3 — Yêu cầu chức năng (FR)

| FR | Yêu cầu | Điều kiện / Giới hạn | Truy vết |
|---|---|---|---|
| FR-01 | Cổng vào: mọi thao tác yêu cầu phiên đăng nhập với vai trò admin, email đã xác thực và email nằm trong danh sách admin cho phép. | So khớp email không phân biệt hoa/thường; bị gỡ khỏi danh sách là mất quyền ngay, không đợi phiên hết hạn. | ✅ apps/server/src/lib/require-admin.ts:11-14, apps/server/src/lib/require-admin.ts:28-49; test apps/server/src/routes/admin-library.test.ts:130-164, apps/server/src/routes/admin-library-audio.test.ts:242-264 |
| FR-02 | Phiên không phải admin → từ chối 403 với mã NOT_ADMIN; chưa đăng nhập → 401. | Chặn trước mọi nghiệp vụ, áp cho cả đọc lẫn ghi. | ✅ apps/server/src/lib/require-admin.ts:39-47; test apps/server/src/routes/admin-library.test.ts:130-164 |
| FR-03 | Mọi thao tác ghi phải đến từ origin console trong danh sách cho phép; thiếu hoặc sai origin → 403. | Danh sách rỗng thì mọi ghi bị chặn hẳn (khép kín, không mở mặc định). | ✅ apps/server/src/routes/admin-library.ts:383-388, apps/server/src/routes/admin-library.ts:87-89; test apps/server/src/routes/admin-library.test.ts:166-189 |
| FR-04 | Route ghi nhận nội dung JSON; riêng upload audio nhận dữ liệu nhị phân thô và xóa không cần nội dung. | Sai kiểu nội dung cho ghi JSON → 415. | ✅ apps/server/src/routes/admin-library.ts:389-396, apps/server/src/routes/admin-library.ts:101-103 |
| FR-05 | Danh sách đề hiển thị mọi đề toàn hệ thống, mới cập nhật trước, kèm số part, số câu, bộ sưu tập/nhóm đề, trạng thái và cờ "đủ audio" của đề nghe. | Lọc theo kỹ năng và trạng thái; giá trị lạ → 400. Tìm theo từ khóa phủ tiêu đề/mô tả/bộ sưu tập/nhóm đề. | ✅ apps/server/src/routes/admin-library.ts:404-477 (lọc 405-419, tìm 420-429, thứ tự 432-434, đủ audio 455-465), packages/api/src/library-contracts.ts:519-537 |
| FR-06 | Tạo đề: nhập tiêu đề, mô tả, kỹ năng (đọc/nghe), thời lượng, bộ sưu tập, nhóm đề; hệ thống chỉ áp khung slot của kỹ năng (đọc 3, nghe 4) làm giới hạn soạn và gate xuất bản; không có dòng part nào được tạo lúc tạo đề — part vật hóa từng slot từ lần lưu đầu. | Thời lượng 60 giây đến 4 giờ, mặc định 1 giờ; khung: đọc 3 part, nghe 4 part; trần 200 ký tự tiêu đề. | ✅ apps/server/src/routes/admin-library.ts:480-502, apps/server/src/routes/admin-library.ts:297-299, packages/api/src/library-contracts.ts:74-88, packages/api/src/contracts.ts:410-447 |
| FR-07 | Đề mới luôn ở trạng thái nháp. | Không có đường tạo thẳng sang đã xuất bản. | ✅ apps/server/src/routes/admin-library.ts:498, packages/db/src/schema/library-test.ts:31 |
| FR-08 | Chi tiết đề trả metadata cùng toàn bộ part theo khung; mỗi part kèm nội dung soạn, câu hỏi, nhóm câu và cờ nhóm hỏng. | Part chưa được lưu (mặc định của mọi đề mới tạo, không riêng đề cũ) vẫn được trả với dữ liệu rỗng thay vì lỗi. | ✅ apps/server/src/routes/admin-library.ts:505-509, apps/server/src/routes/admin-library.ts:244-279, packages/api/src/library-contracts.ts:506-509 |
| FR-09 | Sửa metadata đề: tiêu đề, mô tả, thời lượng, bộ sưu tập, nhóm đề. | Đổi kỹ năng bị từ chối riêng với mã SKILL_IMMUTABLE dù payload có đủ mọi trường khác hợp lệ. | ✅ apps/server/src/routes/admin-library.ts:522-524, apps/server/src/routes/admin-library.ts:534-543, packages/api/src/library-contracts.ts:92-108 |
| FR-10 | Chuyển trạng thái chỉ nhận hai giá trị nháp/xuất bản; kèm các trường metadata khác trong cùng lượt cũng được. | Giá trị trạng thái khác → 400; trường lạ → 400 (hợp đồng khép). | ✅ apps/server/src/routes/admin-library.ts:525-533, apps/server/src/routes/admin-library.ts:534-543 |
| FR-11 | Xuất bản chỉ qua khi cấu trúc đề đạt luật sẵn sàng: đủ part theo khung, mỗi part có ít nhất một câu hỏi có đề bài, part đọc có đoạn văn, part nghe có audio, luật ảnh và ngân hàng đáp án đúng. | Chưa đạt → 400 NOT_READY kèm danh sách lý do xếp theo part. | ✅ packages/api/src/library-contracts.ts:263-438, packages/api/src/library-contracts.ts:458-476, apps/server/src/routes/admin-library.ts:574-576; UI apps/admin/src/components/library/publish-bar.tsx:42-58 |
| FR-12 | Xuất bản chặn khi có bất kỳ part nào nhóm câu hỏng → 409 GROUPS_CORRUPT, kể cả khi phần còn lại hợp lệ. | Phòng trường hợp nhóm hỏng được độn thành "nhóm ngầm" hợp lệ khiến luật sẵn sàng lọt. | ✅ apps/server/src/routes/admin-library.ts:562-569 |
| FR-13 | Hạ ngược từ xuất bản về nháp luôn được, không kèm điều kiện. | Sau khi hạ mới xóa part/audio được. | ✅ apps/server/src/routes/admin-library.ts:575-576, apps/admin/src/components/library/publish-bar.tsx:111-115 |
| FR-14 | Soạn nội dung part lưu theo từng slot; nội dung mới ghi đè trọn vẹn câu hỏi + nhóm câu + ngân hàng đáp án. | Slot phải thuộc khung của kỹ năng đề; sai slot → 404 PART_NOT_FOUND; phần thân khai slot khác đường dẫn → 400. | ✅ apps/server/src/routes/admin-library.ts:616-631, apps/server/src/routes/admin-library.ts:670-693 |
| FR-15 | Part của đề đang xuất bản vẫn sửa được nhưng nội dung mới phải vẫn đạt luật sẵn sàng. | Tên audio lấy từ bản ghi hiện có (payload không khai audio); vi phạm → 400 NOT_READY kèm lý do. | ✅ apps/server/src/routes/admin-library.ts:655-669 |
| FR-16 | Lưu part không bao giờ đụng các cột audio — audio chỉ thay qua đường upload riêng. | Client không tự khai khóa/tên audio. | ✅ apps/server/src/routes/admin-library.ts:670-686 (comment + bộ trường ghi), packages/api/src/library-contracts.ts:143-252 |
| FR-17 | Đọc dữ liệu part phân biệt nhóm câu RỖNG (hợp lệ) với nhóm câu HỎNG (JSON hỏng / không phải mảng / phần tử sai hình / vượt trần 20 nhóm). | Nhóm hỏng được gắn cờ + lý do, không bao giờ được sửa im lặng thành rỗng. | ✅ apps/server/src/routes/admin-library.ts:165-201, packages/api/src/library-contracts.ts:124 |
| FR-18 | Ghi đè lên nhóm hỏng bắt buộc kèm xác nhận tường minh "bỏ nhóm hỏng"; thiếu xác nhận → 409 GROUPS_CORRUPT dù payload mới có nội dung gì. | Chặn cả trường hợp UI sinh lại nhóm nhìn có vẻ hợp lệ từ dữ liệu ngầm. | ✅ apps/server/src/routes/admin-library.ts:643-646, apps/server/src/routes/admin-library.ts:632-641; test apps/server/src/routes/admin-library.test.ts:1075-1247 |
| FR-19 | Gửi xác nhận khi nhóm đã lành (snapshot stale) → 409 GROUPS_NOT_CORRUPT buộc tải lại trang, tránh xóa nhầm dữ liệu hợp lệ. | Cả hai hướng lệch đều được bắt. | ✅ apps/server/src/routes/admin-library.ts:638-641, packages/api/src/library-contracts.ts:167 |
| FR-20 | Xóa part của đề đang xuất bản → chặn 409 NOT_READY; phải hạ về nháp trước. | Đề nháp xóa part tự do. | ✅ apps/server/src/routes/admin-library.ts:702-705 |
| FR-21 | Xóa đề xóa cùng lúc toàn bộ part trong một lô; object audio dọn sau khi bản ghi đã biến mất, chạy nền. | Hỏng giữa chừng chỉ để object mồ côi (dọn tay) — không bao giờ để bản ghi trỏ object thiếu. | ✅ apps/server/src/routes/admin-library.ts:589-613 (comment 601-602) |
| FR-22 | Upload audio: chỉ cho đề nghe; part phải thuộc khung nghe; dung lượng đọc từ độ dài nội dung, phải dương và không quá 50 MB; kiểu nội dung phải trong danh sách cho phép; tên tệp bắt buộc. | Đề đọc yêu cầu upload → 400 INVALID_AUDIO (đọc không có audio); thiếu/sai tên → 400; quá trần → 413; kiểu lạ → 415. | ✅ apps/server/src/routes/admin-library.ts:723-766, packages/api/src/library-contracts.ts:35-53; test apps/server/src/routes/admin-library-audio.test.ts:326-451 |
| FR-23 | Thay audio theo so-sánh-và-đổi: ghi object mới trước, cập nhật bản ghi chỉ khi khóa cũ còn nguyên. | Người khác đã thay giữa chừng → 409 AUDIO_CHANGED, object mới bị dọn, không đụng object cũ. | ✅ apps/server/src/routes/admin-library.ts:769-810; test apps/server/src/routes/admin-library-audio.test.ts:452-486 |
| FR-24 | Lỗi ghi bản ghi sau khi object đã ghi lên kho → dọn object mới, GIỮ khóa cũ. | Bản ghi không bao giờ trỏ object chưa tồn tại. | ✅ apps/server/src/routes/admin-library.ts:811-817; test apps/server/src/routes/admin-library-audio.test.ts:429-451 |
| FR-25 | Thay thành công thì xóa object cũ ở nền; lỗi xóa chỉ để object mồ côi, phát audio vẫn đúng theo khóa mới. | Xóa cũ chạy sau khi bản ghi đã trỏ khóa mới. | ✅ apps/server/src/routes/admin-library.ts:818-822; test apps/server/src/routes/admin-library-audio.test.ts:593-628 |
| FR-26 | Nghe audio: phát trực tiếp từ kho với bộ header an toàn (chặn đoán kiểu nội dung, CSP sandbox, không lưu cache). | Chưa hỗ trợ Range — client phát toàn bộ; đề/part lạ hay object thiếu → 404. | ✅ apps/server/src/routes/admin-library.ts:832-851, apps/server/src/lib/media-response.ts:1-46 |
| FR-27 | Xóa audio gỡ thông tin audio khỏi part; part vốn không có audio vẫn coi như thành công. | Đề đang xuất bản chặn xóa audio → 409 NOT_READY; ai đã thay giữa chừng → 409 AUDIO_CHANGED (đọc lại bản ghi trước khi xóa khóa). | ✅ apps/server/src/routes/admin-library.ts:854-895 (đọc lại 884-892) |
| FR-28 | Kho audio chưa gắn cấu hình → mọi thao tác audio trả 503 với mã LIBRARY_AUDIO_DISABLED, phần còn lại của thư viện hoạt động bình thường. | Mã ngoài danh sách mã nghiệp vụ vì đây là lỗi cấu hình triển khai. | ✅ apps/server/src/routes/admin-library.ts:104-106, apps/server/src/routes/admin-library.ts:725, apps/server/src/routes/admin-library.ts:836, apps/server/src/routes/admin-library.ts:856; test apps/server/src/routes/admin-library-audio.test.ts:630-646 |
| FR-29 | Bài tập thư viện: xem danh sách (lọc kỹ năng + trạng thái), tạo, sửa, xóa bài tập lẻ reading/grammar/vocabulary cùng hình dạng nội dung part (đoạn văn, câu hỏi, ngân hàng đáp án). | Giá trị lọc lạ → 400; tạo ghi nhận người tạo; sắp mới cập nhật trước. | ✅ apps/server/src/routes/admin-library.ts:898-1037, packages/db/src/schema/study-pack.ts:17-43, packages/api/src/contracts.ts:4471-4476 |
| FR-30 | Bài tập có trạng thái nháp/sẵn sàng; hạ bài tập đã sẵn sàng về nháp bị chặn khi còn bộ đề nào tham chiếu → 409. | Xóa bài tập cũng chặn 409 khi còn bộ đề tham chiếu. | ✅ apps/server/src/routes/admin-library.ts:973-987, apps/server/src/routes/admin-library.ts:1022-1034 |
| FR-31 | Bộ đề hệ thống: xem danh sách/chi tiết, tạo, sửa bộ ghép bài theo ngày; bộ dùng chung toàn hệ thống (không thuộc tổ chức nào). | Mỗi mục trỏ về part đề đọc đã xuất bản hoặc bài tập đã sẵn sàng; nguồn khác/tệ → từ chối kèm lý do. | ✅ apps/server/src/routes/admin-library.ts:1039-1166, apps/server/src/lib/study-pack-clone.ts:524-556, apps/server/src/lib/study-pack-clone.ts:597-624, packages/api/src/contracts.ts:4464-4469 |
| FR-32 | Trần bộ đề: tối đa 366 ngày, 10 mục mỗi ngày, 200 mục mỗi bộ. | Vượt trần → từ chối với lý do rõ từng ngày. | ✅ packages/api/src/contracts.ts:4478-4480, packages/api/src/contracts.ts:4494-4536, apps/server/src/lib/study-pack-clone.ts:354-632 |
| FR-33 | Cập nhật bộ bảo toàn mã mục: mục còn giữ nguyên (ngày + nguồn + mã nguồn) GIỮ mã cũ, chỉ mục biến mất bị xóa và mục mới nhận mã mới. | Tránh đứt tiến độ học viên đang làm bộ; ghi theo lô (xóa hết + chèn lại với mã giữ). | ✅ apps/server/src/routes/admin-library.ts:1123-1157, apps/server/src/lib/study-pack-clone.ts:902-940; test apps/server/src/routes/admin-library.test.ts:1482-1656 |
| FR-34 | Xóa bộ đề chặn khi còn lớp đang gắn → 409; xóa được thì dọn kèm toàn bộ mục. | Chỉ xóa được bộ hệ thống (không thuộc tổ chức). | ✅ apps/server/src/routes/admin-library.ts:1177-1195 |
| FR-35 | Giao bộ cho lớp là SAO CHÉP nội dung: bản sao sở hữu bởi tổ chức lớp, mục tham chiếu thư viện được vật hóa thành nội dung lớp, giữ khóa mục để đo tiến độ. | Giao lại cùng bộ cho cùng lớp (đang hoạt động) bị chặn trùng. | 🔵 apps/server/src/lib/study-pack-clone.ts:354-632, apps/server/src/lib/study-pack-clone.ts:910-940, packages/db/src/migrations/0060_study_pack.sql:1-79, packages/api/src/contracts.ts:4687-4714 |
| FR-36 | Xem trước đề hiển thị đúng cấu trúc học viên sẽ gặp (nhóm câu, ngân hàng đáp án, ảnh) và dùng được cả khi đề còn nháp. | Xem trước gộp dữ liệu đã lưu và đang soạn. | ✅ apps/admin/src/components/library/test-preview-model.ts:1-139, apps/admin/src/routes/_auth/library/tests/$testId.tsx:763-776 |
| FR-37 | Trang soạn chặn rời trang khi còn thay đổi chưa lưu với hộp thoại xác nhận ghi rõ rủi ro mất thay đổi. | Áp cho cả nội dung part lẫn metadata header bẩn. | ✅ apps/admin/src/routes/_auth/library/tests/$testId.tsx:281-291 |
| FR-38 | Lưu theo tương tác: rời ô là lưu ngay trường đó (không cần nút lưu tổng); thành công hiện xác nhận theo tên part. | Lỗi hiện thông báo tiếng Việt theo mã; sai nhóm hỏng mở đúng luồng FR-18. | ✅ apps/admin/src/routes/_auth/library/tests/$testId.tsx:301-314, apps/admin/src/components/library/part-form.tsx:804-826, apps/admin/src/components/library/library-error.ts:11-27 |
| FR-39 | Upload audio từ client: chọn tệp → tải lên với thanh tiến trình và nút hủy giữa chừng; sai nhóm mã lỗi hiện đúng thông báo. | Dùng yêu cầu cấp thấp để bắt được tiến trình + hủy. | ✅ apps/admin/src/lib/repos/library.ts:221-292, apps/admin/src/components/library/audio-uploader.tsx:1-317 |
| FR-40 | Danh sách vấn đề sẵn sàng hiển thị tiếng Việt xếp theo part, tái dùng đúng luật của server (một nguồn sự thật). | Chặn trước phía client khi còn lý do — không cần chờ 400. | ✅ apps/admin/src/components/library/part-issues.ts:1-144, apps/admin/src/components/library/publish-bar.tsx:44-48 |

## Mục 4 — Yêu cầu phi chức năng (NFR)

| NFR | Yêu cầu | Truy vết |
|---|---|---|
| NFR-01 | Hợp đồng yêu cầu/phản hồi khép: trường lạ bị từ chối thay vì bỏ qua — client và server phải lên cùng phiên bản khi đổi hình dạng dữ liệu. | ✅ packages/api/src/library-contracts.ts:88, packages/api/src/library-contracts.ts:106-107, apps/server/src/routes/admin-library.ts:536-546 |
| NFR-02 | Phân tích thân JSON trả 400 phân biệt được JSON hỏng với sai hình; trần dung lượng nằm ở từng trường của hợp đồng (route không có trần thân yêu cầu). | ✅ apps/server/src/routes/admin-library.ts:119-133, packages/api/src/library-contracts.ts:74-88 |
| NFR-03 | Audio: trần 50 MB mỗi part (khớp trần media bài nói), danh sách kiểu nội dung đóng (MP3/M4A/WAV/AAC/OGG/WEBM). | ✅ packages/api/src/library-contracts.ts:35-53, apps/server/src/routes/admin-library.ts:746-752 |
| NFR-04 | Phát media kèm header an toàn: không đoán kiểu nội dung, CSP sandbox khép, không lưu cache; tên tệp trong header mã hóa an toàn. | ✅ apps/server/src/lib/media-response.ts:1-46 |
| NFR-05 | CSRF khép kín: origin thiếu/sai bị chặn; danh sách rỗng → chặn toàn bộ ghi (không có chế độ mở). | ✅ apps/server/src/routes/admin-library.ts:381-388 |
| NFR-06 | Truy vấn/chèn lô tách theo trần tham số bind của D1 (in-array 50, chèn item pack 10, chèn prompt 3) để không vỡ trần 100 tham số. | ✅ apps/server/src/lib/study-pack-clone.ts:31-35 |
| NFR-07 | Ghi nhiều bảng chạy trong một lô để không lọt trạng thái nửa vời ở cấp ứng dụng (D1 không có giao dịch bọc ngoài). | ✅ apps/server/src/routes/admin-library.ts:596-611, apps/server/src/routes/admin-library.ts:1147-1160 |
| NFR-08 | Mọi bước hỏng giữa chừng của audio phải tự dọn object mới; không bao giờ để bản ghi trỏ object thiếu — object mồ côi là trạng thái chấp nhận được và có log. | ✅ apps/server/src/routes/admin-library.ts:66-79, apps/server/src/routes/admin-library.ts:806-822 |
| NFR-09 | Việc chạy nền (dọn object) không chặn phản hồi và lỗi nền được ghi log thay vì mất im lặng. | ✅ apps/server/src/routes/admin-library.ts:603-611, apps/server/src/routes/admin-library.ts:820-825 |
| NFR-10 | Mã lỗi nghiệp vụ liệt kê đóng trong hợp đồng; mã ngoài nghiệp vụ (503 cấu hình, 409 CAS) đặt riêng để không phá hợp đồng cũ. | ✅ packages/api/src/library-contracts.ts:56-67, apps/server/src/routes/admin-library.ts:104-109 |
| NFR-11 | UI chặn sẵn điều kiện xuất bản phía client bằng cùng bộ luật server; lỗi server vẫn được bắt và hiển thị cùng kiểu. | ✅ apps/admin/src/components/library/publish-bar.tsx:13-19, apps/admin/src/components/library/part-issues.ts:1-144 |
| NFR-12 | Trạng thái nhóm hỏng phải log kèm lý do khi bị hủy bỏ tường minh để truy vết được dữ liệu cũ. | ✅ apps/server/src/routes/admin-library.ts:647-654 |

## Mục 5 — Quy tắc nghiệp vụ (BR)

- **BR-01.** Kỹ năng của đề không đổi được sau khi tạo — đề đọc mãi là đọc, đề nghe mãi là nghe; muốn loại khác thì tạo đề mới. ✅
  apps/server/src/routes/admin-library.ts:518-520; test apps/server/src/routes/admin-library.test.ts (SKILL_IMMUTABLE)
- **BR-02.** Mọi đề mới khởi đầu là bản nháp; chỉ xuất bản qua một cửa duy nhất có kiểm luật. ✅
  apps/server/src/routes/admin-library.ts:498, apps/server/src/routes/admin-library.ts:525-576
- **BR-03.** Cấu trúc part cố định theo mẫu kỹ năng: đọc 3 part, nghe 4 part; part ngoài mẫu không tồn tại (thêm/xóa ngoài mẫu → 404). ✅
  apps/server/src/routes/admin-library.ts:297-299, packages/api/src/contracts.ts:410-447
- **BR-04.** Điều kiện xuất bản từng part: đọc cần đoạn văn; nghe cần audio kèm tên; mọi part cần ít nhất một câu hỏi có đề bài; câu dùng ảnh cần ảnh HTTPS kèm ghim; ngân hàng đáp án phải đủ theo dạng bài. ✅
  packages/api/src/library-contracts.ts:263-438
- **BR-05.** Nhóm câu hỏng không bao giờ bị ghi đè im lặng — phải có xác nhận tường minh; ngược lại xác nhận khi dữ liệu đã lành cũng bị chặn để bắt client cũ. ✅
  apps/server/src/routes/admin-library.ts:632-655; test apps/server/src/routes/admin-library.test.ts:1075-1247
- **BR-06.** Đề có nhóm hỏng không được phát hành. ✅
  apps/server/src/routes/admin-library.ts:562-569
- **BR-07.** Thay audio theo so-sánh-và-đổi: người thay sau thắng, người thay trước nhận biết bị vượt qua bằng mã riêng và phải tải lại trang. ✅
  apps/server/src/routes/admin-library.ts:769-810; test apps/server/src/routes/admin-library-audio.test.ts:452-486
- **BR-08.** Không bao giờ để bản ghi trỏ đến object audio không tồn tại; thứ tự an toàn: ghi object mới → trỏ bản ghi → dọn object cũ; hỏng ở đâu lùi về đó và dọn phần mới. ✅
  apps/server/src/routes/admin-library.ts:66-79, apps/server/src/routes/admin-library.ts:806-822
- **BR-09.** Đang xuất bản thì không xóa part và không xóa audio; sửa nội dung part thì được nhưng phải vẫn đạt luật xuất bản. ✅
  apps/server/src/routes/admin-library.ts:656-670, apps/server/src/routes/admin-library.ts:702-705, apps/server/src/routes/admin-library.ts:860-861
- **BR-10.** Object mồ côi (hỏng khi dọn) là trạng thái chấp nhận được, ghi log để dọn tay — ưu tiên tính đúng đắn của bản ghi hơn là sạch kho. ✅
  apps/server/src/routes/admin-library.ts:601-602, apps/server/src/routes/admin-library.ts:818-822
- **BR-11.** Bài tập lẻ và part đề đọc đưa vào bộ đề phải đã sẵn sàng; bộ đề không nhét nội dung nháp. ✅
  apps/server/src/lib/study-pack-clone.ts:524-556, apps/server/src/lib/study-pack-clone.ts:597-624
- **BR-12.** Trần bộ đề: 366 ngày / 10 mục mỗi ngày / 200 mục mỗi bộ. ✅
  packages/api/src/contracts.ts:4478-4480
- **BR-13.** Sửa bộ đề bảo toàn mã mục theo khóa ngày+nguồn+mã nguồn — học viên đang làm không bị mất tiến độ. ✅
  apps/server/src/routes/admin-library.ts:1123-1157, apps/server/src/lib/study-pack-clone.ts:902-908
- **BR-14.** Dữ liệu đang được dùng thì không xóa: bài tập đang nằm trong bộ đề, bộ đề đang gắn với lớp đều bị chặn xóa/hạ ngược bằng 409. ✅
  apps/server/src/routes/admin-library.ts:973-987, apps/server/src/routes/admin-library.ts:1022-1034, apps/server/src/routes/admin-library.ts:1177-1187
- **BR-15.** Bộ đề hệ thống là tài sản dùng chung: chỉ tồn tại ngoài phạm vi tổ chức; bản sao theo lớp mới thuộc tổ chức. ✅
  apps/server/src/routes/admin-library.ts:1083 (orgId null), packages/db/src/schema/study-pack.ts:52-55
- **BR-16.** Giao lớp không dùng chung dữ liệu gốc — luôn vật hóa thành bản sao riêng của lớp để sửa lớp không đụng thư viện và ngược lại. 🔵
  apps/server/src/lib/study-pack-clone.ts:354-632, packages/db/src/migrations/0060_study_pack.sql:1-79
- **BR-17.** Đề nháp không bao giờ lộ cho học viên: phía học viên chỉ nhận đề đã xuất bản cùng tổ chức khi vật hóa sang bài giao/luyện. 🔵
  apps/server/src/routes/student-practice.ts:32-43, apps/server/src/routes/student-practice.ts:44-90, packages/db/src/schema/quiz-attempt.ts (bản chụp đề)

## Mục 6 — Ma trận lỗi

Mã lỗi giữ nguyên giá trị hợp đồng. Wording UI trích nguyên văn từ component.

| Mã / tình huống | HTTP | Điều kiện | Wording / hiển thị | Truy vết |
|---|---|---|---|---|
| E-01 — chưa đăng nhập | 401 | Thiếu phiên trên mọi route thư viện | "Phiên đăng nhập đã hết hạn." | ✅ apps/server/src/lib/require-admin.ts:28-34, apps/admin/src/components/library/library-error.ts:41 |
| E-02 — `NOT_ADMIN` | 403 | Phiên tồn tại nhưng không phải admin / email chưa xác thực / ngoài danh sách | "Bạn không có quyền thực hiện thao tác này." | ✅ apps/server/src/lib/require-admin.ts:35-47, apps/admin/src/components/library/library-error.ts:42; test apps/server/src/routes/admin-library.test.ts:130-164 |
| E-03 — origin lạ | 403 | Ghi với Origin thiếu/ngoài danh sách console | "origin not allowed" (thô) | ✅ apps/server/src/routes/admin-library.ts:383-388; test apps/server/src/routes/admin-library.test.ts:166-189 |
| E-04 — sai kiểu nội dung | 415 | Ghi JSON với kiểu nội dung khác | "content-type must be application/json" (thô) | ✅ apps/server/src/routes/admin-library.ts:397-401 |
| E-05 — thân không hợp lệ | 400 | JSON hỏng / sai hình / trường lạ / slot thân khác đường dẫn | (toast lỗi chung theo mã) | ✅ apps/server/src/routes/admin-library.ts:119-133, apps/server/src/routes/admin-library.ts:536-546, apps/server/src/routes/admin-library.ts:628-630 |
| E-06 — `TEST_NOT_FOUND` | 404 | Đề không tồn tại | "Bộ đề không tồn tại hoặc đã bị xóa." | ✅ apps/server/src/routes/admin-library.ts:507, apps/server/src/routes/admin-library.ts:543, apps/server/src/routes/admin-library.ts:592, apps/admin/src/components/library/library-error.ts:12 |
| E-07 — `PART_NOT_FOUND` | 404 | Slot ngoài khung kỹ năng / part vắng | "Part không tồn tại hoặc đã bị xóa." | ✅ apps/server/src/routes/admin-library.ts:625, apps/server/src/routes/admin-library.ts:709, apps/server/src/routes/admin-library.ts:735, apps/admin/src/components/library/library-error.ts:13 |
| E-08 — `NOT_READY` | 400 | Xuất bản/lưu part khi chưa đạt luật, kèm danh sách lý do | "Bộ đề chưa đủ điều kiện — xem danh sách lý do." + khối "Chưa xuất bản được — N lý do:" | ✅ apps/server/src/routes/admin-library.ts:570-573, apps/server/src/routes/admin-library.ts:664-669, apps/admin/src/components/library/library-error.ts:14, apps/admin/src/components/library/publish-bar.tsx:116-132 |
| E-09 — `NOT_READY` | 409 | Xóa part/audio của đề đang xuất bản | (theo mã) | ✅ apps/server/src/routes/admin-library.ts:703-705, apps/server/src/routes/admin-library.ts:860-861 |
| E-10 — `SKILL_IMMUTABLE` | 400 | Payload sửa metadata có kỹ năng | "Kỹ năng của đề không đổi được sau khi tạo." | ✅ apps/server/src/routes/admin-library.ts:522-524, apps/admin/src/components/library/library-error.ts:19; test apps/server/src/routes/admin-library.test.ts:191-225 |
| E-11 — `GROUPS_CORRUPT` | 409 | Ghi đè part có nhóm hỏng thiếu xác nhận | "Part này có nhóm câu hỏng trên server — bấm «Lưu đè nhóm hỏng» nếu muốn thay thế." | ✅ apps/server/src/routes/admin-library.ts:643-646, apps/admin/src/components/library/library-error.ts:24-25 |
| E-12 — `GROUPS_CORRUPT` | 409 | Xuất bản khi còn part nhóm hỏng | (theo mã E-08) | ✅ apps/server/src/routes/admin-library.ts:562-569 |
| E-13 — `GROUPS_NOT_CORRUPT` | 409 | Gửi xác nhận hủy nhóm khi dữ liệu đã lành | "Nhóm câu đã được phục hồi trên server — tải lại trang." | ✅ apps/server/src/routes/admin-library.ts:638-641, apps/admin/src/components/library/library-error.ts:26 |
| E-14 — `INVALID_AUDIO` | 400 | Đề đọc upload audio / thiếu độ dài / độ dài ≤ 0 / thiếu tên / thiếu thân / lệch byte sau ghi | "File audio không hợp lệ." | ✅ apps/server/src/routes/admin-library.ts:729-732, apps/server/src/routes/admin-library.ts:742-743, apps/server/src/routes/admin-library.ts:763-765, apps/server/src/routes/admin-library.ts:779-781, apps/admin/src/components/library/library-error.ts:15; test apps/server/src/routes/admin-library-audio.test.ts:326-428 |
| E-15 — `AUDIO_TOO_LARGE` | 413 | Quá 50 MB | "File audio vượt quá dung lượng cho phép (tối đa 50 MB)." | ✅ apps/server/src/routes/admin-library.ts:746-748, apps/admin/src/components/library/library-error.ts:16 |
| E-16 — `UNSUPPORTED_AUDIO_TYPE` | 415 | Kiểu nội dung ngoài danh sách | "Định dạng audio không hỗ trợ — dùng MP3, M4A, WAV, AAC, OGG hoặc WEBM." | ✅ apps/server/src/routes/admin-library.ts:749-752, apps/admin/src/components/library/library-error.ts:17-18 |
| E-17 — `AUDIO_CHANGED` | 409 | CAS thua khi upload (khóa cũ đã đổi) | "Audio vừa được người khác cập nhật — tải lại trang rồi thử lại." | ✅ apps/server/src/routes/admin-library.ts:808-811, apps/admin/src/components/library/library-error.ts:22-23; test apps/server/src/routes/admin-library-audio.test.ts:452-486 |
| E-18 — `AUDIO_CHANGED` | 409 | CAS thua khi xóa audio | (như E-17) | ✅ apps/server/src/routes/admin-library.ts:884-892 |
| E-19 — `LIBRARY_AUDIO_DISABLED` | 503 | Kho audio chưa cấu hình (upload/nghe/xóa) | "Kho audio chưa được kích hoạt — liên hệ quản trị hệ thống." | ✅ apps/server/src/routes/admin-library.ts:104-106, apps/admin/src/components/library/library-error.ts:20-21; test apps/server/src/routes/admin-library-audio.test.ts:630-646 |
| E-20 — lỗi kho audio | 500 | Ghi object lên kho hỏng / lệch số byte | "audio upload failed" (thô) | ✅ apps/server/src/routes/admin-library.ts:782-787, apps/server/src/routes/admin-library.ts:815-819 |
| E-21 — bài tập đang được dùng | 409 | Hạ ngược/xóa bài tập khi còn bộ đề tham chiếu | "exercise is referenced by a study pack" (thô); client: "Không thể xoá bài tập thư viện." | ✅ apps/server/src/routes/admin-library.ts:973-987, apps/server/src/routes/admin-library.ts:1022-1034, apps/admin/src/routes/_auth/library/packs.tsx:213 |
| E-22 — bộ đề đang được dùng | 409 | Xóa bộ khi còn lớp gắn | "study pack is referenced by class assignments" (thô); client: "Không thể xoá bộ đề hệ thống." | ✅ apps/server/src/routes/admin-library.ts:1177-1187, apps/admin/src/routes/_auth/library/packs.tsx:172 |
| E-23 — bộ đề không thấy | 404 | ID lạ hoặc bộ thuộc tổ chức khác | "study pack not found" (thô); client: "Không tải được dữ liệu bộ đề hệ thống." | ✅ apps/server/src/routes/admin-library.ts:1060-1062, apps/server/src/routes/admin-library.ts:1114-1116, apps/server/src/routes/admin-library.ts:1174-1176, apps/admin/src/routes/_auth/library/packs.tsx:92 |
| E-24 — tham số lọc lạ | 400 | skill/status lọc không hợp lệ (đề và bài tập) | "invalid skill"/"invalid status" (thô) | ✅ apps/server/src/routes/admin-library.ts:408-416, apps/server/src/routes/admin-library.ts:902-910 |
| E-25 — bài tập không thấy | 404 | ID bài tập lạ | "exercise not found" (thô) | ✅ apps/server/src/routes/admin-library.ts:970-972, apps/server/src/routes/admin-library.ts:1019-1021 |
| E-26 — trạng thái nội bộ hỏng | 500 | Kỹ năng lưu trong DB khác hai giá trị hợp lệ | "corrupt test skill" (thô) | ✅ apps/server/src/routes/admin-library.ts:544-546, apps/server/src/routes/admin-library.ts:620-622 |
| E-27 — tạo thất bại | 500 | Chèn xong đọc lại không thấy (hiếm) | "exercise creation failed"/"study pack creation failed" (thô) | ✅ apps/server/src/routes/admin-library.ts:957, apps/server/src/routes/admin-library.ts:1101 |

## Mục 7 — Thước đo thành công

- Admin soạn và xuất bản trọn vẹn một đề đọc và một đề nghe mà không cần dev can
  thiệp vào dữ liệu. 🟡 (mục tiêu vận hành — không thấy tài liệu nêu chỉ số; OQ-01)
- Sau khi luật nhóm hỏng vào đời, không phát sinh thêm row nhóm hỏng mới (chỉ còn
  dữ liệu cũ tồn tại từ trước). 🟡 (nguồn hỏng là schema siết chặt #425 — OQ-09)
- Hai học viên/lớp khác nhau dùng chung một bộ đề hệ thống không làm mất tiến độ của
  nhau khi admin cập nhật bộ. 🟡 (kỳ vọng #554 — OQ-11)
- Bằng chứng kỹ thuật hiện có: e2e đi trọn soạn→xuất bản cho reading và listening
  (kể cả upload audio), 29+15 test API phủ cổng quyền/CSRF/nhóm hỏng/CAS. ✅
  apps/e2e/specs/admin-library-reading.spec.ts:174, apps/e2e/specs/admin-library-reading.spec.ts:279, apps/e2e/specs/admin-library-reading.spec.ts:652, apps/e2e/specs/admin-library-listening.spec.ts:106-313, apps/server/src/routes/admin-library.test.ts:1-1656, apps/server/src/routes/admin-library-audio.test.ts:1-647

## Mục 8 — Thực thể nghiệp vụ

- **Bộ đề thư viện** (library_test): thuộc tính đề + trạng thái nháp/xuất bản +
  người tạo không khóa cứng tài khoản (xóa người dùng không xóa đề). ✅
  packages/db/src/schema/library-test.ts:16-48 (người tạo 32-36)
- **Part của đề** (library_test_part): gắn đề theo kiểu xóa-cascade; một slot duy
  nhất cho mỗi đề; toàn bộ nội dung soạn dạng văn bản JSON; 5 cột audio; nhóm câu
  giữ mảng phẳng câu hỏi trỏ theo dải chỉ số. ✅
  packages/db/src/schema/library-test.ts:59-103 (unique 97-102, groups 79-85)
- **Bài tập thư viện** (study_pack_exercise): bài lẻ reading/grammar/vocabulary với
  trạng thái riêng, người tạo, cùng hình dạng nội dung part. ✅
  packages/db/src/schema/study-pack.ts:17-43
- **Bộ đề hệ thống** (study_pack): bản ghi gốc ngoài tổ chức + trạng thái + nguồn
  sao chép (bản hệ thống để trống). ✅ packages/db/src/schema/study-pack.ts:49-76
- **Mục bộ đề** (study_pack_item): ngày + vị trí + nguồn (loại + mã) + ghi chú;
  khóa duy nhất theo bộ+ngày+loại nguồn+mã nguồn. ✅ packages/db/src/schema/study-pack.ts:81-107
- **Bộ đề gán lớp** (class_study_pack): bản sao giao lớp — tiêu đề + ngày bắt đầu +
  giờ phát/giờ hết hạn + trạng thái hoạt động/đã hủy; trùng gán đang hoạt động bị
  chặn; xóa bộ gốc bị chặn khi còn gán. ✅ packages/db/src/schema/study-pack.ts:115-146
- **Bản vật hóa cho học viên** (assignment_prompt): đề/part thư viện được chụp thành
  bài giao/luyện qua mã tham chiếu — học viên không đọc trực tiếp bảng thư viện;
  sửa đề thư viện sau vật hóa không đổi bài đã giao. 🔵
  packages/db/src/migrations/0060_study_pack.sql:1-79, apps/server/src/routes/student-practice.ts:44-90, apps/server/src/lib/study-pack-clone.ts:354-632

## Mục 9 — Luồng (danh mục)

Đặc tả đủ (sequence + activity) ở srs/admin-library-reverse-flows.md.

| F-id | Luồng | Một dòng |
|---|---|---|
| F1 | Xem và lọc danh sách đề | Lọc kỹ năng/trạng thái + tìm từ khóa → bảng đề có cờ đủ audio |
| F2 | Tạo đề mới | Nhập metadata → khung part tự dựng theo kỹ năng → vào soạn |
| F3 | Soạn nội dung part và nhóm câu | Lưu từng part; chặn ghi đè nhóm hỏng; luật sẵn sàng chạy chéo client/server |
| F4 | Quản lý audio part nghe | Upload CAS + dọn object cũ nền; nghe qua kho bảo mật |
| F5 | Xuất bản / hạ ngược đề | Hai cửa draft↔ready với luật sẵn sàng + chặn nhóm hỏng |
| F6 | Xóa đề và xóa part | Chặn khi đang xuất bản (part/audio); xóa đề dọn audio nền |
| F7 | Quản lý bài tập thư viện | CRUD bài lẻ + chặn hạ ngược/xóa khi đang tham chiếu |
| F8 | Bộ đề hệ thống và giao lớp | Ghép bài theo ngày từ nguồn ready; bảo toàn mã mục; sao chép xuống lớp |
| F9 | Xem trước đề | Gộp dữ liệu lưu + đang soạn, khung như học viên |

## Mục 10 — Màn hình

- `/library` (mục "Thư viện" trên console) — trang danh sách đề: chip lọc kỹ năng +
  trạng thái, ô tìm, bảng đề, hộp thoại xóa, nút tạo. ✅
  apps/admin/src/components/layout/admin-shell.tsx:1-76, apps/admin/src/routes/_auth/library/tests/index.tsx:139-279
- `/library/tests/new` — form tạo đề: metadata + chọn kỹ năng. ✅
  apps/admin/src/routes/_auth/library/tests/new.tsx:1-122
- `/library/tests/$testId` — trang soạn: header metadata (lưu theo blur), khung part
  theo kỹ năng, tab nội dung/câu hỏi mỗi part, uploader audio (nghe), thanh xuất bản,
  khối xem trước, chặn rời trang khi bẩn. ✅
  apps/admin/src/routes/_auth/library/tests/$testId.tsx:1-779
- `/library/packs` — bài tập thư viện + bộ đề hệ thống: form JSON soạn nhanh (thêm
  mục theo ngày), danh sách bộ, xóa, tạo bài tập lẻ. ✅
  apps/admin/src/routes/_auth/library/packs.tsx:1-446

## Mục 11 — Ràng buộc

- Cổng admin theo danh sách email từ cấu hình triển khai; danh sách rỗng → mọi ghi
  bị chặn (khép kín). ✅ apps/server/src/lib/require-admin.ts:18, apps/server/src/routes/admin-library.ts:87-89
- Route thư viện tự gắn cổng quyền và CSRF riêng, KHÔNG dùng lõi org-scoped của
  kernel: dữ liệu dùng chung toàn hệ thống, bảng không có cột tổ chức. ✅
  apps/server/src/routes/admin-library.ts:66-72
- Kho audio có thể vắng mặt tùy môi trường — toàn bộ tính năng audio phải degrade
  về 503 rõ mã thay vì làm hỏng phần còn lại. ✅ apps/server/src/routes/admin-library.ts:88-89, apps/server/src/routes/admin-library.ts:104-106
- Trần kỹ thuật: 50 MB/part audio; 20 nhóm câu/part; nhóm tối đa 40 câu; tiêu đề 200
  ký tự; thời lượng 60 giây-4 giờ; bộ đề 366 ngày/10 mục ngày/200 mục. ✅
  packages/api/src/library-contracts.ts:35-36, packages/api/src/library-contracts.ts:124, packages/api/src/library-contracts.ts:128-133, packages/api/src/library-contracts.ts:77-84, packages/api/src/contracts.ts:4478-4480
- Trần tham số bind của D1 (100) buộc tách lô khi truy vấn/chèn theo mảng: in-array 50, chèn item pack 10, chèn prompt 3. ✅
  apps/server/src/lib/study-pack-clone.ts:31-35
- Hợp đồng Zod khép (.strict()) — thêm trường phải đồng bộ cả client lẫn server trong
  cùng phiên bản. ✅ packages/api/src/library-contracts.ts:88, packages/api/src/library-contracts.ts:106-107
- Luật sẵn sàng là một nguồn sự thật dùng chung client (chặn trước) và server (chặn
  sau) — không nhân bản rule. ✅ packages/api/src/library-contracts.ts:447-452, apps/admin/src/components/library/publish-bar.tsx:13-19
- Câu hỏi/ngân hàng đáp án/ảnh của thư viện tái dùng nguyên khối luật của ngân hàng
  bài tập lớp (không định nghĩa riêng). ✅ packages/api/src/library-contracts.ts:143-152

## Mục 12 — Câu hỏi mở (OQ)

| OQ | Câu hỏi | Liên quan |
|---|---|---|
| OQ-01 | Ai là người dùng thực tế của console thư viện (biên tập viên nội dung riêng hay admin vận hành)? ảnh hưởng tới phân quyền tinh trong tương lai | Mục 2, FR-01 |
| OQ-02 | Bộ sưu tập/nhóm đề chỉ để lọc trong console hay là danh mục phục vụ catalog luyện đề của học viên (khớp chính xác như phía học viên đang lọc)? | FR-05, BR-17 |
| OQ-03 | Vì sao xóa đề không chặn dù đang được tham chiếu qua bản vật hóa — có phải chính sách "bản sao tự chịu"? | FR-21, BR-16 |
| OQ-04 | Vì sao sửa part khi đang xuất bản được phép (kèm luật) nhưng xóa part/audio thì bị chặn? | FR-15, BR-09 |
| OQ-05 | Luật ngân hàng đáp án theo dạng bài: quy tắc nghiệp vụ gốc nào định nghĩa "đủ"? | BR-04 |
| OQ-06 | Ai chịu trách nhiệm chất lượng ghim ảnh (đủ số ghim theo dạng bài) khi soạn? | BR-04, FR-11 |
| OQ-07 | Căn cứ chọn trần 50 MB / 366 ngày / 10 mục ngày / 200 mục — kỹ thuật hay nghiệp vụ? | NFR-03, BR-12 |
| OQ-08 | Chính sách dọn object mồ côi audio (tần suất "dọn tay", ai chịu trách nhiệm)? | BR-10 |
| OQ-09 | Nguồn nhóm hỏng là schema siết chặt (#425) — còn kịch bản nào sinh row hỏng mới, và khi nào có thể bỏ hẳn lớp bảo vệ này? | FR-17-19, E-11 |
| OQ-10 | GET audio chưa hỗ trợ Range — có kế hoạch tua trong bài nghe phía học viên không? | FR-26 |
| OQ-11 | Thông điệp người dùng khi xóa bộ bị chặn 409 chưa có wording riêng (toast chung) — có cần giải thích nguyên nhân lớp nào đang dùng? | E-21, E-22 |
| OQ-12 | Bộ đề hệ thống có cần vòng đời nháp/sẵn sàng có ý nghĩa nghiệp vụ như đề, hay chỉ là nhãn? | FR-31, SM-05 |
| OQ-13 | Ý nghĩa thay đổi chưa commit trong test audio (cỡ dữ liệu nền 4 → 16) — sửa tay cục bộ hay chuẩn bị đổi trần/bỏ-CAS? | _evidence §Working-tree |
| OQ-14 | Môi trường triển khai nào chạy thiếu kho audio (self-host?) — chính sách thông báo người dùng cuối? | FR-28, E-19 |
