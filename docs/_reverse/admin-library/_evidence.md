---
feature: admin-library
type: reverse-evidence
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# _evidence — admin-library

Bằng chứng thô theo nhóm. Mọi cite `path:line` đã kiểm trong EOF (`awk 'END{print NR}'`).

## §Mount + dep (khởi tạo route)

- Mount `/api/admin/library` trong app: apps/server/src/app.ts:444-467; bootstrap bypass
  middleware chú thích ở app.ts:450-452.
- Deps route cần: db, session reader, adminEmails (lowercase), adminOrigins (rỗng →
  chặn hết), getLibraryAudioStore (vắng → 503), runInBackground —
  apps/server/src/routes/admin-library.ts:81-92.
- Header comment tổng hợp ý đồ #413/#425/#305: admin-library.ts:66-79.

## §Cổng admin + CSRF

- Cổng: role `admin` + emailVerified + email trong ADMIN_EMAILS (so khớp lowercase) —
  apps/server/src/lib/require-admin.ts:28-49 (role 35-36, NOT_ADMIN 39-47), comment
  ý đồ 11-14; /me dùng chung gate 59-70.
- Test ma trận vai trò (admin thường/teacher/student/no-session): admin-library.test.ts:130-164;
  audio test lặp lại ma trận: admin-library-audio.test.ts:242-264.
- CSRF router-local: WRITE_METHODS 97; Origin check fail-closed admin-library.ts:381-388;
  bỏ kiểm content-type cho PUT .../audio + DELETE 389-396 (isRawAudioUpload 101-103);
  test CSRF: admin-library.test.ts:166-189.

## §Routes (19)

| Route | Dòng | Ghi chú |
|---|---|---|
| GET /tests | 404-477 | lọc skill/status (400 giá trị lạ), tìm `q` LIKE 4 cột, order updatedAt desc, hasAllAudio 455-465 |
| POST /tests | 480-502 | luôn draft (498), trả detail |
| GET /tests/:id | 505-509 | detail + parts |
| PATCH /tests/:id | 512-586 | SKILL_IMMUTABLE 522-524; status ngoài schema xử lý tay 525-533; corrupt check 562-569; NOT_READY 570-573 |
| DELETE /tests/:id | 589-613 | batch delete parts+test; audio dọn nền sau (601-602) |
| PUT /tests/:id/parts/:part | 616-696 | slot check 624-626; part-body mismatch 400 628-630; corrupt guard 632-654; ready validate 655-669; không đụng audio 670-686; upsert onConflict 687-693 |
| DELETE /tests/:id/parts/:part | 699-720 | ready → 409 (703-705); draft xóa tự do |
| PUT .../audio | 723-831 | đọc kỹ ở §Audio CAS |
| GET .../audio | 834-851 | comment "chưa Range" 832-833; media-response headers |
| DELETE .../audio | 854-895 | ready → 409 (860-861); idempotent (865); re-read chống CAS 884-892 |
| GET /exercises | 898-925 | lọc skill/status; order 3 khóa |
| POST /exercises | 926-960 | re-check session 929-930; createdBy; 201 |
| PUT /exercises/:id | 961-1012 | hạ ready→draft chặn khi pack tham chiếu 973-987 |
| DELETE /exercises/:id | 1013-1037 | chặn khi pack tham chiếu 1022-1034 |
| GET /packs | 1040-1052 | chỉ org_id IS NULL |
| GET /packs/:id | 1054-1066 | 404 org pack |
| POST /packs | 1067-1103 | validateStudyPackItems(null org) 1074-1077; batch insert 1081-1095; 201 |
| PUT /packs/:id | 1105-1166 | validate 1118-1121; map tuple→id 1132-1137; batch update+delete+insert giữ id 1139-1157 |
| DELETE /packs/:id | 1168-1195 | chặn class_study_pack tham chiếu 1177-1187; batch xóa item+pack |

## §Hợp đồng + luật sẵn sàng (packages/api/src/library-contracts.ts)

- LIBRARY_SKILLS đọc/nghe :28; LIBRARY_AUDIO_MAX_BYTES 50 MB :35-36 (comment khớp
  QUIZ_MEDIA_MAX_BYTES của Speaking); LIBRARY_AUDIO_MIME :43-53.
- LIBRARY_ERROR_CODES :56-67 (9 mã; GROUPS_* có comment #425 :64-65).
- Create schema :74-88 (title 200, timeLimit 60..4h default 3600, .strict :88).
- Update schema :94-108 — comment "không có status" :92-93 LỖI THỜI (route xử lý
  status tay — xem CF-01).
- LIBRARY_GROUP_MAX 20 :124; libraryQuestionGroupSchema :126-142 (startIndex/count,
  optionBank ≤ ASSIGNMENT_OPTION_BANK_MAX).
- Upsert part :143-252 — discardCorruptGroups literal(true) :167; answerSet
  superRefine :174-215; tái dùng luật ngân hàng assignment :143-152.
- partIssues :263-438 (đọc: passage; nghe: audio + audioName; ≥1 câu hỏi có stem;
  ảnh https + pins; optionBank); validatePartForReady :447-452; validateTestReady
  :458-476 (đủ part theo preset).
- DTO :491-516 (groupsCorrupt :506-509); listItem :519-537 (hasAllAudio :533-534).

## §Nhóm câu hỏng (#425)

- Parse phân biệt rỗng/hỏng + 4 lý do (malformed/non-array/shape/over-cap):
  admin-library.ts:165-201 (comment nguồn hỏng = schema siết chặt :165-172).
- PUT part guard: cờ khi lành → GROUPS_NOT_CORRUPT 638-641 (comment snapshot stale);
  hỏng thiếu cờ → GROUPS_CORRUPT 643-646 (comment: BẤT KỂ payload); log khi hủy tường
  minh 647-654.
- Publish guard: corrupt chặn trước validate 562-569 (comment chống "nhóm ngầm" lọt).
- Test nhóm hỏng: admin-library.test.ts:1075-1247 (describe "groups corrupt guard
  (#425)" mở từ :981) — các ca: ghi đè thiếu cờ 409; cờ đúng → ghi + log; nhóm soạn
  lại không cờ 409; DTO gắn cờ; cờ trên row sạch 409; publish chặn corrupt.

## §Audio CAS (#305)

- Dòng then: khóa cũ đọc trước 770; key mới `library/<testId>/<part>/<uuid>` 771;
  dọn-object-new helper 772-773; put trước 775; setWhere theo key cũ (hoặc isNull khi
  slot trống) 798-805; 0 row → dọn object mới + 409 AUDIO_CHANGED 806-810; catch →
  dọn mới giữ cũ 811-817; dọn cũ nền 818-822.
- Content-Length bắt buộc dương 737-744; trần 745-747; MIME 748-751; tên bắt buộc
  (X-File-Name + sanitize) 752-765 — comment: đề listening ready cần audioName.
- Nghe: 834-851 — media-response (nosniff, CSP sandbox, private no-store, RFC8187)
  apps/server/src/lib/media-response.ts:1-46.
- Xóa: idempotent 865; đọc lại row sau update để bắt thua CAS 884-892.
- Test (working tree): role matrix 242-264; upload hợp lệ 266-317; CSRF raw origin
  318-325; lỗi đầu vào (reading/slot/length/MIME/tên/413/lệch byte/DB fail) 326-451;
  thua CAS 452-486; thay thành công purge cũ 488-505 (settle); slot chưa có row
  506-528; GET header 529-545; DELETE audio 546-592; DELETE test purge 593-628; 503
  disabled 630-646.

## §Bài tập + bộ đề (#533, #554)

- Bảng: study_pack_exercise (schema study-pack.ts:17-43, status draft/ready :31);
  study_pack (49-76, org nullable + sourcePackId); study_pack_item (81-107, unique
  pack+day+kind+source 96-101); class_study_pack (115-146, partial unique active
  141-144, packId restrict).
- Validate item: study-pack-clone.ts:354-632 — org_prompt chặn tham chiếu chéo org
  377-382; library_test_part: part ready + skill đọc + đúng test 524-556; exercise:
  ready 597-624; trần ngày/mục day-level check :4494-4536 contracts.
- Tuple key `${dayIndex}:${sourceKind}:${sourceId}` :902-908; insert statements giữ
  id cũ :910-940; D1 chunk in-array 50 / chèn item pack 10 / chèn prompt 3 :31-35.
- Test bảo toàn mã mục: admin-library.test.ts:1482-1656 (update giữ id item cũ, xóa
  item biến mất, thêm item mới id mới).
- assign schema: contracts.ts:4687-4714 (gán lớp — thuộc feature study-pack, chỉ
  cross-ref).

## §Client wiring

- repos/library.ts: LibraryHttpError (issues từ 400 NOT_READY) :35-47; libraryRequest
  :96-127; uploadLibraryAudio XHR progress+abort :221-292; query keys :305-315.
- part-form.tsx: banner nhóm hỏng + nút «Lưu đè nhóm hỏng» :804-826; đổi dạng bài giữ
  nội dung câu có sẵn :840-849.
- publish-bar.tsx: chặn trước bằng validateTestReady cùng luật server :42-58; khối
  lý do :116-132; chú giải luật :111-115.
- $testId.tsx: blocker confirm :281-291; invalidate prefix list :294-299; blur save +
  toast :301-314, :552-566; preview :763-776.
- index.tsx: chip lọc skill/status :170-192; empty states :235-268; hộp thoại xóa
  delete-test-dialog.tsx:40-87 («Xóa bộ đề?» + không hoàn tác).
- packs.tsx: JSON textarea + quick adder :102-124; tạo pack :126-161; xóa pack
  :163-174; tạo exercise :176-202; xóa exercise :204-215.
- library-error.ts: map mã → wording :11-27; fallback theo status :39-46.
- apps/admin/src/components/layout/admin-shell.tsx: một mục nav "Thư viện đề" :1-76.

## §Entities + migration

- library_test :16-48 — created_by KHÔNG FK (xóa user không xóa đề) :32-36; index
  (skill,status) :46-47.
- library_test_part :59-103 — FK cascade :63-67; unique (testId,part) :98-101;
  groups JSON mảng phẳng + dải chỉ số :79-85; 5 cột audio :87-91.
- 0043 tạo 2 bảng :1-40; 0044 thêm groups :1-1; 0060 tạo 4 bảng pack + library_ref
  vật hóa + unique org+library_ref :1-79; 0061 :1-1.

## §Tests (R1 — test là bằng chứng hạng nhất)

- admin-library.test.ts:1656 dòng, 29 test: role/CSRF :130-189; SKILL_IMMUTABLE
  :191-225; list/filter :226-334; publish/NOT_READY :407-584; part audio-keep :603-686;
  xóa part/test :687-773; groups corrupt :775-1270; exercises+packs CRUD :1272-1480;
  packs preserve-id #554 :1482-1656.
- admin-library-audio.test.ts:647 dòng, 15 test (§Audio CAS trên).
- e2e reading: 3 test (tạo + soạn + publish :174; part flow :279; preview/publish
  :652) — 1-824.
- e2e listening: 2 test (soạn 4 section + upload audio từng part + publish :106-214;
  regression phát lại :216-313) — 1-326.

## §Working-tree modification (🟡 — bắt buộc ghi nhận)

- `git status --short`: `M apps/server/src/routes/admin-library-audio.test.ts`
  (kèm M .gitignore, M biome.json — 2 tệp này ngoài phạm vi feature, không dùng làm
  bằng chứng; test admin-library chính KHÔNG nằm trong danh sách sửa).
- Diff so với HEAD của tệp audio test: ĐÚNG 2 dòng, cùng thay đổi `audioSize: 4` →
  `audioSize: 16` (seed line ~228, reset line ~306). Không đổi logic test.
- Ý nghĩa: 🟡 — có thể là chỉnh cục bộ chưa xong (nới dữ liệu nền?) hoặc chuẩn bị
  thay đổi liên quan trần/CAS; KHÔNG tự suy ra đáp án → OQ-13. Bằng chứng dùng bản
  working tree như yêu cầu.
- Lệnh kiểm: `git diff HEAD -- apps/server/src/routes/admin-library-audio.test.ts`.

## §Cross-repo hops

- Học viên chỉ thấy đề qua bản vật hóa: student-practice.ts:32-90 (loader đề luyện);
  bản chụp trong quiz-attempt.
- Giao lớp vật hóa: study-pack-clone.ts:354-940 + 0060 library_ref.
- Precedent vocab_library (#361): e2e vocab-library-clone.spec.ts:1-604; header
  comment admin-library.ts:69.

## §Negative searches (R3/R2/R1)

- `grep -rn "\.skip\|\.only\|\.todo" apps/server/src/routes/admin-library.test.ts apps/server/src/routes/admin-library-audio.test.ts apps/e2e/specs/admin-library-*.spec.ts` → 0 match.
- `grep -rn "useTranslation\|i18n" apps/admin/src/components/library apps/admin/src/routes/_auth/library` → 0 match (không có i18n — wording nhảm trực tiếp, R2).
- `grep -rn "from .*library-test" apps/server/src/routes apps/server/src/lib | grep -v admin` → chỉ schema app + clone vật hóa; không app học viên select library_test.
- `grep -rn "AUDIO_CHANGED" apps/server/src/routes/admin-library.test.ts apps/server/src/routes/admin-library-audio.test.ts` → 0 match (code 409 CAS chỉ được khẳng định qua status — GAP-02).
- Tìm code chết/vestigial trong S1: mọi hàm đều có caller (isRawAudioUpload 101→391;
  presetParts 297→460,624,736; toPartDto 244→577,694,509-đường detail); không thấy
  route/hàm không được gọi → không cần mục dead-code riêng.
