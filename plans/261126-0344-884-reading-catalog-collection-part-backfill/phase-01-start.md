---
phase: 1
title: "Phase 1: Reading Metadata Normalizer, Numeric Sort & Runtime Safety"
status: completed
priority: P1
effort: "45m"
dependencies: []
---

# Phase 1: Reading Metadata Normalizer, Numeric Sort & Runtime Safety

<!-- Updated: Red-Team Review 2026-11-26 - Added homoglyph/SQLite-exact title normalization, pure-ASCII passageClue for all 349 non-empty passages with mutual-exclusivity + 6-column SQL/Zod safety checks, syncLibraryTestsToOrg existing-prompt part preservation, and PATCH library prompt type compatibility -->

## Goal
Xây dựng module chuẩn hóa metadata đề Reading dùng chung (`packages/db/src/seed/reading-library.ts`) đồng bộ quy ước Bộ đề/Phần thi với Listening (khớp tuyệt đối SQLite homoglyph/whitespace, có `passageClue` thuần ASCII cho 349/350 bài có đoạn đọc, không rò `"Step IELTS"`/`"Unknown"`), bật sắp xếp số tự nhiên (`numeric: true`) cho dropdown **"Bộ đề"**, và vá hai điểm an toàn runtime khi đề Reading chuyển sang `p2`/`p3` (`syncLibraryTestsToOrg` giữ nguyên `existingPrompt.part` để bảo toàn bất biến `tests.ts:212`, và `PATCH /api/assignments/prompts/:id` chấp nhận `librarySkillTypes` cho prompt có `library_ref IS NOT NULL`).

## Files to Create / Modify
- Create: `packages/db/src/seed/reading-library.ts`
- Modify: `packages/db/src/seed/reading-library-dataset.test.ts`
- Modify: `apps/server/src/routes/student-practice.ts` (line 167)
- Modify: `apps/server/src/routes/student-practice.test.ts`
- Modify: `apps/student/src/components/practice/skill-catalog.tsx` (line 245)
- Modify: `apps/student/src/components/practice/practice-catalog.test.tsx`
- Modify: `apps/server/src/lib/study-pack-clone.ts` (lines 70-85, 695-845: `MaterializePromptsResult`, `materializePrompts`)
- Modify: `apps/server/src/lib/library-test-sync.ts` (lines 224-241: `syncLibraryTestsToOrg`)
- Modify: `apps/server/src/routes/student-practice-library-sync.test.ts`
- Modify: `apps/server/src/routes/assignments/index.ts` (lines 216-266: `PATCH /prompts/:id`)
- Modify: `apps/server/src/routes/assignments/prompt-content-lock.test.ts`

## Tests Before
1. Trong `packages/db/src/seed/reading-library-dataset.test.ts`:
   - Unit test `normalizeReadingTitleKey(title)`: chuẩn hóa đồng bộ 100% SQLite (`\t`, `\r`, `\n`, `\u00a0` → `" "`; `‘`/`’` → `'`; `–`/`—` → `-`; `：` U+FF1A → `:`; Cyrillic `р` U+0440 → `p`; chỉ cắt ASCII space hai đầu `.replace(/^ +| +$/g, "")`, không dùng JS `.trim()` trên `\ufeff`; chỉ hạ chữ hoa ASCII `[A-Z]`).
   - Unit test `normalizeReadingCollectionAndPart(rawSource, passageNumber)` cho mọi nhánh: `C11T1` + `2`, `C7T1` + `2`, `Actual Test` + `1`, `Forecast Quý 2-2025` + `3`, `Trainer` + `null` → `p1`, và `Step IELTS` / `Unknown` / `""` → `Other sources`.
   - Dataset test `loadReadingLibraryMetadata()`: trả đúng `350` dòng (gồm 17 bộ đề khác nhau, đủ `p1`/`p2`/`p3`), 349/350 dòng có `passageClue` thuần `[a-z ]` độ dài 10–40 khớp nguyên từ (duy nhất `Collection-looking-at-daily-life-in-ancient-rome.json` có `paragraphs: []` mang `passageClue === ""`), clue của `"will eating less make you live longer"` khớp cả 2 file gốc, 2 dòng `"coral reefs"` có clue loại trừ lẫn nhau (`"london zoo"` chỉ có trong `C20T3` và vắng trong `Collection`; `"calcium carbonate"` chỉ có trong `Collection` và vắng trong `C20T3`), **cả 6 trường** của mọi entry không chứa NUL/control char/`;`/`--`/`/*`/`-->`, tuân thủ giới hạn Zod (`collection <= 200`, `testGroup <= 100`, `partSource <= 200`), và 0 chuỗi khớp `/step[\s-]?ielts/i` hay `^unknown$`.
2. Trong `apps/server/src/routes/student-practice.test.ts`:
   - Test `GET /api/student/practice?skill=reading&facets=1` với 4 đề thuộc `"Cambridge IELTS 20"`, `"Cambridge IELTS 7"`, `"Cambridge IELTS 10"`, `"Actual Test"` trả `facets.collections` theo thứ tự tự nhiên `["Actual Test", "Cambridge IELTS 7", "Cambridge IELTS 10", "Cambridge IELTS 20"]`.
3. Trong `apps/student/src/components/practice/practice-catalog.test.tsx`:
   - Test `SkillCatalog` hiển thị các `<option>` của dropdown `"Bộ đề"` theo thứ tự tự nhiên (`["Actual Test", "Cambridge IELTS 7", "Cambridge IELTS 10", "Cambridge IELTS 20"]`).
4. Trong `apps/server/src/routes/student-practice-library-sync.test.ts`:
   - Test khi một org đã có sẵn `assignment_prompt` (từ Study Pack) với `library_ref = 'library_test_part:<ltp.id>'` và `part = 'p1'` (giáo viên đã sửa `passage`), trong khi `library_test_part.part = 'p2'`, gọi `syncLibraryTestsToOrg` tạo `assignment_test_part` với `part = 'p1'` và `position = 0` khớp `existingPrompt.part` (không bao giờ lệch `atp.part !== ap.part`).
5. Trong `apps/server/src/routes/assignments/prompt-content-lock.test.ts`:
   - Test `PATCH /api/assignments/prompts/:id` sửa `title`/`source`/`status` trên một `assignment_prompt` Reading `part = 'p2'`, `type = 'tfng'` có `library_ref = 'library_test_part:ltp-falkirk'` trả `200`, **và** một `assignment_prompt` Study Pack Reading `part = 'p1'`, `type = 'note'` có `library_ref = 'library_exercise:sysex-note'` cũng trả `200`, trong khi đề tự soạn (`library_ref = NULL`, `part = 'p2'`, `type = 'tfng'`) vẫn giữ chặt guard trả `400 "invalid type"`.

## Tasks & Steps

### Task 1.1 — Viết toàn bộ TDD tests Phase 1 (Red phase)
- **Goal:** Tạo đủ 5 nhóm test đỏ kiểm chứng normalizer Reading, sắp xếp tự nhiên Bộ đề, `syncLibraryTestsToOrg` giữ `existingPrompt.part`, và `PATCH /api/assignments/prompts/:id` cho library prompt `p2`/`p3` trước khi sửa code sản phẩm.
- **Target files and symbols:**
  - `packages/db/src/seed/reading-library-dataset.test.ts` (import `normalizeReadingTitleKey`, `normalizeReadingCollectionAndPart`, `extractAsciiPassageClue`, `loadReadingLibraryMetadata` từ `./reading-library`, đồng thời sửa interface `passage_number: number | null`)
  - `apps/server/src/routes/student-practice.test.ts` (test numeric sort với 4 đề `"Actual Test"`, `"Cambridge IELTS 20"`, `"Cambridge IELTS 7"`, `"Cambridge IELTS 10"`)
  - `apps/student/src/components/practice/practice-catalog.test.tsx` (test numeric sort `<option>` trong `SkillCatalog`)
  - `apps/server/src/routes/student-practice-library-sync.test.ts` (test pre-existing Study Pack `assignment_prompt` `part = 'p1'` khi `library_test_part.part = 'p2'`)
  - `apps/server/src/routes/assignments/prompt-content-lock.test.ts` (test `PATCH /api/assignments/prompts/:id` cho library prompt `p2`/`tfng` trả `200` và custom prompt `p2`/`tfng` vẫn trả `400`)
- **Steps:**
  1. Cập nhật `packages/db/src/seed/reading-library-dataset.test.ts` bổ sung `describe("reading-library metadata normalization (#884)")` với đầy đủ assertion ở mục Tests Before.
  2. Bổ sung test numeric sort (4 bộ đề `"Actual Test"`, `"Cambridge IELTS 20"`, `"Cambridge IELTS 7"`, `"Cambridge IELTS 10"`) trong `apps/server/src/routes/student-practice.test.ts` và `apps/student/src/components/practice/practice-catalog.test.tsx`.
  3. Bổ sung test Study-Pack pre-existing prompt `part = 'p1'` vs `ltp.part = 'p2'` trong `apps/server/src/routes/student-practice-library-sync.test.ts`.
  4. Bổ sung test `PATCH /api/assignments/prompts/:id` cho library prompt `p2`/`tfng` vs custom prompt `p2`/`tfng` trong `apps/server/src/routes/assignments/prompt-content-lock.test.ts`.
  5. Chạy vitest xác nhận Red phase fail đúng lý do.
- **Success criteria:** Các test mới thất bại đúng nguyên nhân (thiếu `./reading-library`, sort `"Cambridge IELTS 10"` trước `"Cambridge IELTS 7"`, `atp.part === "p2"` lệch `ap.part === "p1"`, và `PATCH` trả `400` trên library prompt `p2`/`tfng`).
- **Verify:** `pnpm --filter @teacher-os/db exec vitest run src/seed/reading-library-dataset.test.ts` exits non-zero (missing `./reading-library`; passing is a failure in red phase) AND `pnpm --filter student test src/components/practice/practice-catalog.test.tsx` exits non-zero on `Cambridge IELTS 7` order (passing is a failure in red phase).

### Task 1.2 — Cài đặt `reading-library.ts`, numeric sort, và vá 2 điểm an toàn runtime (Green phase)
- **Goal:** Triển khai sạch toàn bộ code Phase 1 để tất cả 5 nhóm test đều xanh và không gây hồi quy.
- **Target files and symbols:**
  - `packages/db/src/seed/reading-library.ts` (exports: `DEFAULT_READING_DATA_DIR`, `ReadingLibraryMetaEntry`, `normalizeReadingTitleKey`, `normalizeReadingCollectionAndPart`, `extractAsciiPassageClue`, `loadReadingLibraryMetadata`)
  - `apps/server/src/routes/student-practice.ts` (line 167: `buildPracticeFacets`)
  - `apps/student/src/components/practice/skill-catalog.tsx` (line 245: `SkillCatalog`)
  - `apps/server/src/lib/study-pack-clone.ts` (`MaterializePromptsResult`, `materializePrompts`: thêm `promptPartBySourceKey: Map<string, string>` đọc `assignmentPrompt.part` từ câu `SELECT` sau `onConflictDoNothing`)
  - `apps/server/src/lib/library-test-sync.ts` (`syncLibraryTestsToOrg`: dùng `effectivePart = materialized.promptPartBySourceKey.get(sourceKey) ?? part.part` cho cả `part` và `position`)
  - `apps/server/src/routes/assignments/index.ts` (`PATCH /prompts/:id`: select thêm `libraryRef: assignmentPrompt.libraryRef`; khi `row.libraryRef !== null && isLibrarySkill(row.skill)` dùng `librarySkillTypes(row.skill)` cho `partTypes`)
- **Steps:**
  1. Tạo `packages/db/src/seed/reading-library.ts`:
     - `normalizeReadingTitleKey(title: string)`:
       ```ts
       return title
         .replace(/[\t\r\n\u00a0]/g, " ")
         .replace(/[\u2018\u2019]/g, "'")
         .replace(/[\u2013\u2014]/g, "-")
         .replace(/\uFF1A/g, ":")
         .replace(/\u0440/g, "p")
         .replace(/^ +| +$/g, "")
         .replace(/[A-Z]/g, (ch) => ch.toLowerCase());
       ```
     - `normalizeReadingCollectionAndPart(rawSource, passageNumber)`: áp dụng quy ước `C<N>T<M>` → `Cambridge IELTS <N>` / `Test <M>`, `STEP_IELTS_RE = /step[\s-]?ielts/i` / `"Unknown"` / rỗng → `"Other sources"`, nguồn khác → `<source>` / `Passage <P>`, `passageNumber = 2 | 3` else `1`.
     - `extractAsciiPassageClue(paragraphs: readonly string[])`: nếu không có đoạn văn không rỗng trả `""`; ngược lại trích cụm từ thuần chữ cái thường ASCII có ranh giới từ `\b[a-z]{3,}(?: [a-z]{2,}){2,4}\b` dài 16–36 ký tự trên văn bản đã `.toLowerCase()` (ưu tiên đoạn 0 sau khi bỏ nhãn `"A. "`, fallback toàn bộ đoạn đọc; fallback `\b[a-z]{3,}(?: [a-z]{2,}){1,4}\b` dài 10–40), bảo đảm bắt nguyên từ và không chứa dấu nháy/dấu câu/HTML.
     - `loadReadingLibraryMetadata(dataDir = DEFAULT_READING_DATA_DIR)`: đọc `_index.json` + từng file JSON; nhóm theo `normTitle`; nếu nhóm có `> 1` bài cùng metadata (như `"Will Eating Less Make You Live Longer"`) gộp 1 dòng và xác nhận `passageClue` xuất hiện trong **tất cả** bài cùng nhóm; nếu nhóm có `> 1` bài khác metadata (như `"Coral reefs"`) tra `DUPLICATE_TITLE_CLUES` (`"C20T3" -> "london zoo"`, `"Collection" -> "calcium carbonate"`) và kiểm tra tính loại trừ lẫn nhau (clue của bài `i` có mặt ở bài `i` và vắng mặt ở mọi bài `j !== i`), ném lỗi ngay nếu gặp xung đột mới; sắp xếp ổn định theo `(normTitle, passageClue)`.
  2. Thêm `numeric: true` vào `localeCompare` ở `apps/server/src/routes/student-practice.ts:167` và `apps/student/src/components/practice/skill-catalog.tsx:245`.
  3. Trong `apps/server/src/lib/study-pack-clone.ts`: mở rộng `MaterializePromptsResult` (`ok: true`) thêm `promptPartBySourceKey: Map<string, string>`, populate từ `assignmentPrompt.part` tại câu `SELECT` dòng 823–838 (và từ `metadataByKey` cho `org_prompt`).
  4. Trong `apps/server/src/lib/library-test-sync.ts:224-241`: đọc `const effectivePart = materialized.promptPartBySourceKey.get(sourceKey) ?? part.part;`, tính `slotIndex = ASSIGNMENT_TEST_PRESETS[test.skill].slots.findIndex((slot) => slot.part === effectivePart)`, và ghi `part: effectivePart`, `position: slotIndex >= 0 ? slotIndex : 0`.
  5. Trong `apps/server/src/routes/assignments/index.ts:216-266`: import `isLibrarySkill`, `librarySkillTypes` từ `@teacher-os/api/library-contracts`; select thêm `libraryRef: assignmentPrompt.libraryRef`; tính `slotTypes = ASSIGNMENT_PART_TYPES[row.skill as AssignmentSkill]?.types[row.part] ?? []` và `partTypes = row.libraryRef !== null && isLibrarySkill(row.skill) ? [...new Set([...slotTypes, ...librarySkillTypes(row.skill)])] : slotTypes`.
  6. Chạy toàn bộ tests Phase 1 và kiểm tra kiểu.
- **Success criteria:** Toàn bộ tests trong 5 file test đều pass 100%, zero regressions.
- **Verify:** `pnpm --filter @teacher-os/db exec vitest run src/seed/reading-library-dataset.test.ts && pnpm --filter server exec vitest run src/routes/student-practice.test.ts src/routes/student-practice-library-sync.test.ts src/routes/assignments/prompt-content-lock.test.ts && pnpm --filter student test src/components/practice/practice-catalog.test.tsx` exits 0 and prints all tests passed.

## Verification
- `pnpm --filter @teacher-os/db exec vitest run src/seed/reading-library-dataset.test.ts` exits 0
- `pnpm --filter server exec vitest run src/routes/student-practice.test.ts src/routes/student-practice-library-sync.test.ts src/routes/assignments/prompt-content-lock.test.ts` exits 0
- `pnpm --filter student test src/components/practice/practice-catalog.test.tsx` exits 0

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
