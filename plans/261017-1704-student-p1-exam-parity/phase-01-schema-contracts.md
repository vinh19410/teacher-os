---
title: "Phase 1: Schema & Contracts nền"
status: todo
---

# Phase 1: Schema & Contracts nền

## Context Links

- [Scout report](../reports/scout-report.md) · [Research report](../reports/researcher-report.md)
- Nguồn: [`plans/reports/2026-10-17-stepielts-competitor-analysis.md`](../../../reports/2026-10-17-stepielts-competitor-analysis.md) mục P1
- Key decisions: xem `plan.md` § Key Decisions · Red-team findings #1/3/5/7/8/10/14

## Overview

Đặt móng dữ liệu + contract cho toàn plan: migration 0036 (`assignment_prompt.time_limit_seconds` + `audio_key`, `quiz_attempt.flags`, bảng `student_feedback`, index history), mở rộng Zod contracts (question `explanation`, wire fields cho student), expose fields ở server routes — bao gồm **forward `explanation` qua 2 parse layer whitelist** và **read-path teacher** (nếu không: field bị strip/xoá im lặng). Phase này KHÔNG đổi UI.

## Key Insights

- `assignment_prompt.questions` là **text JSON string** (`packages/db/src/schema/assignment-prompt.ts:35`) → `explanation` per question không cần migration cột, NHƯNG:
  - **POST start snapshot QUA `parseQuizQuestions`** (`apps/server/src/routes/student.ts:129-158` whitelist `stem/opts/answer/alts/type/pin`) → KHÔNG forward `explanation` là bị strip ngay lúc snapshot; GET detail đọc lại qua cùng parser (`loadAttemptForReview` :1681) — phải sửa parser (red-team Critical #1).
  - **Teacher read path cũng strip**: `parseQuestions` (`apps/server/src/routes/snapshot.ts:107-150`) + type `KernelAssignmentPromptRow.questions` (contracts.ts:1326+) — không sửa thì editor load mất explanation, save lại xoá sạch (đúng regression class `type`/`pin` mà comment trong code cảnh báo).
- `timeLimitSeconds` nhân bản từ full-test (`assignment-test.ts:29`), **cap 3h (10800) khớp full-test** (contracts.ts:927-930), và **chặn skill `speaking`** (superRefine — submit Speaking cần mediaKey, auto-submit hết giờ sẽ kẹt MEDIA_REQUIRED, student.ts:1576-1584).
- **Deploy order (red-team #3, #5)**: (a) migration 0036 prod TRƯỚC worker — query select full row 500 khi thiếu cột, `/readyz` không phát hiện (lesson #319); (b) server + student CÙNG release train — `studentQuizDetailSchema` `.strict()` (contracts.ts:1903) được `.parse` client-side (`apps/student/src/lib/repos/quiz.ts:66`), server mới + bundle student cũ = throw "Unrecognized key" ngay giữa take screen; web teacher deploy sau server được. Field optional chỉ bảo vệ chiều client-mới → server-cũ (comment contracts.ts:1945-1951).
- PATCH prompt có **explicit update map** (`assignments/index.ts:200-223`) — field mới không thêm vào map bị silent-drop. PATCH thay **nguyên mảng questions** → chiều GHI explanation tự theo contract.
- `transcript` KHÔNG nằm trong questionsSnapshot — lấy từ cột `assignment_prompt.transcript` qua join header trong `loadAttemptForReview` (:1666-1696).
- **Wire student không đặt min** cho `timeLimitSeconds` (e2e seed 6-10s phải parse được client-side); min/max chỉ ở input teacher.

## Requirements

- [ ] Migration 0036: `assignment_prompt` +2 cột, `quiz_attempt` + cột flags + **index `(student_id, submitted_at)`**, bảng `student_feedback` + index.
- [ ] Contracts Zod: `explanation` per question; `timeLimitSeconds` prompt (create/response, superRefine chặn speaking, cap 3h); wire student: `timeLimitSeconds` (không min), `audioAvailable`, `attempt.startedAt`, `attempt.flags`, `serverNow`; detail: `transcript` + `explanation`.
- [ ] **Forward `explanation` ở cả 2 parse layer** (`parseQuizQuestions` student.ts:129-158, `parseQuestions` snapshot.ts:107-150) + type `KernelAssignmentPromptRow` — không bị strip ở bất kỳ đường nào.
- [ ] **Read-path teacher**: snapshot.ts map prompt (:513-543), web mapper prompt, `assignment-presets` (`emptyItem` có `explanation: ""`, `emptyComposer` có `timeLimitSeconds: null`), `assignment-draft-store` shape — round-trip không xoá field.
- [ ] Server routes expose đủ field mới (GET quiz, GET attempt detail, POST/PATCH prompts).
- [ ] `student_feedback` schema: `page_url` validate **chỉ relative path `/`** (không URL tuyệt đối, chặn `javascript:` stored-XSS).

## Architecture

```
assignment_prompt: + time_limit_seconds INTEGER NULL   (null = luyện tập; KHÔNG cho speaking)
                   + audio_key TEXT NULL               (media-store key, server-set qua upload P4)
quiz_attempt:      + flags TEXT NOT NULL DEFAULT '{}'  (JSON map key→bool, song song answers)
                   + INDEX(student_id, submitted_at)   (history/streak P5 — chỉ có unique(assignment_id,student_id) + org_idx)
student_feedback:  id, org_id, student_id, category TEXT CHECK(in enum),
                   message TEXT(2000), page_url TEXT(500), user_agent TEXT(300),
                   created_at; INDEX(student_id, created_at)
```

Wire (tất cả optional/nullable — chỉ bảo vệ chiều client-mới→server-cũ, KHÔNG bảo vệ ngược lại):
- `assignmentPromptBaseSchema`: `timeLimitSeconds: z.number().int().min(60).max(10800).nullish()` + `superRefine` từ chối khi `skill === "speaking"`
- Question inner (:620-648): `explanation: z.string().max(4000).nullish()`
- `studentQuizDetailSchema`: `timeLimitSeconds: z.number().int().nullable().optional()` (KHÔNG min — e2e seed ngắn), `audioAvailable` (optional), `serverNow` (ISO optional); `attempt`: `startedAt` (ISO optional), `flags` (record optional)
- `quizAttemptDetailSchema`: `transcript` (optional), question `explanation` (optional)

`audio_key` KHÔNG nằm trong create/update payload teacher — server set qua endpoint upload (phase 4).

## Files to Create / Modify

- Modify: `packages/db/src/schema/assignment-prompt.ts` (2 cột)
- Modify: `packages/db/src/schema/quiz-attempt.ts` (cột flags + index `(student_id, submitted_at)`)
- Create: `packages/db/src/schema/student-feedback.ts`
- Create: `packages/db/src/migrations/0036_*.sql` (sinh qua `pnpm db:generate`, KHÔNG viết tay)
- Modify: `packages/api/src/contracts.ts` (schema trên + `KernelAssignmentPromptRow.questions` forward explanation + timeLimitSeconds)
- Modify: `apps/server/src/routes/student.ts` — **`parseQuizQuestions` :129-158 forward `explanation`**; GET quiz :985 expose timeLimitSeconds/audioAvailable/attempt.startedAt/flags/serverNow; GET detail :1786 transcript (từ prompt join, KHÔNG phải snapshot) + explanation từ questionsSnapshot (fallback: attempt start trước deploy → đọc explanation từ prompt hiện hành qua join)
- Modify: `apps/server/src/routes/snapshot.ts` — **`parseQuestions` :107-150 forward `explanation`** + map prompt :513-543 thêm `timeLimitSeconds`
- Modify: `apps/server/src/routes/assignments/index.ts` (POST :67-104 + PATCH :135-239: parse timeLimitSeconds vào update map)
- Modify: `apps/web/src/components/assignments/assignment-presets.ts` (`emptyItem` :342-356 thêm explanation rỗng; `emptyComposer` :357-373 thêm timeLimitSeconds null)
- Modify: `apps/web/src/lib/assignment-draft-store.ts` (shape :46-113 pin timeLimitSeconds + explanation)
- Modify (nếu mapper tách file): web mapper prompt khi load composer từ kernel data.

## Implementation Steps

1. Sửa 3 file schema drizzle (`assignment-prompt.ts`, `quiz-attempt.ts` + index, tạo `student-feedback.ts`).
2. `pnpm db:generate` → migration 0036; review SQL (ADD COLUMN + CREATE TABLE + CREATE INDEX, có `--> statement-breakpoint`); apply local.
3. Contracts: mở rộng theo § Architecture; superRefine speaking; viết/ mở rộng contract test: round-trip `POST → GET snapshot → PATCH → GET` giữ explanation + timeLimitSeconds; test từ chối timeLimit khi speaking; test pageUrl `javascript:` bị reject.
4. **Parser layers**: thêm `explanation` vào object trả về của `parseQuizQuestions` (student.ts) và `parseQuestions` (snapshot.ts) — mô phỏng cách `type`/`pin` được forward (xem comment cảnh báo trong 2 hàm). Kiểm sync-guard mirror shape nếu có (cloze.ts:23, answer-key-grid.ts:33 đọc shape question).
5. Server routes expose fields (GET quiz: `serverNow: new Date().toISOString()`, audioAvailable = audioKey != null; flags parse JSON an toàn default `{}`; PATCH: timeLimitSeconds vào update map — null hợp lệ để xóa).
6. Web read-path: presets + draft-store + mapper — verify composer load thấy timeLimitSeconds đã lưu (round-trip).
7. **Deploy-runbook** (ghi vào PR): apply migration 0036 prod → promote worker server + student cùng release train → web teacher. Post-migrate verify: curl GET quiz 200 (không "no such column").
8. Gate: `pnpm check`, `pnpm check-types`, `pnpm --filter server run test`, `pnpm --filter web run test` (contract round-trip).

## Todo

- [ ] Schema drizzle 3 bảng/cột + index history + migration 0036 generate + apply local
- [ ] Contracts Zod mở rộng + superRefine speaking + cap 3h + contract tests (round-trip, XSS pageUrl)
- [ ] Forward explanation ở parseQuizQuestions + parseQuestions + KernelAssignmentPromptRow
- [ ] Read-path teacher (snapshot map, presets, draft-store) round-trip
- [ ] Server routes expose fields (GET quiz, GET detail, POST/PATCH prompts)
- [ ] Deploy-runbook migration-trước-worker + same-release ghi vào PR
- [ ] Gate local pass

## Success Criteria

- Migration 0036 apply sạch local; seed cũ không vỡ (cột nullable/default; chỉ ADD/CREATE).
- **Round-trip explanation không bị strip**: POST prompt (có explanation) → GET snapshot teacher vẫn còn → PATCH → GET vẫn còn; POST start attempt → questionsSnapshot trong DB còn explanation.
- Contract test chặn: timeLimit trên speaking → 400; pageUrl `javascript:…` → reject.
- GET quiz/detail trả đủ field mới (test server hoặc curl).

## Risk Assessment

- **Deploy order vỡ 2 chiều**: (a) worker mới + DB chưa migrate → 500 toàn màn quiz (`/readyz` vẫn xanh — verify bằng curl GET quiz sau migrate, trước promote); (b) server mới + student bundle cũ → `.strict()` throw — cùng release train server+student (#304), chấp nhận cửa sổ tới reload. Rollback worker an toàn; KHÔNG rollback migration.
- **PATCH update map** quên field → silent drop; đã có test round-trip chặn.
- **Parser whitelist strip** → đã đưa 2 parser vào scope + test; nếu vẫn sót (layer thứ 3 xuất hiện) → tín hiệu: editor load mất explanation — grep mọi nơi reconstruct question object trước khi mở rộng.

## Security Considerations

- `flags` client ghi — validate key ∈ questionsSnapshot, value boolean, ≤ số câu.
- `explanation`/`transcript` chỉ xuống wire SAU nộp; KHÔNG thêm explanation vào `studentQuizQuestionSchema` (đề sạch).
- `student_feedback.page_url` chỉ relative path (server trim + reject scheme khác) — chống stored XSS khi render sau này; message cap 2000.

## Next Steps

→ Phase 2 (Exam Timer) và Phase 3 (Flag) tiêu thụ field của phase này.
