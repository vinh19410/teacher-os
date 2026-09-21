---
phase: 1
title: "Kernel: schema 0019, contract v2 & POST API"
status: todo
priority: P1
effort: "4h"
dependencies: []
---

# Phase 1: Kernel — schema 0019, contract v2 & POST API

## Goal

Mở rộng model `assignment_prompt` cho 4 kỹ năng IELTS (migration 0019 additive + backfill), thay wire contract `assignmentPromptCreateSchema` sang v2 (`skill/part/type` + trường theo kỹ năng + `questions[]`, superRefine mirror `canSave`), adapt POST route + snapshot projection, kèm server tests đầy ma trận. Kết phase: kernel nhận & trả về đúng dữ liệu v5; `pnpm check-types` xanh toàn repo.

## Context Links

- Spec thiết kế: [../research/design-spec.md](../research/design-spec.md) (§2.6 KIND map, §5 canSave — nguồn superRefine)
- Scout report: [../reports/scout-report.md](../reports/scout-report.md) (mục 5–6: contract/DB/snapshot hiện tại)
- Chuẩn copy catalog: `~/Library/Application Support/Open Design/namespaces/release-stable/data/projects/f2f4d498-7ea3-403c-89e9-6ac3099ac79b/assignment-create-5.html` (dòng 441: `KIND`; dòng 442–641: `SKILLS`; dòng 743: `emptyItem`; dòng 766: `answersReady`; dòng 779: `applyDefaults`; dòng 889: `canSave`)
- Precedent trực tiếp: `packages/db/src/schema/assignment-prompt.ts:12-32`, `packages/api/src/contracts.ts:271-282`, `apps/server/src/routes/assignments/index.ts:60-72`, `apps/server/src/routes/snapshot.ts:166-170`, server tests `apps/server/src/kernel.test.ts:4047+`

## Key Insights

- **Tách DB/contract khỏi route không khả thi ở mức phase độc lập**: route `apps/server/src/routes/assignments/index.ts:60-72` spread `...body.data` vào `db.insert(assignmentPrompt).values(...)` — bỏ `task/genre` khỏi contract mà không sửa route là lỗi type ngay (cột notNull). Do đó phase 1 là một vertical slice kernel (Key Decision 5 của plan; precedent #208 phase 1).
- **Backfill nằm trong migration 0019** (SQL `UPDATE`), không phải code: mọi row hiện tại là Writing nên `part = task`, `type = genre` map 1:1 id preset cũ (`task1|task2`, `chart..problem`) — id mới của writing parts/types dùng đúng các id này để map không mất dữ liệu.
- **superRefine phải mirror chính xác `canSave` của design** (mock dòng 889–907): **reading cần `passage` + ≥1 stem ở cả draft lẫn ready**; draft Listening cần ≥1 stem; draft không cần answer/audio; **ready** mới bắt toàn bộ stems + answers (+ audioName cho listening); Writing luôn cần `prompt`; Speaking part2 cần `cueTopic`, **mọi part khác (default-require)** cần `prompt`. Server là nguồn sự thật cho trạng thái ready — client chỉ chặn UX.
- **Whitelist id trong contract (finding R6)**: `packages/api/src/contracts.ts` export hằng số `ASSIGNMENT_SKILLS` (4 id) và `ASSIGNMENT_PART_TYPES: Record<skillId, { parts: string[]; types: Record<partId, string[]> }>` (12 part · 29 type theo mock — nguồn duy nhất, web catalog phase 2 import từ đây). superRefine: `part` phải ∈ parts của skill, `type` phải ∈ types của part; speaking dùng default-require (part ≠ `part2` → bắt `prompt`) thay vì liệt kê part1/part3.
- **Answer theo alphabet kind (finding R7)**: với type có KIND dạng choice (tfng/ynng/mcq4/mcq3/roman/letter — bảng choice mirror `answerChoices` mock dòng 750–759), mọi `answer` non-empty phải thuộc bộ lựa chọn của kind (vd mcq4 ∈ A–D); sai → 400.
- **`questions` là JSON text** (`[{"stem","opts","answer","alts"}]`): parse một nơi duy nhất ở snapshot projection — try/catch **+ `Array.isArray` + sanitize từng item** (string fields, `opts` string[]|null — precedent `parseSkills` `snapshot.ts:63-72`), parse fail log `console.warn` kèm row id rồi mới fallback `[]`; web không bao giờ `JSON.parse` trong render.
- `audioName` dùng sentinel `""` (precedent cột `source` — `assignment-prompt.ts:23`), tránh nullable lan sang wire/UI.

## Requirements

### Functional

- Cột mới trong `assignment_prompt`: `skill` text notNull default `'writing'`; `part` text notNull default `''`; `type` text notNull default `''`; `intro` text notNull default `''`; `passage` text notNull default `''`; `transcript` text notNull default `''`; `cue_topic` text notNull default `''`; `cue_points` text notNull default `''`; `audio_name` text notNull default `''`; `questions` text notNull default `'[]'`. Docblock cập nhật: 4 kỹ năng IELTS (design v5 2026-09-21), `task/genre` là legacy compat-derived.
- Migration 0019: `ALTER TABLE` các cột + `UPDATE assignment_prompt SET skill='writing', part=task, type=genre WHERE part=''` (chạy sau các ALTER, trong cùng file).
- `assignmentPromptCreateSchema` v2 (vẫn `.strict()`, giữ tên export + `AssignmentPromptCreate`):
  `skill: z.enum(["writing","reading","listening","speaking"])`, `part: z.string().trim().min(1).max(20)`, `type: z.string().trim().min(1).max(20)`, `title` (1–200), `band` (enum 4 giá trị, giữ nguyên), `source` (≤200), `prompt` (≤5000), `passage` (≤20000), `intro` (≤2000), `transcript` (≤10000), `cueTopic` (≤500), `cuePoints` (≤2000), `audioName` (trim ≤200), `questions: z.array(z.object({ stem: z.string().trim().max(500), opts: z.array(z.string().max(500)).max(6).nullish(), answer: z.string().trim().max(200), alts: z.string().max(500).default("") })).max(40)`, `note` (≤2000), `status` (enum draft|ready).
  Cùng file export hằng whitelist: `ASSIGNMENT_SKILLS`, `ASSIGNMENT_PART_TYPES`, `ASSIGNMENT_ANSWER_CHOICES` (kind → bộ lựa chọn) — nguồn duy nhất cho web catalog (phase 2 import).
  `superRefine` (message tiếng Anh ngắn theo pattern `reportCreateSchema` "content required when sending"):
  - `part` ∈ `ASSIGNMENT_PART_TYPES[skill].parts` và `type` ∈ `...[part]` — sai → 400 (chặn part/type lạ, chặn tổ hợp chéo skill).
  - `writing`: `prompt.trim()` bắt buộc.
  - `reading`: `passage.trim()` + `questions.length ≥ 1` + ≥1 stem; `ready` → mọi stem + mọi answer non-empty.
  - `listening`: `questions.length ≥ 1` + ≥1 stem; `ready` → thêm `audioName !== ""` + mọi stem + mọi answer.
  - `speaking`: `part === "part2"` → `cueTopic.trim()`; **mọi part khác** → `prompt.trim()` (default-require theo mock).
  - `questions` chỉ hợp lệ cho R/L; W/S phải gửi `[]`.
  - Với type có dạng đáp án choice: mọi `answer` non-empty phải ∈ `ASSIGNMENT_ANSWER_CHOICES[kind]`.
- POST `/api/assignments/prompts` vẫn 201 `{ id }`; insert map wire→DB: `task = skill === "writing" ? part : "task2"`, `genre = skill === "writing" ? type : ""`, `questions = JSON.stringify(body.questions)`, các trường text còn lại thẳng.
- `KernelAssignmentPromptRow` mở rộng: `skill`, `part`, `type`, `intro`, `passage`, `transcript`, `cueTopic`, `cuePoints`, `audioName: string`, `questions: Array<{ stem: string; opts: string[] | null; answer: string; alts: string }>`; snapshot projection parse JSON an toàn; thứ tự sort giữ nguyên (`asc(createdAt), asc(id)` — `snapshot.ts:170`).

### Non-functional

- Không đổi collection key snapshot → không đụng guard `SNAPSHOT_COLLECTION_KEYS`; **deploy web + server cùng một release** (xem R4).
- Payload bound: tối đa 40 câu × (stem 500 + 6 opts×500 + answer 200 + alts 500) — đủ lớn cho đề thật, đủ nhỏ để snapshot không phình vô hạn. **Định lượng rủi ro tổng (finding R10)**: mỗi GET `/api/kernel` trả toàn bộ đề của org (không pagination, `snapshot.ts:166-170`) và refetch sau mỗi write; đề R/L đầy đủ ≈ 60–220KB → ngưỡng chấp nhận **≤ 200 đề hoặc snapshot ≤ 10MB**; vượt ngưỡng này phải mở plan pagination/projection nhẹ (list bỏ `passage/transcript/questions`) — preview bank hiện cần full questions nên không cắt trong milestone này.

## Architecture (data flow)

```
POST /api/assignments/prompts (JSON, CSRF kernel router)
  → assignmentPromptCreateSchema.safeParse (strict + superRefine theo skill)
  → insert assignment_prompt { ...wire, task/genre legacy-derived, questions JSON.stringify }
  → 201 { id }
GET /api/kernel → snapshot loader select assignment_prompt (org-scoped)
  → projection: { ...row, createdAt: ISO, questions: safeParse(row.questions) ?? [] }
  → web mapper (phase 2) → AssignmentPrompt UI type
```

## Related Code Files

- Modify: `packages/db/src/schema/assignment-prompt.ts` (10 cột + docblock), `packages/api/src/contracts.ts` (`assignmentPromptCreateSchema` v2 + superRefine + whitelist constants + `KernelAssignmentPromptRow`), `apps/server/src/routes/assignments/index.ts` (map insert), `apps/server/src/routes/snapshot.ts` (projection parse), `apps/server/src/kernel.test.ts` (describe "assignment prompt bank (issue #202)" — cập nhật body cũ + case mới)
- Create: `packages/db/src/migrations/0019_*.sql` (sinh qua `pnpm --filter db db:generate` + hand-append marker + backfill UPDATE), `apps/server/src/assignment-prompt-existing-data-migration.test.ts`
- Delete: không

## Implementation Steps

1. Sửa `packages/db/src/schema/assignment-prompt.ts`: thêm 10 cột (default như Requirements), cập nhật docblock nêu legacy `task/genre` là compat-derived và user action ghi `skill/part/type` là "tạo đề 4 kỹ năng".
2. Chạy `pnpm --filter db db:generate` sinh 0019; **mở file kiểm tay trong cùng commit**: đủ 10 `ALTER TABLE ... ADD COLUMN`; append `--> statement-breakpoint` **trước** `UPDATE assignment_prompt SET skill = 'writing', part = task, "type" = genre WHERE part = '';` — drizzle migrator split theo marker này chứ không theo dấu `;` (precedent `0007_class_type_skills.sql` có marker trước mỗi UPDATE tay; thiếu marker → ALTER cuối + UPDATE gộp thành một batch multi-statement → migration fail mọi môi trường). Checklist: số marker = số statement − 1. Chưa env nào apply nên được sửa trực tiếp (quy tắc repo: không sửa migration đã apply).
3. Viết lại `assignmentPromptCreateSchema` v2 + superRefine + **bộ hằng whitelist** (`ASSIGNMENT_SKILLS` / `ASSIGNMENT_PART_TYPES` / `ASSIGNMENT_ANSWER_CHOICES`) trong `packages/api/src/contracts.ts` (giữ comment docblock: mirror `canSave` design v5, link design-spec §5); mở rộng `KernelAssignmentPromptRow`.
4. Sửa POST route `apps/server/src/routes/assignments/index.ts:60-72`: insert values thêm mapping legacy (`task`, `genre`) + `questions: JSON.stringify(body.data.questions)`; route vẫn trả `CreatedResponse` 201.
5. Sửa projection `apps/server/src/routes/snapshot.ts` (block assignmentPrompts ~dòng 166-170 + projection ~312/339): thêm field mới + helper local `parseQuestions(raw: string)`: try/catch → kiểm `Array.isArray(parsed)` → sanitize từng item (string fields, `opts` string[]|null, thiếu → default `""`) → fallback `[]`; parse fail `console.warn` kèm row id (không nuốt im lặng — finding R9); `opts: item.opts ?? null`, `alts: item.alts ?? ""`.
6. Cập nhật server tests `apps/server/src/kernel.test.ts` (describe bắt đầu dòng 4047):
   - Đổi body các test hiện có (dòng 4071, 4095, 4125, 4135, 4143, 4187, 4203) sang v2: thêm `skill: "writing", part: <task cũ>, type: <genre cũ>` + các trường rỗng + `questions: []`.
   - Thêm case: (a) reading ready đầy đủ (passage + 2 câu có stem/answer) → 201, snapshot trả `questions` parse đúng; (b) reading ready thiếu 1 answer → 400; (c) listening ready thiếu `audioName` → 400; (d) listening draft không audio/answer (≥1 stem) → 201; (e) reading draft thiếu passage → 400; (f) speaking part2 thiếu `cueTopic` → 400; (g) W/S gửi `questions` non-empty → 400; (h) `questions` 41 phần tử → 400; (i) field lạ (`.strict()`), `skill` lạ, `part` rỗng → 400; (j) org scoping A/B (org B không thấy row A trong snapshot); (k) `part`/`type` lạ hoặc tổ hợp chéo skill (vd `skill: "speaking", part: "task2"`) → 400; (l) answer ngoài alphabet kind (vd tfng answer "BANANA", mcq answer "E") → 400; (m) row DB `questions = 'null'` → snapshot trả `[]` không crash (pin hành vi `parseQuestions`).
7. **Test migration trên DB có dữ liệu (finding R2/R3)** — tạo `apps/server/src/assignment-prompt-existing-data-migration.test.ts` theo đúng pattern `comment-bank-existing-data-migration.test.ts` (`applyThrough(client, "0018")` → raw INSERT 2 row Writing legacy qua SQL thẳng → apply 0019 → assert `skill='writing'`, `part`/`type` backfill đúng → `PRAGMA foreign_key_check` sạch). Đây là nơi duy nhất verify backfill — kernel test và e2e boot đều migrate DB rỗng.

## Todo

- [ ] Schema 10 cột mới + docblock + generate migration 0019 + hand-check SQL + marker `--> statement-breakpoint` + backfill UPDATE
- [ ] Contract v2 `.strict()` + superRefine mirror canSave + whitelist id (`ASSIGNMENT_SKILLS`/`ASSIGNMENT_PART_TYPES`/`ASSIGNMENT_ANSWER_CHOICES`) + answer theo alphabet kind + `KernelAssignmentPromptRow` mở rộng
- [ ] POST route: legacy mapping + questions stringify
- [ ] Snapshot projection: field mới + parseQuestions an toàn (Array.isArray + sanitize + log)
- [ ] Server tests: migrate 7 call cũ sang v2 + 13 case mới (matrix ready/draft × skill + whitelist + alphabet + parse-fail)
- [ ] `assignment-prompt-existing-data-migration.test.ts` (applyThrough 0018 → seed legacy → 0019 → assert backfill)

## Success Criteria

- POST v2 hợp lệ (đủ 4 kỹ năng) → 201; snapshot org tương ứng trả đủ field mới với `questions` là mảng object; org khác không thấy.
- Ready thiếu điều kiện (answer/audioName/passage/cueTopic) → 400 từ superRefine; draft hợp lệ (thiếu answer/audio) → 201; part/type lạ hoặc tổ hợp chéo skill → 400; answer ngoài alphabet kind → 400.
- Migration 0019 apply sạch trên DB fresh của server test harness **và** spec `assignment-prompt-existing-data-migration.test.ts` xác minh backfill đúng cho row Writing cũ (seed theo schema cũ → sau 0019 có `skill='writing', part, type` đúng).
- `pnpm check-types` xanh toàn repo.

## Verification

```bash
pnpm --filter db db:generate
cd apps/server && npx vitest run kernel.test.ts -t "assignment prompt"
pnpm check-types
```

## Risk Assessment

- **R1: Drizzle sinh ALTER không kèm backfill** — luôn vậy (drizzle-kit chỉ diff schema) → append marker + UPDATE tay ở bước 2, kiểm trong cùng commit (thiếu marker = migration fail — finding R3).
- **R2: superRefine lệch canSave design** (draft vs ready) — pin bằng test (d)/(b)/(c) khớp dòng 889–907 của mock; sai lệch nào cũng bị test đỏ.
- **R3: Snapshot phình vì `questions`** — bound 40 câu/đề; tổng đã định lượng ở Non-functional (ngưỡng 200 đề/10MB, vượt thì mở plan pagination/projection); chấp nhận cho app single-teacher ở quy mô hiện tại.
- **R4: Deploy order — BREAKING cutover cho POST** (finding R1 red-team): schema `.strict()` đổi field nên web cũ ↔ server v2 từ chối nhau (400 cả hai chiều). Runbook: **deploy web + server trong cùng một release, sát nhau**; không rollback server đơn chiều; cửa sổ lệch nhau = downtime tính năng tạo đề. Chiều đọc (snapshot thêm field) mới là additive.

## Security Considerations

- Route nằm trong kernel router mount `kernel.route("/assignments", ...)` (`apps/server/src/routes/kernel.ts:1991`) → kế thừa CSRF Origin + JSON content-type guard.
- Org-scoping: insert gắn `orgId` từ kernelCtx; select snapshot lọc `orgId` — không tin client.
- `.strict()` chặn field lạ; mọi trường bounded (max length/enum); `questions` max 40 items chặn payload bom JSON.
- `passage/transcript/questions` là teacher-authored text — snapshot render bằng text node ở web (phase 3), không innerHTML (xem Security phase 3).

## Next Steps

- Phase 2 dùng `KernelAssignmentPromptRow` mới để mở rộng web data layer + catalog preset.
