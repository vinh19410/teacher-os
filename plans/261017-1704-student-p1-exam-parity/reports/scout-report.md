# Scout report — codebase touchpoints cho P1 student exam features

Ngày: 2026-10-17 · Agent: Explore · Repo: teacher-os @ develop

## A. Contract & schema assignment/question

### `packages/api/src/contracts.ts` — 2152 dòng, MỘT file duy nhất

| Schema | Vị trí | Nội dung chính |
|---|---|---|
| `ASSIGNMENT_SKILLS` | contracts.ts:265-270 | `writing/reading/listening/speaking` |
| `ASSIGNMENT_PART_TYPES` | contracts.ts:273-309 | Catalog 2 cấp skill→part→type. Reading: `tfng/sent/note/shortans/diagram/headings/info/summary/sentend/tablecomp/ynng/mcq/features/flowchart`; Listening: `form/mcq1/map/match2/mcq3/flow/notes/sent4` |
| `assignmentPromptBaseSchema` | contracts.ts:598-665 (`.strict()`) | `prompt/passage/intro/transcript` (richTextField, **transcript ĐÃ CÓ** :612, cap 10000), `audioName` (:616), `imageUrl`, `questions[]` max 40 (:618-650), `optionBank`, `note`, `status: draft\|ready` |
| Question inner schema | contracts.ts:620-648 (`.strict()`) | `stem/opts/answer/alts/type/nullish pin`. **KHÔNG có `explanation`** — thêm field phải sửa contract + server + web editor + student cùng lúc vì `.strict()` sẽ 400 khi client gửi field lạ |
| `assignmentTestCreateSchema` | contracts.ts:922-937 | **`timeLimitSeconds` ĐÃ CÓ** (:927) nhưng chỉ cho full-test builder (`assignment_test`), KHÔNG cho prompt đơn / class_assignment |
| `studentQuizDetailSchema` | contracts.ts:1867-1904 | Đề sạch take screen. Comment :1862-1865 xác nhận **`transcript` không bao giờ xuống wire**; `note` chỉ có với Speaking. `attempt` object: `id/status/answers/essay?/media?` — **KHÔNG có `startedAt`** |
| `quizAttemptSummarySchema` | contracts.ts:1931-1971 | `startedAt/submittedAt` (ISO), counters, `essay/skill/media/grade/part/annotations` optional — pattern "optional = server cũ" |
| `quizAttemptDetailSchema` | contracts.ts:1979-1995 | `note` + `questions[]` extend `key/alts/verdict/answer` — chỗ cắm `explanation` per câu + `transcript` |
| Media | contracts.ts:1685-1716 | `QUIZ_MEDIA_MAX_BYTES` 50MB, allowlist MIME `QUIZ_MEDIA_TYPES` (MP3/M4A/WAV… đã có audio) |

## B. apps/server — migration, routes, media pipeline

- Migrations: `packages/db/src/migrations/` — mới nhất **`0035_ambiguous_freak.sql`**. Format `NNNN_tên-random.sql`, ngăn `--> statement-breakpoint`. Tạo migration: `pnpm db:generate` (drizzle-kit) sau khi sửa schema TS; deploy `db:migrate:deploy`. Config `packages/db/drizzle.config.ts`.
- `packages/db/src/schema/quiz-attempt.ts:31-74` — `quiz_attempt`: `id/orgId/assignmentId/studentId/status/questionsSnapshot/answers(JSON)/essay/mediaKey..mediaUploadedAt/correctCount/gradeScores(JSON)/gradeFeedback/gradedAt/startedAt/submittedAt`; unique `(assignmentId, studentId)` :68-71 (mỗi đề 1 attempt). **Không có cột flags.**
- `packages/db/src/schema/assignment-prompt.ts:12-50` — `assignment_prompt`: `transcript` :30, `audioName` :33 (chỉ TÊN file), `questions` :35 là **text JSON string** → thêm `explanation` per question không cần migration cột. **Không có `audio_key`, không có `time_limit_seconds`.**
- `packages/db/src/schema/assignment-test.ts:18-78` — `timeLimitSeconds` :29 (null = không giới hạn) — mẫu cho đề lẻ.
- Teacher prompt CRUD: `apps/server/src/routes/assignments/index.ts` — POST `/prompts` :67-104, PATCH `/prompts/:id` :135-239 với **explicit update map :200-223 — field mới không thêm vào map sẽ bị silent-drop**. Mount `/tests` :243.
- Mount: `kernel.ts:2099` `/assignments`, `:2105` `/grading`; `app.ts:227-228` `/api/student`, `/api`.
- Student quiz: `apps/server/src/routes/student.ts` (1845 dòng) — GET quiz :985, POST start :1095 (snapshot đề + key vào `questionsSnapshot`), PATCH answer :1192 (json_set atomic), PATCH essay :1269, PUT media :1328, DELETE media :1453, GET media :1519, POST submit :1553 (CAS flip `in_progress→submitted` idempotent + stamp `class_assignment_target.submittedAt` trong 1 `db.batch`), GET attempt :1723, GET detail :1786.
- Media pipeline (Speaking): **không presign** — raw body PUT stream. Interface `apps/server/src/lib/media-store.ts` (put/get/delete + `enforceDeclaredSize`); adapter R2 `lib/r2-media-store.ts:13` (FixedLengthStream); wiring `apps/server/src/index.ts:83-87` (binding `env.MEDIA`, thiếu → 503). e2e dùng adapter đĩa. Bucket R2 `packages/infra/alchemy.run.ts:98-101` (private) + binding `MEDIA` :111.
- Body guard: `student.ts:600-633` — `bodyLimit` 4096 mặc định, 48KB `/essay`; PUT/DELETE media miễn content-type JSON. CORP header: `app.ts:153-161`.
- **Feature listening: teacher hiện chỉ lưu TÊN file (`audioName`), chưa có endpoint upload audio prompt.** Cần endpoint teacher + cột `audioKey` + GET stream student-side.

## C. apps/web (teacher) — assignment editor

- Route soạn đề: `apps/web/src/routes/_auth/assignments/new.tsx` (dùng `<PromptComposer>` :488); sửa `$assignmentId.tsx`; full-test `assignments/tests/{new,$id}.tsx`.
- `apps/web/src/components/assignments/prompt-composer.tsx` (332 dòng): `ComposerValue` :18-37 (chưa có explanation/timeLimit). **Listening file picker :203-244 chỉ lưu tên file vào `audioName` (:214), KHÔNG upload nội dung.** Transcript field :265-277 ("chỉ giáo viên" — sẽ đổi semantic thành "hiện sau nộp"). `note` :315-322. Per-question editor `question-key-editor.tsx` (`AssignmentQuestion`, `assignment-presets.ts:21`).
- Config thời lượng có sẵn ở full-test: `components/assignment-tests/test-header-form.tsx` (parse "60:00"→3600, lỗi :70) + `test-builder-shell.tsx:104-117,235,490`; draft store `lib/assignment-test-draft-store.ts`. Nhân bản pattern cho đề lẻ.
- Save: `lib/repos/kernel.ts:162` (POST `/api/assignments/prompts`), `:274` (PATCH).

## D. apps/student — take + review

- Take screen: `apps/student/src/routes/_auth/learn/quizzes/$assignmentId.tsx` (554 dòng): loader :68-95, store wiring :179-194, submit mutation :230-275 (**drain-before-submit** :233-243), guard câu trống :284-289 + `QuizSubmitGuardDialog` :527-551.
- Autosave/resume: `apps/student/src/lib/quiz-attempt-store.ts` (487 dòng) — debounce 600ms :11, mirror localStorage `quiz-attempt:{attemptId}` :21, resume reconcile mirror đè server :340-360, drain :313, halt 401/409 :225-246. `beforeunload`/`pagehide` flush keepalive: `$assignmentId.tsx:306-331`.
- Anti double-submit: server CAS `student.ts:1576-1586` + client `submitDisabled` :411-415.
- **Timer cắm tại:** `components/quiz/quiz-runtime-header.tsx:25-78` — có slot `children` :65 cạnh save-state. `attempt` payload chưa có `startedAt`/deadline.
- **Flag cắm tại:** `QuizNavigator` (`packages/ui/src/components/quiz/quiz-navigator.tsx`, props `parts/answers/current/onSelect/mode/verdicts`) + `quiz-question-item.tsx`. Flag KHÔNG đụng map `answers` (đụng grader `grade-quiz`) → cột riêng.
- Review: summary `routes/_auth/learn/quizzes/attempt/$attemptId.tsx` (`AttemptSummaryBody` :99-278); detail `attempt/$attemptId.detail.tsx` — dựng `review` map :99-114 (**hiện truyền cùng `note` của đề vào mọi câu**), `QuizPaper mode="review"`. Explanation render tại `packages/ui/src/components/quiz/quiz-review-item.tsx` (`QuizReviewInfo` :8-31 có `note`, disclosure `<details>` "Giải thích" :66+).
- Transcript chưa có trong detail payload (route detail `student.ts:1786-1836` không select transcript).
- Media player: `components/quiz/quiz-media-player.tsx:16-136` — tải blob qua `fetchQuizMediaObjectUrl` (`lib/repos/quiz.ts:303-333`) vì `<audio src>` thẳng API không gửi được header `x-student-org-id` (:296-302). Endpoint hiện per-attempt `GET /attempts/:id/media` — audio listening thuộc **prompt**, cần endpoint GET mới, học viên chưa start vẫn phải nghe được.
- Routing: TanStack Router file-based `src/routes/`; `_auth/route.tsx` guard session; home `_auth/index.tsx`. **Shell không sidebar** — `components/layout/student-shell.tsx:13-18` chỉ header. Trang mới = route file + entry point từ home.
- API client: `lib/repos/quiz.ts` (:60-333) + `lib/repos/student.ts` (headers `x-student-org-id`). **Chưa có endpoint list attempts per student.**

## E. Attempts data cho lịch sử + streak

- `quiz_attempt` có: `studentId/assignmentId/status/startedAt/submittedAt/correctCount/gradeScores/gradedAt`.
- **Skill KHÔNG nằm trên attempt** — join `class_assignment → assignment_prompt` (chuẩn `loadOwnedAttemptWithSkill` `student.ts:660-696`); skill/part/title snapshot lấy từ `class_assignment`.
- Query aggregate hiện có: chỉ `snapshot.ts:325-342` (teacher). **Chưa có endpoint lịch sử học viên, chưa có streak.**
- Unique `(assignmentId, studentId)`: lịch sử = 1 dòng/đề; streak suy từ `submittedAt`.

## F. PWA & infra & UI

- apps/student là Vite (port 8003; plugin tanstackRouter + tailwindcss); `index.html` chưa link manifest; `public/` chỉ có `theme-init.js`. **Không manifest, không SW.** `src/worker.ts` = Cloudflare Worker serve ASSETS (security headers); deploy `alchemy.run.ts:216-238`.
- **RISK: issue #125 — `vite-plugin-pwa` đã bị THÁO vì SW làm vỡ SPA boot; e2e `apps/e2e/specs/no-service-worker.spec.ts` khẳng định 0 SW registration + `/sw.js` stub self-unregister (apps/web). PWA student phải giới hạn manifest, KHÔNG SW.**
- Không có rate-limit middleware; không có endpoint feedback. Precedent route ngoài `/api/*`: `app.ts:217-223` (webhook secret, `/public/pay`, `/readyz`).
- `packages/ui` tồn tại (`src/styles/globals.css` tokens); DESIGN.md ở repo root: dark mặc định, accent cam `--accent #ff5b1f`, `--verdict-correct/wrong` chỉ cho đúng/sai kèm icon, DM Mono cho số liệu (hợp countdown), `.neu/.neu-sm/.neu-in`, motion 150ms, focus ring cam.

## G. Testing & verify

- e2e: `apps/e2e/specs/` — `student-quiz-take-review.spec.ts`, `helpers-quiz.ts` (seed DB trực tiếp: prompt/class_assignment/target), `helpers.ts`, `no-service-worker.spec.ts`, `assignment-prompt-create.spec.ts`, `teacher-grade-submission.spec.ts`. Playwright config `apps/e2e/playwright.config.ts:5-7` — override `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103`.
- Unit test student: `apps/student/test/*.test.ts(x)`, vitest **environment "node", KHÔNG jsdom**; test .tsx dùng `renderToStaticMarkup`; logic thuần test store node (`quiz-attempt-store.test.ts`).
- Lệnh verify (root package.json): `pnpm check` (biome), `pnpm check-types` (turbo), `pnpm --filter student run test`, e2e `pnpm e2e`. CI chỉ chạy target `main` — gate là bộ lệnh local.

## Risks

1. `.strict()` everywhere: thêm `explanation`/`transcript`/`timeLimit` phải ship server + client cùng release train (pattern "optional = server cũ" như `essay/skill/media` #304).
2. Explicit update map `assignments/index.ts:200-223` — quên field → lưu im lặng không round-trip.
3. `no-service-worker.spec.ts` chặn SW — PWA chỉ manifest hoặc revising spec có chủ đích.
4. Listening audio chưa có pipeline upload teacher-side — tốn công hơn ước lượng (endpoint + cột + GET stream + player).
5. Timer thiếu deadline trên wire — resume đa thiết bị cần server là nguồn thời gian.
6. Vitest student node + static markup — test DOM tương tác phải tách logic thuần.
