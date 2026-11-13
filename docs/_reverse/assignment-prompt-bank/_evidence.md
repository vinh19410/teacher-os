# Bằng chứng kỹ thuật — assignment-prompt-bank

Mọi dòng cite theo working tree develop @ d6c0f6b5. Chỉ tên biến/constant — không có secret trong feature này.

## §1 Endpoints (Nguồn thật của wire)

| Endpoint | Handler | Hành vi | Cite |
|----------|---------|---------|------|
| GET `/api/assignments` | `routes.get("/")` trong assignmentRoutes | Trả `snapshot.assignments` — danh sách điểm per-học viên (grading legacy), KHÔNG phải ngân hàng đề; ngân hàng đến từ GET `/api/kernel` | `apps/server/src/routes/assignments/index.ts:103-108`; `apps/server/src/routes/kernel.ts:448` |
| POST `/api/assignments/prompts` | `routes.post("/prompts")` | Tạo row `assignment_prompt`: org từ kernelCtx; `task`/`genre` derive (writing → part/type, không thì "task2"/""); `questions`/`optionBank` stringify; trả `{id}` 201 (CreatedResponse); insert trống → 500 `prompt write conflict` | `apps/server/src/routes/assignments/index.ts:113-153` (derive `:124-125`, stringify `:140,143`, 500 `:151`, 201 `:152`) |
| PATCH `/api/assignments/prompts/:id` | `routes.patch("/prompts/:id")` | Partial update org-scoped: load row → 404; validate type theo skill/part của ROW; per-question type/answer; questions-only; writing skill guard; writing-lock 3 probe; contentChanged diff (trim/canonical); attempt probe → 409 CONTENT_LOCKED; metadata luôn ghi; content chỉ ghi khi đổi; no-op → 200 `{id}` | `apps/server/src/routes/assignments/index.ts:199-525` (404 `:237,523`; type rules `:241-257`; per-question `:261-281`; questions-only `:282-292`; writing guard `:297-303`; writing lock `:304-374`; diff `:382-427`; attempt `:428-463`; updates map `:465-509`; no-op `:511-512`) |
| POST `/api/assignments/:id/grade` | `routes.post("/:id/grade")` | Touchpoint grading: update bảng `assignment` (scores + status graded) + phát notification grade_returned | `apps/server/src/routes/assignments/index.ts:155-193` |
| `/api/assignments/tests*` | `testsRoutes` mount con | Feature assignment-tests (bộ đề): CRUD + PUT parts replace-all | `apps/server/src/routes/assignments/index.ts:527-529`; `apps/server/src/routes/assignments/tests.ts:20-29,135` |
| GET `/api/kernel` | `kernel.get("/kernel")` | Snapshot: `assignmentPrompts` gồm đề của org, loại `demo-prompt:%` và `library_ref` không null, order createdAt asc | `apps/server/src/routes/kernel.ts:448`; `apps/server/src/routes/snapshot.ts:338-347,744-790` |
| POST `/api/classes/:id/assignments` | kernel route (feature classes) | Touchpoint giao đề: prompt phải thuộc org và `status === "ready"` (400 `prompt not ready`); tạo `class_assignment` snapshot title | `apps/server/src/routes/kernel.ts:1511-1542` |

Web command mapping (client → endpoint): `create-assignment-prompt` → POST `/api/assignments/prompts` (`apps/web/src/lib/repos/kernel.ts:187-193`); `update-assignment-prompt` → PATCH `/api/assignments/prompts/:id` (`:302-309`). Action types: `apps/web/src/lib/data-actions.ts:80-85,285-292`.

Auth/CSRF: kernel middleware Origin allowlist + JSON-only cho POST/PUT/PATCH/DELETE (`apps/server/src/routes/kernel.ts:189-211`); kernelCtx (orgId, userId, role) set ở bootstrapMiddleware sau khi chặn student/admin và teacher allowlist (`apps/server/src/app.ts:207-301`). Router assignments mount tại `apps/server/src/routes/kernel.ts:3495`.

## §2 Validation (2 lớp)

### Lớp server — zod schema

- `assignmentPromptBaseSchema` (`.strict()`): skill enum 6 giá trị; part 1-20; type ≤20; title 1-200; band enum; source ≤200; prompt richText 5000 (raw 12500); passage 20000; intro 2000; transcript 10000; cueTopic ≤500; cuePoints ≤2000; audioName ≤200; imageUrl ≤500; questions ≤40; optionBank ≤8 (mỗi mục 1-200); note 2000; status enum draft|ready; writing nullable optional — `packages/api/src/contracts.ts:831-870`, richTextField `packages/api/src/rich-text.ts:129-146`.
- `assignmentQuestionSchema` (`.strict()`): stem ≤500; opts ≤6×500 nullish; answer ≤200; alts ≤500; type 1-20 nullish; pin {x,y} 0-100 nullish; explanation richText 2000 optional; answerSet 1-20 nullish — `packages/api/src/contracts.ts:722-762`.
- `assignmentPromptCreateSchema.superRefine`: part thuộc catalog; type rules theo status/skill (ready chặt, writing draft lỏng, kỹ năng khác chặt) `:874-898`; per-question type `:899-908`; questions-only-auto `:909-919`; writing-only-auto `:920-925`; prompt/passage/questions/audio required theo kỹ năng `:926-976`; image+pin `:977-999`; https `:1000-1005`; ready: stem/gap-blank/answer `:1006-1032`; speaking `:1033-1046`; answer-choice theo kind hiệu dụng `:1047-1059`; option-bank rules `:1060-1123` — `packages/api/src/contracts.ts`.
- `assignmentPromptUpdateSchema`: base `.omit({skill, part}).partial().strict()`; chỉ tự kiểm https + answer-choice; các rule phụ thuộc skill/part của ROW do route kiểm sau khi load — `packages/api/src/contracts.ts:1129-1165`, `apps/server/src/routes/assignments/index.ts:239-257`.
- `assignmentWritingSectionSchema`: part/type thuộc catalog writing + prompt bắt buộc — `packages/api/src/contracts.ts:770-801`.

### Lớp client — mirror trước khi gửi

- `missingRequirementsFor` (7 nhóm mục thiếu, trả fieldId để focus): `apps/web/src/routes/_auth/assignments/new.tsx:141-305`.
- `fieldErrors` inline: `:700-743`; `canSave = missingRequirements.length === 0`: `:744-746`.
- `optionBankIssue` / `clozeStemIssue` / `imagePinIssue` mirror contract: `apps/web/src/components/assignments/composer-transitions.ts:161-212,223-272,279-293`.
- Catalog đồng bộ 2 package: `BANKABLE_PAIRS`/`IMAGE_BASED_PAIRS` build từ hằng contract — `packages/ui/src/components/assignments/editor/assignment-presets.ts:99-120`.
- Image URL policy dùng chung 1 nguồn: `packages/api/src/contracts.ts:692-710`.

## §3 Errors (throw-site + catalog + web mapping)

| Lỗi | Throw-site (nguyên văn response) | Catalog / constant | Web hiển thị |
|-----|----------------------------------|--------------------|--------------|
| 409 CONTENT_LOCKED | `apps/server/src/routes/assignments/index.ts:455-461`: `c.json({ error: "prompt content locked", code: ASSIGNMENT_PROMPT_ERROR_CODES.CONTENT_LOCKED }, 409)` | `packages/api/src/contracts.ts:1174-1177`: `CONTENT_LOCKED: "PROMPT_CONTENT_LOCKED"` + comment "Đề đã có quiz_attempt — trường nội dung không được đổi." | `apps/web/src/lib/use-kernel-form-submit.ts:21-22`: "Đề đã có học viên làm bài nên không sửa được nội dung. Bạn vẫn có thể đổi tiêu đề, band, nguồn và trạng thái. Muốn đổi nội dung, hãy tạo đề mới." |
| 409 WRITING_SECTION_LOCKED | `apps/server/src/routes/assignments/index.ts:364-371`: `c.json({ error: "writing section locked", code: ASSIGNMENT_PROMPT_ERROR_CODES.WRITING_SECTION_LOCKED }, 409)` | `packages/api/src/contracts.ts:1177-1178`: `WRITING_SECTION_LOCKED: "WRITING_SECTION_LOCKED"` + comment "Phần Writing bị khóa vì đề đã giao / nằm trong bộ đề, study pack." | `apps/web/src/lib/use-kernel-form-submit.ts:23-24`: "Đề đã được giao hoặc đang dùng trong bộ đề nên không sửa được phần Writing. Hãy trả phần này về như cũ để lưu các thay đổi khác." |
| 400 invalid body | `apps/server/src/routes/assignments/index.ts:96-99` | (schema messages — chỉ catalog, xem Conflict-2) | generic "Không lưu được — dữ liệu chưa được ghi lên máy chủ. Vui lòng kiểm tra và thử lại." `apps/web/src/lib/use-kernel-form-submit.ts:11-12` |
| 400 invalid type | `apps/server/src/routes/assignments/index.ts:248-249,252-253,255-256` | — | generic failure |
| 400 invalid question type / invalid answer choice (kèm `question: index`) | `:264-268`, `:272-278` | `ASSIGNMENT_ANSWER_CHOICES` `packages/api/src/contracts.ts:450-457` | generic failure |
| 400 questions only apply... | `:288-292` | `packages/api/src/contracts.ts:914-919` (cùng message) | generic failure |
| 404 prompt not found | `:237`, `:523` | — | trang "Không tìm thấy đề này." `apps/web/src/routes/_auth/assignments/new.tsx:1052-1076` |
| 500 prompt write conflict | `:151` | — | generic failure |
| 400 prompt not ready (touchpoint) | `apps/server/src/routes/kernel.ts:1541` | — | — |
| 403 origin not allowed | `apps/server/src/routes/kernel.ts:193-196` | — | — |
| 415 content-type must be application/json | `apps/server/src/routes/kernel.ts:198-207`; `apps/server/src/routes/assignments/index.ts:81-89` | — | — |

Kết quả submit client (4 kind): `apps/web/src/lib/repos/kernel.ts:412-421` — `refreshed` / `committed` / `definite-failure` (chỉ 4xx chứng minh KHÔNG lưu — comment `:423-430`) / `outcome-unknown`.

## §4 Rules + hằng số

| Rule/hằng | Giá trị | Cite |
|-----------|---------|------|
| `ASSIGNMENT_SKILLS` | writing, reading, listening, speaking, grammar, vocabulary | `packages/api/src/contracts.ts:337-344` |
| `ASSIGNMENT_PART_TYPES` | writing task1/task2; reading p1/p2/p3; listening s1-s4; speaking part1-3; grammar g1; vocabulary v1 (+ types từng part) | `packages/api/src/contracts.ts:355-403` |
| `ASSIGNMENT_BANDS` / default | 5.0,5.5,6.0,6.5,7.0,7.5,8.0 / "7.0" | `packages/api/src/contracts.ts:815-825` |
| `ASSIGNMENT_ANSWER_CHOICES` | tfng 3, ynng 3, mcq4 4, mcq3 3, roman i-viii, letter A-H | `packages/api/src/contracts.ts:450-457` |
| `ASSIGNMENT_OPTION_BANK_MAX` | 8 | `packages/api/src/contracts.ts:489` |
| `ASSIGNMENT_OPTION_BANK_TYPES` | reading: headings,info,sentend,features; listening: match2,map; vocabulary: match (skill-qualified) | `packages/api/src/contracts.ts:490-500` |
| `ASSIGNMENT_IMAGE_BASED_TYPES` | reading: diagram; listening: map | `packages/api/src/contracts.ts:675-685` |
| `ASSIGNMENT_IMAGE_SRC_PATTERN` / max length | `/^https:\/\/\S+$/` / 500 | `packages/api/src/contracts.ts:698-699` |
| questions max / stem / answer / alts / opts | 40 / 500 / 200 / 500 / 6 mục | `packages/api/src/contracts.ts:722-762,851`; `packages/ui/src/components/assignments/editor/answer-key-grid.tsx:38-47` |
| bodyLimit | 256 * 1024 bytes cho POST/PATCH | `apps/server/src/routes/assignments/index.ts:63-68` |
| Draft store | key `assignment-draft`; schemaVersion 1; TTL 7*24h; cap 512*1024 | `apps/web/src/lib/assignment-draft-store.ts:15-23` |
| Preview draft | key `teacher-os:assignment-preview-draft` (sessionStorage) | `apps/web/src/lib/assignment-preview-draft.ts:4` |
| Debounce | tìm kiếm 300ms; autosave 1000ms | `apps/web/src/routes/_auth/assignments/index.tsx:147-159`; `apps/web/src/routes/_auth/assignments/new.tsx:687-699` |
| QStart theo part | reading 1/14/27; listening 1/11/21/31; grammar+vocab 1 | `packages/ui/src/components/assignments/editor/assignment-presets.ts:181,195,209,232,243,254,265,327,349` |
| `isAutoSkill` / `isAutoGradableSkill` | reading|listening|grammar|vocabulary | `packages/ui/src/components/assignments/editor/assignment-presets.ts:392-399`; `packages/api/src/lib/ielts-band.ts:35-37` |
| promptStatus | draft → "Bản nháp"; used>0 → "Đã dùng N lớp"; else "Sẵn sàng" | `apps/web/src/components/assignments/assignment-status.ts:198-206` |
| Content-lock diff | 10 field text so trim; questions/optionBank so JSON chuẩn hóa; writing so part/type/trim(prompt) | `apps/server/src/routes/assignments/index.ts:296-317,382-427` |
| Attempt probe (khóa nội dung) | quiz_attempt cùng org JOIN class_assignment (promptId) hoặc assignment_test → assignment_test_part (promptId), limit 1 | `apps/server/src/routes/assignments/index.ts:428-453` |
| Writing-lock probe | class_assignment theo promptId; assignmentTestPart JOIN assignmentTest (org); studyPackItem source_kind='org_prompt' + sourceId | `apps/server/src/routes/assignments/index.ts:318-363` |

## §5 Entities

- `assignment_prompt` — 27 cột: id, org_id (FK→organization, cascade), task*, genre*, skill, part, type, title, band, source, prompt, intro, passage, transcript, cue_topic, cue_points, audio_name, image_url, questions, option_bank, note, status, writing_part, writing_type, writing_prompt, library_ref, created_at. (*legacy). Index: `assignment_prompt_org_idx`; unique `assignment_prompt_org_library_ref_uq (org_id, library_ref)` — `packages/db/src/schema/assignment-prompt.ts:18-67`.
- Lịch sử migration: tạo bảng `0017_wet_jetstream.sql:1-15` (id/org/task/genre/title/band/source/prompt/note/status/created_at); v5 columns `0019_solid_boomer.sql:1-10` (skill/part/type/intro/passage/transcript/cue_topic/cue_points/audio_name/questions); `image_url` `0027_unknown_lizard.sql:1`; `option_bank` `0028_salty_purifiers.sql:6`; `library_ref` + unique index `0060_study_pack.sql:7-8`; `writing_part/writing_type/writing_prompt` `0063_green_ghost_rider.sql:1-3`.
- `class_assignment` (touchpoint): prompt_id FK→assignment_prompt cascade; title snapshot; due/dueAt/note — `packages/db/src/schema/class-assignment.ts:8-19`.
- Kernel row type `KernelAssignmentPromptRow` — `packages/api/src/contracts.ts:1816-1843`; snapshot key `assignmentPrompts` — `:1941`; view model UI `AssignmentPrompt` — `apps/web/src/lib/mock-data.ts:83-108`.

## §6 Cross-repo hops (điểm chạm ra ngoài feature)

| Hop | Từ | Đến | Bằng chứng |
|-----|----|----|------------|
| classes/enrollment | ngân hàng đề | `class_assignment` (+targets) | `apps/server/src/routes/kernel.ts:1511-1542`; `packages/db/src/schema/class-assignment.ts:8-19` |
| grading | khóa nội dung | `quiz_attempt` tồn tại | `apps/server/src/routes/assignments/index.ts:428-453`; `packages/db/src/schema/quiz-attempt.ts` |
| assignment-tests | prompt nguyên liệu | `assignment_test_part.prompt_id` | `apps/server/src/routes/assignments/index.ts:330-343`; `packages/db/src/schema/assignment-test.ts` |
| study-pack | đề nguồn org_prompt | `study_pack_item (source_kind='org_prompt', source_id=promptId)` | `apps/server/src/routes/assignments/index.ts:344-362` |
| study-pack/library | materialize đề thư viện | clone row `assignment_prompt` có `library_ref`, status "ready", bị ẩn khỏi ngân hàng | `apps/server/src/lib/study-pack-clone.ts:711,740-752`; `apps/server/src/routes/snapshot.ts:341-346` |
| notifications | chấm xong | grade_returned (boundary grading) | `apps/server/src/routes/assignments/index.ts:181-191` |
| exam-import (AI) | nhập đề bằng AI | publish thẳng vào `assignment_prompt` (không library_ref) | `apps/server/src/lib/exam-import/publish-to-bank.ts:443-463` |

## §7 Gaps — negative search

| Gap | Pattern | Scope | Kết quả |
|-----|---------|-------|---------|
| Không xóa đề | `delete-assignment-prompt\|deleteAssignmentPrompt` | apps/ packages/ (--include=*.ts,*.tsx) | 0 kết quả |
| Không DELETE route prompt | `routes.delete\|kernel.delete` | apps/server/src/routes/assignments/ + kernel.ts | chỉ `tests.ts:135` (DELETE test — feature kế bên), `kernel.ts:1346,1480,2642` (invitations/enrollments/sessions) — không có /prompts |
| Không nút xóa UI | `Xóa đề\|xóa đề\|Xoá đề` | apps/web/src (--include=*.tsx) | 0 kết quả |
| Không GET chi tiết 1 đề | đọc toàn bộ route file S1 | apps/server/src/routes/assignments/index.ts | chỉ GET "/" (grading), POST /prompts, PATCH /prompts/:id, POST /:id/grade, mount /tests |
| Không audit trail | đọc schema S2 | packages/db/src/schema/assignment-prompt.ts | chỉ `created_at`, không updated_at/updated_by |
| Không phân trang | đọc query snapshot | apps/server/src/routes/snapshot.ts:338-347 | không limit/offset |
| Test active (R1) | `\.skip(\|\.todo(\|\.only(\|test.fixme\|describe.skip` | assignment-prompt-create/bank/map-listening/reading-types spec + prompt-content-lock.test.ts + tests.test.ts + assignment-prompts.test.ts | 0 kết quả (exit 1 = không match) — toàn bộ test đang active |

Số lượng test đã đếm lại: E2E assignment-prompt-create 13 test (`grep -c "^test("`), assignment-bank 1, reading-types 9, map-listening 2; server prompt-content-lock 9 test case trong 1 describe (`:272,295,329,401,425,464,493,519,555`); web `assignment-prompts.test.ts` 5 test; `new.test.tsx` ~49 it/test; `new-submit.test.tsx` 14; `index.test.tsx` 11; `preview.test.tsx` 12.
