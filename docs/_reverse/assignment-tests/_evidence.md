# Bằng chứng thô — assignment-tests

Repo /root/projects/teacher-os @ develop (d6c0f6b5). Mọi dòng cite đã đối chiếu bằng đọc file trực tiếp.

## §1 Endpoints

| Endpoint (nghiệp vụ: mở ở cột Nguồn) | Hành vi | Nguồn |
|---|---|---|
| POST /api/assignments/tests | Tạo bộ đề draft; trả 201 `{id}` | `apps/server/src/routes/assignments/tests.ts:63-86` (status draft dòng 81; 500 conflict dòng 84) |
| PATCH /api/assignments/tests/:id | Partial update meta + status; skill immutable; no-op 200 | `tests.ts:90-131` (404:103, skill:104-105, status:118, no-op:120-121) |
| DELETE /api/assignments/tests/:id | Batch xóa parts + test; 200 `{id}` | `tests.ts:135-161` |
| PUT /api/assignments/tests/:id/parts | Replace-all parts; idempotent; khóa attempt | `tests.ts:166-302` (diff:221-257; idempotent:259-262; lock:264-281; batch:283-300) |
| (đọc) GET /api/kernel → `assignmentTests[]` (parts group) | Snapshot duy nhất | `apps/server/src/routes/snapshot.ts:571-587,822-832` |
| Mount | `/api/kernel` tree → `/assignments` → `/tests` | `apps/server/src/routes/kernel.ts:3495`; `routes/assignments/index.ts:529`; bodyLimit `index.ts:63-68` |
| Web mutation map | create→POST, update→PATCH, delete→DELETE, set-parts→PUT | `apps/web/src/lib/repos/kernel.ts:274-301` |
| Touchpoint student-practice | Catalog đọc test `status='ready'` + ≥1 part; attempt gắn testId | `apps/server/src/routes/student-practice.ts:57-91,219,246-266` |
| Touchpoint grading/reminders | Join `assignmentTest` qua `quizAttempt.testId` (practice) | `apps/server/src/routes/grading.ts:209-232,255-266`; `dashboard-reminders.ts:203-217` |
| Touchpoint exam-import publish | Tạo/update `assignment_test` + parts (status theo targetStatus) | `apps/server/src/lib/exam-import/publish-to-bank.ts:192-207,463-503` |

## §2 Validation

| Rule | Nguồn (contract) | Nguồn (route) | Nguồn (UI) |
|---|---|---|---|
| title trim 1..200 | `packages/api/src/contracts.ts:1201` | qua readBody `tests.ts:54-57` | Field error `test-header-form.tsx:67`; maxLength input `:164` |
| description rich ≤2000 optional | `contracts.ts:1202` (richTextField) | — | rỗng `<p></p>` rơi khỏi payload `test-header-form.tsx:102-104`; contract test `assignment-rich-text-contract.test.ts:193-206` |
| skill ∈ PRACTICE_SKILLS (4) | `contracts.ts:347-353,1203` | — | grammar/vocab blocked: `assignment-rich-text-contract.test.ts:540-557` |
| timeLimitSeconds int >0 ≤10800 nullable | `contracts.ts:1204-1209` | — | parse MM:SS/HH:MM:SS `test-header-form.tsx:48-64`; trống→null `:89-91` |
| collection ≤200, testGroup ≤100 optional | `contracts.ts:1210-1211` | — | datalist `test-header-form.tsx:216-253` |
| schema `.strict()` (create/update/part item) | `contracts.ts:1213,1220,1238` | readBody fail → 400 | — |
| update: status enum draft\|ready optional | `contracts.ts:1217-1220` | `tests.ts:118` | UI không gửi (G-1) |
| parts: mảng ≤4; part 1..20 ký tự; promptId 1..100; qStartOverride int>0 optional | `contracts.ts:1230-1240` | — | payload builder `repos/assignment-tests.ts:50-68` |
| superRefine: slot phải thuộc union preset; không trùng part | `contracts.ts:1241-1266` | member skill của test `tests.ts:180-185` | — |
| prompt org + skill test + part slot + không hybrid | — | `tests.ts:189-218` | picker lọc skill+part+non-hybrid `test-builder-shell.tsx:603-613` |
| khóa attempt khi partsChanged | — | `tests.ts:244-281` | rollback UI `test-builder-shell.tsx:302-328` |

## §3 Errors (nguyên văn)

| Chuỗi nguyên văn | Nguồn |
|---|---|
| `{"error":"unauthorized"}` 401 | `tests.ts:38-40` |
| `{"error":"invalid json"}` 400 | `tests.ts:49-53` |
| `{"error":"invalid body"}` 400 | `tests.ts:54-57` |
| `{"error":"test not found"}` 404 | `tests.ts:103,129,146,179` |
| `{"error":"skill is immutable"}` 400 | `tests.ts:104-105` |
| `{"error":"invalid test skill"}` 400 | `tests.ts:180-181` |
| `{"error":"invalid part slot for skill"}` 400 | `tests.ts:182-185` |
| `{"error":"prompt not found"}` 400 | `tests.ts:189-209` |
| `{"error":"prompt skill mismatch"}` 400 | `tests.ts:210-211` |
| `{"error":"prompt part mismatch"}` 400 | `tests.ts:212-213` |
| `{"error":"hybrid prompt cannot be attached to test"}` 400 | `tests.ts:214-218` |
| `{"error":"test parts locked","code":"TEST_PARTS_LOCKED"}` 409 | throw `tests.ts:273-281`; catalog `packages/api/src/contracts.ts:1187-1190` (`PARTS_LOCKED: "TEST_PARTS_LOCKED"`); test `tests.test.ts:460-463` |
| `{"error":"test write conflict"}` 500 | `tests.ts:84` |
| superRefine messages: `"invalid part slot"` / `"duplicate part"` | `contracts.ts:1249-1264` |
| Web: `"Bộ đề đã có học viên làm bài nên không thể thay đổi hoặc gỡ part. Bạn vẫn có thể đổi tên, thời gian và trạng thái bộ đề. Muốn thay đổi đề, hãy tạo bộ đề mới."` | `apps/web/src/lib/use-kernel-form-submit.ts:25-26` |
| Web generic: `"Không lưu được — dữ liệu chưa được ghi lên máy chủ. Vui lòng kiểm tra và thử lại."` | `use-kernel-form-submit.ts:11-12` |
| Key parse: `"Dòng không đọc được — dùng mẫu “số. giá trị” (ví dụ: 1. TRUE)."` / `` `Q${n} bị lặp trong nội dung dán — dòng hợp lệ đầu tiên thắng.` `` / `"Dòng trống giá trị."` / `` `Q${n}: “${v}” không thuộc bộ đáp án (${choices.join(", ")}).` `` | `apps/web/src/lib/test-answer-key.ts:117-179` (dòng 127,139,152,172) |
| Apply error: `` `Ghi lỗi ở part "${label}" — các part trước đã ghi xong và không hoàn tác; chạy lại Apply để tiếp phần còn lệch.` `` | `apps/web/src/components/assignment-tests/answers-checking-panel.tsx:126-132` |
| Apply success: `` `Đã ghi ${n} câu ở ${m} part — bảng so khớp đã tải lại theo dữ liệu mới.` `` | `answers-checking-panel.tsx:134-136` |
| Confirm apply: `` `Ghi đè đáp án ${n} câu ở ${m} part? Câu đã khớp giữ nguyên.` `` | `answers-checking-panel.tsx:113-117` |
| Confirm đổi skill: `"Đổi kỹ năng sẽ xóa các part đã gán và bản nháp slot của kỹ năng cũ. Tiếp tục?"` | `test-builder-shell.tsx:288-293` |
| Confirm đổi dạng đề: `"Đổi dạng đề sẽ xóa câu hỏi, đáp án và câu lệnh đã soạn của dạng hiện tại. Tiếp tục?"` | `test-builder-shell.tsx:429-434` |
| Time limit: `"Nhập thời gian theo dạng MM:SS hoặc HH:MM:SS."` | `test-header-form.tsx:89-97` |
| Field errors: `"Tiêu đề 1–200 ký tự."` … | `test-header-form.tsx:66-73` |
| Preview rỗng: `"Chưa có bộ đề nào để xem trước."` | `preview.tsx:98-105` |
| 404 edit: `"Không tìm thấy bộ đề."` | `$id.tsx:9-11` |

## §4 Rules + hằng số

| Hằng / rule | Giá trị | Nguồn |
|---|---|---|
| PRACTICE_SKILLS | reading, listening, writing, speaking | `contracts.ts:347-353` |
| ASSIGNMENT_TEST_PRESETS | reading p1-p3 (3), listening s1-s4 (4), writing task1-2 (2), speaking part1-3 (3), grammar g1 (1), vocabulary v1 (1) | `contracts.ts:410-448` |
| Số part tối đa (body) | 4 (`.max(4)`) | `contracts.ts:1240` |
| timeLimitSeconds max | 3*3600 = 10800 | `contracts.ts:1208` |
| ASSIGNMENT_TEST_ERROR_CODES | chỉ PARTS_LOCKED = "TEST_PARTS_LOCKED" | `contracts.ts:1187-1190` |
| computeTestRanges | qStart = override ?? next; next = qStart + count | `apps/web/src/lib/test-ranges.ts:33-45` |
| TEST_KEY_LINE_PATTERN | `/^\s*(\d+)[.)]\s*(.+)$/` | `apps/web/src/lib/test-answer-key.ts:20` |
| Diff status | match / mismatch / missing / extra | `test-answer-key.ts:59,206-231` |
| Match predicate | text: trim + alts chuẩn hóa `" / "`; choice: canonical 2 chiều | `test-answer-key.ts:80-97,236-249` |
| Draft store key / version / TTL / cap | `teacher-os:test-draft:new` / 2 / 7 ngày / 512KB | `apps/web/src/lib/assignment-test-draft-store.ts:15-23` |
| Preview handoff key / version / cap | `teacher-os:test-preview-draft` / 1 / 1MB (ref fallback) | `apps/web/src/lib/assignment-test-preview-draft.ts:13-16` |
| Autosave debounce | 1000ms, chỉ khi có nội dung | `test-builder-shell.tsx:256-277`; `testDraftHasContent` `assignment-test-draft-store.ts:212-226` |
| Preview heading reading | `READING ${label.toUpperCase()}` | `test-preview-paper.tsx:37-43` |
| Position slot | `preset.slots.findIndex(slot.part === item.part)` | `tests.ts:292-296` |
| FK: test cascade, prompt RESTRICT, attempt SET NULL | | `assignment-test.ts:57-66`; `quiz-attempt.ts:57-59` |
| CHECK attempt | `mode <> 'assignment' OR assignment_id IS NOT NULL` (không CHECK đảo vì chặn SET NULL) | `quiz-attempt.ts:99-106` |

## §5 Entities

- `assignment_test`: `apps/server` ghi qua insert/update/delete (`tests.ts:68-83,122-128,147-159`); cột + index: `packages/db/src/schema/assignment-test.ts:18-44`; snapshot row: `snapshot.ts:822-832`; contract row: `contracts.ts:1882-1892`.
- `assignment_test_part`: cột + unique: `assignment-test.ts:53-78`; snapshot group: `snapshot.ts:571-587`; contract row: `contracts.ts:1869-1876`.
- `assignment_prompt`: ngân hàng nguồn — create `routes/assignments/index.ts:113-153`; content-lock khi test có attempt `index.ts:428-463` (join `assignment_test_part`); hybrid lock `index.ts:297-374`.
- `quiz_attempt`: FK test + CHECK `packages/db/src/schema/quiz-attempt.ts:57-59,99-106`; attempt khóa parts `tests.ts:264-281`.
- Web state (không DB): `KernelAssignmentTestRow` map defensive `repos/assignment-tests.ts:21-41`; draft/handoff shapes `assignment-test-draft-store.ts:25-38`, `assignment-test-preview-draft.ts:18-70`.

## §6 Cross-repo hops

1. packages/api (`contracts.ts`) — schema + mã lỗi + presets được import cả server (`tests.ts:2-9`) lẫn web (`test-builder-shell.tsx:2-9`, `test-header-form.tsx:1-4`): hợp đồng dùng chung, UI không copy rule (`test-header-form.tsx:79-81`).
2. packages/db (`schema/assignment-test.ts`) — table + FK dùng bởi server routes và snapshot.
3. apps/server — route + snapshot + student-practice/grading/publish touchpoints.
4. apps/web — builder shell + libs (test-ranges, test-answer-key, repos) + routes.
5. apps/e2e — spec chấp nhận end-to-end trên D1 thật (boot wipe, self-seed: `assignment-test-create.spec.ts:4-8`).
6. Web→server chỉ qua command bus (`repos/kernel.ts:274-301`), không fetch riêng trong panel soát đáp án (`answers-checking-panel.tsx:28-30`).

## §7 Gaps negative-search

| # | Pattern | Scope | Kết quả | Kết luận |
|---|---------|-------|---------|----------|
| NS1 | `grep -rn "delete-assignment-test" apps/web/src` | toàn web app | 4 hits: `data-actions.ts:277` (type), `repos/kernel.ts:289` (map), `repos/assignment-tests.test.ts:163,165` (test) | G-3: mutation có mapping + test nhưng không UI dispatch → dead-path UI 🟡 |
| NS2 | `grep -n "setOverrides" apps/web/src/components/assignment-tests/test-builder-shell.tsx` | shell builder | 143, 297, 322, 361, 599 — không có handler input | G-4: qStartOverride không có control UI 🟡 |
| NS3 | `grep -n "status" apps/web/src/components/assignment-tests/test-header-form.tsx`; `grep '"ready"' components/assignment-tests/*.tsx` | form + components | 0 hits ở form; "ready" chỉ là badge của prompt (composer/picker) | G-1: không có control test-status 🟡 |
| NS4 | `grep -rn "tests/new" apps/web/src` (loại routeTree.gen, routes-matcher, *.test.*) | toàn web app | 6 hits: tự route `new.tsx`, fallback `preview.tsx:109`, redirect `import.tsx:44`, dialog credit `insufficient-credits-dialog.tsx:40`, comment `import-with-ai-button.tsx:8`, comment draft-store | G-2: không có nav entry thường 🟡 |
| NS5 | `grep -rn "\.skip\|\.todo\|\.only\|fixme"` trong toàn bộ test file phạm vi | 11 file test | 0 hits | R1: mọi test active ✅ |
| NS6 | `grep -rn "placement" apps/server/src/routes/` + grep assignmentTest trong placement* | boundary | placement dùng schema riêng `packages/db/src/schema/placement-test.ts`; 0 liên quan assignmentTest | Boundary xác nhận |
| NS7 | `grep -rn "assignmentTest" apps/server/src/routes/student.ts grading.ts dashboard-reminders.ts student-history.ts` | server consumers | grading.ts + dashboard-reminders.ts join qua quizAttempt.testId (practice) | Touchpoint xác nhận (chấm/remind thấy test qua attempt) |
