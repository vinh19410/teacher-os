---
feature: materials
type: reverse-evidence
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# _evidence — materials

Bằng chứng thô theo hạng mục. Cite dạng `repo-relative/path:line`; range đã kiểm
EOF bằng awk END NR và nội dung bằng sed/grep.

## §R1 test-mining (không chạy test — chỉ grep)

- Phương pháp đếm active: `grep -oE "(^|[^a-zA-Z0-9_.])(test|it)\(" <file> | wc -l`.
- apps/server/src/routes/materials.test.ts → **35** (wc -l 2590).
- apps/web/src/routes/_auth/materials/index.test.tsx → **15** (449).
- packages/api/src/material-contracts.test.ts → **15** (466).
- apps/server/src/lib/material-file-response.test.ts → **5** (184).
- apps/server/src/lib/session-curriculum-materials.test.ts → **9** (417).
- apps/web/src/components/materials/material-picker.test.tsx → **5** (204).
- apps/web/src/components/class-detail/session-materials-modal.test.tsx → **5** (217).
- apps/student/src/components/class/lesson-materials.test.tsx → **7** (171).
- e2e: material-bank 1, materials-at-session-create 2, material-upload-student 1,
  655-screenshots 1 → **5**.
- Skip/only/todo: `grep -rEn "\.(skip|only|todo)\("` trên 9 file → **0 hit**.
- git status working tree: các nguồn materials KHÔNG nằm trong danh sách sửa
  (chỉ .gitignore, apps/server/src/routes/admin-library-audio.test.ts, biome.json
  bị sửa — không thuộc feature này; docs/_reverse/, .claude/, _templates/ là
  untracked). → không cần ghi chú 🟡 lệch working-tree cho nguồn materials.

## §Schema & migration

- material_folder: id PK text; org_id NOT NULL FK organization cascade; parent_id
  FK tự tham chiếu "no action"; name NOT NULL; created_at timestamp_ms default
  unixepoch ms. Comment: "Tên duy nhất trong cùng một cha (coalesce vì SQLite
  coi mọi NULL là khác nhau trong unique index). Độ sâu tối đa (5) và chống vòng
  lặp được khóa nguyên tử bằng SQL WITH RECURSIVE ngay trong route (#646). FK
  cha là NO ACTION: thư mục chỉ xoá được khi rỗng…" —
  packages/db/src/schema/material.ts:16-48 (index :41, unique :42-46).
- material: comment "…cả hai có object trong bucket private `materials` theo key
  `<orgId>/<materialId>` — hoặc `link` (URL http/https ngoài). `objectKey` và
  `createdBy` là cột teacher-only, không bao giờ chiếu sang /api/student. Tài
  liệu đang gắn vào buổi học không xoá được (FK từ `lesson_material`)." —
  packages/db/src/schema/material.ts:50-91 (CHECK kind_shape :86-89; 2 index
  :84-85).
- lesson_material: PK (class_id, date, material_id); comment "Buổi học là nhóm
  dòng lesson cùng (classId, date) nên liên kết theo cặp đó… dời buổi kéo theo
  `date` ở đây" — packages/db/src/schema/material.ts:93-127 (position default 0
  :114; 2 index :124-125).
- syllabus_lesson_material: PK (syllabus_lesson_id, material_id); comment #655
  "Copy template → lớp copy cả links (remap syllabusLessonId, giữ materialId —
  ngân hàng là tài nguyên org dùng chung)" — packages/db/src/schema/material.ts:129-164.
- Migration 0066 hand-edited: "the folder-name unique index keeps coalesce
  (parent_id, '') as a real expression (drizzle-kit split it on the comma) so
  root folders (parent NULL) are unique too" —
  packages/db/src/migrations/0066_class_materials.sql:1-4; CHECK :38; unique :54.
- Migration 0068 tạo syllabus_lesson_material + FK material no action —
  packages/db/src/migrations/0068_salty_impossible_man.sql:1-14.

## §Route server (S1)

- Gate: thiếu kernelCtx → 401 "unauthorized"; GET/HEAD → canReadMaterials, còn
  lại canWriteMaterials; fail → 403 FORBIDDEN; gate gắn cho cả 4 mẫu đường —
  apps/server/src/routes/materials.ts:161-174.
- readBody: 415 "content-type must be application/json"; 400 "invalid json";
  400 "invalid body" — :176-203.
- usageCountColumn: đếm lesson_material theo material.id — :67-68. materialUsage:
  đếm CẢ lesson_material lẫn syllabus_lesson_material (#655) — :265-286.
- storeUpload: Content-Length phải số; checkMaterialUpload (type→415, size→413
  kèm maxBytes, khác → 400 INVALID_FILE); X-File-Name decode + sanitize;
  materialExtensionMatches fail → 415; peekStream min(64, size+1); ended/size lệch
  → 400; matchesMaterialMagic fail → 415; id = crypto.randomUUID(); key =
  `<orgId>/<id>`; store.put lỗi mismatch → 400, khác → 500 "upload failed";
  discard = xóa object nền — :302-432.
- isHolidayBucket (#645): đếm lesson holiday vs non-holiday cùng (org, class,
  date); class_session tại cùng ngày chặn coi là all-holiday (#658) — :434-475.
- isShiftedHolidayBucket (#662): all-holiday + class_session + shift row —
  :477-534. holidayBucketDateGuard: CASE trả NULL để NOT NULL violation fail —
  :536-550. Comment liệt kê 6 bề mặt — :477-486.
- resolveSession: parseStartDateStrict → 400; lớp không thuộc org → 404
  CLASS_NOT_FOUND; rejectHoliday → 409 SESSION_HOLIDAY; requireLesson=false bỏ
  qua đòi lesson; buổi = lesson HOẶC class_session (#658) → 404 SESSION_NOT_FOUND —
  :552-613.
- loadSessionMaterials: innerJoin material cùng org, orderBy position, createdAt,
  id — :615-653. nextPosition: coalesce(max,-1)+1 tính trong INSERT — :655-657.
- folderMoveGuard + insertChildFolder: WITH RECURSIVE anc/sub, điều kiện max(depth)
  + max(level) ≤ 5; CTE sub loại cạnh quay về chính id để cho tự phục hồi —
  :677-756. classifyCreateBlock / classifyMoveBlock: FOLDER_NOT_FOUND /
  FOLDER_CYCLE / FOLDER_TOO_DEEP — :758-792.
- POST folders: earlyBlock → nameTaken 409 → insert gốc hoặc insert con nguyên
  tử; fail → classify → thử lại 1 lần → classify lần 2 → 409 "concurrent folder
  conflict"; catch: nameTaken lại → 409 — :800-855.
- PATCH folders/:id: không đổi gì → trả nguyên; move guard trong WHERE của
  UPDATE; thua race → classify → retry → classify → 409; catch: đọc lại, nameTaken
  với tên/cha mới → 409 — :857-950.
- DELETE folders/:id: folderExists → 404; isEmpty (con + tài liệu) → 409
  FOLDER_NOT_EMPTY; catch FK → isEmpty lại → 409 hoặc throw — :952-985.
- GET /materials: q > 100 → 400 "invalid q"; kind lạ → 400 "invalid kind";
  folderId "root" → isNull; orderBy updatedAt desc, id asc; lọc JS
  normalize NFC + toLocaleLowerCase("vi") trên title/description/originalName
  (comment: lower() SQLite chỉ ASCII, "Đề" không khớp "đề") — :989-1030.
- GET /materials/:id → 404 MATERIAL_NOT_FOUND — :1032-1041.
- POST /materials/links: checkFolder 404; insert kind "link", createdBy = ctx.userId
  → 201 — :1043-1065.
- PUT /materials/files: store undefined → 503 MATERIALS_DISABLED; folderId từ
  query; upload fail → trả; insert fail → discard + folder vẫn còn? 404 :
  500 "upload failed" — :1067-1098.
- PATCH /materials/:id: checkFolder khi có folderId; set 3 trường + updatedAt =
  now; RETURNING id rỗng → 404 — :1100-1133.
- DELETE /materials/:id: loadMaterial 404; usage > 0 → 409 MATERIAL_IN_USE kèm
  sessionCount + syllabusCount; objectKey ≠ null mà không có store → 503; delete
  catch → đếm lại → 409 hoặc throw; store.delete sau, lỗi chỉ log — :1135-1180.
- GET /materials/:id/file: store 503; row không có objectKey → 404;
  materialFileResponse với Range + download=1 — :1182-1203.
- GET sessions materials: resolveSession (không rejectHoliday); items +
  curriculumMaterials dedupe direct ưu tiên (#655) — :1205-1230.
- POST attach: rejectHoliday=true; isShiftedHolidayBucket → 409; loadMaterial
  404; holidayGuard trong values.date; onConflictDoNothing; catch → isHoliday ||
  shifted → 409, material mất → 404, khác throw; inserted rỗng → 409
  ALREADY_ATTACHED; 201 item — :1232-1293.
- PUT sessions files: store 503; rejectHoliday; shifted → 409; checkFolder;
  storeUpload; db.batch([insert material, insert lessonMaterial với guard]) —
  một batch nguyên tử; catch → discard + map 409/404/500 — :1295-1356.
- DELETE session material: requireLesson=false + rejectHoliday=true (comment:
  gỡ không cần còn lesson; nhưng holiday không gỡ); delete → rỗng → 404
  NOT_ATTACHED — :1358-1386.

## §Phục vụ file (S11-S14)

- STRICT_CSP = "default-src 'none'; frame-ancestors 'none'; sandbox";
  INLINE_MEDIA_CSP cho media inline (media-src 'self', style-src unsafe-inline,
  sandbox allow-same-origin, KHÔNG allow-scripts) —
  apps/server/src/lib/material-file-response.ts:14-25.
- LOCKED_HEADERS: nosniff, COOP same-origin, no-referrer, private no-store,
  Accept-Ranges — :27-34.
- Range 1 dải; parse fail → 416 + Content-Range bytes */total; store.get với
  range → 206; MIME không trong allowlist → application/octet-stream; inline
  chỉ khi kind media + không download — :50-112.
- MediaStore.put đòi size đúng (MediaSizeMismatchError); enforceDeclaredSize đếm
  byte thật, vượt/thiếu đều lỗi — apps/server/src/lib/media-store.ts:20-74.
- R2 adapter: FixedLengthStream(size), get range, delete —
  apps/server/src/lib/r2-media-store.ts:7-48.
- peekStream: đọc tối đa maxBytes đầu, phát lại buffer, chống empty-chunk stall
  (16), thuần Web Streams — apps/server/src/lib/peek-stream.ts:1-17,47-66.

## §Hợp đồng (S4)

- MATERIAL_KINDS = ["file","link","media"]; MATERIAL_DOC_MAX_BYTES = 25 MiB;
  MATERIAL_MEDIA_MAX_BYTES = 95 MiB (comment #647 edge 100 MB, Business ≥ 200 MB);
  TITLE 200, DESCRIPTION 1000, URL 2000, FOLDER_NAME 100, FOLDER_MAX_DEPTH 5 —
  packages/api/src/material-contracts.ts:11-33.
- MATERIAL_MIME 10 mục: pdf/png/jpeg/webp/docx/pptx/xlsx (file), mpeg/mp4-audio/
  mp4-video (media) — :40-62. Extension map + MIME aliases — :67-93.
  BANNED_FTYP_BRANDS (qt/heic/avif…) — :102-113. MATERIAL_MAGIC_PEEK_BYTES = 64 —
  :115-116.
- matchesMaterialMagic: PDF %PDF-1.x/2.x; PNG 8-byte; JPEG ffd8ff; WEBP RIFF;
  OOXML PK zip (method 0/8, nameLen>0); MP3 ID3v2.3-2.4 hoặc sync frame; MP4/M4A
  ftyp brand hợp lệ, size box 16-4096, brand in ASCII 0x20-0x7e — :191-301.
- checkMaterialUpload: MIME chuẩn hóa → entry; media max 95 MiB, file 25 MiB;
  size phải nguyên > 0 — :303-330.
- isSafeMaterialUrl: URL parser, chỉ http:/https: — :332-341.
- Schema: folder create (name 1-100 + cấm ký tự điều khiển \p{Cc}\p{Cf}, parentId
  nullable default null).strict(); folder update (name|parentId, "nothing to
  update"); link create (title/description/url/folderId).strict(); update
  (title|description|folderId); attach {materialId}.strict() — :343-420.
- MATERIAL_ROOT_FOLDER = "root"; MATERIAL_SEARCH_MAX = 100 — :422-424.
- MATERIAL_ERROR_CODES 16 mã — :426-444.
- Views: MaterialFolderView, MaterialView (12 trường, usageCount),
  LessonMaterialView (+position, attachedAt), StudentLessonMaterialView (9
  trường, không objectKey/createdBy/folderId/usageCount), SyllabusBankMaterialRef
  = StudentLessonMaterialView — :446-497.

## §Client (S3, S5-S10, S29)

- Trang: MaterialsSearch {q, kind, folderId}; validateMaterialsSearch chuẩn hóa;
  debounce 300ms useEffect setTimeout; missingFolder card "Thư mục này không còn
  tồn tại." + "Xem tất cả tài liệu"; kindCounts tính client; empty 2 bản sao theo
  canWrite — apps/web/src/routes/_auth/materials/index.tsx:65-98,161-208,317-385.
- PageHead action + nút rỗng: "Thêm liên kết", "Tải file lên" chỉ khi canWrite —
  :219-240,367-383.
- Dòng item: badge "Dùng ở N buổi" / "Chưa dùng ở buổi nào"; Sửa/Xóa aria-label
  `Sửa ${title}` — :388-448.
- FolderPanel: "Thư mục mới" (create con trong selectedFolder), "Đổi tên",
  "Di chuyển", "Xóa thư mục"; indent kẹp MATERIAL_FOLDER_MAX_DEPTH - 1; empty
  "Chưa có thư mục…" — :503-665.
- useMaterialWrite: onError 401 → reauth; 404/409 hoặc FOLDER_CYCLE/FOLDER_TOO_DEEP
  → invalidate cụm; onSuccess toast + invalidate materialsAllQueryKey —
  apps/web/src/components/materials/material-dialogs.tsx:36-75.
- FolderDialog: tên rỗng → "Nhập tên thư mục."; >100 → "Tên thư mục tối đa 100
  ký tự."; move exclude subtree (folderSubtreeIds); toast "Đã tạo thư mục." /
  "Đã đổi tên thư mục." / "Đã di chuyển thư mục." — :118-250.
- LinkDialog: "Nhập tiêu đề tài liệu."; isSafeMaterialUrl → "Liên kết phải bắt
  đầu bằng http:// hoặc https://." — :252-344.
- UPLOAD_HELP = "PDF, PNG/JPG/WEBP, DOCX/PPTX/XLSX tối đa 25 MB; MP3/M4A/MP4 tối
  đa 95 MB." — :346-348.
- UploadDialog: pick() kiểm ngay khi chọn; submit không file → "Chọn một file
  để tải lên."; accept list khớp allowlist — :350-433.
- EditMaterialDialog: title bắt buộc; gửi title/description/folderId sau trim —
  :435-511.
- DeleteDialog: "Xóa “{tên}” khỏi ngân hàng tài liệu? Không thể hoàn tác." /
  "Xóa thư mục “{tên}”? Chỉ xóa được thư mục rỗng." — :513-574.
- Repo: request() parse JSON body lỗi thành MaterialRequestError (code,
  sessionCount, syllabusCount, maxBytes); materialErrorMessage switch 16 mã +
  fallback 413/403/400/khác; prepareMaterialUpload dùng resolveMaterialMimeType +
  checkMaterialUpload; uploadInit PUT raw + X-File-Name encodeURIComponent —
  apps/web/src/lib/repos/materials.ts:35-135,141-271.
- Query keys: materialsAll ["materials"], folders, list(params), session(classId,
  date); materialFileUrl(id, download) → /api/materials/:id/file?download=1 —
  :273-293,401-404.
- useCanWriteMaterials: đọc viewer.role từ cache kernelQueryKey, fallback
  "teacher", canWriteMaterials — :470-490.
- material-item: MATERIAL_KIND_LABELS {file: File, link: Liên kết, media:
  Audio/Video}; materialMeta: link → hostname; file/media → "nhãn · dung lượng";
  MaterialOpenActions: link → mở tab mới noopener; media → Phát (inline) + Tải
  xuống (download=1); file → chỉ Tải xuống — apps/web/src/components/materials/material-item.tsx:18-107.
- material-folders: flattenFolderTree (cha-mất → về gốc; chu trình → rootNode về
  depth 0); folderSubtreeIds; folderPath "Cha / Con" —
  apps/web/src/lib/material-folders.ts:13-105.
- session-materials-modal: view list|pick (canWrite khóa list); attach/detach/
  upload mutations + toast "Đã gắn tài liệu vào buổi học." / "Đã gỡ tài liệu
  khỏi buổi học." / "Đã tải lên và gắn vào buổi học."; curriculum section nhãn
  "Copy theo bài của buổi — thêm/gỡ ở giáo trình của lớp." + Badge "Từ giáo
  trình"; empty "Chưa có tài liệu nào cho buổi này…" —
  apps/web/src/components/class-detail/session-materials-modal.tsx:36-283.
- MaterialPicker: cap MATERIAL_LINKS_MAX = 20; upload nhanh folderId null
  ("File tải lên được lưu vào ngân hàng tài liệu (Chưa xếp thư mục)."); toast
  "Đã tải lên ngân hàng tài liệu." — apps/web/src/components/materials/material-picker.tsx:201-363.
- MaterialBankBrowser: duyệt thư mục + tìm kiếm debounce 300ms; dòng đã-gắn
  khóa nút; atCap khi maxSelected — :63-199.

## §Học viên (S16, S32)

- Guard: enrollment active + lesson ngày đó (join) → 404 "session not found" —
  apps/server/src/routes/student-materials.ts:42-71,73-75.
- GET list: projection 9 trường không teacher-only + curriculumMaterials dedupe —
  :76-130. GET file: qua lessonMaterial hoặc qua curriculum id (resolve lại
  danh sách rồi tìm id) → materialFileResponse — :132-219.
- UI học viên: icon theo loại (link/video/audio/file), formatFileSize thập phân,
  mở/tải qua lessonMaterialFileUrl — apps/student/src/components/class/lesson-materials.tsx:1-60.

## §Hạ tầng & quyền (S17-S21)

- MATERIAL_WRITE_ROLES = [teacher, owner, admin, class_teacher]; READ +ta;
  comment "#646 … tách độc lập hoàn toàn khỏi GRADING_*" —
  packages/auth/src/role.ts:144-177.
- Mount: `kernel.route("/", materialRoutes(deps))` —
  apps/server/src/routes/kernel.ts:3494; CSRF middleware Origin/JSON :185-206.
- app.ts: getMaterialsStore?() docs "Vắng mặt → route upload/tải file tài liệu
  trả 503 MATERIALS_DISABLED; link và metadata vẫn hoạt động"; mount học viên
  `app.route("/api/student", studentMaterialRoutes(deps))` :446; runInBackground
  :115-121 — apps/server/src/app.ts:84-121,446.
- index.ts: getMaterialsStore → env.MATERIALS → createR2MediaStore (cache) —
  apps/server/src/index.ts:125-129.
- infra: `export const materials = Cloudflare.R2.Bucket("materials", {})` +
  bind MATERIALS — packages/infra/alchemy.run.ts:195-209.

## §Cross-repo hops

| Từ | Đến | Bằng chứng |
|---|---|---|
| Trang web (dialog) | repo client | apps/web/src/components/materials/material-dialogs.tsx:19-32 (import repos/materials) |
| repo client | HTTP | apps/web/src/lib/repos/materials.ts:297-468 (mọi fetch/PUT/DELETE đường /api/materials, /api/classes/…/materials) |
| HTTP | server route | apps/server/src/routes/kernel.ts:3494 → apps/server/src/routes/materials.ts:151-1389 |
| server upload | kho object | apps/server/src/routes/materials.ts:406 → apps/server/src/lib/media-store.ts (interface) → apps/server/src/lib/r2-media-store.ts:7-48 (R2) / apps/server/src/index.ts:125-129 (binding) |
| server đọc buổi | giáo trình | apps/server/src/routes/materials.ts:1222 → apps/server/src/lib/session-curriculum-materials.ts:124-174 → schema syllabus |
| học viên | cùng hợp đồng view | apps/server/src/routes/student-materials.ts:1-15 → packages/api/src/material-contracts.ts:476-497 |
| snapshot | links giáo trình | apps/server/src/routes/snapshot.ts:451-477 (boundary — feature Syllabus đọc) |
| picker | form lớp/bài học | apps/web/src/components/modals/add-class-session-modal.tsx:1-3,165; apps/web/src/components/modals/add-lesson-modal.tsx:1-3,70-73 (boundary) |

## §Ranh giới feature (tránh trộn)

- syllabus-content-routes: ghi syllabus_lesson_material (thêm/xóa links của bài)
  — dedupe + validate org-scoped, 422 "material-not-found" — thuộc feature
  Syllabus: apps/server/src/routes/syllabus-content-routes.ts:63-109,312-349.
- holidays.ts: khi áp shift/hủy buổi, xóa lesson_material ngày makeup — thuộc
  feature Lịch/Nghỉ lễ: apps/server/src/routes/holidays.ts:377-381.
- add-class-session-modal / add-lesson-modal / edit-lesson-modal: gửi materialIds
  trong payload tạo buổi/bài (cap 20) — thuộc feature Lớp học/Syllabus:
  apps/web/src/components/modals/add-class-session-modal.tsx:94,165;
  packages/api/src/contracts.ts:256,271,1764.
- MediaStore dùng chung: library audio (LIBRARY_AUDIO), exam imports (MEDIA),
  speaking (#305) — cùng interface khác bucket:
  apps/server/src/index.ts:111-137; packages/infra/alchemy.run.ts:195-209.
- study-pack schema: chữ "material" trong comment là "tài liệu" của bộ đề, không
  FK tới bảng material — packages/db/src/schema/study-pack.ts:14.
