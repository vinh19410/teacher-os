---
type: reverse-srs
feature: assignment-tests
status: draft
updated: 2026-11-11
confidence_summary: "✅114 🔵26 🟡3 (trong spec; toàn bộ 17 file: ✅124 🔵27 🟡10 — đếm theo luật batch, loại dòng legend/front-matter/dòng chứa \"chắc chắn\") — OQ 8"
links:
  sources: ./reverse-sources.md
  gaps: ./reverse-gaps.md
  evidence: ./_evidence.md
  flows: ./srs/assignment-tests-reverse-flows.md
  states: ./srs/assignment-tests-reverse-states.md
  erd: ./srs/assignment-tests-reverse-erd.md
  usecases: ./usecases/assignment-tests-reverse-usecase-index.md
---

# assignment-tests — SRS tái lập (reverse)

> Trạng thái: `draft` (tái lập, chưa duyệt). Nhãn: ✅ chắc chắn · 🔵 suy đoán · 🟡 cần xác nhận.

## 0. Truy vết nguồn & độ tin cậy

- **Nguồn:** xem [`reverse-sources.md`](./reverse-sources.md) — S1 route bộ đề, S2 schema DB, S3 UI tạo bộ đề, S4 logic dải câu/điểm, S5 e2e, S6 contracts, S7–S12 các nguồn mở rộng qua grep.
- **Câu hỏi mở / khác biệt:** xem [`reverse-gaps.md`](./reverse-gaps.md) — OQ-1..OQ-8, Gap G-1..G-6, xung đột: không tìm thấy, Inferred I-1..I-4.
- Bằng chứng thô theo từng nhóm: [`_evidence.md`](./_evidence.md).

### 0.3 Khác biệt với tài liệu chính

Doc feature-level chưa tồn tại (`docs/_reverse/reverse-plan.json:156-168` đánh dấu `existing_doc: null`). Tài liệu chính gần nhất là dòng tổng quan hệ thống trong PDR:

| Điểm | Reverse nói (từ nguồn) | Doc chính nói (`docs/project-overview-pdr.md:26`) | Đề xuất |
|------|------------------------|---------------------------------------------------|---------|
| Khóa parts khi đã có lượt làm | PUT parts trả 409 `TEST_PARTS_LOCKED` nếu tồn tại bất kỳ `quiz_attempt` (in_progress hoặc submitted) cùng org; gửi lại đúng danh sách part hiện có thì 200 no-op | PDR chỉ nói đề được snapshot lúc start, không nói khóa cấu trúc bộ đề (`docs/project-overview-pdr.md:27`) | Bổ sung 1 câu vào PDR hoặc tạo doc feature |
| Khóa nội dung prompt thuộc test | PATCH prompt trả 409 `PROMPT_CONTENT_LOCKED` khi prompt nằm trong test có attempt (hồi quy `apps/server/src/routes/assignments/tests.test.ts:687-743`) | PDR chỉ liệt kê khóa qua `class_assignment` | Bổ sung |
| Hybrid Writing prompt | Bị chặn gắn vào test: 400 `hybrid prompt cannot be attached to test` (`apps/server/src/routes/assignments/tests.ts:214-218`) | PDR nói "hybrid prompts are excluded from assignment_test" (`docs/project-overview-pdr.md:20`) | Khớp — không cần CR |
| UI còn thiếu | Không có control chuyển test sang `ready`, không có trang danh sách bộ đề, không có control `qStartOverride`, không có nút xóa gọi được từ UI (Gap G-1..G-4) | PDR không đề cập mặt UI | Chốt sản phẩm: cố ý hay thiếu |

## 1. Scope

Feature `assignment-tests` là **Full Test Builder** (design "IELTS Full Test Builder", 2026-09-28 — `apps/server/src/routes/assignments/tests.ts:26`, `packages/db/src/schema/assignment-test.ts:13`): cho giáo viên ghép các part (mỗi part là một đề trong ngân hàng `assignment_prompt`) thành một bộ đề trọn vẹn theo đúng một kỹ năng, đánh số câu hỏi chạy liên tục toàn bộ đề, soát đáp án theo key dán vào, xem trước đề dưới dạng giấy thi học viên.

- Bộ đề gắn đúng một kỹ năng trong 4 kỹ năng luyện tập (reading, listening, writing, speaking); grammar/vocabulary bị chặn tạo bộ đề. ✅ [S6 `packages/api/src/contracts.ts:1203`, S6 `contracts.ts:347-353`, test `apps/server/src/assignment-rich-text-contract.test.ts:540-557`]
- Bộ đề gồm 2–4 slot part, layout slot theo preset kỹ năng: Reading 3 passage, Listening 4 section, Writing 2 task, Speaking 3 part. ✅ [S6 `packages/api/src/contracts.ts:410-448`]
- Mỗi slot tham chiếu đúng một prompt của ngân hàng; một slot không thể có 2 prompt (unique `testId+part`); đổi part chỉ bằng replace-all. ✅ [S2 `packages/db/src/schema/assignment-test.ts:49-51,72-77`, S6 `packages/api/src/contracts.ts:1223-1229`]
- Số câu bắt đầu mỗi part được tính lại (derive) từ số câu thật của các part trước, có thể ghi đè bằng `qStartOverride`; số tuyệt đối không persist vào prompt. ✅ [S4 `apps/web/src/lib/test-ranges.ts:3-8,27-45`]
- Trạng thái bộ đề: `draft` (bản nháp riêng tư) / `ready` (dùng được khi giao). ✅ [S2 `packages/db/src/schema/assignment-test.ts:16`]
- UI builder: outline trái + form header + danh sách slot + composer soạn mới ngay trong slot (kỹ năng/part bị khóa trong composer) + panel soát đáp án + xem trước. ✅ [S3 `apps/web/src/components/assignment-tests/test-builder-shell.tsx:72-77,617-850`]
- Bản soạn dở tự lưu vào localStorage (TTL 7 ngày) và được phục hồi kèm banner xác nhận. ✅ [S3 `apps/web/src/lib/assignment-test-draft-store.ts:15-23`, S3 `test-builder-shell.tsx:101-106`]
- Dữ liệu đọc của web đến từ kernel snapshot (`assignmentTests` + parts group theo test). ✅ [S7 `apps/server/src/routes/snapshot.ts:571-587,822-832`]

**Boundary (out of scope):**

- **Nhập đề bằng AI** là feature `exam-import-ai` riêng; điểm chạm duy nhất là nút "Nhập bằng AI" trên PageHead của màn tạo bộ đề và route `/assignments/tests/import` redirect về `/assignments/tests/new` khi AI tắt. ✅ [S3 `apps/web/src/routes/_auth/assignments/tests/new.tsx:3,29`, S8 `apps/web/src/routes/_auth/assignments/tests/import.tsx:41-45`; side-effect: publish tạo thẳng `assignment_test` status ready — `apps/server/src/lib/exam-import/publish-to-bank.ts:463-503`]
- **Làm bài / chấm bài học viên** thuộc feature `student-quiz`/`grading`: điểm chạm là `quiz_attempt.test_id` (nguồn của khóa parts) và catalog tự luyện đọc `assignment_test` status `ready`. ✅ [S9 `packages/db/src/schema/quiz-attempt.ts:57-59`, S10 `apps/server/src/routes/student-practice.ts:57-91,246-266`]
- **Prompt-bank** (soạn đề reading/writing/… từng part) là feature kế bên; builder chỉ tiêu thụ prompt qua picker/composer và PATCH đáp án khi soát key. ✅ [S7 `apps/server/src/routes/assignments/index.ts:110-153,199-525`]
- **Thư viện đề toàn hệ thống** (`library_test`, admin) là bảng riêng, chỉ mượn pattern collection/testGroup. ✅ [S11 `packages/db/src/schema/library-test.ts:11-37`]
- **Placement test** (`/kiem-tra-dau-vao/`) dùng schema riêng, không liên quan. ✅ [S11 `packages/db/src/schema/placement-test.ts` tồn tại tách biệt; grep `assignmentTest` trong `apps/server/src/routes/placement*.ts` = 0 kết quả]

## 2. Actors & Stakeholders

| Actor | Loại (người/hệ thống/ngoài) | Mục tiêu | Trong scope? | Nguồn | Nhãn |
|-------|-----------------------------|----------|--------------|-------|------|
| Giáo viên (teacher, org member) | người | Soạn/ghép/sửa/xóa bộ đề, soát đáp án, xem trước | Có | S1 `apps/server/src/routes/assignments/tests.ts:64-65` (guard `kernelCtx`); S5 e2e đăng ký tài khoản giáo viên | ✅ |
| Học viên | người | Làm bộ đề status `ready` qua tự luyện; bị khóa phần nhìn đáp án | Không (touchpoint) | S10 `apps/server/src/routes/student-practice.ts:61-66`; S2 `packages/db/src/schema/quiz-attempt.ts:57-59` | ✅ |
| Kernel snapshot (hệ thống) | hệ thống | Phục vụ dữ liệu đọc `assignmentTests` cho web | Có (dependency) | S7 `apps/server/src/routes/snapshot.ts:822-832` | ✅ |
| Luồng nhập đề AI (exam-import) | hệ thống (feature khác) | Xuất bản đề bóc tách thành `assignment_test` + parts | Không (touchpoint) | S8 `apps/server/src/lib/exam-import/publish-to-bank.ts:463-503` | ✅ |
| Khách/ngoài hệ thống | ngoài | Không có endpoint công khai của feature này | Không | grep route public = không có; mọi handler guard 401 | ✅ |

## 3. Functional Requirements (FR)

> Priority trong ngoặc là suy đoán phân tích (🔵) — code không ghi priority; phần mô tả là ✅ có cite.

| ID | Title | Description | Priority | Verify by | Nguồn | Nhãn |
|----|-------|-------------|----------|-----------|-------|------|
| FR-assignment-tests-001 | Tạo bộ đề draft | POST tạo row `assignment_test` với title/description/skill/timeLimitSeconds/collection/testGroup; luôn sinh `status="draft"`; parts không nằm ở create | P0 🔵 | test (`tests.test.ts:242-270`) | S1 `tests.ts:63-86`; S6 `contracts.ts:1194-1213` | ✅ |
| FR-assignment-tests-002 | Cập nhật metadata | PATCH partial title/description/timeLimitSeconds/collection/testGroup/status; `skill` không được đổi (400); body không field nào → no-op 200 | P0 🔵 | test (`tests.test.ts:301-314`) | S1 `tests.ts:88-131`; S6 `contracts.ts:1216-1221` | ✅ |
| FR-assignment-tests-003 | Xóa bộ đề | DELETE xóa parts + test trong MỘT `db.batch` (không dựa FK cascade) | P1 🔵 | test (`tests.test.ts:316-323`) | S1 `tests.ts:133-161` | ✅ |
| FR-assignment-tests-004 | Ghép parts replace-all | PUT toàn bộ danh sách part (≤4); chặn slot lạ, part trùng, quá 4 mục; kiểm membership: prompt thuộc org, đúng skill của test, đúng part của slot, chặn hybrid Writing prompt; position = index slot trong preset | P0 🔵 | test (`tests.test.ts:272-299,325-378`) | S1 `tests.ts:163-302`; S6 `contracts.ts:1230-1267` | ✅ |
| FR-assignment-tests-005 | Đánh số câu liên tục | `computeTestRanges` là nguồn số duy nhất: qStart part sau = qStart + count part trước; `qStartOverride` đè mốc; part count 0 không dịch mốc | P0 🔵 | test (`test-ranges.test.ts:19-66`) | S4 `apps/web/src/lib/test-ranges.ts:27-45`; S3 `test-builder-shell.tsx:194-220` | ✅ |
| FR-assignment-tests-006 | Khóa parts khi có attempt | PUT parts tạo thay đổi khi tồn tại `quiz_attempt` cùng org → 409 `TEST_PARTS_LOCKED`; gửi lại đúng danh sách hiện có → 200 idempotent, giữ nguyên row | P0 🔵 | test (`tests.test.ts:392-743`) | S1 `tests.ts:244-281`; S6 `contracts.ts:1183-1192` | ✅ |
| FR-assignment-tests-007 | Builder shell 2 cột | Outline trái (số part đã gán/tổng slot, tổng câu, dải câu mỗi slot) + form header + slots; mọi slot render từ `ASSIGNMENT_TEST_PRESETS`, không hard-code | P0 🔵 | test (`test-builder-shell.test.tsx:134-283`) | S3 `test-builder-shell.tsx:72-77,180-186,617-655` | ✅ |
| FR-assignment-tests-008 | Chọn part từ ngân hàng | Dialog lọc prompt theo skill+part của slot, loại prompt hybrid, sort mới nhất trước, hiện cả bản draft kèm badge | P1 🔵 | test (`test-builder-shell.test.tsx:156-193`) | S3 `test-builder-shell.tsx:603-613`; S3 `prompt-picker-dialog.tsx:6-10,29-65` | ✅ |
| FR-assignment-tests-009 | Soạn mới part trong slot | Composer nhúng lockPart (skill/part không đổi được); lưu prompt vào ngân hàng rồi tự gán vào slot; khi lưu lỗi nhận id thất bại → báo gán lại tay | P1 🔵 | test + e2e | S3 `test-builder-shell.tsx:371-401,452-487`; S5 e2e `assignment-test-create.spec.ts:199-223` | ✅ |
| FR-assignment-tests-010 | Chỉnh sửa part đã gán | Mở composer với baseline = giá trị lúc mở; PATCH prompt chỉ gửi field thật sự khác baseline (text trim, JSON canonical); skill/part không bao giờ nằm trên PATCH | P1 🔵 | test (`test-builder-shell.test.tsx:285-425`) | S3 `test-builder-shell.tsx:403-417,968-1040` | ✅ |
| FR-assignment-tests-011 | Gỡ part khỏi slot | Nút ✕ chỉ gỡ prompt khỏi test (null slot + reset override), prompt giữ nguyên trong ngân hàng; edit mode persist ngay, thất bại thì rollback state | P1 🔵 | test (`test-builder-shell.test.tsx:427-485`) | S3 `test-builder-shell.tsx:354-369`; S3 `test-part-slot.tsx:110-112` | ✅ |
| FR-assignment-tests-012 | Soát đáp án (View All / Paste / Compare / Apply) | Grid ô đáp án đánh số tuyệt đối; dán key `số. giá trị[/alt]`; so khớp match/mismatch/missing/extra; Apply ghi answer+alts vào prompt từng part qua PATCH tuần tự, chỉ câu mismatch, lỗi thì dừng không rollback | P0 🔵 | test (`answers-checking-panel.test.tsx`, `repos/assignment-tests.test.ts:385-500`) + e2e `assignment-test-create.spec.ts:226-259` | S3 `answers-checking-panel.tsx:21-32,112-137`; S4 `test-answer-key.ts:105-181,206-231`; S4 `repos/assignment-tests.ts:164-219` | ✅ |
| FR-assignment-tests-013 | Xem trước giấy thi | Handoff sessionStorage (≤1MB nhúng nguyên văn, vượt trần → ref theo test id); render heading, thời gian, dải câu, option bank; không bao giờ render đáp án | P1 🔵 | test (`test-preview-paper.test.tsx`) + e2e `assignment-test-create.spec.ts:274-298` | S3 `assignment-test-preview-draft.ts:135-168`; S3 `test-preview-paper.tsx:15-24`; S3 `preview.tsx:80-146` | ✅ |
| FR-assignment-tests-014 | Autosave bản nháp + phục hồi | Create mode: debounce 1s lưu header + slot drafts vào localStorage (schema v2, TTL 7 ngày, cap 512KB); lần sau vào hiện banner phục hồi, Tiếp tục hoặc Hủy xóa trắng | P1 🔵 | test (`assignment-test-draft-store` qua shell test) | S3 `assignment-test-draft-store.ts:15-23,144-226`; S3 `test-builder-shell.tsx:101-171,257-277,589-601` | ✅ |
| FR-assignment-tests-015 | Snapshot đồng bộ | Kernel snapshot trả `assignmentTests` org-scoped kèm parts group theo test, thứ tự position; row thiếu field collapse về null/[]/draft phía web | P0 🔵 | test (`repos/assignment-tests.test.ts:51-131`) | S7 `snapshot.ts:571-587,822-832`; S4 `repos/assignment-tests.ts:15-41` | ✅ |
| FR-assignment-tests-016 | Datalist collection/group | Input tự do + datalist distinct từ các bộ đề đã có; gõ tên mới = tạo mới inline | P2 🔵 | test (`repos/assignment-tests.test.ts:242-258`) | S4 `repos/assignment-tests.ts:70-88`; S3 `test-header-form.tsx:216-253` | ✅ |
| FR-assignment-tests-017 | Form header + parse thời gian | Validate trùng rule zod server (import schema, không copy); thời gian MM:SS hoặc HH:MM:SS, để trống = null (không giới hạn); sai dạng chặn trước zod với message hướng dẫn | P0 🔵 | test (`test-header-form.test.tsx:12-135`) | S3 `test-header-form.tsx:37-121` | ✅ |

## 4. Non-Functional Requirements (NFR)

| ID | Category | Requirement | Priority | Acceptance | Nguồn | Nhãn |
|----|----------|-------------|----------|------------|-------|------|
| NFR-assignment-tests-001 | security | Multi-tenant: mọi handler guard `kernelCtx`; test/part truy vấn luôn kèm `orgId`; promptId ngoài org bị chặn trước khi ghi (IDOR) | P0 🔵 | test IDOR 400 (`tests.test.ts:362-378`), org-isolation (`tests.test.ts:650-685`) | S1 `tests.ts:64-65,101,144,177,189-205` | ✅ |
| NFR-assignment-tests-002 | security | Route mount trong kernel tree nên được cover Origin + JSON content-type CSRF guard; body limit 256KB cho POST/PATCH | P0 🔵 | phân tích + comment kiến trúc | S1 `tests.ts:27-29`; S7 `routes/assignments/index.ts:44-47,63-68`; mount `apps/server/src/routes/kernel.ts:3495` + `routes/assignments/index.ts:529` | ✅ |
| NFR-assignment-tests-003 | integrity | Replace-all parts nguyên tử: delete + insert trong một `db.batch` (D1 không có transaction); orphan part không bao giờ tồn tại; xóa test cũng batch 2 statement | P0 🔵 | test CRUD round-trip | S1 `tests.ts:31-33,133-134,147-159,283-300` | ✅ |
| NFR-assignment-tests-004 | correctness | Số câu chỉ derive từ `computeTestRanges`; cấm dùng qStart tĩnh của preset làm đầu vào numbering (part thật có thể 12/15 câu) | P0 🔵 | unit test 4 ca (`test-ranges.test.ts:19-66`) + e2e khớp 29–40 | S4 `test-ranges.ts:2-10`; S3 `test-builder-shell.tsx:194-197` | ✅ |
| NFR-assignment-tests-005 | privacy | Preview paper không bao giờ render đáp án (`answer` chỉ dùng tính rộng ô nhập, không render; e2e assert 0 kết quả "TRUE"/"YES"/"Đáp án đúng") | P0 🔵 | e2e (`assignment-test-create.spec.ts:295-298`) | S3 `test-preview-paper.tsx:21-24` | ✅ |
| NFR-assignment-tests-006 | performance/usability | Autosave debounce 1s, skip khi chưa có nội dung; lưu quá 512KB bị skip + console.warn, không bao giờ ngắt flow soạn | P1 🔵 | unit + phân tích | S3 `test-builder-shell.tsx:256-277`; S3 `assignment-test-draft-store.ts:19-23,144-162` | ✅ |
| NFR-assignment-tests-007 | reliability | Apply key idempotent và dừng an toàn: chỉ ghi câu mismatch, lỗi part dừng vòng, chạy lại chỉ đụng câu còn lệch; 0 changes → 0 PATCH | P1 🔵 | unit (`repos/assignment-tests.test.ts:463-500`) | S4 `repos/assignment-tests.ts:200-219` | ✅ |
| NFR-assignment-tests-008 | resilience | Mọi write có thể "đã lưu mà không chắc" (committed/outcome-unknown) phải không hồi sinh draft và không cho replay mù; rollback state chỉ khi chắc chắn thất bại | P1 🔵 | test (`test-builder-shell.test.tsx:427-485`) | S3 `test-builder-shell.tsx:502-510,302-328`; S3 `use-kernel-form-submit.ts:62-64` | ✅ |
| NFR-assignment-tests-009 | data-integrity | Snapshot mapping defensive: row server cũ/corrupt collapse về `[]`/null/draft, UI không bao giờ thấy hole | P2 🔵 | unit (`repos/assignment-tests.test.ts:87-99`) | S4 `repos/assignment-tests.ts:15-41` | ✅ |

## 5. Business Rules

| ID | Rule | Trigger | Implements FR | Nguồn | Nhãn |
|----|------|---------|---------------|-------|------|
| BR-assignment-tests-001 | Kỹ năng bộ đề bất biến sau khi tạo | PATCH gửi `skill` khác skill hiện có | FR-002 | S1 `tests.ts:88-89,104-105` (lỗi `skill is immutable`); UI khóa select khi edit `test-header-form.tsx:143-145,193-201` | ✅ |
| BR-assignment-tests-002 | Mỗi slot tối đa 1 prompt trong một test | PUT parts có 2 item cùng part, hoặc part lạ, hoặc >4 mục | FR-004 | S2 unique index `assignment-test.ts:72-77`; S6 superRefine `contracts.ts:1241-1266` (`.max(4)` dòng 1240); test `tests.test.ts:325-341` | ✅ |
| BR-assignment-tests-003 | Chỉ 4 kỹ năng luyện tập được tạo bộ đề | Tạo/sửa với skill grammar/vocabulary | FR-001 | S6 `contracts.ts:347-353,1203`; test `assignment-rich-text-contract.test.ts:540-557` | ✅ |
| BR-assignment-tests-004 | Thời lượng 1..10.800 giây hoặc null = không giới hạn | Create/PATCH timeLimitSeconds | FR-001/002, FR-017 | S6 `contracts.ts:1204-1209` (`.gt(0).max(3*3600).nullable()`); UI `test-header-form.tsx:85-97,107` | ✅ |
| BR-assignment-tests-005 | Prompt hybrid Writing không gắn được vào test | PUT parts với prompt có `writingPart != null` | FR-004 | S1 `tests.ts:214-218`; picker cũng lọc `prompt.writing == null` `test-builder-shell.tsx:610` | ✅ |
| BR-assignment-tests-006 | Prompt đang nằm trong một test không xóa được khỏi ngân hàng | DELETE prompt được tham chiếu bởi `assignment_test_part` | FR-004 (liên quan prompt-bank) | S2 FK RESTRICT `assignment-test.ts:60-66` | ✅ |
| BR-assignment-tests-007 | Bộ đề đã có lượt làm thì khóa cấu trúc parts (thêm/gỡ/đổi prompt/đổi override) | PUT parts tạo diff khi tồn tại `quiz_attempt` cùng org | FR-006 | S1 `tests.ts:244-281`; test cả `in_progress` lẫn `submitted` `tests.test.ts:408-513`; mã `contracts.ts:1187-1190` | ✅ |
| BR-assignment-tests-008 | Idempotent parts: gửi lại đúng danh sách hiện có không phải là thay đổi, không chạm DB dù đang bị khóa | PUT parts map part→(promptId, override) giống hệt hiện trạng | FR-006 | S1 `tests.ts:221-262`; test giữ row ID `tests.test.ts:557-620` | ✅ |
| BR-assignment-tests-009 | Slot trống (chưa gán prompt) không làm dịch số của các part sau | computeTestRanges gặp part count 0 | FR-005 | S4 `test-ranges.ts:27-32`; test ca (d) `test-ranges.test.ts:56-65` | ✅ |
| BR-assignment-tests-010 | Thứ tự part trong test = thứ tự preset, bất kể thứ tự client gửi | PUT parts gửi p2 trước p1 | FR-004/005 | S1 `tests.ts:292-296` (`findIndex` trong preset); test `tests.test.ts:272-299` | ✅ |
| BR-assignment-tests-011 | Khi Apply key, chỉ câu `mismatch` được ghi; câu match không ghi lại (chống đè mất alts đang có) | Apply answer key | FR-012 | S4 `repos/assignment-tests.ts:159-163,164-191`; test `repos/assignment-tests.test.ts:429-461` | ✅ |
| BR-assignment-tests-012 | Học viên chỉ thấy bộ đề `ready` cùng org và có tối thiểu 1 part | Học viên mở catalog tự luyện / bắt đầu attempt | FR-015 (touchpoint student-practice) | S10 `student-practice.ts:61-66,246-266` (filter `status='ready'` + exists part) | ✅ |
| BR-assignment-tests-013 | Xóa bộ đề không xóa lượt làm: `quiz_attempt.test_id` SET NULL, điểm đã nộp giữ nguyên | DELETE test có attempt | FR-003 (touchpoint student-quiz) | S2 `quiz-attempt.ts:35-40,57-59`; ghi chú "Đề đã xoá" `quiz-attempt.ts:37` | ✅ |
| BR-assignment-tests-014 | Composer trong slot luôn khóa skill/part theo slot (không đổi giữa chừng) | Bật composer soạn mới/chỉnh sửa trong builder | FR-009/010 | S3 `test-builder-shell.tsx:76,424-428` (patch lạ bị bỏ); `lockPart` prop `test-builder-shell.tsx:744` | ✅ |
| BR-assignment-tests-015 | Tạo mới bộ đề không bao giờ nhận parts trong body create | POST với field lạ (schema `.strict()`) | FR-001 | S6 `contracts.ts:1213` `.strict()` + comment `contracts.ts:1197`; S1 `tests.ts:62` | ✅ |

## 6. Error Matrix

> Wording là nguyên văn chuỗi trả về/hiển thị trong code (R2: cite cả throw-site lẫn catalog/mapping).

| Error ID | Title | Trigger | Severity | Related FR | Screen state | Recovery | Nguồn | Nhãn |
|----------|-------|---------|----------|------------|--------------|----------|-------|------|
| E-assignment-tests-001 | 401 unauthorized | Gọi API không có session/kernelCtx | critical | mọi FR write | — (API) | Đăng nhập lại | S1 `tests.ts:38-40` (`{"error":"unauthorized"}`); test `tests.test.ts:380-391` | ✅ |
| E-assignment-tests-002 | 400 invalid json | Body không parse được JSON | minor | FR-001/002/004 | — (API) | Gửi lại body hợp lệ | S1 `tests.ts:49-53` (`{"error":"invalid json"}`) | ✅ |
| E-assignment-tests-003 | 400 invalid body | Body fail zod (`assignmentTestCreateSchema`/`UpdateSchema`/`PartsSetSchema`, gồm "invalid part slot", "duplicate part" từ superRefine) | major | FR-001/002/004 | — (API); UI hiện lỗi field trước khi gửi | Sửa theo lỗi field | S1 `tests.ts:54-57` (`{"error":"invalid body"}`); S6 `contracts.ts:1249-1264` | ✅ |
| E-assignment-tests-004 | 404 test not found | Test id không tồn tại hoặc không thuộc org | major | FR-002/003/004 | Edit route web: "Không tìm thấy bộ đề." (`$id.tsx:9-19`) | Về trang Bài tập | S1 `tests.ts:103,129,146,179` | ✅ |
| E-assignment-tests-005 | 400 skill is immutable | PATCH đổi `skill` khác giá trị hiện có | major | FR-002, BR-001 | UI khóa select nên không kích hoạt được từ UI | Chỉ đổi qua test mới | S1 `tests.ts:104-105`; UI `test-header-form.tsx:143-145` | ✅ |
| E-assignment-tests-006 | 400 invalid test skill | Skill của test không có preset (không xảy ra với dữ liệu hợp lệ vì create chặn trước) | minor | FR-004 | — (API) | — | S1 `tests.ts:180-181` | ✅ |
| E-assignment-tests-007 | 400 invalid part slot for skill | Part không thuộc preset của skill test (ví dụ s4 vào test reading) | major | FR-004, BR-002 | — (API) | Chọn slot đúng preset | S1 `tests.ts:182-185` | ✅ |
| E-assignment-tests-008 | 400 prompt not found | promptId không thuộc org hiện tại (gồm IDOR) | major | FR-004, NFR-001 | — (API) | Chọn prompt trong org | S1 `tests.ts:189-209`; test `tests.test.ts:362-378` | ✅ |
| E-assignment-tests-009 | 400 prompt skill mismatch | Prompt skill khác skill test | major | FR-004 | Picker đã lọc nên khó kích hoạt từ UI | Chọn prompt đúng kỹ năng | S1 `tests.ts:210-211`; test `tests.test.ts:343-360` | ✅ |
| E-assignment-tests-010 | 400 prompt part mismatch | Prompt.part khác part của slot | major | FR-004 | — (API) | Gán prompt vào slot đúng part | S1 `tests.ts:212-213` | ✅ |
| E-assignment-tests-011 | 400 hybrid prompt cannot be attached to test | Prompt có `writingPart != null` | major | FR-004, BR-005 | Picker đã lọc hybrid | — | S1 `tests.ts:214-218` | ✅ |
| E-assignment-tests-012 | 409 test parts locked | PUT parts tạo thay đổi khi test có `quiz_attempt` | critical | FR-006, BR-007/008 | UI hiện thông báo khóa + hoàn nguyên slot | Đổi metadata vẫn được; muốn đổi đề → tạo bộ đề mới | Throw S1 `tests.ts:273-281` (nguyên văn `{"error":"test parts locked","code":"TEST_PARTS_LOCKED"}`); catalog S6 `contracts.ts:1187-1190` (`PARTS_LOCKED: "TEST_PARTS_LOCKED"`); web mapping S3 `use-kernel-form-submit.ts:25-26` ("Bộ đề đã có học viên làm bài nên không thể thay đổi hoặc gỡ part. Bạn vẫn có thể đổi tên, thời gian và trạng thái bộ đề. Muốn thay đổi đề, hãy tạo bộ đề mới.") | ✅ |
| E-assignment-tests-013 | 500 test write conflict | INSERT `returning` không có row (không quan sát được trong test) | major | FR-001 | — (API) | Thử lại | S1 `tests.ts:84` (`{"error":"test write conflict"}`) | 🟡 (OQ-6: điều kiện xảy ra chưa rõ) |
| E-assignment-tests-014 | Lỗi dòng key dán vào | Dòng key không đọc được / trùng số / giá trị không thuộc bộ đáp án của dạng | minor | FR-012 | Panel soát đáp án: "{n} dòng cần sửa (dòng hợp lệ vẫn so sánh được): Dòng {line}: {message}" | Sửa dòng lỗi; dòng hợp lệ vẫn compare | S4 `test-answer-key.ts:117-179` (message nguyên văn dòng 127, 139, 152, 172); UI `answers-checking-panel.tsx:174-188` | ✅ |
| E-assignment-tests-015 | Ghi key lỗi ở một part | PATCH part trong Apply trả lỗi | major | FR-012 | Panel: `Ghi lỗi ở part "{label}" — các part trước đã ghi xong và không hoàn tác; chạy lại Apply để tiếp phần còn lệch.` | Chạy lại Apply (idempotent) | S3 `answers-checking-panel.tsx:126-132` | ✅ |
| E-assignment-tests-016 | Thời gian nhập sai dạng | Time limit khác rỗng mà không parse được MM:SS/HH:MM:SS | minor | FR-017 | Field error: "Nhập thời gian theo dạng MM:SS hoặc HH:MM:SS." | Nhập lại đúng dạng hoặc xóa trắng | S3 `test-header-form.tsx:89-97` | ✅ |
| E-assignment-tests-017 | Lỗi field header | Vi phạm rule zod (title 1–200, mô tả ≤2000, collection ≤200, group ≤100…) | minor | FR-017 | "Tiêu đề 1–200 ký tự." / "Mô tả tối đa 2000 ký tự." / "Thời gian từ 1 giây đến 3:00:00." / "Collection tối đa 200 ký tự." / "Group tối đa 100 ký tự." | Sửa field | S3 `test-header-form.tsx:66-73,110-119` | ✅ |
| E-assignment-tests-018 | Lỗi lưu chung (không phân loại) | definite-failure không phải mã khóa | major | FR-001/002 | "Không lưu được — dữ liệu chưa được ghi lên máy chủ. Vui lòng kiểm tra và thử lại." | Thử lại | S3 `use-kernel-form-submit.ts:11-12,19-29` | ✅ |
| E-assignment-tests-019 | Preview rỗng | Mở /tests/preview khi không có handoff | minor | FR-013 | "Chưa có bộ đề nào để xem trước." + "Trang này không mở được trực tiếp bằng link." | Về trang soạn | S3 `preview.tsx:91-117` | ✅ |

## 7. Success Criteria

| ID | Outcome nghiệp vụ | Đo bằng | Mốc đạt | Nguồn | Nhãn |
|----|-------------------|---------|---------|-------|------|
| SC-assignment-tests-01 | Dựng bộ đề reading 3 part / 40 câu end-to-end (2 part ngân hàng + 1 part soạn trong slot) | e2e `assignment-test-create.spec.ts:141-320` | Flow chạy xanh; outline "3/3 parts · 40 questions" | S5 | ✅ |
| SC-assignment-tests-02 | Đánh số liên tục đúng số câu thật (p1+p2 = 28 câu thật → part 3 phải 29–40 dù composer chip tĩnh 27) | e2e assert "Câu 29–40" | `computeTestRanges` là nguồn số duy nhất | S5 `assignment-test-create.spec.ts:15-18,222-223` | ✅ |
| SC-assignment-tests-03 | Soát key phát hiện và sửa đúng 2 câu lệch, Apply không đè câu khác | e2e paste key 40 dòng 2 sai → "38 match, 2 mismatch" → fix → "40 match, 0 mismatch" | 0 mismatch sau Apply, reload vẫn giữ | S5 `assignment-test-create.spec.ts:226-259,308-319` | ✅ |
| SC-assignment-tests-04 | Preview giống giấy thi, không lộ đáp án | e2e assert heading/passages + count "TRUE"/"YES"/"Đáp án đúng" = 0 | Không có đáp án trên paper | S5 `assignment-test-create.spec.ts:274-298` | ✅ |
| SC-assignment-tests-05 | Dữ liệu bền qua reload (slots + key đã apply) | e2e reload rồi assert lại slots + compare | Persist từ server snapshot | S5 `assignment-test-create.spec.ts:308-319` | ✅ |
| SC-assignment-tests-06 | Khóa parts bảo vệ bài đã làm | unit: mọi biến thể thêm/gỡ/đổi/override khi có attempt → 409, DB không đổi | 409 `TEST_PARTS_LOCKED` giữ nguyên row ID | S1 test `tests.test.ts:408-555` | ✅ |

## 8. Data Entities (tóm tắt — chi tiết ở `srs/assignment-tests-reverse-erd.md`)

- **organization** — gốc multi-tenant; cascade xóa mọi bộ đề. ✅ [S2 `assignment-test.ts:22-24`]
- **assignment_test** — 1 row = 1 bộ đề: title (bắt buộc), description (rich), skill (4 kỹ năng practice), timeLimitSeconds (null = không giới hạn), collection, testGroup, status draft|ready, createdAt/updatedAt. Index org_id. ✅ [S2 `assignment-test.ts:18-44`]
- **assignment_test_part** — slot: testId (cascade), promptId (RESTRICT), part, position, qStartOverride (nullable); unique (testId, part); không có orgId (org-scoping qua testId). ✅ [S2 `assignment-test.ts:53-78`]
- **assignment_prompt** — đề nguồn trong ngân hàng (org-scoped); bị test tham chiếu RESTRICT; hybrid Writing (`writingPart != null`) loại khỏi test. ✅ [S2 `assignment-test.ts:60-66`; S1 `tests.ts:194-218`]
- **quiz_attempt** — lượt làm; `test_id` nullable SET NULL khi xóa đề; CHECK `mode <> 'assignment' or assignment_id is not null` (không có CHECK đảo vì sẽ chặn SET NULL). ✅ [S2 `quiz-attempt.ts:30-40,57-59,99-106`]
- Web-side (không phải DB): draft store localStorage `teacher-os:test-draft:new` (schema v2, TTL 7 ngày) và preview handoff sessionStorage `teacher-os:test-preview-draft` (schema v1, ≤1MB, ref fallback). ✅ [S3 `assignment-test-draft-store.ts:15-23`; S3 `assignment-test-preview-draft.ts:13-16`]

## 9. Flows (tóm tắt — chi tiết ở `srs/assignment-tests-reverse-flows.md`)

- F1 Tạo bộ đề mới (header → POST draft → PUT parts → sang trang edit). ✅
- F2 Ghép part vào slot: chọn từ ngân hàng hoặc soạn mới trong slot (create gom ở lần submit; edit persist ngay + rollback). ✅
- F3 Soát đáp án: paste key → compare → confirm → PATCH tuần tự từng part. ✅
- F4 Xem trước giấy thi (handoff sessionStorage, ref fallback). ✅
- F5 Sửa metadata + khóa parts 409 (skill immutable; rollback UI khi definite-failure). ✅
- F6 Xóa bộ đề (batch; UI chưa có đường gọi — G-3). 🟡
- F7 Bản nháp autosave + phục hồi. ✅

## 10. Screens (tóm tắt)

| Screen | Route | Nội dung chính | Nguồn | Nhãn |
|--------|-------|----------------|-------|------|
| Soạn bộ đề full test | `/assignments/tests/new` | Breadcrumb "Bài tập › Full test mới"; PageHead + nút Nhập bằng AI; builder shell create mode | S3 `new.tsx:6-34` | ✅ |
| Chỉnh sửa bộ đề | `/assignments/tests/$id` | 404 component "Không tìm thấy bộ đề."; skill khóa theo part đã gắn; thay đổi part lưu ngay | S3 `$id.tsx:7-49` | ✅ |
| Xem trước bộ đề | `/assignments/tests/preview` | Giấy thi học viên; không mở trực tiếp khi không có handoff; nút Quay lại soạn | S3 `preview.tsx:20-146` | ✅ |
| Nhập đề AI (touchpoint) | `/assignments/tests/import` | Redirect về `/tests/new` khi `AI_ENABLED` false | S8 `import.tsx:41-45` | ✅ |
| Dialog chọn part | modal trong builder | Danh sách prompt lọc skill+part, badge Sẵn sàng/Bản nháp | S3 `prompt-picker-dialog.tsx:29-65` | ✅ |
| Panel soát đáp án | card trong builder | View All grid, paste key, compare list, apply block | S3 `answers-checking-panel.tsx:139-256` | ✅ |

Lưu ý G-1/G-2: không có trang danh sách bộ đề và không có link điều hướng thường tới `/tests/new` (chỉ fallback preview-rỗng, redirect import, dialog hết credit) — xem `reverse-gaps.md`.

## 11. Constraints, Dependencies & Assumptions

**Constraints (ràng buộc áp đặt):**

| Ràng buộc | Source / Owner | Nguồn | Nhãn |
|-----------|----------------|-------|------|
| D1 SQLite không có `.transaction()` — nguyên tử phải qua `db.batch` | nền tảng Cloudflare D1 | S1 `tests.ts:32-33` | ✅ |
| Route phải mount trong kernel tree (CSRF Origin + JSON guard); never mount standalone | kiến trúc server | S1 `tests.ts:27-29`; S7 `routes/assignments/index.ts:44-47` | ✅ |
| Đánh số câu KHÔNG được dùng qStart tĩnh của catalog part làm đầu vào | design decision trong code | S4 `test-ranges.ts:2-10` | ✅ |
| Org-scoping của `assignment_test_part` đi qua testId (bảng không có orgId) | schema | S2 `assignment-test.ts:51` | ✅ |
| Slot id phải thuộc union các preset; membership theo skill của test do route kiểm (route mới có test.skill từ DB) | contract | S6 `contracts.ts:1223-1229` | ✅ |
| PATCH/prompt body limit 256KB (POST/PATCH) | routes | S7 `routes/assignments/index.ts:63-68` | ✅ |

**Dependencies (deliverable do bên khác sở hữu):**

| Phụ thuộc | Owner | Blocks nếu chưa sẵn | Nguồn | Nhãn |
|-----------|-------|---------------------|-------|------|
| Ngân hàng prompt (assignment_prompt + POST/PATCH prompts) | feature assignment-prompt-bank | Không có part để gán; Apply key không ghi được | S7 `routes/assignments/index.ts:110-153,199-525` | ✅ |
| Kernel snapshot (`GET /api/kernel`) | hạ tầng kernel | Web không có dữ liệu tests/parts (mọi route đọc qua snapshot, không có GET đơn) | S7 `snapshot.ts:822-832`; S1 (không có routes.get trong `tests.ts`) | ✅ |
| `useKernelFormSubmit` + command bus | hạ tầng web | Không gửi được action create/update/parts | S3 `use-kernel-form-submit.ts:56-95`; S4 `repos/kernel.ts:274-301` | ✅ |
| exam-import publish (feature exam-import-ai) | feature khác | Không chặn; là nguồn tạo test song song (status ready) | S8 `publish-to-bank.ts:463-503` | ✅ |

**Assumptions (tin là đúng — nêu hệ quả nếu sai):**

| Giả định | Invalidate {X} nếu sai | Nguồn | Nhãn |
|----------|------------------------|-------|------|
| Mọi request ghi đều đi qua kernel tree nên CSRF/origin đã được guard | NFR-002 sập nếu ai đó mount `testsRoutes` standalone (comment cảnh báo) | S1 `tests.ts:27-29` | ✅ |
| Số câu part = `prompt.questions.length` tại thời điểm render/tính (snapshot), phần tử questions có `stem` | FR-005 sai nếu questions corrupt; mapAssignmentTests collapse an toàn | S4 `test-ranges.ts:17-19`; S4 `repos/assignment-tests.ts:15-41` | ✅ |
| Người dùng builder là giáo viên trong org (kernelCtx.orgId) | Multi-tenant của FR/NFR sập | S1 `tests.ts:64-65` | ✅ |
| UI không có đường set test `status=ready` (chỉ API/exam-import) — xem OQ-1 | BR-012: nếu giả định sai (có control nào đó bị bỏ sót) thì học viên đã thấy test draft | grep `status` trong `test-header-form.tsx` = 0; payload gửi đi là `AssignmentTestCreate` không có status | 🟡 |

## 12. Open Questions

> Danh sách đầy đủ OQ + Gap ở [`reverse-gaps.md`](./reverse-gaps.md). Dưới đây chỉ trích các OQ blocking.

- [ ] OQ-1 (blocking sản phẩm): Làm sao bộ đề soạn tay chuyển sang `ready`? Contract PATCH nhận `status` nhưng UI không có control nào gửi status — bộ đề tạo tay không bao giờ xuất hiện trong catalog tự luyện của học viên.
- [ ] OQ-2: Cửa vào builder ở đâu trong app? Không tìm thấy link điều hướng tới `/assignments/tests/new` ngoài fallback/redirect của feature khác.
- [ ] OQ-4: `qStartOverride` không có control UI (chỉ state nội bộ) — ai là người dùng thật của tính năng này?

<!-- wm:c3e3a8b9c06f46427bf9089e2fdafa48 -->
<sub>Tài liệu thuộc bộ AI4BA BA-Kit — bản quyền hoangphan.blog</sub>
