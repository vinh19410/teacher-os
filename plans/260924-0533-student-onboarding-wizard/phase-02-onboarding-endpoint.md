---
phase: 2
title: "POST /api/student/onboarding + studentMe mở rộng + unit tests"
status: completed
priority: P2
effort: 2h
dependencies: [1]
---

# Phase 2: POST /api/student/onboarding + studentMe mở rộng + unit tests

## Goal

Endpoint ghi dữ liệu wizard: `POST /api/student/onboarding` trong `studentRoutes`, đi qua middleware provisioning có sẵn — nghĩa là request chỉ tới được handler khi `emailVerified === true` và row student tồn tại (đã provision nếu cần). Vì đây là POST ghi đầu tiên dưới `/api/student/*` (cookie `SameSite=None`), phase này thêm middleware CSRF (Origin + content-type + size cap) theo pattern kernel — D5. Cùng phase, mở rộng `studentMeSchema` + handler `/me` để UI đọc được `onboardingCompletedAt` cho gate (Phase 3).

Điểm load-bearing: middleware session `router.use("*")` (`apps/server/src/routes/student.ts:43-145`) chạy cho MỌI method dưới `/api/student/*` — POST `/onboarding` được hưởng nguyên bộ gate 401/403 (unverified, not-linked, ambiguous) và context `studentCtx` (dòng 134-142); guard CSRF đăng ký TRƯỚC middleware session để cross-site POST chết sớm nhất có thể. Thứ tự bắt buộc: Task 2.1 (contract + `/me`) trước Task 2.2 (CSRF + POST) vì cả hai dùng chung helper `buildStudentMe`; Task 2.3 test bao trùm cả hai.

## Files to Create / Modify

- Modify: `packages/api/src/contracts.ts` (`studentMeSchema` thêm onboarding fields — D4, ISO string nullable fail-soft; cập nhật comment "Read-only endpoints" dòng 907-910 thành read-write vì có POST ghi)
- Modify: `apps/server/src/routes/student.ts` (middleware CSRF cho POST + helper `buildStudentMe` + refactor `/me` + thêm POST `/onboarding`)
- Modify: `apps/server/src/student.test.ts` (đổi kỳ vọng test strict-equality `(a)` + thêm describe onboarding)

## Tasks & Steps

### Task 2.1 — Mở rộng `studentMeSchema` + helper `buildStudentMe` + refactor `/me`
- Goal: DTO `/me` trả đủ onboarding fields để portal gate quyết định redirect (D2), serialize nhất quán (D4).
- Target files: `packages/api/src/contracts.ts` (`studentMeSchema` dòng 919-931); `apps/server/src/routes/student.ts` (handler `/me` dòng 147-162).
- Steps:
  1. Contracts — trong `studentMeSchema.student` (dòng 924-929) thêm 6 field, đặt sau `orgId`. Mỗi field dùng `.nullable().catch(null)` (**fail-soft read-side**: server cũ thiếu key hoặc dữ liệu lạ → null thay vì ZodError trắng màn portal — xem Risks version-skew):
     ```ts
     examInterest: z.string().nullable().catch(null),
     targetScore: z.string().nullable().catch(null),
     learningGoals: z.array(z.enum(LEARNING_GOAL_OPTIONS)).nullable().catch(null),
     learningGoalsNote: z.string().nullable().catch(null),
     dailyStudyHours: z.string().nullable().catch(null),
     /** ISO 8601 string — precedent: studentAssignmentSchema.submittedAt (dòng ~970). */
     onboardingCompletedAt: z.string().nullable().catch(null),
     ```
     Cùng file: cập nhật comment docblock trên khu Student Portal (dòng 907-910) — bỏ "Read-only", ghi rõ có POST `/onboarding` ghi bởi chính học viên, trust anchor là session email + provisioning.
  2. `apps/server/src/routes/student.ts` — thêm hàm module-level (đặt sau interface `StudentContext`, dòng 32). Đọc-side validate **fail-soft đủ 4 phía enum** (không chỉ learningGoals): giá trị lạ trong DB → null ở DTO, không crash, không lọt chuỗi tùy ý xuống client:
     ```ts
     function parseLearningGoals(raw: string | null): LearningGoalOption[] | null {
         if (!raw) return null;
         try {
             const parsed: unknown = JSON.parse(raw);
             if (!Array.isArray(parsed)) return null;
             const valid = parsed.filter(
                 (g): g is LearningGoalOption =>
                     typeof g === "string" &&
                     (LEARNING_GOAL_OPTIONS as readonly string[]).includes(g),
             );
             return valid.length === parsed.length ? valid : null;
         } catch {
             return null; // JSON-in-text hỏng -> fail-soft, không crash DTO (Risks)
         }
     }

     function parseEnum<T extends string>(
         raw: string | null,
         allowed: readonly T[],
     ): T | null {
         return typeof raw === "string" && (allowed as readonly string[]).includes(raw)
             ? raw
             : null;
     }

     function parseTargetScore(
         examInterest: string | null,
         raw: string | null,
     ): string | null {
         const allowed =
             examInterest === "toeic" ? TOEIC_TARGET_SCORES : IELTS_TARGET_BANDS;
         return parseEnum(raw, allowed);
     }

     function buildStudentMe(
         sessionUser: { userName: string; email: string },
         s: typeof student.$inferSelect,
     ): StudentMe {
         const examInterest = parseEnum(s.examInterest ?? null, EXAM_INTERESTS);
         return {
             user: { name: sessionUser.userName, email: sessionUser.email },
             student: {
                 id: s.id,
                 name: s.name,
                 email: s.email,
                 orgId: s.orgId,
                 examInterest,
                 targetScore: parseTargetScore(examInterest, s.targetScore ?? null),
                 learningGoals: parseLearningGoals(s.learningGoals ?? null),
                 learningGoalsNote: s.learningGoalsNote ?? null,
                 dailyStudyHours: parseEnum(
                     s.dailyStudyHours ?? null,
                     DAILY_STUDY_HOUR_OPTIONS,
                 ),
                 onboardingCompletedAt:
                     s.onboardingCompletedAt instanceof Date
                         ? s.onboardingCompletedAt.toISOString()
                         : null,
             },
         };
     }
     ```
     Import `EXAM_INTERESTS`, `IELTS_TARGET_BANDS`, `TOEIC_TARGET_SCORES`, `LEARNING_GOAL_OPTIONS`, `DAILY_STUDY_HOUR_OPTIONS` + types `LearningGoalOption` vào import block `@teacher-os/api/contracts` sẵn có (dòng 1-5).
  3. Refactor handler `/me` (dòng 147-162): thay object literal bằng `return c.json(buildStudentMe(sessionUser, s));` — giữ nguyên cách destructuring `c.get("studentCtx")`.
  4. Cập nhật test `(a)` trong `apps/server/src/student.test.ts:270-278`: `expect(me).toEqual({...})` là strict theo key — thêm 6 key với giá trị `null` cho student seed `student-1` (chưa onboarding). Đây là contract change có chủ ý (khớp Risks của plan).
- Success criteria: `GET /api/student/me` với student chưa onboarding trả thêm 6 field `null`; type `StudentMe` khớp handler (check-types xanh).
- Verify: `pnpm --filter server test` → exit 0; `pnpm check-types` (root) → exit 0.

### Task 2.2 — Middleware CSRF cho POST + handler `POST /api/student/onboarding`
- Goal: POST ghi đầu tiên dưới `/api/student/*` phải có lớp phòng thủ CSRF giống kernel (cookie `SameSite=None` — `packages/auth/src/index.ts:111-116`), rồi mới đến handler ghi 5 câu trả lời + `onboardingCompletedAt`, idempotent last-write-wins (D5).
- Target files: `apps/server/src/routes/student.ts` (middleware + route mới sau handler `/overview`, trước `return router;` dòng 293-294); `apps/server/src/app.ts` (không đổi — `AppDeps.corsOrigin` đã có và đã được truyền nguyên object vào `studentRoutes(deps)` tại dòng 143).
- Steps:
  1. Mở rộng `StudentRouteDeps` (dòng 20-23) thêm `corsOrigin: string | string[]`, và normalize allowlist ngay đầu `studentRoutes` (copy cách làm `kernel.ts:136-143`):
     ```ts
     const allowedOrigins = Array.isArray(deps.corsOrigin)
         ? deps.corsOrigin
         : [deps.corsOrigin];
     ```
     Kiểm tra các call site `studentRoutes(...)` (chỉ `app.ts:143` + test buildApp trong `student.test.ts` — đã truyền đủ AppDeps nên type mở rộng không vỡ nơi nào khác; nếu test build app bằng deps riêng thì bổ sung `corsOrigin` giống giá trị test kernel dùng cho case `(i)` ở dòng 460-495).
  2. Đăng ký middleware CSRF **ngay trước** middleware session hiện có (dòng 43) — chặn cross-site request trước khi đụng DB:
     ```ts
     // Cookies are SameSite=None, so CSRF defense is an explicit Origin check
     // (same contract as kernel.ts). POST bodies are JSON-only and size-capped.
     router.use("*", async (c, next) => {
         if (c.req.method === "POST") {
             const origin = c.req.header("Origin") ?? "";
             if (!allowedOrigins.includes(origin)) {
                 return c.json({ error: "origin not allowed" }, 403);
             }
             const contentType = c.req.header("Content-Type") ?? "";
             if (!contentType.toLowerCase().startsWith("application/json")) {
                 return c.json({ error: "content-type must be application/json" }, 415);
             }
             const contentLength = Number(c.req.header("Content-Length") ?? "0");
             if (contentLength > 4096) {
                 return c.json({ error: "payload too large" }, 413);
             }
         }
         return next();
     });
     ```
  3. Thêm handler POST (đặt sau handler `/overview`):
     ```ts
     router.post("/onboarding", async (c) => {
         const { student: s, sessionUser } = c.get("studentCtx");
         const db = deps.getDb();

         let raw: unknown;
         try {
             raw = await c.req.json();
         } catch {
             return c.json({ error: "invalid json" }, 400);
         }
         const parsed = studentOnboardingPayloadSchema.safeParse(raw);
         if (!parsed.success) {
             // theo convention kernel: { error: "invalid body" } (routes/kernel.ts:182-186)
             return c.json({ error: "invalid body" }, 400);
         }

         const { examInterest, targetScore, learningGoals, learningGoalsNote, dailyStudyHours } =
             parsed.data;
         await db
             .update(student)
             .set({
                 examInterest,
                 targetScore,
                 learningGoals: JSON.stringify([...learningGoals]),
                 learningGoalsNote: learningGoalsNote?.length ? learningGoalsNote : null,
                 dailyStudyHours,
                 onboardingCompletedAt: new Date(), // refresh mỗi lần POST — by design (D5)
             })
             .where(eq(student.id, s.id));

         const [updated] = await db
             .select()
             .from(student)
             .where(eq(student.id, s.id))
             .limit(1);
         if (!updated) {
             return c.json({ error: STUDENT_ERROR_CODES.NOT_LINKED }, 403);
         }
         return c.json(buildStudentMe(sessionUser, updated), 200);
     });
     ```
     Import `studentOnboardingPayloadSchema` vào block contracts (dòng 1-5). `eq` đã import (dòng 16).
  4. KHÔNG thêm auth/provisioning logic riêng — middleware session `use("*")` (dòng 43-145, giờ đứng SAU guard CSRF) đã: chặn 401 không session, 403 unverified (103-111), 403 ambiguous (113-121), provision khi verified + 0 row (68-86).
  5. Idempotency: không check "đã onboarding chưa" — mỗi POST hợp lệ ghi đè cả 5 answer + làm mới `onboardingCompletedAt` (last-write-wins, D5).
- Success criteria: POST hợp lệ → 200 + DTO mới; POST sai schema → 400 `{ error: "invalid body" }`; POST Origin lạ → 403 `origin not allowed`; POST `text/plain` → 415; POST body > 4KB → 413; unverified → 403 `STUDENT_EMAIL_UNVERIFIED` từ middleware session (không đụng DB).
- Verify: xem Task 2.3 (test bao trùm).

### Task 2.3 — Unit tests server
- Goal: gate cơ học cho endpoint mới + contract mở rộng + guard CSRF, theo đúng pattern file hiện có.
- Target files: `apps/server/src/student.test.ts` (thêm `describe("POST /api/student/onboarding")`; pattern buildApp/DI dòng 176-258, header `x-test-user`, libsql assert kiểu test `(b)` dòng 311-331; pattern test Origin của kernel: `(i)` dòng 460-495).
- **Lưu ý chung cho mọi case POST `/onboarding`:** request phải kèm header `Origin` nằm trong allowlist `corsOrigin` mà test buildApp dùng (đối chiếu deps buildApp trong file test + pattern case `(i)` 460-495) và `Content-Type: application/json` — thiếu Origin là 403 ngay từ guard CSRF, không tới được logic test nhắm tới.
- Steps:
  1. **Happy path** (dùng user `provisioning-user` — verified + email mới, middleware tự provision như test `(b)`): POST `/api/student/onboarding` body `{ examInterest: "ielts", targetScore: "6.5", learningGoals: ["study-abroad", "career"], dailyStudyHours: "1-2" }` (kèm Origin + Content-Type chuẩn) → 200; response `student.examInterest === "ielts"`, `learningGoals` deep-equal mảng gửi lên, `onboardingCompletedAt` là string parse được bởi `new Date(...)` (không NaN). Assert DB row (select theo email): `exam_interest = "ielts"`, `target_score = "6.5"`, `learning_goals` JSON string chứa 2 key đúng thứ tự, `onboarding_completed_at` NOT NULL.
  2. **GET /me round-trip**: sau bước 1, GET `/api/student/me` cùng header → trả đúng các field vừa ghi (chứng minh serialize ISO + parse JSON hoạt động qua wire DTO).
  3. **Idempotent overwrite**: POST lần 2 với `{ examInterest: "toeic", targetScore: "850", learningGoals: ["communication"], dailyStudyHours: "3-plus" }` → 200; DB row đổi sang giá trị mới; `onboarding_completed_at` được làm mới (last-write-wins — by design, D5).
  4. **Invalid body 400** — 3 case: (i) thiếu `examInterest`; (ii) `examInterest: "ielts"` + `targetScore: "999"` (superRefine chặn); (iii) `learningGoals: []` (min 1). Đều assert 400 + `error === "invalid body"` + DB row không đổi.
  5. **Guard CSRF** — 3 case (pattern `(i)` 460-495): (i) POST hợp lệ nhưng `Origin: "https://evil.example"` → 403 `origin not allowed`, DB không đổi; (ii) POST `Content-Type: text/plain` (body JSON) → 415, DB không đổi; (iii) POST hợp lệ + header `Content-Length` vượt 4KB → 413, DB không đổi.
  6. **Unverified 403**: header `x-test-user: unverified` + payload hợp lệ + Origin chuẩn → 403 `STUDENT_EMAIL_UNVERIFIED` (middleware session), DB count student không đổi (pattern test dòng 333-350).
  7. **Không session 401**: header `x-test-user: none` → 401 (pattern test `(g)` dòng 427-432).
  8. **Fail-soft read-side** (khóa hành vi parseLearningGoals/parseEnum): update trực tiếp DB row của một student test (`learning_goals = 'not-json'`, `daily_study_hours = 'bogus'`) → GET `/api/student/me` vẫn 200, `learningGoals === null`, `dailyStudyHours === null`, các field khác nguyên vẹn (không crash DTO).
- Success criteria: toàn bộ test pass, gồm test `(a)` đã cập nhật ở Task 2.1 và mọi test cũ khác.
- Verify: `pnpm --filter server test` → exit 0; `pnpm check` → exit 0; `pnpm check-types` → exit 0.

## Verification (cả phase)

- `pnpm --filter server test` → exit 0.
- `pnpm check-types` (root) → exit 0 (api + server đồng bộ contract).
- `pnpm check` → exit 0.
- `pnpm test` (root) → exit 0 (bao gồm test:ci-workflow + test:topology-drift).

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
