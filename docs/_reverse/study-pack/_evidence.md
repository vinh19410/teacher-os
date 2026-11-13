---
feature: study-pack
type: reverse-evidence
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# _evidence — study-pack

Bằng chứng thô, nhóm theo chủ đề. Mỗi dòng ghi sự thật quan sát được kèm vị trí.
Quy ước: `tệp:dòng` tính trên working tree HEAD 8277bfb4.

## Provenance

- HEAD của repo lúc soạn: 8277bfb4 (merge #684 media-upload-magic-bytes), nhánh
  develop. Commit đối chiếu của nhiệm vụ: d6c0f6b5.
- `git diff --stat d6c0f6b5 HEAD` trên toàn repo cho thấy HEAD hơn 1 merge
  commit; các tệp trong phạm vi feature trùng nội dung giữa hai commit TRỪ
  `packages/api/src/contracts.ts` (+2 dòng tại :1971-1972 HEAD, do #675, NẰM
  TRƯỚC đoạn feature 4456-4801 nên mọi trích dẫn từ :1973 trở đi (HEAD) dịch +2
  so với d6c0f6b5; hai bản trùng nhau tới :1970 — đoạn feature không đổi nội dung).
- Tài liệu kế hoạch S32-S37 tồn tại giống hệt ở cả hai commit (git ls-tree + git
  diff rỗng — NS7).
- Toàn bộ range dòng trong bảng S đo bằng `awk 'END{print NR}'` (đếm cả tệp
  không kết thúc bằng newline), không dùng wc -l.

## Cấu trúc tệp (S1-S37)

- S1 apps/server/src/routes/study-pack.ts — 454 dòng. 8 route.
- S2 apps/server/src/lib/study-pack-clone.ts — 940 dòng.
- S3 apps/server/src/lib/study-pack-assign.ts — 908 dòng.
- S4 packages/db/src/schema/study-pack.ts — 146 dòng.
- S5 packages/db/src/migrations/0060_study_pack.sql — 79 dòng.
- S6 packages/db/src/migrations/0061_petite_dormammu.sql — 1 dòng.
- S7 packages/api/src/contracts.ts — 4801 dòng (đoạn feature 4456-4801).
- S8 apps/web/src/routes/_auth/assignments/packs.tsx — 733 dòng.
- S9 apps/web/src/components/classes/class-study-pack-section.tsx — 481 dòng.
- S10 apps/web/src/lib/repos/study-pack.ts — 151 dòng.
- S11 apps/e2e/specs/study-pack.spec.ts — 334 dòng.
- S12 apps/server/src/routes/study-pack.test.ts — 926 dòng.
- S13 apps/server/src/lib/study-pack-assign.test.ts — 619 dòng.
- S14 apps/server/src/lib/study-pack-clone.test.ts — 360 dòng.
- S15 apps/server/src/study-pack-migration.test.ts — 446 dòng.
- S16 apps/web/src/components/classes/class-study-pack-section.test.tsx — 301 dòng.
- S17 packages/auth/src/role.ts — 177 dòng.
- S18 apps/server/src/lib/assignment-visibility.ts — 16 dòng.
- S19 apps/server/src/routes/enrollment-activation.ts — 776 dòng.
- S20 apps/server/src/routes/kernel.ts — 3523 dòng.
- S21 packages/api/src/vietnam-date.ts — 316 dòng.
- S22 apps/server/src/routes/holidays.ts — 1012 dòng.
- S23 apps/server/src/routes/admin-library.ts — 1244 dòng.
- S24 apps/server/src/routes/student.ts — 2468 dòng.
- S25 apps/server/src/kernel.test.ts — 7844 dòng.
- S26 apps/e2e/src/boot.ts — 299 dòng.
- S27 apps/e2e/specs/class-assign.spec.ts — 411 dòng.
- S28 apps/web/src/routes/_auth/assignments/index.tsx — 540 dòng.
- S29 apps/web/src/routes/_auth/classes/$classId.tsx — 511 dòng.
- S30 apps/student/src/components/overview/assignment-row.tsx — 77 dòng.
- S31 packages/db/src/schema/class-assignment.ts — 78 dòng.
- S32 plans/261101-1357-533-study-pack-scheduled-release/plan.md — 115 dòng.
- S33 phase-01-schema-migration-contracts.md — 144 dòng.
- S34 phase-02-grammar-vocabulary-exercises.md — 119 dòng.
- S35 phase-03-pack-library-and-org-api.md — 89 dòng.
- S36 phase-04-assign-to-class-and-read-time-gate.md — 120 dòng.
- S37 phase-05-ui-and-e2e.md — 88 dòng.

## Cơ sở dữ liệu (S4, S5, S6, S31)

- Bảng `study_pack_exercise` (đề hệ thống): cột skill/part/type/title/band/intro/
  passage/questions/optionBank/note/status/createdBy/created_at/updated_at;
  status nhận `draft|ready`. ✅ packages/db/src/schema/study-pack.ts:17-43
- Bảng `study_pack`: org_id nullable (NULL = hệ thống) :53-55; status
  `draft|ready` :58; source_pack_id không FK :59; unique
  `(org_id, source_pack_id)` :71-74; index org/status :69-74.
- Bảng `study_pack_item`: pack_id cascade; day_index/position;
  source_kind `org_prompt|library_test_part|library_exercise` :87-90; source_id;
  unique `(pack_id, day_index, source_kind, source_id)` :95-100; `position` chỉ có chỉ mục thường :101-105, không thuộc khoá duy nhất.
- Bảng `class_study_pack`: class_id/pack_id/start_date/release_time/due_time;
  status `active|cancelled` :132; cancelled_at; unique PHẦN
  `(class_id, pack_id) WHERE status = 'active'` :142-144.
- Migration 0060: dọn sót #526 :1-6; thêm `class_assignment.available_at` :4 và
  `class_study_pack_id` :5; thêm `assignment_prompt.library_ref` + unique
  `(org_id, library_ref)` :7-8; tạo 4 bảng :12-79.
- Migration 0061 (1 dòng): tái tạo unique `(org_id, source_pack_id)` của
  `study_pack`.
- `class_assignment` nhận 2 cột mới: available_at :38, class_study_pack_id :39,
  index theo class+available :47. ✅ packages/db/src/schema/class-assignment.ts

## Hợp đồng API (S7 — đoạn 4456-4801)

- Nhãn kế hoạch `#533` mở đầu đoạn :4456.
- `STUDY_PACK_SKILLS = ["reading","listening","grammar","vocabulary"]` :4458-4463.
- `STUDY_PACK_SOURCE_KINDS = ["org_prompt","library_test_part","library_exercise"]` :4466-4471.
- Trần: `MAX_PACK_DAYS = 366`, `MAX_PACK_ITEMS_PER_DAY = 10`,
  `MAX_PACK_TOTAL_ITEMS = 200` :4480-4482 (tiếp đó là TIME_REGEX/DATE_REGEX :4483-4484); không có hằng `MAX_PACK_NOTE_LENGTH` — trần 2000 là inline `.max(2000)` tại note :4491 và description :4499.
- itemInput: sourceKind + sourceId + dayIndex(1..) :4486-4493.
- base schema bộ đề: title/description/note/status/items; superRefine: `ready`
  phải có ≥1 mục :4508-4514; mỗi ngày ≤10 mục :4515-4526; cấm trùng mục trong
  cùng ngày :4527-4535; status enum :4499-4503.
- assignStudyPackSchema: startDate (YYYY-MM-DD) + releaseTime + dueTime HH:MM
  :4689-4716.
- View DTO pack/pack-item :4718-4801 (kèm promptTitle, promptStatus, skill,
  sourceKind, sourceTitle, item sẵn sàng...).

## Route máy chủ (S1)

- Cổng chung: 401 `unauthorized` :38-40; 403 `forbidden` :42-44.
- Cửa đọc thân yêu cầu dùng chung: 415 khi thiếu
  `content-type: application/json` :56-58; 400 `invalid json` :66; 400
  `invalid body` (lỗi Zod gộp) :70.
- Phân vai từng route: GET danh sách :77-78 và GET một :102-103 dùng
  `canReviewGrade`; POST tạo :122-123, PUT :165-166, DELETE :235-236, clone
  :271-273, POST gán :399-400, DELETE huỷ :426-427 dùng `canPublishGrade`;
  GET theo lớp :380-381 dùng `canReviewGrade`.
- GET /study-packs :75-98: bộ lọc phạm vi `mine|system|all` + skill + status;
  bộ hệ thống lọc `isNull(orgId) AND status='ready'` :87.
- GET /study-packs/:id :100-118; 404 `study pack not found` :113.
- POST :120-161: validate qua hợp đồng :131 (trả đúng lỗi hợp đồng); 500
  `study pack creation failed` :157.
- PUT :163-231: 404 :178/:227; KHÔNG có kiểm tra lượt gán (cơ sở GAP-02).
- DELETE :233-267: 409 `study pack is referenced by class assignments` :255 khi
  còn `class_study_pack` tham chiếu.
- POST /:id/clone :269-376: chỉ bộ hệ thống ready :282 + :87 logic tương tự ở
  danh sách; idempotent: đã có bản sao (theo unique org+source) thì trả lại
  bản cũ kèm cờ idempotent, mã 201 :290-302; 404 :287; 500 `study pack clone
  failed` :372; nhánh đua khi hai người nhân bản cùng lúc :348-365.
- GET /classes/:classId/study-packs :378-395: 404 `class not found` :390; trả
  kèm tổng quan tiến độ.
- POST /classes/:classId/study-packs :397-422: gọi assignStudyPackToClass,
  trả lỗi nghiệp vụ đúng mã từ thư viện :417.
- DELETE /classes/:classId/study-packs/:id :424-451: 404 lớp :436; lỗi huỷ
  :446.

## Thư viện vật hoá & kiểm nguồn (S2)

- Hằng số chunk D1 :30-35: `D1_IN_ARRAY_CHUNK=50`,
  `D1_PROMPT_CLONE_INSERT_CHUNK=3`, `D1_PACK_ITEM_INSERT_CHUNK=10`,
  `D1_ASSIGNMENT_INSERT_CHUNK=8`, `D1_TARGET_INSERT_CHUNK=15` (mốc so với
  kế hoạch: GAP-01 — kế hoạch ghi 4 cho chunk nhân bản).
- validateStudyPackItems :354-630: chặn sourceKind lạ :364-375; bộ HỆ THỐNG
  không được chứa `org_prompt` :376-382; kiểm đề org (tồn tại, cùng org, kỹ
  năng thuộc STUDY_PACK_SKILLS, dạng tự chấm) :444-483; kiểm part thư viện
  (kỹ năng, status ready; part nghe bị từ chối với thông điệp "listening
  library parts are not supported in study packs yet") :521-536; kiểm đề
  exercise hệ thống :594-626.
- materializePrompts :636-810: gộp phẳng groups của part thư viện thành nhiều
  prompt :669-754; chèn `.onConflictDoNothing()` theo unique
  (org_id, library_ref) :756-759; ĐỌC LẠI sau chèn để lấy id :761-782; thiếu
  id sau chèn → 422 `failed to materialize prompts` :787-797.
- View pack (list/detail) :812-900; khoá all định danh mục bộ đề
  (tuple key) :902-908; các câu chèn dùng chung :910-940.

## Thư viện gán lớp (S3)

- Hằng số giờ mặc định :31-36.
- computeStudyPackSchedule :47-79: hàm thuần — từ ngày bắt đầu, đi từng ngày,
  bỏ qua ngày nghỉ, trả danh sách ngày học (không đụng DB).
- Mã tất định: bài giao `ca_pk_<classPackId>_<itemId>` :81-86; mục tiêu
  `cat_pk_<assignmentId>_<studentId>` :98-103.
- buildCleanupCancelledPackStatements :140-192: cutoff NULL → xoá toàn bộ bài của
  lượt gán chưa có lần làm bài nào (kể cả bài đã mở); cutoff theo thời điểm huỷ
  → chỉ xoá bài chưa mở tính tới mốc; bài có ít nhất một lần làm bài luôn giữ.
- assignStudyPackToClass :194-510: bộ phải `ready` :213-219; tái dùng lượt gán
  `active` đang tồn tại (idempotent) :221-254; chặn bộ không sẵn sàng :292-294;
  chặn bộ rỗng mục :306-308; vật hoá đề :310-313; tạo lượt gán :315-331; nhánh
  đua khi hai request gán song song (unique active) :336-363; lịch theo ngày
  nghỉ :366-377; mỗi mục một bài giao với available_at tính từ giờ mở ngày đó
  :379-417 (:391 tính thời điểm, :404 gán vào bản ghi); mục tiêu cho học viên
  active hiện có :421-437; ghi theo lô :439-455; sau lỗi ghi, kiểm lại lượt gán
  có bị huỷ xen ngang không và dọn theo mốc :457-492.
- cancelClassStudyPack :521-566: 404 `class study pack not found` :538-540;
  mốc hiệu lực = cancelled_at cũ nếu đã huỷ trước :541; một lô: cập nhật
  status/cancelled_at + dọn mục tiêu + dọn bài giao (theo builder :140).
- backfillStudyPackTargetsForStudent :573-623: chỉ tạo mục tiêu cho bài còn hạn
  (`gt(dueAt, now)` :596); học viên đã có mục tiêu thì bỏ qua.
- loadClassStudyPacks :628-908: gắn cờ mở bài theo thời điểm :827-833; đếm tổng
  mục/bài đã nộp :835-854; sắp bài trong pack theo day_index/position/assignment_id :876-881.

## Đọc phía học viên & cổng (S24, S18, S19, S17)

- Bộ lọc thời điểm mở bài dùng chung (khai báo 16 dòng). ✅
  apps/server/src/lib/assignment-visibility.ts:1-16
- Cổng học viên: 404 trước giờ trên đường mở/làm bài. ✅
  apps/server/src/routes/student.ts:1354-1383; cổng giờ mở trên dữ liệu đã ánh xạ :918 (`row.availableAt > now` → 404).
- Ba đường kích hoạt ghi danh đều gọi backfillStudyPackTargetsForStudent:
  :697, :748, :769. ✅ apps/server/src/routes/enrollment-activation.ts
- role.ts: chú thích nêu rõ hai hàm sinh ra cho khối chấm bài :105-142;
  canPublishGrade :136; canReviewGrade :140 (định nghĩa kề nhau).

## Mount & hạ tầng (S20, S21, S22)

- Router bộ đề được mount trong kernel sau middleware Origin/content-type:
  :3490-3493. ✅ apps/server/src/routes/kernel.ts
- vietnam-date.ts: hàm hôm nay/cộng ngày ISO/mốc giờ Việt Nam :27-46; ghi chú
  múi giờ cố định :99.
- holidays.ts: đọc ngày nghỉ theo tổ chức và phạm vi lớp :166-171.

## Giao diện giáo viên (S8, S9, S10, S28, S29, S30)

- packs.tsx: bộ lọc đề hợp lệ chỉ lấy `org_prompt` có status ready + kỹ năng
  được phép :91-100; trạng thái form mặc định "ready" :75 và đặt lại mỗi khi mở form tạo mới
  :134; nhân bản :196-208; xoá — bọc lỗi 409 thành câu thoại :216-227;
  kiểm khi thêm mục :229-279; lưu :285-325; ô chọn trạng thái
  :538-541 ("Sẵn sàng" / "Nháp"); nhãn trạng thái :439-443.
- class-study-pack-section.tsx: xem trước lịch chạy phía khách (bản sao thuần
  của hàm lịch máy chủ) :41-72; nộp gán + bọc lỗi nghiệp vụ thành câu thoại
  :163-214 ("Bộ đề này vừa bị huỷ..." :198; "Bộ đề này đang chạy trên lớp với
  lịch khác." :206); huỷ :216-228; nhãn trạng thái :297-302; huy hiệu mở bài
  "Đã mở"/"Chưa đến giờ" :352-359; thanh tiến độ :360-369; khung xem trước
  :432-454.
- repos/study-pack.ts: ném lỗi kèm `studyPackErrorCode` :27-39; 8 hàm gọi API.
- assignments/index.tsx: nút dẫn sang "Bộ đề tự học" :276-287.
- $classId.tsx: tab "Buổi học & luyện tập" :312; chuyển chế độ
  practice/study-pack :340-366 (mount section khi mở :361-364).
- assignment-row.tsx: nhãn "Làm bài: " + tên đề :67-71.

## E2E & kiểm thử (S11-S16, S25, S26, S27) — R1

- S11 study-pack.spec.ts: 1 test `test(...)` :62-334; chặn khổ nhỏ :14-40; ghi
  ảnh vào thư mục kế hoạch :34; cổng học viên trước giờ (404 trên quiz trực
  tiếp) :254-264; dịch giờ qua boot :296-307; học viên vào muộn :316-333.
- S12 study-pack.test.ts: 4 test `it(...)`; khối `describe("study pack routes")`.
- S13 study-pack-assign.test.ts: 3 test (lịch, gán, huỷ + đan xen).
- S14 study-pack-clone.test.ts: 3 test (chunk, validate, vật hoá 2 lần).
- S15 study-pack-migration.test.ts: 5 test (migration 0060 + hợp đồng Zod +
  xác nhận mã thông báo cũ đã gỡ :165, :167).
- S16 class-study-pack-section.test.tsx: 5 test component.
- S25 kernel.test.ts: 1 test liên quan (#572) — backfill KHÔNG đụng bài giao
  thường :6712-6737.
- Không có only/skip/todo/xit/xdescribe trong 6 tệp (NS1).
- Tổng: 22 test active (4+3+3+5+5+1+1).

## Tài liệu kế hoạch (S32-S37) — đối chiếu, không phải chuẩn

- plan.md: bảng quyết định đã chốt :21-30 — bỏ thông báo chủ động :27; kỹ năng
  được phép :28; trần 366/10/200 :29; gỡ #526 bằng migration kèm hướng dẫn
  backup :30. Non-goal :40-44 — không sửa giờ bộ đang chạy (huỷ rồi gán lại)
  :42; không thông báo mở bài :43. Kiến trúc + lịch bỏ ngày nghỉ :48-63.
  RT-4 (chunk + trần do giới hạn bind D1) :89; RT-5 (chặn part nghe V1, yêu cầu
  audio player) :90. Tiêu chí nghiệm thu :109-115.
- phase-03: cổng vai theo nhóm chấm bài :66; nhân bản chỉ bộ hệ thống ready :71;
  tiêu chí test phân quyền/clone/409 :76; chunk nhân bản = 4 :38, :50 (LỆCH
  code = 3 — GAP-01).
- phase-05: form soạn (trạng thái Nháp/Sẵn sàng, chỉ hiện đề ready) :51; nút
  chế độ không dùng role=tab :53.

## Kết quả NS tóm tắt

Chi tiết lệnh + kết quả nguyên văn ở reverse-gaps.md §4. Tómắt: NS1 (0),
NS1b (0), NS1c (0), NS3 (0), NS4 (0), NS5 (0), NS7b (0), R2 (0); NS2 (1 nơi
ghi sản phẩm + 2 nơi ngoài); NS6 (chỉ admin-library ghi org NULL).
