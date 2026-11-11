---
phase: 1
title: "Phase 1: Khoá fail-closed createStudentGuard, đồng bộ /orgs & chuẩn hoá bảo mật mediaObjectResponse"
status: completed
priority: P1
effort: "1.25h"
dependencies: []
---

# Phase 1: Khoá fail-closed `createStudentGuard`, đồng bộ `/orgs` & chuẩn hoá bảo mật `mediaObjectResponse`

<!-- Updated: Red-Team & Validation Session 1 - valid onboarding payload + HEAD/?org=org-2 tests + fixture cleanup, /orgs asc(student.id) + trim sync, mediaObjectResponse MIME allowlist + app.ts CORP/Referrer-Policy for remaining 4 routes -->

## Goal
Bổ sung mã lỗi hợp đồng `STUDENT_ORG_MISMATCH`, chuyển `createStudentGuard` từ fail-open sang fail-closed (`403 STUDENT_ORG_MISMATCH`) kèm giới hạn `?org=` chỉ cho `GET`/`HEAD` và đồng bộ thứ tự mặc định với `GET /api/student/orgs`, đồng thời khoá cứng hợp đồng `mediaObjectResponse` (giữ `sandbox` chặt, allowlist MIME, `COOP: same-origin`, và `CORP: same-site` + `Referrer-Policy: no-referrer` trên `app.ts`).

## Files to Create / Modify
- Modify: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/packages/api/src/contracts.ts`
- Modify: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/server/src/routes/student.ts`
- Modify: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/server/src/app.ts`
- Modify: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/server/src/student.test.ts`
- Modify: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/server/src/lib/media-response.ts`
- Create: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/server/src/lib/media-response.test.ts`

## Tasks & Steps

### Task 1.1 — Thêm hằng số hợp đồng `STUDENT_ERROR_CODES.ORG_MISMATCH` ở `@teacher-os/api`
- **Goal:** Xuất mã lỗi `ORG_MISMATCH: "STUDENT_ORG_MISMATCH"` trong `STUDENT_ERROR_CODES` để cả server và cổng học viên phân biệt rạch ròi giữa tài khoản chưa liên kết bất kỳ tổ chức nào (`STUDENT_NOT_LINKED`) với request gửi `orgId` không thuộc hồ sơ của phiên đăng nhập (`STUDENT_ORG_MISMATCH`).
- **Target files and symbols:** `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/packages/api/src/contracts.ts` (hằng số `STUDENT_ERROR_CODES` tại dòng 1967–1971).
- **Steps:**
  1. Trong `STUDENT_ERROR_CODES` (`packages/api/src/contracts.ts:1967`), thêm trường `ORG_MISMATCH: "STUDENT_ORG_MISMATCH"` kèm JSDoc ngắn giải thích: trả về với HTTP `403` khi `x-student-org-id` hoặc `?org=` (trên `GET`/`HEAD`) khác rỗng nhưng không khớp bất kỳ hồ sơ học viên nào của phiên đăng nhập hiện tại (#675).
- **Success criteria:** Type `StudentErrorCode` tự động bao gồm `"STUDENT_ORG_MISMATCH"` và gói `@teacher-os/api` kiểm tra kiểu thành công.
- **Verify:** `pnpm --filter @teacher-os/api check-types` kết thúc với mã thoát `0`.

### Task 1.2 — Viết bài test đỏ (TDD Red) cho hành vi fail-closed của `createStudentGuard` và đồng bộ `GET /api/student/orgs` trong `student.test.ts`
- **Goal:** Khoá đầy đủ ma trận hành vi mới của `createStudentGuard` (`GET`, `HEAD`, `POST`, header khoảng trắng, `?org=` org lạ lẫn `?org=` org phụ hợp lệ trên lệnh ghi) và tính nhất quán với `GET /api/student/orgs` bằng các bài test thất bại trên code hiện tại trước khi sửa server.
- **Target files and symbols:** `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/server/src/student.test.ts` (khối test đa-org tại dòng 417–488).
- **Steps:**
  1. Trong test `"(c) multi-org student resolves cleanly via header x-student-org-id or fallback"` (`apps/server/src/student.test.ts:417`):
     - Giữ kiểm tra không gửi header → rơi về org mặc định (`200`) và kiểm tra thêm `GET /api/student/orgs` (không header, và với header có khoảng trắng `"  org-2  "`) đánh dấu `isCurrent: true` trùng khớp chính xác với `body.student.orgId` của `GET /api/student/me` ngay cả khi 2 dòng `student-amb-1` và `student-amb-2` có cùng `createdAt`.
     - Thêm kiểm tra gửi `x-student-org-id: "org-not-mine"` → trả `403` với `{ error: STUDENT_ERROR_CODES.ORG_MISMATCH, code: STUDENT_ERROR_CODES.ORG_MISMATCH }`.
     - Thêm kiểm tra gửi `x-student-org-id: "   "` (chỉ khoảng trắng) → coi như không gửi header, trả `200`.
  2. Trong test `"multi-org student can pick the org via ?org= when headers cannot be sent"` (`apps/server/src/student.test.ts:450`):
     - Cập nhật nhánh `foreign` (`GET /api/student/me?org=org-not-mine`, dòng 467–474): đổi kỳ vọng từ `200` sang `403` với `code: STUDENT_ERROR_CODES.ORG_MISMATCH`.
     - Thêm kiểm tra `HEAD /api/student/me?org=org-2` → trả `200`, và `HEAD /api/student/me?org=org-not-mine` → trả `403`.
     - Thêm kiểm tra header khoảng trắng kèm query hợp lệ (`headers: { "x-test-user": "ambiguous", "x-student-org-id": "  " }` trên `GET /api/student/me?org=org-2`) → trả `200` với `student.orgId === "org-2"`.
     - Giữ kiểm tra `both` (`x-student-org-id: "org-1"` thắng `?org=org-2`), và thêm kiểm tra `x-student-org-id: "org-not-mine"` kèm `?org=org-1` → vẫn trả `403 STUDENT_ORG_MISMATCH` (header sai không được rơi xuống `?org=`).
     - Thêm kiểm tra phương thức ghi bỏ qua hoàn toàn `?org=`: dùng đúng payload hợp lệ theo `studentOnboardingPayloadSchema` là `{ examInterest: "ielts", currentLevel: "intermediate", targetScore: "6.5", learningGoals: ["study-abroad"], dailyStudyHours: "1-2" }` với `headers: { "x-test-user": "ambiguous", Origin: "http://localhost:8003", "Content-Type": "application/json" }`:
       - `POST /api/student/onboarding?org=org-2` (không có header `x-student-org-id`; lưu ý `org-2` là org phụ hợp lệ của `ambiguous`, còn `rows[0]` theo `asc(student.id)` là `student-amb-1` ở `org-1`) → trả `200` với `body.student.orgId === "org-1"` (chứng minh `?org=org-2` không thể lái ngữ cảnh ghi sang `org-2`).
       - `POST /api/student/onboarding?org=org-not-mine` → trả `200` với `body.student.orgId === "org-1"`.
       - `POST /api/student/onboarding` kèm header `x-student-org-id: "org-not-mine"` → trả `403` với `code: STUDENT_ERROR_CODES.ORG_MISMATCH`.
     - Trong khối `finally` (`apps/server/src/student.test.ts:483-487`), ngoài việc reset `email: ""` cho `student-amb-2`, khôi phục đầy đủ các cột onboarding của `student-amb-1` và `student-amb-2` (`onboardingCompletedAt: null, examInterest: null, currentLevel: null, targetScore: null, learningGoals: null, dailyStudyHours: null`) để không làm bẩn các bài test phía sau.
- **Success criteria:** Bộ test `student.test.ts` chạy đỏ vì `createStudentGuard` hiện vẫn trả `200` cho org lạ và `GET /api/student/orgs` đang dùng `desc(student.id)` chưa `.trim()`.
- **Verify:** `pnpm --filter server test -- src/student.test.ts` kết thúc với mã thoát khác `0` do lỗi khẳng định (nếu lệnh thoát `0` là thất bại).

### Task 1.3 — Cài đặt `createStudentGuard` fail-closed & đồng bộ `GET /api/student/orgs` (TDD Green)
- **Goal:** Sửa `createStudentGuard` và `GET /api/student/orgs` trong `apps/server/src/routes/student.ts` để thoả mãn toàn bộ ma trận kiểm thử ở Task 1.2.
- **Target files and symbols:** `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/server/src/routes/student.ts` (JSDoc dòng 118–123, thân hàm `createStudentGuard` dòng 177–200, và handler `router.get("/orgs")` dòng 676–711).
- **Steps:**
  1. Cập nhật JSDoc của `createStudentGuard` ghi rõ: chọn org theo header `x-student-org-id` (hoặc query `?org=` chỉ trên `GET`/`HEAD`); khi có truyền `orgId` khác rỗng mà không khớp hồ sơ nào của phiên đăng nhập thì trả `403 STUDENT_ORG_MISMATCH` (fail-closed, #675); khi không có hồ sơ nào trả `403 STUDENT_NOT_LINKED`.
  2. Thay đoạn đọc `requestedOrgId` (dòng 180–189) bằng:
     ```ts
     const rawHeaderOrg = c.req.header("x-student-org-id")?.trim();
     const headerOrgId = rawHeaderOrg ? rawHeaderOrg : undefined;
     const method = c.req.method.toUpperCase();
     const rawQueryOrg =
     	method === "GET" || method === "HEAD"
     		? c.req.query("org")?.trim()
     		: undefined;
     const queryOrgId = rawQueryOrg ? rawQueryOrg : undefined;
     const requestedOrgId = headerOrgId ?? queryOrgId;
     let matchedStudent = rows[0];

     if (requestedOrgId) {
     	const found = rows.find((r) => r.orgId === requestedOrgId);
     	if (!found) {
     		return c.json(
     			{
     				error: STUDENT_ERROR_CODES.ORG_MISMATCH,
     				code: STUDENT_ERROR_CODES.ORG_MISMATCH,
     			},
     			403,
     		);
     	}
     	matchedStudent = found;
     }
     ```
  3. Trong `router.get("/orgs", ...)` (`apps/server/src/routes/student.ts:680, 692`):
     - Đổi dòng 680 thành `const rawHeaderOrg = c.req.header("x-student-org-id")?.trim(); const requestedOrgId = rawHeaderOrg ? rawHeaderOrg : undefined;`.
     - Đổi dòng 692 từ `.orderBy(desc(student.createdAt), desc(student.id))` thành `.orderBy(desc(student.createdAt), asc(student.id))` để khớp tuyệt đối với `createStudentGuard` (giữ nguyên hành vi không trả 403 trên `/orgs` khi `requestedOrgId` cũ để client luôn đọc được danh sách tổ chức hợp lệ).
- **Success criteria:** Toàn bộ `student.test.ts` và các suite route học viên của server đều chạy xanh.
- **Verify:** `pnpm --filter server test -- src/student.test.ts src/student-invitation.test.ts src/routes/student-quiz.test.ts src/routes/materials.test.ts` thoát với mã `0` và in `passed`.

### Task 1.4 — Viết bài test đỏ (TDD Red) & khoá hợp đồng bảo mật cho `mediaObjectResponse` + `app.ts` CORP/Referrer-Policy (TDD Green)
- **Goal:** Khoá cứng `mediaObjectResponse` (giữ `default-src 'none'; sandbox`, gắn `COOP: same-origin`, chuẩn hoá & allowlist MIME chống `text/html`/`image/svg+xml`/chuỗi rỗng) và phủ `Cross-Origin-Resource-Policy: same-site` + `Referrer-Policy: no-referrer` trước `secureHeaders` trong `app.ts` cho cả 4 route `mediaObjectResponse` còn thiếu.
- **Target files and symbols:**
  - Create: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/server/src/lib/media-response.test.ts`
  - Modify: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/server/src/lib/media-response.ts` (hàm `mediaObjectResponse` tại dòng 30–46).
  - Modify: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/server/src/app.ts` (khối middleware `Cross-Origin-Resource-Policy` / `Referrer-Policy` tại dòng 319–342).
- **Steps:**
  1. (Red) Tạo `apps/server/src/lib/media-response.test.ts` kiểm tra:
     - Phản hồi chuẩn cho MIME được phép (`"audio/mpeg"`, `"video/mp4"`, `"application/pdf"`, `"image/png"`, `"Audio/MPEG; codecs=mp3"`) mang `Content-Disposition: inline; filename*=UTF-8''...` (mã hoá đúng `'()*` và tiếng Việt), `Content-Type` đã chuẩn hoá chữ thường không kèm tham số, `Content-Security-Policy: "default-src 'none'; sandbox"` (không chứa `"allow-same-origin"` và không chứa `"allow-scripts"`), `X-Content-Type-Options: "nosniff"`, `Cache-Control: "private, no-store"`, và `Cross-Origin-Opener-Policy: "same-origin"`.
     - Khi `meta.mediaType` là `""`, `"   "` hoặc `null` nhưng `object.contentType` hợp lệ (`"audio/mpeg"`), `Content-Type` rơi về `"audio/mpeg"` (`inline`).
     - Khi cả hai rỗng hoặc mang MIME nguy hiểm ngoài allowlist (`"text/html"`, `"image/svg+xml"`, `"application/javascript"`), `mediaObjectResponse` ép `Content-Type: "application/octet-stream"` và hạ `Content-Disposition` xuống `attachment; filename*=UTF-8''...` để caller không bao giờ nhận/dựng `Blob` HTML/SVG thực thi được.
     - Thêm 1 bài test tích hợp qua `buildApp` kiểm tra các đường dẫn `/api/exam-imports/:id/file`, `/api/admin/library/tests/:testId/parts/:slot/audio`, `/api/student/vocab/audio/:wordId`, `/api/kernel/vocab/words/:wordId/audio` giữ `Cross-Origin-Resource-Policy: "same-site"` và `Referrer-Policy: "no-referrer"` sau khi đi qua `secureHeaders` (kể cả trên phản hồi 401/404).
     - Chạy `pnpm --filter server test -- src/lib/media-response.test.ts` và xác nhận thoát khác `0`.
  2. (Green) Cập nhật `apps/server/src/lib/media-response.ts`:
     - Import `normalizeMediaType` từ `@teacher-os/api/lib/quiz-media`.
     - Viết hàm kiểm tra allowlist MIME cho `mediaObjectResponse`: cho phép `normalized.startsWith("audio/") || normalized.startsWith("video/")` (loại trừ rỗng sau `/`) hoặc thuộc tập tài liệu nguồn của `exam-imports` (`"application/pdf"`, `"image/png"`, `"image/jpeg"`, `"image/webp"`, `"application/vnd.openxmlformats-officedocument.wordprocessingml.document"`).
     - Nếu MIME đã chuẩn hoá (từ `meta.mediaType?.trim() || object.contentType?.trim() || ""`) thoả allowlist thì dùng `normalized` với `disposition = "inline"`; ngược lại ép `contentType = "application/octet-stream"` và `disposition = "attachment"`.
     - Giữ nguyên `"Content-Security-Policy": "default-src 'none'; sandbox"` và thêm `"Cross-Origin-Opener-Policy": "same-origin"`, kèm JSDoc giải thích rõ sự khác biệt chủ đích với `materialFileResponse` (#647 / PR #674).
  3. (Green) Trong `apps/server/src/app.ts` (dòng 319–342, trước `secureHeaders`): bổ sung các đường dẫn `/api/exam-imports/:id/file`, `/api/admin/library/tests/:testId/parts/:slot/audio`, `/api/student/vocab/audio/:wordId`, `/api/kernel/vocab/words/:wordId/audio` (cùng `/api/grading/:attemptId/media`, `/api/placement-test/audio/:id`, `/api/student/attempts/:attemptId/media`) đặt `Cross-Origin-Resource-Policy: same-site` và `Referrer-Policy: no-referrer` sau `await next()`.
- **Success criteria:** `media-response.test.ts`, `grading.test.ts`, `student-quiz-media.test.ts`, `exam-imports.test.ts` (nếu có) và `vocab.test.ts` đều chạy xanh hoàn toàn.
- **Verify:** `pnpm --filter server test -- src/lib/media-response.test.ts src/routes/grading.test.ts src/routes/student-quiz-media.test.ts` thoát với mã `0` và in `passed`.

## Todo
- [x] Task 1.1: Thêm `STUDENT_ERROR_CODES.ORG_MISMATCH` vào `packages/api/src/contracts.ts`
- [x] Task 1.2: Viết bài test đỏ cho `createStudentGuard` fail-closed (`GET`/`HEAD`/`POST`, `?org=org-2`, khoảng trắng) & đồng bộ `GET /orgs` trong `apps/server/src/student.test.ts`
- [x] Task 1.3: Cài đặt `createStudentGuard` fail-closed + đồng bộ `GET /api/student/orgs` trong `apps/server/src/routes/student.ts` và chạy xanh test server
- [x] Task 1.4: Viết test đỏ + cập nhật allowlist MIME, `COOP: same-origin` cho `mediaObjectResponse` và `CORP: same-site` + `Referrer-Policy: no-referrer` trong `app.ts`

## Verification
- `pnpm --filter @teacher-os/api check-types` (thoát 0)
- `pnpm --filter server test -- src/student.test.ts src/student-invitation.test.ts src/routes/student-quiz.test.ts src/routes/materials.test.ts src/lib/media-response.test.ts src/routes/grading.test.ts src/routes/student-quiz-media.test.ts` (thoát 0)

## Success Criteria
- `createStudentGuard` từ chối `403 STUDENT_ORG_MISMATCH` mọi request có `x-student-org-id` hoặc `?org=` (trên `GET`/`HEAD`) không khớp `rows`, bỏ qua hoàn toàn `?org=` trên `POST`/`PUT`/`PATCH`/`DELETE`, và `GET /api/student/orgs` luôn chọn cùng `defaultOrgId` với `createStudentGuard`.
- `mediaObjectResponse` giữ nguyên `default-src 'none'; sandbox`, có `Cross-Origin-Opener-Policy: same-origin`, ép `application/octet-stream` + `attachment` cho mọi MIME ngoài allowlist hoặc rỗng, và cả 7 route media đều mang `Cross-Origin-Resource-Policy: same-site` + `Referrer-Policy: no-referrer` qua `buildApp`.

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
