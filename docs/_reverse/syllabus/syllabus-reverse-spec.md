---
type: reverse-srs
feature: syllabus
status: draft
updated: 2026-11-11
confidence_summary: "✅429 🔵11 🟡24 — OQ 8 (đếm theo luật batch: loại dòng legend/front-matter/meta)"
links: "[reverse-sources.md](./reverse-sources.md) · [reverse-gaps.md](./reverse-gaps.md) · [_evidence.md](./_evidence.md) · [srs/](./srs/) · [usecases/](./usecases/)"
---

# syllabus — SRS tái lập (reverse)

> Trạng thái: `draft` (tái lập, chưa duyệt). Nhãn: ✅ chắc chắn (code khẳng định) · 🔵 suy đoán (≥2 chỗ code hậu thuẫn) · 🟡 cần xác nhận (vì sao/mục tiêu/priority — code không nói).

## 0. Truy vết nguồn & độ tin cậy

- **Nguồn:** xem [`reverse-sources.md`](./reverse-sources.md) — 40 nguồn (S1–S40): route server, lib copy, schema DB, contracts zod, 2 màn hình UI web, modals/components, snapshot read-side, migrations, và 16 file test (e2e + unit) đang active.
- **Câu hỏi mở / khác biệt:** xem [`reverse-gaps.md`](./reverse-gaps.md) — 8 OQ, 6 Gap, 2 Conflict, 6 Inferred.
- **Phạm vi làm việc:** working tree `develop` @ `d6c0f6b5`, mọi cite theo dòng file hiện tại.

### 0.3 Khác biệt với tài liệu chính (chỉ khi feature trùng doc hiện có)

Doc chính: `docs/project-overview-pdr.md`. Feature syllabus chỉ xuất hiện trong PDR ở 3 dòng quyết định (dòng 15, 16, 19). Không phát hiện mâu thuẫn trực tiếp; các khác biệt dưới đây là điểm code có mà PDR chưa ghi.

| Điểm | Reverse nói (từ nguồn) | Doc chính nói (`docs/project-overview-pdr.md`) | Đề xuất |
|------|------------------------|-----------------------------------|---------|
| Trạng thái chế độ lớp khi gỡ giáo trình | Gỡ giáo trình về `schedulingMode='manual'` + `sessionsTotal=0` CHỈ khi lớp còn 0 buổi thật; có buổi thật thì giữ nguyên giá trị (`apps/server/src/routes/syllabus.ts:655-662`) | PDR không ghi hành vi này (chỉ ghi kind/status dòng 19) | `/gap` bổ sung 1 dòng vào PDR |
| Tự-heal import kẹt (#670) | Import vào lớp đã có copy → 409 `CURRICULUM_ALREADY_EXISTS`, ngoại trừ trạng thái kẹt được heal idempotent rồi trả 201 (`apps/server/src/routes/syllabus.ts:363-436`) | PDR không ghi | `/gap` bổ sung |
| `total_lessons` là cột chết cho hiển thị | UI luôn recompute từ cây module (`apps/web/src/lib/repos/syllabus.ts:43-46` gọi stored column "dead form value") | PDR yêu cầu "derived values derived, not duplicated as source-of-truth columns" (dòng 33) — cột này vi phạm tinh thần đó | `/gap` hoặc `/cr` xoá cột |
| Trần 52 buổi/lớp và 500 node/template | Hai trần cứng trong code (`apps/server/src/routes/syllabus.ts:492-500`, `apps/server/src/lib/syllabus-curriculum.ts:119`) | PDR không ghi | `/gap` bổ sung |

## 1. Scope

Feature `syllabus` là hệ quản trị **giáo trình mẫu (template) dùng chung của tổ chức** và **điểm chạm copy giáo trình vào lớp**:

- Giáo viên tạo template giáo trình với metadata: tên, loại lớp (IELTS/Giao tiếp), trình độ, kỹ năng, mô tả, số buổi dự kiến. ✅ [S6:204-246][S14:88-124]
- Ràng buộc kỹ năng theo loại lớp: IELTS cần ≥1 kỹ năng; Giao tiếp không chọn kỹ năng. ✅ [S6:231-244]
- Tạo template kèm nội dung hàng loạt (danh sách module, mỗi module danh sách buổi học) trong một thao tác ghi nguyên tử. ✅ [S1:151-194][S6:180-216]
- Nhập nhanh nội dung từ file Excel (.xlsx)/CSV ngay khi tạo: parse 100% phía client, preview trước khi lưu. ✅ [S9:1-8][S14:58-70][S36:12-69]
- Định dạng file 5 cột (Module, Mô tả module, Mục tiêu, Tài liệu, Loại) với cột Loại tùy chọn (`giữa kỳ`/`cuối kỳ`); file 4 cột legacy (v3) vẫn import được. ✅ [S9:5-7][S36:72-96][S45:570]
- Tự sinh tên buổi `Buổi {n}` đánh số liên tục xuyên module theo thứ tự dòng file. ✅ [S9:196-203][S45:103]
- Phát hiện file theo template cũ (cột "Trạng thái" v2 / cột "Buổi học" v3) và báo đúng nguyên nhân. ✅ [S9:81-108][S45:61][S45:265]
- Tải file mẫu CSV chuẩn (UTF-8 BOM, CRLF, 5 cột). ✅ [S9:276-310][S14:72-84]
- Xem danh sách template: tổng số template + tổng buổi, lọc chip kỹ năng tiếng Việt (Viết/Nói/Đọc/Nghe), đếm số lớp đang dùng. ✅ [S7:19-25][S7:45][S7:126-129][S10:92-116]
- Xem chi tiết template dạng editor: cây module/buổi, badge buổi thi, badge đếm tài liệu ngân hàng, danh sách lớp đang dùng copy. ✅ [S8:146-390][S20:15-16]
- Quản trị nội dung template: thêm/sửa/xóa module; thêm/sửa/xóa buổi học; đánh Loại buổi `lesson|midterm|final`. ✅ [S2:117-150][S2:207-232][S2:234-280][S2:282-357]
- Đổi thứ tự module và buổi học (lên/xuống) qua reorder đầy đủ tập id. ✅ [S2:152-205][S2:359-416][S18:90-119]
- Gắn tài liệu từ ngân hàng tài liệu của org vào bài học (tối đa 20/bài, dedupe giữ thứ tự). ✅ [S6:254-272][S2:67-87][S22:1-16]
- Import ghi đè TOÀN BỘ cây module/buổi của template từ file, sau confirm modal; số module/buổi "sẽ bị xóa" đọc từ snapshot mới nhất. ✅ [S8:141-144][S8:418-468][S1:201-277]
- Xóa template (hard delete cây); các lớp đã import giữ nguyên bản copy độc lập. ✅ [S1:283-339][S16:40-48]
- Copy giáo trình vào lớp (điểm chạm feature classes): deep-copy cây template thành bản của lớp, sinh UUID mới, reset tiến độ về `upcoming`. ✅ [S3:133-215][S37:89-127]
- Gỡ giáo trình khỏi lớp: xóa copy, null con trỏ, lớp về `manual`/0 buổi khi không còn buổi thật. ✅ [S1:624-718]
- Tự-heal: nhập lần 2 vào lớp kẹt giữa chừng heal idempotent rồi trả 201; otherwise 409. ✅ [S1:363-444][S42:1130]
- Sinh bù lịch học + gói buổi cho học viên active đang kẹt 0 dòng sau khi lớp chuyển sang auto. ✅ [S1:88-133][S42:1036]
- Lớp có giáo trình thì không thêm/xóa buổi thủ công (409 `class-has-syllabus`). ✅ [S25:2425-2433][S25:2651-2660]

**Boundary (out of scope — thuộc feature khác, chỉ lấy điểm chạm):**

- Lịch học, buổi dạy thực tế, điểm danh, sinh lịch auto từ template: feature `classes`/`enrollment`. Điểm chạm: copy-import đổi chế độ lớp, backfill gọi `materializeScheduleForEnrollment` ([S1:94-133][S29:281-290]).
- Quản trị nội dung giáo trình **của lớp** (sửa buổi trên bản copy): cùng route content nhưng mở từ màn hình lớp; feature `classes` sở hữu UI tab đó ([S24:17-27], test [S50:249][S50:352]).
- Ngân hàng tài liệu (thư mục, upload, xóa tài liệu): feature `materials`. Syllabus chỉ đọc tồn tại id + gắn liên kết ([S3:278-289][S5:130-137]).
- Mapping buổi dạy N ↔ bài N để hiện tài liệu trên tab Lịch học: điểm chạm đọc ([S28:16-31]), phần chiếu lịch thuộc `classes`.
- Portal học viên: không có thao tác syllabus nào cho học viên (route student không ghi cây giáo trình).

## 2. Actors & Stakeholders

| Actor | Loại (người/hệ thống/ngoài) | Mục tiêu | Trong scope? | Nguồn | Nhãn |
|-------|-----------------------------|----------|--------------|-------|------|
| Giáo viên (chủ org, role `teacher`) | người | Xây dựng, tái sử dụng giáo trình mẫu; nhập vào lớp; chỉnh nội dung | Có | [S7][S8][S14] | ✅ |
| Giáo viên khác cùng org | người | Dùng lại template chung của tổ chức | Có (template là tài nguyên org, không sở hữu cá nhân) | [S18:154] "giáo trình mẫu của tổ chức" | 🔵 |
| Học sinh (student portal) | người | Không thao tác gì trên syllabus | Không (không có route student nào ghi/đọc cây giáo trình) | negative-search §7 [_evidence.md] | 🔵 |
| Kernel snapshot / command bus | hệ thống | Vận chuyển lệnh ghi POST-only + snapshot đọc sau mỗi ghi | Có (hạ tầng bắt buộc) | [S12:83-105][S25:3492] | ✅ |
| D1/SQLite (batch transaction) | hệ thống | Đảm bảo mỗi thao tác ghi là một `db.batch` nguyên tử | Có | [S1:151-153][S3:118-119] | ✅ |
| papaparse / read-excel-file | ngoài (thư viện client) | Parse CSV/XLSX phía browser | Có (dependency bắt buộc của import) | [S9:240-258] | ✅ |
| Ngân hàng tài liệu (feature materials) | hệ thống | Cung cấp `materialId` hợp lệ org-scoped cho liên kết bài học | Giao thoa (sở hữu bởi feature khác) | [S3:278-289][S5:130-137] | ✅ |

## 3. Functional Requirements (FR)

| ID | Title | Description | Priority | Verify by | Nguồn | Nhãn |
|----|-------|-------------|----------|-----------|-------|------|
| FR-syllabus-001 | Tạo template giáo trình | Tạo template với tên (bắt buộc), loại lớp, trình độ, kỹ năng, mô tả, số buổi dự kiến | P0 | demo | [S1:142-196][S6:204-217][S14:88-124] | ✅ |
| FR-syllabus-002 | Ràng buộc kỹ năng theo loại lớp | IELTS: ≥1 kỹ năng, không trùng; Giao tiếp: không kỹ năng. Client chặn trước, server từ chối sau | P0 | test | [S6:209-244][S14:98-101] | ✅ |
| FR-syllabus-003 | Tạo kèm nội dung hàng loạt | Payload create nhận tuỳ chọn `modules[]` (mỗi module `lessons[]`), ghi 1 batch nguyên tử | P0 | test | [S1:151-194][S6:216][S45:103] | ✅ |
| FR-syllabus-004 | Import Excel/CSV lúc tạo | Chọn file .csv/.xlsx → parse client-side → preview → nộp kèm modules; file không bao giờ tới server | P0 | test | [S9:1-8][S14:58-70][S36:12-69] | ✅ |
| FR-syllabus-005 | Định dạng 5 cột + legacy 4 cột | Cột 5 "Loại" tùy chọn (`giữa kỳ`/`cuối kỳ`, rỗng = buổi thường); file 4 cột v3 vẫn chạy như cũ | P1 | test | [S9:5-7][S9:194-196][S36:72-96] | ✅ |
| FR-syllabus-006 | Tự đánh số buổi xuyên file | Tên buổi tự sinh `Buổi {n}` theo thứ tự dòng TOÀN file; module-only row và dòng trống không tiêu số | P1 | test | [S9:173-204][S45:150] | ✅ |
| FR-syllabus-007 | Phát hiện template cũ | File có ô 5 là "Trạng thái"/"status" hoặc cột 3 là "Buổi học"/"lesson" → đúng 1 lỗi tường minh | P1 | test | [S9:81-108][S45:61][S45:265] | ✅ |
| FR-syllabus-008 | Tải file mẫu | Nút tải CSV mẫu (BOM + CRLF, 5 cột, 2 module · 5 buổi có giữa kỳ/cuối kỳ) | P2 | demo | [S9:276-310][S14:72-84][S45:710] | ✅ |
| FR-syllabus-009 | Danh sách template + lọc | Trang "Giáo trình": kicker tổng template + tổng buổi; chip lọc Tất cả/Viết/Nói/Đọc/Nghe map sang skill wire | P1 | test | [S7:19-25][S7:34-40][S7:45][S47:160] | ✅ |
| FR-syllabus-010 | Đếm lớp đang dùng | Badge "Đang dùng N lớp" đếm qua `sourceTemplateId` của các copy | P1 | test | [S10:106-114][S7:75][S7:126-129][S47:70] | ✅ |
| FR-syllabus-011 | Chi tiết template dạng editor | Cây module/buổi thu gọn được, StatCard tổng buổi + module, badge buổi thi + tint nền, badge đếm tài liệu | P0 | test | [S8:146-348][S20:13-16][S40:21] | ✅ |
| FR-syllabus-012 | CRUD module | Thêm module (position = max+1), sửa title/description, xóa module kèm toàn bộ buổi con (child-first, không dựa FK cascade) | P0 | test | [S2:117-150][S2:207-232][S2:234-280] | ✅ |
| FR-syllabus-013 | CRUD buổi học + Loại | Thêm buổi (position = max+1), sửa, xóa; Loại `lesson|midterm|final` chọn được trên màn hình syllabus | P0 | test | [S2:282-357][S2:418-506][S2:508-546][S50:239] | ✅ |
| FR-syllabus-014 | Đổi thứ tự | Nút ↑/↓ reorder module/buổi: gửi lại ĐỦ tập id, server kiểm duplicate (400) và mismatch tập (409) | P1 | test | [S2:152-205][S2:359-416][S18:90-119][S38:25] | ✅ |
| FR-syllabus-015 | Gắn tài liệu ngân hàng | Khi thêm/sửa bài có thể chọn tối đa 20 tài liệu org; lưu `syllabus_lesson_material` position 0..n-1; sửa CÓ `materialIds` = replace-all, VẮNG = giữ nguyên | P1 | test | [S2:67-87][S2:312-356][S2:466-505][S41:241][S41:311] | ✅ |
| FR-syllabus-016 | Ghi đè nội dung template | Import file ở màn hình detail → confirm (refresh snapshot trước) → replace-all: xóa cây cũ + chèn cây mới + cập nhật `total_lessons`, 1 batch | P0 | test | [S1:198-277][S8:141-144][S8:418-468][S39:21] | ✅ |
| FR-syllabus-017 | Xóa template | Hard delete cây module/lesson; null con trỏ các lớp trỏ tới; detach provenance; copy của lớp không bị ảnh hưởng | P0 | test | [S1:283-339][S43:233][S16:40-48] | ✅ |
| FR-syllabus-018 | Nhập giáo trình vào lớp | Chọn template → deep-copy cây thành bản của lớp (UUID mới, giữ kind, reset status=upcoming), gán con trỏ lớp | P0 | test | [S3:133-215][S1:341-622][S37:128-284] | ✅ |
| FR-syllabus-019 | Nhập xong lớp chuyển auto | Lớp nhận `schedulingMode='auto'`, `sessionsTotal` = số bài template (khi lớp trống buổi thật) | P0 | test | [S1:518-538][S42:995][S37:180-196] | ✅ |
| FR-syllabus-020 | Gỡ giáo trình khỏi lớp | Xóa copy cây, null con trỏ; khi lớp 0 buổi thật: về `manual` + `sessionsTotal=0` + `session_package.total=0` | P0 | test | [S1:624-718][S42:1421][S24:83-118] | ✅ |
| FR-syllabus-021 | Tự-heal nhập kẹt | Nhập lần 2 khi copy đã tồn tại: heal trạng thái kẹt idempotent rồi 201; nếu không heal được → 409 `CURRICULUM_ALREADY_EXISTS` | P1 | test | [S1:363-444][S42:1130] | ✅ |
| FR-syllabus-022 | Backfill học viên kẹt | Sau khi lớp có giáo trình + tổng buổi >0: sinh bù lesson + gói buổi cho enrollment active đang 0 dòng, tuần tự từng học viên | P1 | test | [S1:88-133][S1:614-620][S42:1036] | ✅ |
| FR-syllabus-023 | Chặn buổi thủ công khi có giáo trình | Thêm/xóa buổi thủ công trên lớp có copy → 409 `class-has-syllabus` (điểm chạm classes) | P0 | test | [S25:2425-2433][S25:2651-2660][S42:393] | ✅ |
| FR-syllabus-024 | Guard Loại/Trạng thái từ màn hình lớp | Form mở từ màn lớp không gửi kind/status → server giữ nguyên giá trị hiện có; form màn syllabus được chọn kind | P1 | test | [S2:452-464][S23:66-69][S50:249][S50:352][S40:120] | ✅ |
| FR-syllabus-025 | Tài liệu buổi dạy suy từ bài N | Tài liệu ngân hàng của buổi dạy resolve theo vị trí buổi N ↔ bài N của copy (không lưu riêng) | P1 | test | [S28:16-31][S28:124-174] | ✅ |
| FR-syllabus-026 | Snapshot đọc sau mỗi ghi | Client refresh snapshot: mọi template + copy (kèm `bankMaterials` teacher-safe) | P0 | test | [S26:314-326][S26:450-473][S26:591-625] | ✅ |
| FR-syllabus-027 | Copy id không mở như template | Trang `/syllabus/$id` chỉ nhận template (`classId === null`); id copy/lạ → not-found branded | P1 | test | [S8:62-73][S37:376] | ✅ |
| FR-syllabus-028 | Preview import + gỡ file | Preview bảng 5 cột khi ok; danh sách lỗi hiển thị tối đa 100 + gộp phần còn lại; nút Gỡ file ở cả 2 nhánh | P1 | test | [S19:7-19][S19:53-60][S36:146-185] | ✅ |
| FR-syllabus-029 | Chỉ nhận .csv/.xlsx ≤2MB (client) | Đuôi khác → từ chối; >2MB → từ chối; exception parse → thông báo chung | P1 | test | [S9:230-237][S45:682][S45:692] | ✅ |
| FR-syllabus-030 | Chặn submit khi chưa hợp lệ | Chặn khi đang parse, file lỗi, tên rỗng, IELTS thiếu kỹ năng; số buổi tự fill từ file và khóa khi có file | P1 | test | [S14:86-101][S14:222-236][S36:160-170] | ✅ |

## 4. Non-Functional Requirements (NFR)

| ID | Category | Requirement | Priority | Acceptance | Nguồn | Nhãn |
|----|----------|-------------|----------|------------|-------|------|
| NFR-syllabus-001 | integrity | Mọi ghi cây (create/replace/import/remove) chạy trong MỘT `db.batch` — thành công all-or-nothing | P0 | code review + test migration crash-boundary | [S1:151-153][S3:122-131][S43:341] | ✅ |
| NFR-syllabus-002 | capacity | Trần 500 node (module + buổi) mỗi template/import/reorder — chặn cả zod contract lẫn server constant | P0 | test biên | [S3:118-119][S6:219-230][S6:300-310][S45:345] | ✅ |
| NFR-syllabus-003 | capacity | Trần 52 buổi khi import vào lớp trống | P0 | test biên | [S1:492-500][S42:1340] | ✅ |
| NFR-syllabus-004 | capacity | Trần 20 tài liệu ngân hàng mỗi bài học (server + picker chung một nguồn) | P1 | test | [S6:254-272] | ✅ |
| NFR-syllabus-005 | capacity | Body payload syllabus tối đa 2 MiB (413 kèm thông báo tiếng Việt) | P1 | demo | [S1:724-735] | ✅ |
| NFR-syllabus-006 | capacity | File import ≤ 2 MB, chỉ .csv/.xlsx — kiểm tra client trước khi parse | P1 | test | [S9:12-13][S9:233-237][S45:692] | ✅ |
| NFR-syllabus-007 | privacy/perf | Parse 100% client-side; file không được upload lên server | P1 | phân tích | [S9:1-8] | ✅ |
| NFR-syllabus-008 | multi-tenancy | Mọi truy vấn đọc/ghi đều org-scoped (`orgId` trong mọi WHERE); id client không tin — module phải thuộc syllabus + org | P0 | code review | [S3:88-106][S2:88-91 comment] | ✅ |
| NFR-syllabus-009 | resilience | Import idempotent: retry sau lỗi giữa chừng tự heal, không dup copy (unique `class_id`) | P1 | test | [S1:363-367][S42:1130][S4:46-49] | ✅ |
| NFR-syllabus-010 | resilience | Backfill chạy TUẦN TỰ từng học viên để không vượt trần một `db.batch` của D1 | P1 | phân tích | [S1:90-93] | ✅ |
| NFR-syllabus-011 | compatibility | Snapshot cũ/kind lạ không crash UI — normalize về `lesson`; status lạ → style `upcoming` | P1 | test | [S10:25-32][S21:14-16][S46:140][S46:152] | ✅ |
| NFR-syllabus-012 | ux-responsiveness | UI import/preview dùng được desktop/tablet/mobile (375px không tràn ngang) — e2e kiểm 3 viewport | P2 | test | [S37:248-262][S37:283-300] | 🔵 |
| NFR-syllabus-013 | auditability | Không có soft delete; mọi xóa là hard delete + ghi nhận qua bảng activity/log của kernel | P2 | phân tích | negative-search §7 | 🟡 |

## 5. Business Rules

| ID | Rule | Trigger | Implements FR | Nguồn | Nhãn |
|----|------|---------|---------------|-------|------|
| BR-syllabus-001 | Một lớp có tối đa MỘT giáo trình copy — unique partial index trên `class_id` (chỉ khi NOT NULL) | Import/lớp tạo kèm template | FR-018 | [S4:46-49][S42:1130] | ✅ |
| BR-syllabus-002 | Template luôn `class_id IS NULL`; bản copy không bao giờ được nhận là template (import/xóa/sửa qua guard `findTemplate`) | Mọi thao tác theo id | FR-018, FR-027 | [S3:42-55][S1:210-211][S1:294-295] | ✅ |
| BR-syllabus-003 | Copy là deep-copy ĐỘC LẬP: xóa/sửa template không ảnh hưởng lớp đã import | Xóa template | FR-017 | [S1:279-282][S43:233][S16:40-44] | ✅ |
| BR-syllabus-004 | `kind` là nội dung giáo trình (copy giữ nguyên); `status` là tiến độ per-lớp (reset `upcoming` khi copy) | Import/copy | FR-018 | [S4:93-99][S3:192-197][S43:175][S43:280] | ✅ |
| BR-syllabus-005 | `class.syllabus_id` là cột SUY RA (mirror của `syllabus.class_id`), không bao giờ dùng để ĐỊNH VỊ copy; người ghi duy nhất là batch import/remove | Mọi thao tác theo lớp | FR-018, FR-020 | [S3:57-61][S1:639-641][S28:38-39] | ✅ |
| BR-syllabus-006 | Lớp đã có buổi học thủ công (`class_session`) thì không import giáo trình được | Import vào lớp có buổi manual | FR-018 | [S1:477-487][S42:1232] | ✅ |
| BR-syllabus-007 | Template >52 buổi không import được vào lớp trống (422) | Import, lớp 0 buổi thật | FR-018 | [S1:489-500][S42:1340] | ✅ |
| BR-syllabus-008 | Template 0 bài học không import được vào lớp trống manual 0 buổi (422); lớp auto sẵn có buổi thì 0 bài vẫn hợp lệ (giữ nguyên tổng buổi) | Import | FR-018 | [S1:502-516][S42:1340] | ✅ |
| BR-syllabus-009 | Lớp đã có copy: import lại → 409 `CURRICULUM_ALREADY_EXISTS`, ngoại trừ nhánh tự-heal (FR-021) | Import lần 2 | FR-018, FR-021 | [S1:437-443][S1:363-436][S37:283-284] | ✅ |
| BR-syllabus-010 | Lớp có giáo trình: chặn thêm/xóa buổi thủ công (409 `class-has-syllabus`) | Thêm/xóa buổi manual | FR-023 | [S25:2425-2433][S25:2651-2660] | ✅ |
| BR-syllabus-011 | Gỡ giáo trình: lớp 0 buổi thật → `manual`/0 và gói buổi về 0; có buổi thật → giữ nguyên chế độ + tổng buổi | Gỡ giáo trình | FR-020 | [S1:652-687][S42:1421] | ✅ |
| BR-syllabus-012 | IELTS cần ≥1 kỹ năng (không trùng); Giao tiếp không chọn kỹ năng — áp cho cả template lẫn lớp | Tạo template/lớp | FR-002 | [S6:231-244][S6:136-153] | ✅ |
| BR-syllabus-013 | Tài liệu ngân hàng là tài nguyên org DÙNG CHUNG: copy giữ nguyên `materialId`; tài liệu đang gắn không xóa được (FK NO ACTION) | Copy/xóa tài liệu | FR-015, FR-018 | [S5:130-137][S3:200-212] | ✅ |
| BR-syllabus-014 | Liên kết bài học–tài liệu duy nhất theo cặp (lesson, material) — PK kép | Gắn trùng tài liệu | FR-015 | [S5:156-160][S2:73 dedupe] | ✅ |
| BR-syllabus-015 | Buổi dạy N ánh xạ bài N của copy theo đúng định nghĩa index tab Lịch học (bỏ nhóm nghỉ lễ); không dùng skeleton lịch | Xem tài liệu buổi dạy | FR-025 | [S28:21-31][S28:63-75] | ✅ |
| BR-syllabus-016 | Tên module/mô tả/ objectives/materials giới hạn 500/10.000 ký tự — mirror giữa parser client và zod server | Import + create | FR-004, FR-005 | [S9:17-18][S9:153-163][S6:186-193][S45:378] | ✅ |
| BR-syllabus-017 | Import sai cột Loại → lỗi từng dòng, không parse nửa chừng (all-or-nothing ở mức file) | Import có dòng lỗi | FR-005 | [S9:132-137][S9:207][S45:523] | ✅ |
| BR-syllabus-018 | Cell định dạng ngày trong file là lỗi dòng — yêu cầu định dạng Text | Import Excel có ô ngày | FR-004 | [S9:29-45][S45:624] | ✅ |
| BR-syllabus-019 | Bản copy chỉ xóa được qua gỡ giáo trình phía lớp; mọi route template đều 404 cho copy | Xóa/sửa/replace qua id copy | FR-017, FR-027 | [S1:292-295][S1:138-140 comment][S8:64-65] | ✅ |

## 6. Error Matrix (wording thật — nguyên văn từ code)

| Error ID | Title | Trigger | Severity | Related FR | Screen state | Recovery | Nguồn | Nhãn |
|----------|-------|---------|----------|------------|--------------|----------|-------|------|
| E-syllabus-001 | `unauthorized` (401) | Thiếu kernel context | major | mọi FR | mọi màn hình | Đăng nhập lại | [S1:51-53] | ✅ |
| E-syllabus-002 | `invalid json` (400) — nguyên văn: `{"error": "invalid json"}` | Body không parse được JSON | minor | FR-001,016,018,020 | modal submit | Sửa payload (client luôn gửi JSON hợp lệ) | [S1:62-66] | ✅ |
| E-syllabus-002b | `invalid body` (400) — nguyên văn: `{"error": "invalid body"}` | Zod schema fail (server trả opaque, không chỉ dòng/ô) | minor | FR-001,004,012,013,016 | modal submit | Client mirror giới hạn ở parser/form để hầu như không chạm | [S1:67-71][S9:14-16] | ✅ |
| E-syllabus-003 | "Tổng số module và buổi học vượt giới hạn 500" | zod superRefine: nodes > 500 (create hoặc replace) | major | FR-003, FR-016 | modal tạo/ghi đè | Bớt nội dung file rồi nhập lại | [S6:219-230][S6:300-310] | ✅ |
| E-syllabus-004 | "Syllabus IELTS cần ít nhất một kỹ năng" | type=ielts, skills=[] | major | FR-002 | modal tạo | Chọn kỹ năng | [S6:231-237] | ✅ |
| E-syllabus-005 | "Syllabus Giao tiếp không chọn kỹ năng" | type=communication, skills>0 | major | FR-002 | modal tạo | Bỏ chọn kỹ năng | [S6:238-244] | ✅ |
| E-syllabus-006 | `syllabus not found` (404) | Id không tồn tại/khác org/là copy qua route template | major | FR-012..017, FR-027 | detail 404 branded | Về danh sách | [S1:209][S1:211][S1:290][S1:295][S2:126] | ✅ |
| E-syllabus-007 | `class not found` (404) | Id lớp lạ/khác org | major | FR-018, FR-020 | tab Giáo trình | Kiểm tra lớp | [S1:349][S1:354][S1:632][S1:637] | ✅ |
| E-syllabus-008 | `module not found` (404) | moduleId không thuộc syllabus/org | major | FR-012,013,014 | detail | Refresh | [S2:222][S2:248][S2:299][S2:376] | ✅ |
| E-syllabus-009 | `lesson not found` (404) — lưu ý: syllabus không tìm thấy vẫn báo ở mức lesson (contract cũ) | Lesson upsert khi syllabus/lesson không tìm thấy | major | FR-013 | detail | Refresh | [S2:293-296][S2:429-431][S2:449][S2:534] | ✅ |
| E-syllabus-010 | `duplicate ids` (400) | Reorder gửi id trùng | minor | FR-014 | detail | Client tự gửi tập duy nhất | [S2:158-160][S2:365-367] | ✅ |
| E-syllabus-011 | `set-mismatch` (409) | Reorder thiếu/thừa id so với DB | major | FR-014 | detail | Refresh rồi reorder lại | [S2:179-186][S2:390-397][S2:410-413] | ✅ |
| E-syllabus-012 | "too many modules to reorder" / "too many lessons to reorder" (422) | Siblings > 500 | minor | FR-014 | detail | Không có UI path (trần đã chặn ở 500) | [S2:176-178][S2:387-389] | ✅ |
| E-syllabus-013 | "Dữ liệu syllabus vượt giới hạn 2 MiB." (413) | Body > 2 MiB | major | FR-001, FR-003 | modal tạo | Giảm payload file | [S1:730-735] | ✅ |
| E-syllabus-014 | "Lớp đã có giáo trình" + `code: "CURRICULUM_ALREADY_EXISTS"` (409) | Import khi copy đã tồn tại (hoặc FK race với remove) | major | FR-018, FR-021 | modal nhập | Mở tab Giáo trình dùng bản có sẵn | throw [S1:418-423][S1:437-443][S1:569-589] · catalog [S15:23-24] | ✅ |
| E-syllabus-015 | "Template quá lớn để import" + `code: "CURRICULUM_TEMPLATE_TOO_LARGE"` (422) | modules+lessons+links > 500 | major | FR-018 | modal nhập | Chia nhỏ template | throw [S1:451-457] · catalog [S15:21-22] | ✅ |
| E-syllabus-016 | "Lớp đã có buổi học thủ công. Vui lòng xóa các buổi chưa học trước khi nhập giáo trình." + `code: "MANUAL_SESSIONS_EXIST"`, `reason: "has-manual-sessions"` (409) | Import khi lớp có `class_session` | major | FR-018 | modal nhập | Xóa buổi chưa học rồi nhập lại | throw [S1:477-487][S1:600-609] · catalog [S15:15-16] | ✅ |
| E-syllabus-017 | "Template vượt quá giới hạn 52 buổi học của lớp." + `code: "CURRICULUM_TOO_MANY_LESSONS"`, `reason: "too-many-lessons"` (422) | Import >52 bài vào lớp trống | major | FR-018 | modal nhập | Chia template | throw [S1:492-500] · catalog [S15:19-20] | ✅ |
| E-syllabus-018 | "Template chưa có bài học nào. Vui lòng thêm ít nhất 1 bài học trước khi nhập vào lớp trống." + `code: "CURRICULUM_EMPTY_TEMPLATE"`, `reason: "empty-template"` (422) | Import 0 bài vào lớp trống manual 0 buổi | major | FR-018 | modal nhập | Thêm bài vào template | throw [S1:502-516] · catalog [S15:17-18] | ✅ |
| E-syllabus-019 | `material-not-found` + `materialId: <id đầu tiên thiếu>` (422) | materialIds lạ (validate trước) hoặc FK fail giữa chừng (re-check sau batch) | major | FR-015, FR-018 | modal bài học / modal nhập | Bỏ tài liệu đã xóa khỏi lựa chọn | [S2:73-86][S2:99-114][S1:549-566][S25:2502-2508] | ✅ |
| E-syllabus-020 | `cannot add manual session to class with syllabus` + `reason: "class-has-syllabus"` (409) | Thêm buổi manual trên lớp có copy | major | FR-023 | tab Buổi học (lớp) | Gỡ giáo trình hoặc dùng giáo trình | [S25:2425-2433][S25:2622-2632] | ✅ |
| E-syllabus-021 | `cannot delete session from class with syllabus` + `reason: "class-has-syllabus"` (409) | Xóa buổi trên lớp có copy | major | FR-023 | tab Buổi học (lớp) | Như trên | [S25:2651-2660][S25:2801-2810] | ✅ |
| E-syllabus-022 | 'File dùng template cũ (cột "Trạng thái" đã bỏ). Hãy tải file mẫu mới rồi điền lại dữ liệu.' | File v2 (ô 5 header = trạng thái/status) | major | FR-007 | preview import | Tải file mẫu mới | [S9:86-93][S36:180] | ✅ |
| E-syllabus-023 | 'File dùng template cũ (cột "Buổi học" đã bỏ). Hãy tải file mẫu mới rồi điền lại dữ liệu.' | File v3 header (cột 3 = buổi học/lesson) | major | FR-007 | preview import | Tải file mẫu mới | [S9:94-104] | ✅ |
| E-syllabus-024 | `Dòng {n}: cột Loại nhận "..." — có thể bạn đang dùng template cũ (cột "Trạng thái"). Hãy tải file mẫu mới.` | Từ vựng status v2 lọt vào cột Loại | minor | FR-007 | preview import | Sửa cột Loại | [S9:123-130][S45:608] | ✅ |
| E-syllabus-025 | `Dòng {n}: loại buổi không hợp lệ '...' (dùng: giữa kỳ / cuối kỳ)` | Cột Loại giá trị lạ | minor | FR-005 | preview import | Sửa theo gợi ý | [S9:132-137][S45:523] | ✅ |
| E-syllabus-026 | `Dòng {n}: ô dạng ngày tháng không hỗ trợ — hãy định dạng ô thành Text` | Ô Excel định dạng Date | minor | FR-004 | preview import | Đổi định dạng ô | [S9:29-45] | ✅ |
| E-syllabus-027 | `Dòng {n}: thiếu tên module` / `tên module vượt 500 ký tự` / `mô tả module vượt 10.000` / `mục tiêu vượt 10.000` / `tài liệu vượt 10.000` | Vi phạm giới hạn cột | minor | FR-004,005 | preview import | Sửa dòng tương ứng | [S9:143-193] | ✅ |
| E-syllabus-028 | "Không có dòng dữ liệu." / "File có {n} mục (module + buổi học), vượt giới hạn 500." | File rỗng / vượt cap | major | FR-004 | preview import | Sửa file | [S9:208][S9:212-219][S45:426] | ✅ |
| E-syllabus-029 | "Chỉ nhận file .csv hoặc .xlsx." / "File vượt giới hạn 2 MB." / "Không đọc được file. Kiểm tra file Excel/CSV hợp lệ." / `Dòng {n}: cú pháp CSV không hợp lệ` | File sai đuôi/quá lớn/lỗi parse | major | FR-004, FR-029 | modal tạo / detail | Chọn file khác | [S9:233-237][S9:242-249][S9:260-265][S45:682][S45:698] | ✅ |
| E-syllabus-030 | Client chặn: "Vui lòng nhập tên syllabus." / "Chọn ít nhất một kỹ năng." | Submit form thiếu dữ liệu | minor | FR-030 | modal tạo | Điền form | [S14:94-101] | ✅ |
| E-syllabus-031 | Ném lỗi nội bộ `import-syllabus batch failed` (500) | Batch import fail mà không xác định được nguyên nhân nghiệp vụ sau re-check | critical | FR-018 | toast lỗi chung | Retry (idempotent heal) | [S1:611] | ✅ |

## 7. Success Criteria

| ID | Outcome nghiệp vụ | Đo bằng | Mốc đạt | Nguồn | Nhãn |
|----|-------------------|---------|---------|-------|------|
| SC-syllabus-01 | GV tạo giáo trình hoàn chỉnh từ file Excel/CSV trong một lần nộp (không gõ tay từng buổi) | e2e [S36:12-69] pass | Đã có test tự động | [S36:12-69] | ✅ (hành vi) / 🟡 (mục tiêu KD) |
| SC-syllabus-02 | Một template dùng lại cho nhiều lớp mà sửa lớp không phá template | e2e [S37:89-127][S37:287-332] pass | Đã có test tự động | [S37:287-332] | ✅ (hành vi) / 🟡 (mục tiêu KD) |
| SC-syllabus-03 | Lớp nhận giáo trình là có ngay lịch + gói buổi cho học viên (không phải cấu hình lại) | unit [S42:995][S42:1036] pass | Đã có test tự động | [S42:1036] | ✅ (hành vi) / 🟡 (mục tiêu KD) |
| SC-syllabus-04 | Xóa template/giáo trình không làm mất dữ liệu lớp đã dạy | unit [S43:233] + e2e [S37:333-375] | Đã có test tự động | [S37:333-375] | ✅ (hành vi) / 🟡 (mục tiêu KD) |
| SC-syllabus-05 | Tỷ lệ import lỗi người dùng tự sửa được nhờ thông báo đúng dòng/nguyên nhân | Chưa có đo lường trong code | — | gaps OQ-7 | 🟡 |

## 8. Data Entities (tóm tắt — chi tiết ở `srs/syllabus-reverse-erd.md`)

- **syllabus** — giáo trình; `class_id` NULL = template dùng chung, NOT NULL = bản copy của lớp (duy nhất per lớp); `source_template_id` = provenance (logical FK). ✅ [S4:12-51]
- **syllabus_module** — phân đoạn nội dung, sắp theo `position`. ✅ [S4:53-74]
- **syllabus_lesson** — slot bài học trong module; khác entity với buổi dạy (`lesson` — invariant 5); `kind` nội dung / `status` tiến độ per-lớp. ✅ [S4:76-109]
- **syllabus_lesson_material** — liên kết bài học ↔ tài liệu ngân hàng; PK kép (lesson, material); FK material NO ACTION. ✅ [S5:139-164]
- **material** (đọc, thuộc feature materials) — tài liệu org dùng chung. ✅ [S5:39-77]
- **class** (điểm chạm) — `syllabus_id` cột suy ra (FK NO ACTION), `scheduling_mode`, `sessions_total`. ✅ [S31:8][S31:17][S25:1697]
- **lesson (buổi dạy)**, **class_session**, **enrollment**, **session_package** — phía lớp; liên hệ qua backfill/reset tổng buổi. ✅ [S1:99-133][S1:650-687]

## 9. Flows (tóm tắt — chi tiết ở `srs/syllabus-reverse-flows.md`)

1. **F1 — Tạo template thủ công** (modal → POST /api/syllabus-templates → batch → snapshot → mở detail). ✅
2. **F2 — Tạo template từ Excel/CSV** (chọn file → parse client → preview → create kèm modules). ✅
3. **F3 — Ghi đè nội dung template** (detail → file → confirm modal → replace-content 1 batch). ✅
4. **F4 — Nhập giáo trình vào lớp** (modal → import route → checks → deep-copy + pointer + backfill → 201; alt: 409/422 codes, self-heal). ✅
5. **F5 — Gỡ giáo trình khỏi lớp** (confirm → remove route → pointer null + reset manual/0 + xóa cây). ✅
6. **F6 — Xóa template** (confirm → remove route → clear pointers + detach provenance + xóa cây). ✅
7. **F7 — Thêm/sửa bài học kèm tài liệu ngân hàng** (picker → add/edit lesson + materialIds → validate → batch + FK guard). ✅
8. **F8 — Tài liệu buổi dạy suy từ bài N** (điểm chạm đọc — tab Lịch học resolve bài N; hiển thị thuộc feature classes). ✅

## 10. Screens (tóm tắt)

| Màn hình | Đường dẫn / nơi mở | Chức năng chính | Nguồn | Nhãn |
|----------|--------------------|-----------------|-------|------|
| Danh sách giáo trình | `/syllabus` | Kicker tổng, chip lọc kỹ năng, card template (badge đang dùng, nút Xóa), empty state | [S7:15-150] | ✅ |
| Chi tiết template (editor) | `/syllabus/$syllabusId` | StatCard, nhập Excel/CSV, thêm module, cây module/buổi, ghi đè, danh sách lớp đang dùng; not-found branded | [S8:44-472] | ✅ |
| Modal "Tạo syllabus mới" | từ `/syllabus` | Form metadata + chọn file + file mẫu + preview + số buổi auto-fill khóa | [S14:133-271] | ✅ |
| Modal "Xóa template giáo trình?" | từ card danh sách | Confirm, nói rõ lớp đang dùng không bị ảnh hưởng | [S16:35-74] | ✅ |
| Modal "Ghi đè nội dung giáo trình?" | từ detail | Đếm sẽ xóa/sẽ thay, refresh trước khi mở, khóa khi busy | [S8:418-468] | ✅ |
| Modal Thêm/Sửa module, Thêm/Sửa buổi học | từ detail + từ màn lớp | showKind chỉ trên màn syllabus; materialIds picker (#655) | [S23:17-25][S50:239][S50:352] | ✅ |
| Tab "Giáo trình" trong chi tiết lớp | `/classes/$classId` (thuộc feature classes) | Nhập từ template / Gỡ giáo trình — điểm chạm duy nhất | [S24:28-120] | ✅ |
| TemplatePicker | modal tạo lớp + modal nhập | Chọn template + preview chỉ đọc; allowEmpty khi tạo lớp | [S17:12-105] | ✅ |

## 11. Constraints, Dependencies & Assumptions

**Constraints (ràng buộc áp đặt):**

| Ràng buộc | Source / Owner | Nguồn | Nhãn |
|-----------|----------------|-------|------|
| Router syllabus phải mount BÊN TRONG kernel router để được guard CSRF Origin + JSON content-type | apps/server (kernel) | [S1:43-47] | ✅ |
| SQLite không ALTER TABLE ADD FK → `source_template_id` chỉ là logical FK, phải tự detach khi xóa | DB D1/SQLite | [S4:35-43] | ✅ |
| FK trên `class.syllabus_id` và `material` là NO ACTION → thứ tự batch bị pin: pointer trước, child-first sau | DB D1/SQLite | [S1:297-300][S1:652-654] | ✅ |
| Một `db.batch` D1 có trần — cap 500 node + backfill tuần tự | DB D1 | [S3:118-119][S1:90-93] | ✅ |
| Command bus POST-only; đọc qua snapshot duy nhất | kiến trúc kernel | [S12:83-105][S26:314-326] | ✅ |
| Buổi học giáo trình (`syllabus_lesson`) khác entity buổi dạy (`lesson`) — không nối FK trực tiếp | quyết định kiến trúc (invariant 5) | [S4:76-79] | ✅ |

**Dependencies (deliverable do bên khác sở hữu):**

| Phụ thuộc | Owner | Blocks nếu chưa sẵn | Nguồn | Nhãn |
|-----------|-------|---------------------|-------|------|
| Kernel snapshot + kernelCtx (orgId) | feature kernel/auth | Không thao tác nào chạy được | [S1:51-53][S26:314-326] | ✅ |
| Ngân hàng tài liệu (`material`) | feature materials | Gắn tài liệu bài học (#655) trả 422 | [S3:278-289][S5:139-164] | ✅ |
| `class`, `enrollment`, `session_package`, `class_session` | feature classes | Import/gỡ giáo trình và backfill không chạy được | [S1:74-86][S1:99-133] | ✅ |
| `materializeScheduleForEnrollment` | feature enrollment-activation | Backfill kẹt không chạy | [S1:36][S29:281-290] | ✅ |
| papaparse + read-excel-file (client) | npm | Import Excel/CSV vô dụng | [S9:240-258] | ✅ |

**Assumptions (tin là đúng — nêu hệ quả nếu sai):**

| Giả định | Invalidate {X} nếu sai | Nguồn | Nhãn |
|----------|------------------------|-------|------|
| Template là tài nguyên dùng chung của org — mọi giáo viên trong org sửa được (không có per-user ACL trong code) | Nếu cần ACL theo giáo viên → phải thêm bảng quyền + guard | negative-search §7 [_evidence.md] | 🟡 |
| Mỗi lớp học theo đúng một giáo trình (không ghép nhiều template) | Nếu cần ghép → bỏ unique `class_id`, đổi mô hình import | [S4:46-49] | 🟡 |
| Trần 52 buổi/lớp là quy tắc sản phẩm (không phải giá trị kỹ thuật tạm) | Nếu sai → đổi hằng số ở [S1:492-500] và test biên | [S1:492] | 🟡 |
| File import do chính giáo viên tạo từ file mẫu (không cần chống payload độc hại sâu hơn mức đuôi file + kích thước) | Nếu cần quét malicious XLSX → phải di chuyển parse lên server | [S9:1-8] | 🟡 |

## 12. Open Questions

> Danh sách đầy đủ OQ + Gap ở [`reverse-gaps.md`](./reverse-gaps.md). Dưới đây chỉ trích các OQ blocking.

- [ ] OQ-1: Mục tiêu kinh doanh và mức ưu tiên của trần 52 buổi/lớp — con số từ quy ước sản phẩm hay giới hạn kỹ thuật? (blocking cho BR-007)
- [ ] OQ-2: Có cần sửa metadata template (tên/trình độ/kỹ năng/mô tả) sau khi tạo không? Code hiện KHÔNG có route nào — chỉ thay cây nội dung. (blocking cho FR set)
- [ ] OQ-3: `total_lessons` lưu DB nhưng UI luôn recompute — xóa cột hay giữ làm giá trị form? (blocking cho data model)
- [ ] OQ-4: Template có quyền riêng theo giáo viên trong org không, hay mọi thành viên sửa được toàn bộ? (blocking cho Actors)
- [ ] OQ-5: API cho phép đặt `status` (done/current) trên bài của TEMPLATE qua create/replace — có phải đường vào không mong muốn, hay có use case? (blocking cho BR-004)
