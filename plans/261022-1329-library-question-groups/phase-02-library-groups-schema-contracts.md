---
phase: 2
title: "Schema nhóm, migration, contract thư viện (PR2)"
status: pending
priority: P1
effort: "6h"
dependencies: [1]
---

# Phase 2: Schema nhóm, migration, contract thư viện (PR2)

## Goal

Bảng `library_test_part` có cột `groups` (JSON text, mặc định `'[]'`), và `packages/api/src/library-contracts.ts` có schema nhóm, bất biến dải câu, rule xuất bản theo nhóm, helper đếm marker ô trống `____`. Chưa đụng route và UI.

## Điều kiện bắt đầu

PR1 (phase 1) đã merge vào `develop`. Tạo nhánh mới từ `develop` mới nhất cho PR2.

## Files to Create / Modify

- Modify: `packages/db/src/schema/library-test.ts` (table `libraryTestPart`)
- Create (sinh tự động): `packages/db/src/migrations/0044_library_part_groups.sql` + cập nhật `packages/db/src/migrations/meta/*`
- Modify: `packages/api/src/library-contracts.ts`
- Modify: `packages/api/src/library-contracts.test.ts`

## Tasks & Steps

### Task 2.1 — Sao lưu DB local trước migration (có điều kiện)

> Red-team S3: `apps/e2e/local.db` thường KHÔNG tồn tại giữa các lần chạy (e2e boot xoá + tạo lại mỗi lần — `apps/e2e/src/boot.ts`), nên backup vô điều kiện sẽ fail và ép Failure Protocol oan.

- Goal: nếu có DB local đang tồn tại, có bản sao trước khi migration mới được áp.
- Steps:
  1. Chỉ khi `apps/e2e/local.db` tồn tại: `B="$TMPDIR/teacher-os-db-backup-$(date +%Y%m%d%H%M)"; mkdir -p "$B" && cp apps/e2e/local.db* "$B"/`. File không tồn tại → ghi nhận "không có DB local cần backup" và làm tiếp (e2e boot migrate toàn bộ thư mục migrations, DB kiểm thử thực là `file::memory:`).
- Success criteria: bước trên chạy xong không lỗi (backup hoặc ghi nhận không có file).
- Verify: `ls "$TMPDIR"/teacher-os-db-backup-* 2>/dev/null || echo "no local db"` in ra hoặc backup hoặc `no local db`.

### Task 2.2 — Thêm cột `groups`

- Goal: Drizzle schema có cột mới.
- Target: `packages/db/src/schema/library-test.ts`, `libraryTestPart`.
- Steps:
  1. Ngay sau dòng `optionBank: text("option_bank")...`, thêm:
     ```ts
     /**
      * JSON array QuestionGroup (library-contracts). Mỗi nhóm trỏ vào một
      * dải câu PHẲNG của `questions` (startIndex/count) — câu không lồng
      * trong nhóm để grader chấm theo index không đổi. `[]` = một nhóm ngầm
      * phủ cả part (đề soạn trước khi có tầng nhóm).
      */
     groups: text("groups").notNull().default("[]"),
     ```
  2. Cập nhật comment đầu `libraryTestPart` thêm một câu nhắc cột `groups`.
- Verify: no verification needed (Task 2.3 kiểm).

### Task 2.3 — Sinh migration

- Goal: migration `0044_library_part_groups.sql` chỉ chứa một lệnh ADD COLUMN.
- Steps:
  1. Chạy `pnpm --filter @teacher-os/db db:generate --name library_part_groups`.
  2. Mở file `packages/db/src/migrations/0044_library_part_groups.sql`.
- Success criteria: file tồn tại; nội dung là đúng một câu `ALTER TABLE \`library_test_part\` ADD \`groups\` text DEFAULT '[]' NOT NULL;` (không có DROP, không có CREATE TABLE).
- Verify: `grep -c "ALTER TABLE" packages/db/src/migrations/0044_library_part_groups.sql` in ra `1` VÀ `grep -ci "drop\|create table" packages/db/src/migrations/0044_library_part_groups.sql` in ra `0`.

### Task 2.4 — Helper đếm marker ô trống + catalog dạng bài theo skill

- Goal: hai hàm thuần export từ `library-contracts.ts`.
- Target: `packages/api/src/library-contracts.ts`.
- Steps:
  1. Import thêm `CLOZE_EDITOR_TYPES` và `CLOZE_MARKER_SOURCE` từ `"./lib/infer-question-types"` (đây là nguồn duy nhất của marker `____`; `packages/ui/src/lib/cloze.ts` cũng import từ đó).
  2. Thêm:
     ```ts
     /** Số marker ô trống `____` trong stem — cùng nghĩa `countBlanks` của
      * packages/ui (split theo CLOZE_MARKER_SOURCE), viết lại ở api vì api
      * không được import ui. */
     export function countClozeMarkers(stem: string): number {
       return stem.split(new RegExp(CLOZE_MARKER_SOURCE)).length - 1;
     }

     /** Thư viện bỏ khóa dạng-bài-theo-slot: mọi dạng của skill dùng được ở mọi slot. */
     export function librarySkillTypes(skill: LibrarySkill): readonly string[] {
       return [...new Set(Object.values(ASSIGNMENT_PART_TYPES[skill].types).flat())];
     }
     ```
- Verify: no verification needed (Task 2.7 kiểm).

### Task 2.5 — Schema nhóm + bất biến dải câu trong upsert

- Goal: `libraryPartUpsertSchema` nhận `groups` và từ chối dải sai ở MỌI lần lưu (kể cả draft).
- Target: `packages/api/src/library-contracts.ts`.
- Steps:
  1. Trước `libraryPartUpsertSchema`, thêm:
     ```ts
     export const LIBRARY_GROUP_MAX = 20;
     export const libraryQuestionGroupSchema = z
       .object({
         id: z.string().trim().min(1).max(40),
         type: z.string().trim().min(1).max(20),
         instruction: richTextField(5000),
         startIndex: z.number().int().min(0),
         count: z.number().int().min(1).max(40),
         optionBank: z.array(z.string().trim().min(1).max(200)).max(ASSIGNMENT_OPTION_BANK_MAX).default([]),
         answersInline: z.boolean().default(false),
         splitContent: z.boolean().default(false),
         dragDrop: z.boolean().default(false),
       })
       .strict();
     export type LibraryQuestionGroup = z.infer<typeof libraryQuestionGroupSchema>;
     ```
  2. Trong object của `libraryPartUpsertSchema`, thêm `groups: z.array(libraryQuestionGroupSchema).max(LIBRARY_GROUP_MAX).default([]),`.
  3. Đổi `.strict()` cuối thành `.strict().superRefine((value, ctx) => { ... })` với các luật, mỗi vi phạm `ctx.addIssue({ code: "custom", path: [...], message })` — thứ tự quan trọng (red-team S1): luật `answerSet` phải chạy TRƯỚC early-return nhóm ngầm:
     - (red-team S1) `answerSet` ≥ 2 câu mỗi khóa: gom index các câu có cùng `answerSet` theo key — key nào có **< 2 câu** → path `["questions", idx đầu tiên]`, message `"answer set needs at least two questions"`.
     - (red-team S1) `answerSet` containment (chỉ khi `groups.length > 0`): key nào có các câu **không nằm trọn trong dải của một nhóm duy nhất** → path `["groups"]`, message `"answer set must stay inside one group"`.
     - Nếu `value.groups.length === 0` → return (nhóm ngầm, không kiểm tiếp).
     - `groups[0].startIndex !== 0` → path `["groups", 0, "startIndex"]`, message `"first group must start at 0"`.
     - Với `i ≥ 1`: `groups[i].startIndex !== groups[i-1].startIndex + groups[i-1].count` → path `["groups", i, "startIndex"]`, message `"groups must be contiguous"`.
     - Tổng `count` ≠ `value.questions.length` → path `["groups"]`, message `"group counts must cover every question"`.
     - `id` trùng → path `["groups", i, "id"]`, message `"duplicate group id"`.
     - `value.optionBank.length > 0` → path `["optionBank"]`, message `"optionBank lives on groups when groups exist"`.
     - `value.type !== value.groups[0].type` → path `["type"]`, message `"part type must equal first group type"`.
  4. Đã kiểm sẵn: không chỗ nào dùng `.shape`/`.extend`/`.omit` trên `libraryPartUpsertSchema`; `z.input<typeof libraryPartUpsertSchema>` ở `apps/admin/src/lib/repos/library.ts` vẫn chạy sau khi thêm `.superRefine` (repo dùng zod v4 — chuỗi `.strict().superRefine(...)` cho type input như cũ). Không cần tách schema.
  5. `LibraryPartInput` giờ bắt buộc có `groups`. Thêm `groups: []` vào fixture `readingPart` (và mọi literal `LibraryPartInput` khác) trong `packages/api/src/library-contracts.test.ts`.
- Verify: `pnpm --filter @teacher-os/api check-types` exits 0.

### Task 2.6 — Rule xuất bản theo nhóm trong `partIssues`

- Goal: `validatePartForReady` kiểm từng nhóm; part không nhóm giữ hành vi cũ, chỉ nới khóa dạng bài.
- Target: function `partIssues` trong `library-contracts.ts`.
- Steps:
  1. Thay kiểm tra `config.types[part.part] ... includes(part.type)` bằng `librarySkillTypes(skill).includes(part.type)` (message giữ `"invalid type for part"`). Giữ nguyên kiểm `config.parts.includes(part.part)`.
  2. Tạo danh sách nhóm hiệu lực: nếu `part.groups.length === 0` → một nhóm ngầm `{ id: "implicit", type: part.type, instruction: "", startIndex: 0, count: part.questions.length, optionBank: part.optionBank, answersInline: false, splitContent: false, dragDrop: false }`.
  3. Giữ nguyên các kiểm cấp part: passage (reading), ≥1 câu có stem, audio (listening).
  4. Chuyển khối "Image-based" và khối "OptionBank" vào vòng lặp theo nhóm hiệu lực, thay `part.type` → `group.type`, `part.optionBank` → `group.optionBank`, `part.questions` → `part.questions.slice(group.startIndex, group.startIndex + group.count)`. Path câu luôn dùng **index tuyệt đối** (`questions.${group.startIndex + offset}...`). Path option bank: nhóm ngầm giữ `"optionBank"`; nhóm thật dùng `groups.${gi}.optionBank`. `imageUrl` vẫn là ảnh cấp part.
  5. Chỉ với nhóm thật (không phải nhóm ngầm), thêm:
     - `!librarySkillTypes(skill).includes(group.type)` → `groups.${gi}.type`, `"invalid type for skill"`.
     - câu trong dải có `type` khác `group.type` → `questions.${abs}.type`, `"question type must match its group"`.
     - `group.answersInline && !CLOZE_EDITOR_TYPES.has(group.type)` → `groups.${gi}.answersInline`, `"inline answers need a completion type"`.
     - `group.answersInline`: với mỗi câu trong dải mà `countClozeMarkers(question.stem) !== 1` → `questions.${abs}.stem`, `"inline question needs exactly one blank"`.
     - (red-team S1) `answerSet` containment: key nào có các câu không nằm trọn trong dải của một nhóm thật duy nhất → `groups.${gi của câu đầu tiên}`, `"answer set must stay inside one group"`; key nào chỉ có 1 câu → `questions.${abs}`, `"answer set needs at least two questions"`.
  6. Không viết code đọc cột DB ở phase này; việc chuyển row → `LibraryPartInput` (kể cả `groups`) thuộc phase 3.
- Verify: `pnpm --filter @teacher-os/api check-types` exits 0.

### Task 2.7 — DTO + test contract

- Goal: DTO trả `groups`; test phủ bất biến và rule nhóm.
- Steps:
  1. Trong `libraryPartDtoSchema`, thêm `groups: z.array(libraryQuestionGroupSchema),` ngay sau `questions` (red-team S5/F8: schema thật thay vì `z.array(z.unknown())` — server đã fail-soft ở read path, client không nhận rác; strict key `groups` đồng nghĩa deploy server+admin phải cùng release train — xem runbook phase 5).
  1b. (red-team A7) Cùng commit, thêm `groups: []` vào fixture `partDto` typed `LibraryPartDto` trong `apps/admin/src/components/library/part-form.test.tsx` — DTO bắt buộc `groups` từ phase này, giữ `pnpm --filter admin check-types`/test xanh tại mọi gate phase (fixture này không đợi tới phase 4).
  2. Trong `library-contracts.test.ts`, thêm `describe("library question groups", ...)` với test:
     - `countClozeMarkers("Growers ____ the bogs") === 1`; `countClozeMarkers("a ___ b") === 0` (3 gạch dưới không phải marker); `countClozeMarkers("____ x ______") === 2`.
     - upsert với `groups: []` parse ok (đề cũ).
     - 2 nhóm `[0..2]`,`[3..4]` + 5 câu parse ok.
     - dải hở (`startIndex` 4 thay vì 3) → `success === false`, issue path bắt đầu `["groups",1,"startIndex"]`.
     - tổng count 4 với 5 câu → fail path `["groups"]`.
     - id trùng → fail.
     - `optionBank` cấp part khác rỗng khi có nhóm → fail.
     - (red-team S1) 2 nhóm, câu 0 (nhóm 1) và câu 4 (nhóm 2) cùng `answerSet:"s"` → fail path `["groups"]`, message `"answer set must stay inside one group"`; payload (kể cả `groups: []`) có đúng 1 câu `answerSet:"x"` → fail path bắt đầu `["questions",...]`, message `"answer set needs at least two questions"`.
     - `validatePartForReady("reading", part)` với nhóm 2 `note` `answersInline`, câu 4 (index 3) có stem không chứa `____` → kết quả chứa issue có `path === "questions.3.stem"`.
     - nhóm `tfng` có `answersInline: true` → issue `path === "groups.0.answersInline"`.
     - part `p1` dạng `mcq` (vốn thuộc catalog `p3`) không còn issue `"invalid type for part"`.
     - test cũ của file vẫn pass (ngoài việc thêm `groups: []` vào fixture ở Task 2.5).
- Verify: `pnpm --filter @teacher-os/api test library-contracts --reporter=verbose` exits 0 và output không có `FAIL`.

### Task 2.8 — Gate package

- Verify: `pnpm --filter @teacher-os/api check-types && pnpm --filter @teacher-os/db test` exit 0.

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
