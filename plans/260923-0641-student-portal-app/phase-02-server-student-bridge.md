---
title: "Phase 2: Server student bridge + API student-scoped"
status: todo
priority: P1
effort: 8h
dependencies: [1]
---

# Phase 2: Server bridge danh tính học viên + API student-scoped

## Context Links

- `reports/scout-report.md` (mục 4, 5, 6 — auth/session, schema student/enrollment/class/lesson/assignment, app.ts CORS + bootstrap middleware)
- `packages/db/src/schema/student.ts:18-21` — docblock `email` = "danh tính đăng nhập tương lai" (chủ đích bridging)
- Red-team findings #1, #2, #3, #5, #6, #8, #9 (xem plan.md — đã đúc kết vào đặc tả dưới)
- Reference tests: `apps/server/src/kernel.test.ts`, `apps/server/src/auth-roundtrip.test.ts` (pattern buildApp + libsql)
- Contract surface: `packages/api/src/contracts.ts` (code-standards: đổi contract phải đổi server + web cùng lúc)

## Overview

- Priority: P1 · Status: todo
- Thêm không gian route `/api/student/*` tự resolve danh tính: session user → khớp `student.email` **khi email đã verified**. Cấp 2 endpoint read-only (`/me`, `/overview`). Nới CORS + trustedOrigins + CSRF origin-check nhận nhiều origin. Skip bootstrap provisioning cho nhánh student. Không đụng DB schema.

## Key Insights

- `user` KHÔNG có cột role; mọi user mới login bị bootstrapMiddleware tự tạo org + membership `teacher` (`apps/server/src/app.ts:63-77` — **đây là write thật**: 1 org + 1 membership mỗi user mới). Student route phải (a) không dựa vào `kernelCtx`, (b) skip bootstrap cho path `/api/student` để portal không bơm org rác.
- **Bridge chỉ hợp lệ khi `user.emailVerified === true`** (Google cho verified sẵn). Better-auth hiện KHÔNG bật email verification (`packages/auth/src/index.ts:60-62` chỉ `enabled: true`) — signup email/password với email chưa verify KHÔNG được bridge (403 riêng) nếu không sẽ impersonation học viên chỉ cần biết email nạn nhân (red-team Critical #1).
- **`student.email` không unique toàn hệ thống và không có index email** (`packages/db/src/schema/student.ts:21,29`) — match là toàn cục, không phải "trong cùng org". Nhiều row khớp → fail closed 403 `STUDENT_AMBIGUOUS` (không pick earliest — tránh cross-org pick/email planting, red-team Critical #2). Case: so `lower(trim(email))` cả 2 phía vì SQLite `=` là BINARY (red-team #9).
- **`SessionUser` hiện chỉ có `{userId, userName}`** (`apps/server/src/session.ts:3-6`) — phải mở rộng `email` + `emailVerified` thì middleware mới chạy được như đặc tả (red-team High #6).
- **`kernelRoutes` là consumer thứ 3 của corsOrigin**: tự khai `corsOrigin: string` (`apps/server/src/routes/kernel.ts:131`) và CSRF check `c.req.header("Origin") !== deps.corsOrigin` (`kernel.ts:137-145`) — đổi kiểu ở `AppDeps` mà không sửa kernel sẽ chết compile, hoặc tệ hơn: sửa "cho qua" bằng `!==` với array sẽ 403 MỌI POST của app giáo viên (red-team High #5).
- **Grading rows (`assignment`) không có classId và `due` là text tự do default `""`** (`packages/db/src/schema/assignment.ts:14-36`); chỉ `class_assignment` có classId + due ISO (`class-assignment.ts:28-35`); `submittedAt` chỉ tồn tại ở `class_assignment_target`. Contract phải nullable/lőrõ điều này, không nếu mọi item có class + due (red-team High #8).
- CORS hiện 1 origin: `env.CORS_ORIGIN` tại `apps/server/src/index.ts:24,43`, `trustedOrigins: [input.corsOrigin]` tại `packages/auth/src/index.ts:53`, hono cors `origin: deps.corsOrigin` tại `apps/server/src/app.ts`. Hono cors + better-auth trustedOrigins đều nhận array.
- **Inventory đầy đủ caller của corsOrigin** (red-team #7/Contract Verifier): `apps/server/src/index.ts` (2 chỗ), `apps/e2e/src/boot.ts:42-53` (createAuth + buildApp), 7 file test inject fake deps: `kernel.test.ts:85-87`, `security.test.ts:21-23`, `readiness.test.ts:42`, `auth-roundtrip.test.ts:35-46`, `cookie-prefix.test.ts:41-43`, `lesson-date-integration.test.ts:48-50`, `kernel-occurrence.test.ts:54-56`. Chiến lược **widen-type tại biên** (`string | string[]`, string vẫn hợp lệ) để caller cũ không bắt buộc đổi; normalize diễn ra ở `index.ts`.

## Requirements

- [x] `GET /api/student/me` — `{ user: {name, email}, student: {id, name, email, orgId} }`; lỗi phân loại: 403 `STUDENT_NOT_LINKED` (không có row khớp / email rỗng), 403 `STUDENT_AMBIGUOUS` (>1 row khớp), 403 `STUDENT_EMAIL_UNVERIFIED` (khớp nhưng `emailVerified=false`)
- [x] `GET /api/student/overview` — lớp đang học (kèm buổi tới) + bài tập 2 nguồn; chỉ data của student đã bind
- [x] CORS + trustedOrigins + kernel CSRF check nhận danh sách origin (comma-separated), backward-compatible 1 origin
- [x] Request `/api/student/*` không kích hoạt bootstrap provisioning (không tạo org/membership junk)
- [x] Kernel routes hiện có không đổi hành vi (POST từ origin app hiện tại vẫn xanh)

## Architecture

```
packages/api/src/contracts.ts        # + StudentMe/StudentOverview zod schemas + wire types
packages/auth/src/index.ts           # CreateAuthInput.corsOrigin: string | string[] → trustedOrigins normalize array
apps/server/src/session.ts           # SessionUser + {email, emailVerified}; getSessionUser trả đủ
apps/server/src/app.ts               # AppDeps.corsOrigin: string | string[]; bootstrap skip /api/student; cors origin array
apps/server/src/routes/kernel.ts     # deps corsOrigin: string → corsOrigins: string[]; CSRF check: includes(Origin)
apps/server/src/index.ts             # parseCORSOrigins(env.CORS_ORIGIN) split "," → array cho createAuth + buildApp
apps/server/src/routes/student.ts    # studentRoutes(deps): middleware requireStudent tự resolve studentCtx
apps/server/src/student.test.ts      # unit test bridge + overview (libsql, buildApp pattern)
```

Resolver `requireStudent` (thứ tự kiểm tra):
1. `deps.getSessionUser(headers)` → null: 401.
2. Query: `SELECT * FROM student WHERE lower(trim(email)) = lower(?) ORDER BY createdAt, id` với `email = session.email`; rỗng (hoặc student.email rỗng) → 403 `STUDENT_NOT_LINKED`.
3. `session.emailVerified === false` → 403 `STUDENT_EMAIL_UNVERIFIED` (kiểm tra TRƯỚC khi trả data dù row khớp).
4. `> 1` row → 403 `STUDENT_AMBIGUOUS` (fail closed — không tự pick).
5. Bind: `studentCtx = {studentId, orgId (từ student.orgId), userId, student}`.

Response `overview` (contract chốt qua contracts.ts):
```jsonc
{
  "student": { "id": "...", "name": "Minh" },
  "classes": [{
    "id": "...", "name": "IELTS Foundation A", "level": "IELTS 5.0–6.0",
    "mode": "Online", "schedule": "T2 & T5 18:30–20:00",
    "sessionsDone": 12, "sessionsTotal": 24, "status": "active",
    "nextSession": { "date": "2026-09-25", "time": "18:30", "topic": "Writing Task 2" } | null
  }],
  "assignments": [{
    "id": "...", "title": "Writing Task 2 – Opinion Essay",
    "source": "class_assignment" | "grading",
    "classId": "..." | null,          // null cho source "grading" (schema không có khóa lớp)
    "className": "..." | null,
    "due": "2026-09-25" | "",          // "" = không đặt hạn (grading free-text)
    "submittedAt": null,               // chỉ source class_assignment có
    "scores": null | { "task": 6.5, "coherence": 6.0, "lexical": 6.5, "grammar": 6.0 }
  }]
}
```
Không có field `band` trong contract — band derive ở CLIENT Phase 4 với quy tắc IELTS pinned + test. Derive trạng thái ở client (Phase 4): `submittedAt != null` → Đã nộp; source grading có `scores` → Đã chấm (kèm Điểm); `due === ""` hoặc không parse được ISO → "Chưa nộp" (không bao giờ "Quá hạn"); `due < hôm-nay-VN && chưa nộp` → Quá hạn; `due ≤ +3 ngày` → Sắp đến hạn. "Hôm nay" theo Asia/Ho_Chi_Minh — tái dùng `packages/api/src/vietnam-date.ts`.

## Related Code Files

- Create: `apps/server/src/routes/student.ts`, `apps/server/src/student.test.ts`
- Modify: `packages/api/src/contracts.ts`, `packages/auth/src/index.ts`, `apps/server/src/session.ts`, `apps/server/src/app.ts`, `apps/server/src/routes/kernel.ts`, `apps/server/src/index.ts`
- Modify (fake deps widen — thường không cần đổi nếu chỉ widen type; kiểm tra compile): 7 file test liệt kê ở Key Insights + `apps/e2e/src/boot.ts`

## Implementation Steps

1. Contracts vào `packages/api/src/contracts.ts` (StudentMe, StudentOverview + con; classId/className nullable, scores 4 trường).
2. Mở rộng `SessionUser` + `getSessionUser` (`session.ts`) trả `email`, `emailVerified` (better-auth session đã có sẵn hai thông tin này qua user include).
3. Viết `apps/server/src/routes/student.ts` với resolver 5 bước nêu trên; handler `/me` + `/overview` (join enrollment→class; lesson buổi tới theo `date >= hôm-nay-VN` ORDER BY date, day LIMIT 1 mỗi lớp, NULL date → nextSession null; class_assignment_target→class_assignment; assignment theo studentId).
4. `app.ts`: đổi `AppDeps.corsOrigin: string | string[]`; hono cors `origin: deps.corsOrigin`; trong bootstrapMiddleware thêm early-skip: `if (pathname.startsWith("/api/student")) return next();` (đặt trước logic membership, sau check session — resolver tự 401).
5. `kernel.ts`: đổi deps thành `corsOrigins: string[]` (app.ts truyền normalized array), CSRF check `!deps.corsOrigins.includes(c.req.header("Origin"))`; rà 7 file test + `apps/e2e/src/boot.ts` fix compile nếu widen không đủ.
6. `index.ts`: `parseCORSOrigins()` split `","` + trim + lọc rỗng; truyền array vào cả `createAuth` (trustedOrigins normalize trong packages/auth) lẫn `buildApp`.
7. `packages/auth/src/index.ts`: `CreateAuthInput.corsOrigin: string | string[]` → `trustedOrigins: Array.isArray(x) ? x : [x]`.
8. Unit test `apps/server/src/student.test.ts` (libsql + buildApp): (a) Google-like user verified + email khớp 1 row → /me 200, /overview đúng lớp/bài; (b) không khớp → STUDENT_NOT_LINKED; (c) 2 row trùng email ở 2 org khác nhau → STUDENT_AMBIGUOUS (không pick); (d) email khớp nhưng `emailVerified=false` → STUDENT_EMAIL_UNVERIFIED; (e) mixed-case "Minh@Gmail.com" vs "minh@gmail.com" vẫn khớp; (f) student org A không thấy lớp org B; (g) 401 khi không session; (h) CORS preflight origin student được allow, origin lạ không; (i) kernel POST từ origin thứ 2 (app giáo viên) vẫn 200 với corsOrigins array, origin lạ 403; (j) request /api/student với user mới KHÔNG tạo org/membership.

## Todo

- [x] Contracts + SessionUser mở rộng
- [x] routes/student.ts + resolver 5 bước
- [x] bootstrap skip /api/student + multi-origin CORS + kernel corsOrigins
- [x] 10 unit test case trên xanh: `pnpm --filter server test`
- [x] E2e boot shim + test files compile xanh (`pnpm --filter e2e check-types` hoặc build)

## Success Criteria

- `pnpm --filter server test` + `pnpm check-types` xanh.
- Curl có session cookie: `/api/student/me` trả student khi email verified + khớp 1 row; các trạng thái lỗi trả đúng mã STUDENT_* như bảng Requirements.
- POST kernel từ origin app hiện tại vẫn hoạt động (test (i) xanh).

## Risk Assessment

- **Cross-org single-collision còn lại**: 1 row duy nhất ở org X khớp email user → user bị bind vào org X dù có thể "thuộc" org Y (chưa có cơ chế phê duyệt). Đã fail-closed trường hợp mơ hồ; trường hợp 1-row-wrong-org là accepted-risk có chủ ý, giải pháp triệt để (bảng link/invite teacher-approve) nằm ở Non-goals/follow-up.
- **Student user vẫn là teacher hợp lệ trên org rác khi gọi API kernel trực tiếp** (không qua portal): bootstrap skip chỉ tắt provisioning từ portal, nhưng nếu user từng vào web app, org vẫn được tạo và session của họ vẫn pass kernel guard. Chấp nhận cho v1 read-only portal (UI không phơi mutation); role-guard là follow-up.
- Email planting (teacher org khác tạo sẵn row email sớm hơn) — với fail-closed chỉ còn kịch bản 1-row; theo dõi vận hành thực tế trước khi xây invite flow.

## Security Considerations

- Bridge yêu cầu email verified — không cấp data cho account email/password chưa xác thực sở hữu email.
- Read-only, org-scoped theo `student.orgId` — mọi query WHERE theo studentId/orgId, không nhận id từ client.
- Không lộ danh sách học viên; response chỉ chứa data student đã bind.
- Giữ CSRF/content-type checks ở route layer (code-standards) cho endpoint mới — middleware student route cũng check Origin giống kernel trước mutation (vì read-only, đủ ở CORS layer).
- Không bật wildcard `*` cho CORS/trustedOrigins.

## Next Steps

- Phase 3 + 4 consume các endpoint này; Phase 5 bơm origin student vào CORS_ORIGIN (cả nhánh topology lẫn dev).
