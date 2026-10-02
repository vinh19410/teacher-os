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
  - `quizWriteGuard` (khoảng `:565-588`) hiện chỉ chạy cho POST/PATCH, bắt Origin + `application/json` + `bodyLimit` (4096, hoặc 48KB cho `/essay` sau #304). Áp cho `/attempts/*`.
  - PATCH answer (khoảng `:1014`) và PATCH essay (#304) là khuôn cho ownership `owner`, CAS `status = 'in_progress'` và cách phân biệt 404/409 bằng re-read. Essay handler của #304 đã join `classAssignment → assignmentPrompt` (cả hai có predicate `orgId`) để kiểm `skill`; tái dùng đúng cách join này.
  - Submit (khoảng `:1087`) flip status bằng `UPDATE … WHERE owner AND status='in_progress'`.
  - `loadAttemptForReview` (khoảng `:1185`) đã select `skill` ở header (#304). Summary (khoảng `:1229`) và detail (khoảng `:1270`).
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
  - Nếu `c.req.path.endsWith("/media")` thì `return next()` ngay sau Origin check. Không kiểm JSON, không `bodyLimit`, vì `bodyLimit` của hono sẽ bọc hoặc đọc stream mà handler cần chuyển nguyên vào R2. Handler tự kiểm Content-Type/Content-Length.
  - Các path khác giữ nguyên hành vi.
  - Cập nhật comment của guard.
- [ ] `app.ts`: `allowHeaders` thêm `"X-File-Name"`, kèm comment một dòng.

### 2.2 Helper đọc attempt + skill
- [ ] Nếu #304 đã có helper đọc `attempt + skill` theo `owner` thì tái dùng. Nếu chưa thì tách một closure `loadOwnedAttemptWithSkill(attemptId, s, orgId)` trả `{ attempt, skill } | null`, dùng chung cho essay, media và submit. Không nhân bản câu join.

### 2.3 `PUT /api/student/attempts/:attemptId/media`
- [ ] Thứ tự kiểm tra. Rẻ trước, DB sau, R2 cuối:
  1. `const store = deps.getMediaStore?.()`. Không có thì 503 `media storage unavailable`.
  2. `Content-Length`: thiếu hoặc không phải số nguyên → 411 `length required`. `0` → 400 `empty file`. Lớn hơn `QUIZ_MEDIA_MAX_BYTES` → 413 `payload too large`.
  3. `Content-Type` (lowercase, bỏ `;params`) không thuộc `QUIZ_MEDIA_TYPES` → 415 `unsupported media type`.
  4. `X-File-Name`: `decodeURIComponent` trong try/catch, rồi `sanitizeMediaFileName`. Lỗi hoặc null → 400 `invalid file name`.
  5. `loadOwnedAttemptWithSkill`: không có → 404. `status === "submitted"` → 409 `{ error: "attempt already submitted", code: "ATTEMPT_SUBMITTED" }`. `skill !== "speaking"` → 400 `media not allowed`. Giữ `oldKey = attempt.mediaKey`.
  6. `newKey = \`quiz-media/${orgId}/${attemptId}/${crypto.randomUUID()}\``. Gọi `await store.put(newKey, c.req.raw.body, { contentType, size })`. Body null → 400 `empty file`.
  7. CAS: `UPDATE quiz_attempt SET media_key, media_name, media_type, media_size, media_uploaded_at = now WHERE owner AND status = 'in_progress' AND (oldKey === null ? media_key IS NULL : media_key = oldKey) RETURNING id`.
  8. 0 row: `await store.delete(newKey)`, rồi re-read. Không còn row → 404. `submitted` → 409 `ATTEMPT_SUBMITTED`. Còn lại → 409 `{ error: "media changed", code: "MEDIA_CONFLICT" }`.
  9. Thành công: nếu có `oldKey` thì `await store.delete(oldKey).catch(...)` và `console.error` (precedent `student.ts:497`), không làm fail request. Trả 200 `{ media: { name, type, size, uploadedAt } }`.
- [ ] JSDoc theo style các handler bên cạnh. Nói rõ: raw body thay vì multipart, key mới mỗi lần upload, CAS theo key cũ, lý do bỏ qua `bodyLimit`.

### 2.4 `DELETE /api/student/attempts/:attemptId/media`
- [ ] Store thiếu → 503. Đọc attempt: không có → 404; submitted → 409 `ATTEMPT_SUBMITTED`; skill không phải speaking → 400. `mediaKey === null` → 200 `{ ok: true }` (idempotent).
- [ ] CAS: set 5 cột về null `WHERE owner AND status='in_progress' AND media_key = oldKey`. 0 row → re-read và trả 404/409 như 2.3. Thành công → `store.delete(oldKey)` best-effort, rồi 200 `{ ok: true }`.

### 2.5 `GET /api/student/attempts/:attemptId/media`
- [ ] Store thiếu → 503. Đọc attempt theo `owner` ở mọi status. Không có attempt hoặc `mediaKey` null → 404 `media not found`. `store.get` trả null → 404.
- [ ] Trả `new Response(obj.body, { headers })` với các header:
  - `Content-Type: attempt.mediaType`. Lấy từ DB, đã được kiểm theo allowlist lúc upload.
  - `Content-Length: obj.size`
  - `Content-Disposition: inline; filename*=UTF-8''${encodeURIComponent(name)}`
  - `X-Content-Type-Options: nosniff`
  - `Content-Security-Policy: default-src 'none'; sandbox`
  - `Cache-Control: private, no-store`

### 2.6 Submit chặn nộp rỗng
- [ ] Trong submit handler, trước khi flip: đọc `skill` bằng helper 2.2. Không có attempt thì giữ nguyên luồng hiện tại (404 ở bước re-read).
- [ ] Khi `skill === "speaking"`, predicate flip thêm `isNotNull(quizAttempt.mediaKey)`. Nếu 0 row flipped mà attempt vẫn `in_progress` và `mediaKey` null thì trả 400 `{ error: "media required", code: "MEDIA_REQUIRED" }`. Double submit sau khi đã nộp vẫn idempotent như cũ.

### 2.7 Đọc media
- [ ] GET quiz: `attempt.media = toQuizAttemptMedia(attempt)`, trả `{ name, type, size, uploadedAt ISO }` hoặc null khi `mediaKey` null. Helper thuần đặt cùng file.
- [ ] Summary + detail: `skill: header.skill`, `media: header.skill === "speaking" ? toQuizAttemptMedia(attempt) : null`.

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
- [ ] Hồi quy: PATCH `/answer` với body khoảng 5.000 byte vẫn 413. Summary của đề Reading có `skill: "reading"`, `media: null`.

## Verification
- `pnpm --filter server test -- student-quiz`: tất cả xanh, gồm test mới.
- `pnpm --filter server test`: xanh.
- `pnpm check-types` + `pnpm check`: xanh.

## Risks
- Nếu ai đó sau này thêm `bodyLimit` hoặc parser chạy trước handler cho `/attempts/*`, stream upload sẽ bị đọc mất và R2 nhận body rỗng. Test "upload, replace, play back" assert đúng bytes để khoá hành vi này.
- Hono `app.request` dưới Node: nhớ set header `Content-Length` thủ công trong test vì `Request` với body `Uint8Array` có thể không tự thêm.
