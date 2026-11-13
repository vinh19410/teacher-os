---
feature: vocab-hub
type: reverse-evidence
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# _evidence — vocab-hub

Quy ước: trích dẫn chuỗi người dùng là NGUYÊN VĂN (R2) — đã kiểm lại trực
tiếp trên file tại @ d6c0f6b5. Chú thích mã trích lược giữ nguyên tiếng Anh.

## 1. Schema và migration

- packages/db/src/schema/vocab.ts:14-21 — chú thích doctrine xoá (F7), nguyên
  văn hai dòng khóa:
  ```
  * Xoá deck ở server phải xoá tường minh `vocab_deck + vocab_word + vocab_card + vocab_suggestion`
  * trong 1 `db.batch` (không dựa vào FK cascade do PRAGMA foreign_keys theo connection),
  * nhưng giữ nguyên `vocab_review_log` để bảo toàn streak/retention.
  ```
  ✅ khớp BR-05.
- packages/db/src/schema/vocab.ts:53-60 — audio chỉ máy chủ ghi khóa (nguyên
  văn): "`audioKey` do server sinh và gán sau khi giáo viên upload file âm
  thanh lên R2 (`vocab/{orgId}/{wordId}/{uuid}`), client không bao giờ tự
  truyền key." và "`audioUrl` chỉ được ghi bởi luồng clone từ
  `vocab_library_word` (URL CDN được allowlist), KHÔNG bao giờ nhận trực tiếp
  từ input của giáo viên/client."
- packages/db/src/schema/vocab.ts:84-94 — thẻ đa hình + sinh lười + trích
  srs-spec.md: dòng 85 nguyên văn "Trạng thái SRS 5 memory levels của từng học
  viên trên từng từ (`docs/srs-spec.md` §1)." (file KHÔNG tồn tại —
  negative-search #1); dòng 86-87 "Được lazy provision khi học viên mở deck
  lần đầu (`INSERT OR IGNORE` theo unique `(studentId, wordId)`)."; dòng 88-90
  "`wordId` là polymorphic key (không đặt FK cứng sang `vocab_word.id`): trỏ
  tới `vocab_word.id` (bộ từ lớp/gợi ý của giáo viên) hoặc
  `vocab_library_word.id` (`libword-*` thuộc 20 khóa học từ vựng dùng chung —
  #366)." Invariants dòng 91-94: level 1..5; isWarning chỉ true ở level 5;
  intervalDays chỉ hiển thị, lập lịch đọc dueAt. Được gỡ FK bởi migration 0039
  (packages/db/src/migrations/0039_ambiguous_prowler.sql:1-6).
- packages/db/src/schema/vocab.ts:126-131 — nhật ký: "`id` chính là
  `clientLogId` (UUID do client sinh) để đảm bảo idempotency khi retry hoặc
  race condition (`onConflictDoNothing`)."; "KHÔNG đặt FK tới `vocab_card` hay
  `vocab_deck`, đồng thời snapshot `word` + `translation` tại thời điểm ghi
  để lịch sử học, streak và retention sống sót khi giáo viên xoá deck."
- packages/db/src/schema/vocab.ts:159-164 — gợi ý: "1 row duy nhất per
  `(studentId, deckId)` qua `vocab_suggestion_student_deck_uq`; re-suggest
  sau khi dismissed/thu hồi sẽ flip `status` về `'pending'` (upsert)."; "Thu
  hồi bởi giáo viên flip `status = 'dismissed'` (soft, giữ `respondedAt`),
  KHÔNG hard-delete."
- packages/db/src/schema/vocab-library.ts:4-9 — định danh thư viện suy ra từ
  dữ liệu gốc (nguyên văn): "`id` là khóa chính deterministic suy ra từ master
  CSV (`libcourse-<csvId>`) để seed pipeline chạy lại idempotent bằng
  `ON CONFLICT(id) DO UPDATE`."; dòng 6: "Không có `orgId`/`classId`: mọi giáo
  viên thuộc mọi tổ chức đều đọc được."
- packages/db/src/schema/vocab-library.ts:51-57 — clone chỉ chép 5 trường từ
  từ mẫu (word, ipa, translation, audioUrl, sortOrder — nguyên văn dòng 57
  "dù bước clone hiện tại chỉ chép `word`, `ipa`, `translation`, `audioUrl`,
  `sortOrder`"); các trường giàu còn lại (pos, sentenceVi, sentenceEn,
  pictureUrl) giữ cho tương lai.
- Migration 0036 (packages/db/src/migrations/0036_bored_infant_terrible.sql,
  66 dòng): 4 bảng ban đầu — vocab_card có FK word_id và vocab_deck.class_id
  NOT NULL; chú thích deploy-order 1-5.
- Migration 0037 (0037_cheerful_gambit.sql, 48 dòng): #361 — 3 bảng thư viện,
  ALTER vocab_deck ADD source_library_deck_id, ALTER vocab_word ADD audio_url.
- Migration 0038 (0038_wise_blizzard.sql, 45 dòng): #363 — bảng gợi ý + xoá
  và tạo lại vocab_deck với class_id nullable (điệu nhảy PRAGMA foreign_keys
  OFF → recreate → ON).
- Migration 0039 (0039_ambiguous_prowler.sql, 28 dòng): #366 — tạo lại
  vocab_card KHÔNG có FK word_id (wordId đa hình).
- Migration 0040 (0040_deep_oracle.sql, 1 dòng): ALTER vocab_library_deck ADD
  description TEXT.

## 2. Hợp đồng API (packages/api/src/contracts.ts)

- :3090-3094 — chú thích release train (nguyên văn):
  ```
  // RELEASE TRAIN NOTE (#304, #361): All vocab response/request schemas use `.strict()`.
  // `apps/server` and `apps/student` MUST be deployed on the same release train.
  ```
  (BR-14).
- :3096-3099 — VOCAB_DURATION_MAX_MS (kẹp durationMs 1 giờ) và trần proxy 5 MB
  cho audio thư viện phía học viên (ranh giới student-practice):
  `/** Upper bound (5 MB) for proxying remote library audio files (#361). */`
- :3102-3116 — VOCAB_ERROR_CODES 12 mã (bao gồm LIBRARY_* và VOCAB_*).
- :3120-3135 — KernelVocabDeckRow (wordCount, sourceLibraryDeckId) và
  KernelVocabSuggestionRow (KHÔNG có trường status; enum
  pending/accepted/dismissed nằm ở vocabTeacherSuggestionSchema :3398-3406).
- :3137-3138 — `RESERVED_LIBRARY_ID_PREFIX_REGEX = /^(libcourse|libdeck|libword)-/i`;
  refine trong vocabDeckCreateSchema :3144-3149 và vocabWordUpsertSchema :3185-3188.
- :3175-3177 — chú thích red-team F3 (nguyên văn):
  ```
  // Teacher word upsert contract. Note: `audioKey` is intentionally omitted here
  // (red-team F3) — audio keys are generated and set exclusively by the server
  // after a verified upload to `PUT /api/kernel/vocab/words/:wordId/audio`.
  ```
- :3179-3197 — wordUpsert: word 1-200, ipa ≤ 200, translation ≤ 500,
  sortOrder int ≥ 0, `.strict()`.
- :2420-2423 — QUIZ_MEDIA_MAX_BYTES = 50 MB (hằng của Speaking #305, vocab tái
  sử dụng ở vocab-teacher.ts:775 và vocab-word-row.tsx:94).
- :3303-3309 — clone: deckIds tối đa 50.
- :3379-3395 — suggest (note ≤ 500) + revoke.
- :3398-3406 — teacherSuggestion: status enum có đủ 3 giá trị.
- :3422-3466 — progress query/response schemas.

## 3. Route máy chủ

- apps/server/src/routes/vocab-teacher.ts:53-57 — chú thích #359 mount:
  "mounted ONCE under /api/kernel/vocab (the old /api/vocab/* mount was
  dropped)". Khớp kernel.ts:3515-3520 (import :141-142, route :3517, mount :3520).
- :64-81 — readBody: JSON hỏng → 400.
- :135-174 — tạo bộ từ: kiểm tra lớp cùng tổ chức 142-156 → 404; id 157;
  xung đột 500 → 172; 201 → 173.
- :176-206 — đổi tên: đầy đủ nhưng không UI gọi (negative-search #2).
- :208-275 — xoá bộ từ: chú thích doctrine 209-212; bộ từ lạ 404 220-232;
  batch: card NOT LIKE 'libword-%' 246-250 → suggestion 251-253 → word → deck;
  biến thể batch rỗng 261-271; thực thi 273.
- :277-337 — GET suggestions: 404 288-293; status lạ quy về pending 320-323.
- :339-454 — POST suggestions: nạp song song deck+student 346-377 → 404;
  ghi chú 379-380; idempotent 200 397-400; dismissed → pending flip (reset
  note/teacherId/createdAt/respondedAt) 401-413; INSERT 201 416-438; đua tranh
  → select 200 / 500 440-453.
- :456-496 — revoke: 404 474-482; chú thích soft flip 484-487 — GIỮ
  respondedAt.
- :498-652 — progress: 400 thiếu studentId 501-504; 404 507-514; "hôm nay"
  +07:00 516-527; cửa sổ 7 ngày = hôm nay − 6 525-527; bucketing hoạt động
  569-599; phân bố cấp 601-637; trả về 639-651.
- :654-712 — upsert từ: 404 661-673; UPDATE 676-698; INSERT 700-711.
- :714-749 — xoá từ: join 404 721-735; batch loại trừ libword-* 737-747.
- :751-840 — PUT audio: chú thích F3 751-754; 503 759-762; 411 764-771; file
  rỗng 400 772-774 + 811-814; 413 775-777; MIME 415 779-791 (9 loại 41-51);
  từ 404 794-809; khóa `vocab/{orgId}/{wordId}/{uuid}` 816; lệch độ lớn 400
  819-825; ghi khóa 827-833; xoá khóa cũ 835-837.
- :842-880 — GET audio: 503 846-849; 404 862-875; trả `{word}.mp3` 876-879.
- apps/server/src/routes/vocab-library.ts:21-24 — MAX_CLONE_DECKS=50,
  MAX_CLONE_STATEMENTS=500; :26-31 cloneRawEnvelopeSchema; :32-43 chú thích
  mô-đun (nguyên văn): "Browse endpoints (`GET /courses`,
  `GET /courses/:courseId/decks`, `GET /decks/:deckId/words`) are intentionally
  global across all authenticated teacher orgs." và "`POST /clone` is
  org-scoped: verifies `classId` belongs to `ctx.orgId` before touching any
  library table, enforces deduplication and statement caps, and writes cloned
  `vocab_deck` + `vocab_word` rows in a single `db.batch`."
- :47-81 courses; :83-141 decks (404 95-103); :143-202 words (404 158-166,
  limit clamp 168-174).
- :204-364 clone: thân 400 208-218; deckIds trùng 400 220-230; lớp IDOR 404
  234-245; trần lần 1 422 246-257; bài thiếu 404 265-273; trần lần 2 422
  281-292; trùng báo cáo không chặn (isNull cho đích hub) 294-312; map uuid
  314-318; batch: deck insert lang "en" 326-337 + word insert audioKey null
  338-351; batch 354; 201 {id, added, duplicates} 356-363.
- apps/server/src/routes/snapshot.ts:386-410 — truy vấn vocab; suggestions
  CHỈ PENDING 396-410; chiếu 833-848 (wordCount đếm từ dữ liệu thật).
- apps/server/src/lib/vocab-provision.ts:72-108 — chú thích RT-F1 (#363):
  tiếp cận = lớp hiệu lực ∪ gợi ý accepted ∪ thư viện-có-thẻ; :110-247 — nạp
  3 nguồn + độ ưu tiên class > suggested > library 200-238; thư viện đi qua
  vocabCard → libword → libdeck → libcourse 168-197.
- apps/server/src/app.ts:224-241 — student 403, admin 403; :245-266 —
  TEACHER_EMAILS allowlist.

## 4. Chữ người dùng (R2 — nguyên văn, đã kiểm lại)

- Hub (routes/_auth/vocab/index.tsx): tiêu đề "Từ vựng"; kicker
  "{count} BỘ TỪ · {n} RIÊNG · {n} GỢI Ý CHỜ" (dạng mono chữ hoa); tab
  "Bộ từ vựng" / "Tiến độ" (:29-36).
- deck-list (vocab-deck-list.tsx): nhãn nhóm "Từ vựng SRS" (:178); nút
  "Thêm từ thư viện" / "Tạo bộ từ" (:186-191); huy hiệu "Riêng" (:205),
  "Lớp {tên}" (:206), "Thư viện" (:50), "{n} chờ" (:58), "{n} từ · {lang}"
  (:63); hộp tạo "Tạo bộ từ vựng mới", placeholder "Ví dụ: Topic 1: Environment"
  (:254), lời dẫn khác nhau theo chế độ; hộp xoá "Xoá bộ từ vựng?" (:259-287)
  với cảnh báo giữ lịch sử ôn tập (:284-285); toast xoá `Đã xoá bộ từ "${title}".`
  (:170); rỗng hub: "Chưa có bộ từ vựng nào. Tạo bộ từ mới hoặc thêm từ thư
  viện để gợi ý cho học viên." — rỗng lớp: "Chưa có bộ từ vựng nào cho lớp
  này. Tạo bộ từ để học sinh học và ôn tập theo 5 cấp độ trí nhớ." (:194-199).
- editor (vocab-deck-editor.tsx): "Soạn từ vựng" (:147); 3 cột "Từ vựng" /
  "IPA" / "Nghĩa tiếng Việt" (vocab-word-row.tsx:45,60,75); "+ Thêm từ" (:195); "Thử lại"
  (:171-173); "Từ vựng không được để trống." (:78); "Không upload được file
  âm thanh phát âm." (:136).
- word-row (vocab-word-row.tsx): "Đã có audio" (:89); nhãn max bytes (:94);
  hint "MP3/M4A/WAV · tối đa 50 MB" (:96); nút (:109,:118).
- library-dialog (vocab-library-dialog.tsx): "Chọn theo lượt" (:452); cảnh báo
  trần "Vượt giới hạn 1 lượt (tối đa {n} bộ và tổng số bộ + từ ≤ {m}). Vui
  lòng bỏ chọn bớt bài." (:306-314); chọn nhanh tràn "Đã chọn tối đa {n} bài
  cho 1 lượt — còn {k} bài, hãy thêm tiếp ở lượt sau." (:229); thành công
  "Đã thêm {n} bộ từ." / "Đã thêm {n} bộ từ vào lớp." / với trùng
  "(k bài đã có trong hub từ trước)" / "(k bài đã có trong lớp từ trước)"
  (:250-259); committed "Đã lưu nhưng chưa xác nhận danh sách — vui lòng tải
  lại trang." (:267-269); thất bại "Không thể thêm bộ từ ({lý do})." /
  "Không thể thêm bộ từ." / "Không thể thêm bộ từ vào lớp." (:274-282); không
  rõ "Không rõ kết quả mạng — hãy kiểm tra danh sách bộ từ trước khi thử lại."
  (:285-287); chip "Đã có trong hub" / "Đã có trong lớp" (:519-528).
- suggest-dialog (vocab-suggest-dialog.tsx): STATUS_LABELS "Đang chờ" /
  "Đã chấp nhận" / "Đã ẩn" (:10-14); "Đã gửi gợi ý bộ từ vựng cho học viên."
  (:164); "Đã thu hồi gợi ý bộ từ vựng." (:182); nút "Thu hồi" (:77); lời dẫn
  "Học viên được gợi ý sẽ thấy bộ từ trong mục "Gợi ý cho bạn" trên cổng học
  viên (không bắt buộc)." (:218-221); "Chưa có học viên nào trong trung tâm."
  (:224); rỗng "Chưa gợi ý bộ từ này cho học viên nào." (:284); tiêu đề hộp
  "Gợi ý bộ từ · {tên bộ}" (:194); maxLength 500 (:261).
- progress-tab (vocab-progress-tab.tsx): huy hiệu "Lớp {tên}" / "Lớp học" /
  "Khóa {tên}" / "Thư viện" / "Gợi ý" (:38-46); dòng "Đang học {x}/{tổng} từ
  · Chưa học {n} từ" + " · Học gần nhất {ngày}" (:47-53); "Đến hạn hôm nay:
  {n}" (:66); dải "Cấp 1".."Cấp 5" (:71-108); "Hoạt động 7 ngày (giờ Việt
  Nam)" (:332); "Bộ từ vựng của học viên" (:364); rỗng org "Chưa có học
  viên nào trong trung tâm để theo dõi tiến độ." (:217); rỗng bộ "Học viên
  chưa có bộ từ vựng nào (chưa vào lớp có bộ từ hoặc chưa nhận gợi ý)."
  (:364-371).

## 5. Web wiring

- apps/web/src/lib/data-actions.ts:293-344 — 8 kiểu hành động: create /
  rename / delete / word-upsert / word-remove / audio / suggest / revoke /
  clone-vocab-library-decks.
- apps/web/src/lib/repos/kernel.ts:310-352 — ánh xạ từng hành động → đường
  POST; :380-381 nạp slice vocab từ bản chụp; :564,:573 khóa slice.
- apps/web/src/lib/data-store-reducer.ts:361-362 — mặc định no-op (không biến
  đổi dòng vocab cục bộ).
- sidebar.tsx:88-105 — nhóm "IELTS" chứa mục "Từ vựng" (:103); :201 active-key;
  test sidebar.test.tsx:161,172.
- routes-matcher.ts:33 — /vocab trong danh sách route SW.
- app-shell.tsx:31+ — ROUTE_CRUMBS không có /vocab.
- $classId.tsx:26 (dùng vocab-deck-list), :315-322 (tab).
- search-index.ts:174-190 — teacherNavForViewer sinh mục điều hướng (không có
  literal "vocab" — chữ đến từ sidebar).

## 6. Bảng nhảy chéo repo (cross-repo hops)

| Từ | Đến | Qua đâu | Bằng chứng |
|---|---|---|---|
| apps/server (route) | packages/api (hợp đồng) | import zod schema + mã lỗi | ✅ vocab-teacher.ts:1-36 import @teacher-os/api |
| packages/api | packages/db (schema) | tên bảng/cột trùng khớp ở snapshot + route | ✅ snapshot.ts:386-410 vs schema/vocab.ts |
| apps/server | apps/web (client) | dispatch action → POST → snapshot refresh | ✅ data-actions.ts:293-344 + repos/kernel.ts:310-352 |
| apps/web | apps/server (release coupling) | hợp đồng `.strict()` buộc phát hành cùng lúc | ✅ contracts.ts:3090-3095 + runbook :899-924 |
| packages/db (seed) | apps/server (thư viện) | bảng thư viện nạp bởi seed, đọc bởi route read-only | ✅ seed/vocab-library.ts + vocab-library.ts:32-43 |
| packages/db (migrations) | docs (runbook) | 3 migration vocab có mục vận hành riêng | ✅ runbook :899-924 vs 0037/0038/0039 |
| teacher feature | student feature (khác) | dùng chung bảng + predicate tiếp cận; route riêng | ✅ vocab-provision.ts:72-108 + student.ts:90,2407 |
| teacher feature | admin feature (#413, khác) | trùng chữ "library", khác bảng + route | ✅ tech-debt.md:121 |

## 7. R1 — Đào test (test-mining)

Đếm bằng `grep -n "it("` trên file test @ d6c0f6b5:

| File | Số it | Dòng it |
|---|---|---|
| apps/server/src/routes/vocab-teacher.test.ts | 5 | 146 (CRUD+audio+snapshot+xoá-hàng-loạt+PRAGMA OFF+415), 336 (xoá từ), 401 (chéo tổ chức), 453 (suite gợi ý + tiến độ thư viện), 708 (tiền tố dành riêng + progress) |
| apps/server/src/routes/vocab-library.test.ts | 6 | 211 (401×4), 239 (duyệt+404), 336 (guards), 378 (trần 422), 438 (nhân bản + tái-nhân-bản trùng), 543 (đích hub) |
| packages/db/src/schema/vocab.test.ts | 3 | 14 (0038), 200 (migrator), 219 (0039) |
| packages/db/src/seed/vocab-library.test.ts | 7 | 34..553 |
| apps/web/src/components/vocab/vocab-hub.test.tsx | 2 | 21 (tạo bộ hub thân đích rỗng), 115 |
| apps/web/src/components/vocab/vocab-library-dialog.test.tsx | 3 | 25, 226 (trần), 320 (URL thư viện hiện "Đã có audio") |
| apps/e2e/specs/vocab-hub-suggestion.spec.ts | 3 | — |
| apps/e2e/specs/vocab-library-clone.spec.ts | 3 | — |
| apps/e2e/specs/vocab-srs.spec.ts | 3 | — |

- Không skip/todo/only (negative-search #7). Kết quả chi tiết khớp SM-01..SM-10.
- **Git-status khi soạn (2026-11-12)**: `git status --porcelain` chỉ cho
  .gitignore, biome.json, apps/server/src/routes/admin-library-audio.test.ts
  (feature admin #413 — KHÔNG thuộc vocab-hub) và các file
  __tmp__materials-check__* của agent song song. `git status --porcelain |
  grep -iE "vocab"` chỉ trả đúng file admin nêu trên. Mọi trích dẫn trỏ vào mã
  clean @ d6c0f6b5. ✅

## 8. Ranh giới (boundary)

- Học/ôn của học viên — Learn/Review, accept/dismiss, sinh thẻ lười, proxy
  audio 5 MB: thuộc student-practice. Feature này CHỈ: (a) phơi dữ liệu đầu
  vào qua bản chụp (snapshot.ts:386-410); (b) tạo gợi ý trạng thái pending;
  (c) dùng chung predicate tiếp cận để tổng hợp tiến độ. Bằng chứng ranh giới:
  route học viên mount ở app học viên, không phải kernel (student.ts:90,2407);
  e2e SRS (vocab-srs.spec.ts:50-665) chạy trên cổng/app học viên; mã lỗi
  SUGGESTION_ALREADY_ACCEPTED nằm ở route học viên (routes/vocab.ts:861).
- Ngân hàng đề thi IELTS của admin (#413): cùng chữ "library", khác bảng và
  route (tech-debt.md:121) — không trộn vào assembly này.
- Seed thư viện: chạy ngoài app (scripts), PROD khóa gate giấy phép
  (seed/vocab-library.ts:7-11; README-seed :1-63; runbook :903).
