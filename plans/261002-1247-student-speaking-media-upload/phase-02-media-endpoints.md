---
phase: 2
title: "Endpoints media: upload / xoá / phát + chặn nộp rỗng"
status: pending
priority: P1
effort: "4h"
dependencies: [1]
---

# Phase 2: Endpoints media: upload / xoá / phát + chặn nộp rỗng

## Goal
Học viên upload, thay, xoá và phát lại được file bài nói của attempt Speaking của mình. Server không cho nộp đề Speaking khi chưa có file. Mọi guard (auth, CSRF, IDOR, trạng thái, skill, MIME, dung lượng) đều có test bao phủ.

## Bối cảnh
- Router: `apps/server/src/routes/student.ts`.
  - `quizWriteGuard` (`:568-592`) hiện chỉ chạy cho POST/PATCH, bắt Origin + `application/json` + `bodyLimit` (4096, hoặc 48KB cho `/essay` sau #304). Áp cho `/attempts/*`.
  - PATCH answer (`:1025`) và PATCH essay (`:1102`, #304) là khuôn cho ownership `owner`, CAS `status = 'in_progress'` và cách phân biệt 404/409 bằng re-read. Essay handler của #304 join inline `classAssignment → assignmentPrompt` (cả hai có predicate `orgId`) để kiểm `skill` (`:1123-1143`); #304 không tách helper dùng chung.
  - Submit (`:1182`) flip status bằng `UPDATE … WHERE owner AND status='in_progress'`.
  - `loadAttemptForReview` (`:1277`) đã select `skill` và trả field phẳng `skill` (#304). Summary (`:1331`) và detail (`:1374`). <!-- Updated: Red Team 2026-10-02 -->
- CORS: `apps/server/src/app.ts:144-153`, `allowHeaders: ["Content-Type", "Authorization", "x-student-org-id"]`.
- Test: `apps/server/src/routes/student-quiz.test.ts` dựng `buildApp` với libsql và đã có fixture + test (a), test này liệt kê các endpoint unauthenticated.

## Files to Create / Modify
- Modify: `apps/server/src/routes/student.ts`
- Modify: `apps/server/src/app.ts` (CORS `allowHeaders`)
- Modify: `apps/server/src/routes/student-quiz.test.ts`

## Tasks & Steps

### 2.1 Guard
- [ ] `quizWriteGuard`:
  - Origin check áp cho `POST | PATCH | PUT | DELETE`.
  - Chỉ khi method là `PUT` hoặc `DELETE` **và** path khớp đúng `/^\/api\/student\/attempts\/[^/]+\/media$/` thì `return next()` ngay sau Origin check. Không kiểm JSON, không `bodyLimit`, vì `bodyLimit` của hono sẽ bọc hoặc đọc stream mà handler cần chuyển nguyên vào R2. Handler tự kiểm Content-Type/Content-Length. POST/PATCH tới bất kỳ path `/media` nào vẫn qua guard JSON + bodyLimit. <!-- Updated: Red Team 2026-10-02 -->
  - Các path khác giữ nguyên hành vi.
  - Cập nhật comment của guard.
- [ ] `app.ts`: `allowHeaders` thêm `"X-File-Name"`, kèm comment một dòng.

### 2.2 Helper đọc attempt + skill
- [ ] #304 chưa có helper. Tách closure `loadOwnedAttemptWithSkill(attemptId, studentId, orgId)` select `status`, `skill`, `mediaKey`, `mediaName`, `mediaType`, `mediaSize`, `mediaUploadedAt` (join như essay), trả row hoặc undefined. Chuyển PATCH essay sang dùng helper; các test essay hiện có là regression guard. Media và submit dùng chung helper. Không nhân bản câu join. <!-- Updated: Red Team 2026-10-02 -->

### 2.3 `PUT /api/student/attempts/:attemptId/media`
- [ ] Thứ tự kiểm tra. Rẻ trước, DB sau, R2 cuối:
  1. `const store = deps.getMediaStore?.()`. Không có thì 503 `media storage unavailable`.
  2. `Content-Length`: thiếu hoặc không phải số nguyên → 411 `length required`. `0` → 400 `empty file`. Lớn hơn `QUIZ_MEDIA_MAX_BYTES` → 413 `payload too large`.
  3. `Content-Type` (lowercase, bỏ `;params`) không thuộc `QUIZ_MEDIA_TYPES` → 415 `unsupported media type`.
  4. `X-File-Name`: `decodeURIComponent` trong try/catch, rồi `sanitizeMediaFileName`. Lỗi hoặc null → 400 `invalid file name`.
  5. `loadOwnedAttemptWithSkill`: không có → 404. `status === "submitted"` → 409 `{ error: "attempt already submitted", code: "ATTEMPT_SUBMITTED" }`. `skill !== "speaking"` → 400 `media not allowed`. Giữ `oldKey = attempt.mediaKey`.
  6. `newKey = \`quiz-media/${orgId}/${attemptId}/${crypto.randomUUID()}\``. Body null → 400 `empty file`. Gọi `await store.put(newKey, c.req.raw.body, { contentType, size })` trong try/catch: `MediaSizeMismatchError` → 400 `size mismatch`; lỗi khác (client abort, stream lỗi) → xoá `newKey` qua `runInBackground` rồi ném lại (500, hono log). <!-- Updated: Red Team 2026-10-02 -->
  7. CAS: `UPDATE quiz_attempt SET media_key, media_name, media_type, media_size, media_uploaded_at = now WHERE owner AND status = 'in_progress' AND (oldKey === null ? media_key IS NULL : media_key = oldKey) RETURNING id`.
  8. CAS ném lỗi (D1) → xoá `newKey` qua `runInBackground`, ném lại. 0 row: xoá `newKey` qua `runInBackground`, rồi re-read. Không còn row → 404. `submitted` → 409 `ATTEMPT_SUBMITTED`. Còn lại → 409 `{ error: "media changed", code: "MEDIA_CONFLICT" }`.
  9. Thành công: nếu có `oldKey` thì xoá qua `runInBackground(store.delete(oldKey).catch(log))`, log `console.error` (precedent `student.ts:500`), không làm fail request. Trả 200 `{ media: { name, type, size, uploadedAt } }`.
- [ ] JSDoc theo style các handler bên cạnh. Nói rõ: raw body thay vì multipart, key mới mỗi lần upload, CAS theo key cũ, lý do bỏ qua `bodyLimit`.

### 2.4 `DELETE /api/student/attempts/:attemptId/media`
- [ ] Store thiếu → 503. Đọc attempt: không có → 404; submitted → 409 `ATTEMPT_SUBMITTED`; skill không phải speaking → 400. `mediaKey === null` → 200 `{ ok: true }` (idempotent).
- [ ] CAS: set 5 cột về null `WHERE owner AND status='in_progress' AND media_key = oldKey`. 0 row → re-read và trả 404/409 như 2.3. Thành công → `store.delete(oldKey)` best-effort qua `runInBackground`, rồi 200 `{ ok: true }`.

### 2.5 `GET /api/student/attempts/:attemptId/media`
- [ ] Store thiếu → 503. Đọc attempt theo `owner` ở mọi status. Không có attempt hoặc `mediaKey` null → 404 `media not found`. `store.get` trả null → 404.
- [ ] Trả `new Response(obj.body, { headers })` với các header:
  - `Content-Type: attempt.mediaType`. Lấy từ DB, đã được kiểm theo allowlist lúc upload.
  - `Content-Length: obj.size`
  - `Content-Disposition: inline; filename*=UTF-8''${encodeURIComponent(name)}`
  - `X-Content-Type-Options: nosniff`
  - `Content-Security-Policy: default-src 'none'; sandbox`
  - `Cache-Control: private, no-store`
  - `Cross-Origin-Resource-Policy: same-site`: ghi đè giá trị `cross-origin` global của `secureHeaders` (`app.ts:119`), vì cookie SameSite=None cho phép trang ngoài nhúng `<video src>`. Student portal và API cùng site nên blob fetch không bị ảnh hưởng. Nếu `secureHeaders` ghi đè header của handler thì set lại sau middleware (test 2.8 khẳng định giá trị cuối cùng). <!-- Updated: Red Team 2026-10-02 -->

### 2.6 Submit chặn nộp rỗng
- [ ] Trong submit handler, trước khi flip: đọc `skill` bằng helper 2.2. Không có attempt thì giữ nguyên luồng hiện tại (404 ở bước re-read).
- [ ] Khi `skill === "speaking"`, predicate flip thêm `isNotNull(quizAttempt.mediaKey)`.
- [ ] Re-read sau flip phải select thêm `status` và `mediaKey`. Khi `flipped.length === 0`:
  - `status === "in_progress"` → **luôn** trả về trước nhánh self-heal: `mediaKey` null → 400 `{ error: "media required", code: "MEDIA_REQUIRED" }`; còn lại (file vừa được tải ở tab khác giữa flip và re-read) → 409 `{ error: "media changed", code: "MEDIA_CONFLICT" }` để client thử lại.
  - Chỉ khi `status === "submitted"` mới chạy nhánh self-heal stamp `submittedAt` như cũ. Double submit sau khi đã nộp vẫn idempotent. <!-- Updated: Red Team 2026-10-02 -->

### 2.7 Đọc media
- [ ] GET quiz: `attempt.media = toQuizAttemptMedia(attempt)`, trả `{ name, type, size, uploadedAt ISO }` hoặc null khi `mediaKey` null. Helper thuần đặt cùng file.
- [ ] Summary + detail: `skill: loaded.skill`, `media: loaded.skill === "speaking" ? toQuizAttemptMedia(attempt) : null`.

### 2.8 Server tests (`student-quiz.test.ts`)
Seed thêm một prompt Speaking (`skill: "speaking"`, `part: "part2"`, `cueTopic: "a place you like to visit"`, `cuePoints: "where it is\nwhy you like it"`, `questions: []`) và một `class_assignment` cho học viên fixture. Truyền `getMediaStore` là một store Map trong file test (hàm `createMemoryMediaStore()` đọc hết stream vào `Uint8Array`, đồng thời đếm số object để assert dọn dẹp).
- [ ] `"speaking media upload, replace, play back and submit"`: start; PUT file 1 (`audio/mpeg`, khoảng 2KB) → 200, có `media.name` và `media.size`; GET quiz trả `attempt.media`; PUT file 2 (`video/mp4`) → 200 và store chỉ còn 1 object; GET media trả đúng bytes của file 2 cùng các header `content-type: video/mp4`, `x-content-type-options: nosniff`, `content-security-policy` chứa `sandbox`; submit → 200; summary trả `skill: "speaking"`, `media.type: "video/mp4"`, `totalCount 0`; GET media sau khi nộp vẫn 200.
- [ ] `"speaking submit without media is rejected with MEDIA_REQUIRED"`: start rồi submit → 400 `MEDIA_REQUIRED`, attempt vẫn `in_progress`. Upload rồi DELETE → 200, store rỗng; submit lại → 400. DELETE lần hai → 200 (idempotent).
- [ ] `"media upload guards"` (table-driven):
  - Thiếu Content-Length → 411.
  - Content-Length = 0 → 400.
  - Content-Length > 50MB → 413. Chỉ gửi header, body nhỏ; handler phải chặn trước khi đọc body.
  - `application/pdf` → 415.
  - Thiếu `X-File-Name` hoặc `%E0%A4%A` (URI hỏng) → 400.
  - Đề Reading → 400 `media not allowed`.
  - Học viên khác → 404.
  - Sau khi nộp → 409 `ATTEMPT_SUBMITTED`.
  - Origin lạ → 403.
  - Mỗi case lỗi: store không còn object nào sót lại.
- [ ] `"media routes return 503 without a media store"`: dựng app không có `getMediaStore`.
- [ ] Mở rộng test (a): PUT, DELETE, GET `/media` khi chưa đăng nhập → 401.
- [ ] `"media upload rejects a body longer than its Content-Length"`: header `Content-Length: 10`, body 20 byte → 400, store rỗng.
- [ ] `"speaking submit without media never stamps the assignment target"`: attempt Speaking `in_progress` không có file → submit 400 `MEDIA_REQUIRED`, gọi lại lần hai vẫn 400, `class_assignment_target.submittedAt` vẫn null và attempt vẫn `in_progress` (khoá hành vi: nhánh self-heal không chạy khi status còn `in_progress`). Nhánh 409 `MEDIA_CONFLICT` (file vừa có giữa flip và re-read) là phòng thủ cho race không tái hiện tất định được dưới libsql; giữ bằng code review.
- [ ] `"media GET sets same-site CORP"`: header `cross-origin-resource-policy` cuối cùng là `same-site`.
- [ ] Preflight: `OPTIONS /api/student/attempts/x/media` với `Access-Control-Request-Method: PUT` và `Access-Control-Request-Headers: content-type,x-file-name,x-student-org-id` → allow-headers chứa cả ba và allow-methods chứa PUT; lặp lại với DELETE.
- [ ] Guard hẹp: `POST` và `PATCH` tới `/api/student/attempts/:id/media` với `text/plain` → 415 (vẫn bị guard JSON). <!-- Updated: Red Team 2026-10-02 -->
- [ ] Hồi quy: PATCH `/answer` với body khoảng 5.000 byte vẫn 413. Summary của đề Reading có `skill: "reading"`, `media: null`.

## Verification
- `pnpm --filter server test -- student-quiz`: tất cả xanh, gồm test mới.
- `pnpm --filter server test`: xanh.
- `pnpm check-types` + `pnpm check`: xanh.

## Risks
- Nếu ai đó sau này thêm `bodyLimit` hoặc parser chạy trước handler cho `/attempts/*`, stream upload sẽ bị đọc mất và R2 nhận body rỗng. Test "upload, replace, play back" assert đúng bytes để khoá hành vi này.
- Hono `app.request` dưới Node: nhớ set header `Content-Length` thủ công trong test vì `Request` với body `Uint8Array` có thể không tự thêm.
