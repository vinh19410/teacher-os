---
phase: 1
title: "Server Range Streaming & CORS/CORP Headers"
status: completed
priority: P0
effort: "1h"
dependencies: []
---

# Phase 1: Server Range Streaming & CORS/CORP Headers

## Goal

Cung cấp HTTP `Range` (`206 Partial Content` / `416 Range Not Satisfiable` / `Accept-Ranges: bytes`), revalidation an toàn bằng `Cache-Control: private, no-cache` + `ETag`/`304` + `Vary: Cookie, x-student-org-id` cho 2 route audio Listening học viên (giữ nguyên `private, no-store` cho 3 route giáo viên và 7 route `mediaObjectResponse`), idle read timeout + wall-clock cap + kiểm biên Range/Content-Range chặt cho `streamStudyPackAudio`, và đủ header CORP/CORS trong `app.ts`.

## Files to Create / Modify

- Modify: `apps/server/src/lib/media-store.ts`
- Modify: `apps/server/src/lib/r2-media-store.ts`
- Modify: `apps/e2e/src/fs-media-store.ts`
- Modify: `apps/server/src/lib/media-response.ts`
- Modify: `apps/server/src/lib/study-pack-audio.ts`
- Modify: `apps/server/src/routes/student-practice.ts`
- Modify: `apps/server/src/routes/student.ts`
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/lib/study-pack-audio.test.ts`
- Modify: `apps/server/src/lib/media-response.test.ts`
- Modify: `apps/server/src/routes/student-practice-library-sync.test.ts`
- Modify: `apps/server/src/routes/student-quiz.test.ts`

## Tasks & Steps

### Task 1.1 — Viết TDD tests (Red) cho Range 206/416, ETag/304, CORP/CORS và bảo mật `streamStudyPackAudio`

<!-- Updated: Red Team Session 2026-11-24 - Sửa fixture 6 byte, nâng mock store, thêm test assignments Range & CORP media-response.test.ts -->

- **Goal:** Có test fail chứng minh server chưa hỗ trợ `Range` 206/416, `ETag`/`304` (`private, no-cache` cho học viên, giữ `private, no-store` mặc định), CORP `same-site` trên `/api/student/practice/:testId/audio`, `Range` trong CORS headers, và kiểm biên Range/Content-Range trong `streamStudyPackAudio`.
- **Target files and symbols:**
  - `apps/server/src/lib/study-pack-audio.test.ts` (describe `serveStudyPackAudio` + `streamStudyPackAudio`)
  - `apps/server/src/lib/media-response.test.ts` (danh sách route CORP `same-site` + `Referrer-Policy: no-referrer`)
  - `apps/server/src/routes/student-practice-library-sync.test.ts` (nâng cấp mock `libraryAudioStore` hỗ trợ `head` + `get(key, range)` và test streaming audio)
  - `apps/server/src/routes/student-quiz.test.ts` (test `Range` 206/416 + `ETag`/`304` trên `/api/student/assignments/:assignmentId/audio`)
- **Steps:**
  1. Trong `apps/server/src/lib/study-pack-audio.test.ts`, thêm tests cho:
     - `serveStudyPackAudio` với R2 `audioKey`:
       - Mặc định (`cacheControl` không truyền): trả `200`, `Accept-Ranges: bytes`, `Cache-Control: private, no-store` (giữ nguyên bảo mật cho 3 route giáo viên).
       - Khi truyền `cacheControl: "private, no-cache"` + `ifNoneMatch`: lần đầu trả `200` kèm `ETag` và `Vary: Cookie, x-student-org-id`; lần sau gửi khớp `ifNoneMatch` (không có `Range`) trả `304 Not Modified` không body kèm `ETag` + `Cache-Control: private, no-cache` + `Vary`.
       - Có `rangeHeader: "bytes=0-3"`: gọi `store.head` + `store.get(key, { offset: 0, length: 4 })`, trả `206`, `Content-Range: bytes 0-3/<total>`, `Content-Length: 4`, `Accept-Ranges: bytes`, chỉ trả đúng 4 byte.
       - Có `rangeHeader: "bytes=999-1000"` (vượt biên): trả `416`, `Content-Range: bytes */<total>`, `Accept-Ranges: bytes`, không gọi `store.get`.
       - Store không implement `head` hoặc trả object thiếu `object.range`: rơi về `200` full stream an toàn (không buffer 50 MB trong RAM).
       - MIME fallback: `object.contentType = "application/octet-stream"` với `.mp3` / `.m4a` / `.wav` / `.ogg` / `.webm` vẫn resolve đúng MIME thuộc `LIBRARY_AUDIO_MIME`.
     - `streamStudyPackAudio`:
       - `rangeHeader: "bytes=0-1"` khi upstream trả `206` kèm `Content-Range: bytes 0-1/4`: pass-through `Range`, trả `206`, `Content-Range`, `Content-Length: 2`, `Accept-Ranges: bytes`.
       - `rangeHeader: "bytes=-"` hoặc `"bytes=5-2"`: không chuyển tiếp `Range` lỗi lên upstream, trả `200`.
       - Upstream trả `206` nhưng thiếu hoặc lệch `Content-Range` (ví dụ `bytes 50-10/100` hoặc `Content-Length` khác `end - start + 1`): trả `404` (tuyệt đối không hạ xuống `200`) và hủy body upstream.
       - Upstream trả `416`: hủy body upstream, trả `416` kèm `Accept-Ranges: bytes` và đủ 4 security headers (`CSP`, `nosniff`, `CORP: same-site`, `Referrer-Policy: no-referrer`, `Cache-Control: private, no-store`).
       - Khi pause / không gọi `pull()` ngay sau `firstChunk`, stream vẫn đọc tiếp chunk sau đó mà không bị 15s idle timer cắt ngang.
  2. Trong `apps/server/src/lib/media-response.test.ts`, bổ sung `"/api/student/practice/t-1/audio"` vào danh sách kiểm `Cross-Origin-Resource-Policy: same-site` và `Referrer-Policy: no-referrer`.
  3. Trong `apps/server/src/routes/student-practice-library-sync.test.ts`:
     - Nâng cấp mock `libraryAudioStore` (dòng 50-67) bổ sung `head(key)` và `get(key, range)` cắt slice + trả `range` + `etag`.
     - Bổ sung assertions trên `/api/student/practice/:testId/audio` (fixture `bikes.mp3` dài **6 byte**):
       - `GET` không `Range` trả `200`, `Accept-Ranges: bytes`, `Cache-Control: private, no-cache`, có `ETag`, `Vary` chứa `x-student-org-id`, `Cross-Origin-Resource-Policy: same-site`, `Referrer-Policy: no-referrer`; gửi lại `If-None-Match` khớp trả `304`.
       - `GET` với `Range: bytes=0-2` trả `206`, `Content-Range: bytes 0-2/6`, `Content-Length: 3`, body `[0x49, 0x44, 0x33]`.
       - `GET` với `Range: bytes=100-200` trả `416`, `Content-Range: bytes */6`.
       - `OPTIONS` preflight với `Origin` hợp lệ và `Access-Control-Request-Headers: range, x-student-org-id` trả `204` có `Access-Control-Allow-Headers` chứa `Range` và `Access-Control-Expose-Headers` chứa `Accept-Ranges`, `Content-Range`, `Content-Length`, `ETag`.
  4. Trong `apps/server/src/routes/student-quiz.test.ts`, bổ sung test `Range: bytes=0-2` (`206`) và `Range: bytes=999-1000` (`416`) cho `/api/student/assignments/:assignmentId/audio`.
- **Success criteria:** Các test mới biên dịch được và fail ở đúng assertion mới vì code production chưa triển khai.
- **Verify:** `pnpm --filter server exec vitest run src/lib/study-pack-audio.test.ts src/lib/media-response.test.ts src/routes/student-practice-library-sync.test.ts` exits non-zero với assertion failure (passing ở bước này là failure).

### Task 1.2 — Thêm `StoredMediaMeta` + `head?(key)` + clamp `range` vào `MediaStore`, `createR2MediaStore`, `createFsMediaStore`, và re-export từ `app.ts`

<!-- Updated: Red Team Session 2026-11-24 - Thêm etag, clamp range, re-export StoredMediaMeta -->

- **Goal:** Đọc metadata `{ contentType, size, etag? }` mà không đọc toàn bộ body stream, và đảm bảo R2/FS store luôn clamp `range` theo biên `size` thật.
- **Target files and symbols:**
  - `apps/server/src/lib/media-store.ts` (`StoredMediaMeta`, `StoredMedia.etag`, `MediaStore.head`)
  - `apps/server/src/lib/r2-media-store.ts` (`createR2MediaStore`)
  - `apps/e2e/src/fs-media-store.ts` (`createFsMediaStore`)
  - `apps/server/src/app.ts` (re-export `type StoredMediaMeta`)
- **Steps:**
  1. Trong `apps/server/src/lib/media-store.ts`:
     - Export `interface StoredMediaMeta { contentType: string; size: number; etag?: string; }`.
     - Thêm optional `etag?: string;` vào `StoredMedia`.
     - Thêm optional `head?(key: string): Promise<StoredMediaMeta | null>;` vào `MediaStore`.
  2. Trong `apps/server/src/app.ts`, bổ sung `type StoredMediaMeta` vào block `export { ... } from "./lib/media-store"`.
  3. Trong `apps/server/src/lib/r2-media-store.ts`:
     - Thêm `async head(key)` gọi `const object = await bucket.head(key); if (!object) return null; return { contentType: object.httpMetadata?.contentType ?? "application/octet-stream", size: object.size, ...(object.httpEtag ? { etag: object.httpEtag } : {}) };`.
     - Trong `get(key, range)`: tính `effectiveRange` sau khi nhận `object` từ `bucket.get` — chỉ gắn `range` khi `range && range.offset >= 0 && range.offset < object.size && range.length > 0`, với `length = Math.min(range.length, object.size - range.offset)`; kèm `...(object.httpEtag ? { etag: object.httpEtag } : {})`.
  4. Trong `apps/e2e/src/fs-media-store.ts`:
     - Thêm `async head(key)` đọc `metaFor(key)` và trả `{ contentType: meta.contentType, size: meta.size, etag: \`"${meta.size}-${encodeURIComponent(key)}"\` }` (hoặc `null` nếu không tồn tại).
     - Trong `get(key, range)`: clamp `range` theo `meta.size`: nếu `range && range.offset >= 0 && range.offset < meta.size && range.length > 0`, tính `clampedLength = Math.min(range.length, meta.size - range.offset)` và dùng `start: range.offset, end: range.offset + clampedLength - 1`, trả `range: { offset: range.offset, length: clampedLength }` và `etag`.
- **Success criteria:** Type-check `server` và `e2e` sạch; `head` và clamped `get(key, range)` sẵn sàng cho Task 1.3.
- **Verify:** no verification needed (xác minh cùng Task 1.3 & 1.4).

### Task 1.3 — Triển khai HTTP Range 206/416, ETag/304 (`private, no-cache` opt-in), MIME fallback đầy đủ, và `streamStudyPackAudio` idle/cap timeout + Range validation

<!-- Updated: Red Team Session 2026-11-24 - Sửa Cache-Control + ETag/304 + Vary, tách idle read timeout + wall-clock cap, siết Range/Content-Range & 416 security headers, xử lý TOCTOU & full LIBRARY_AUDIO_MIME -->

- **Goal:** `serveStudyPackAudio` hỗ trợ streaming từng phần (`200`/`206`/`416`) + revalidation `ETag`/`304` an toàn cho học viên (giữ `private, no-store` cho 3 route giáo viên) và `streamStudyPackAudio` hỗ trợ Range pass-through chặt chẽ không bị cắt khi pause.
- **Target files and symbols:**
  - `apps/server/src/lib/media-response.ts` (`mediaObjectResponse`)
  - `apps/server/src/lib/study-pack-audio.ts` (`streamStudyPackAudio`, `serveStudyPackAudio`)
- **Steps:**
  1. Trong `apps/server/src/lib/media-response.ts`, mở rộng `meta` của `mediaObjectResponse` với các field optional:
     - `cacheControl?: string` (mặc định `"private, no-store"`),
     - `acceptRanges?: boolean`,
     - `status?: 200 | 206` (mặc định `200`),
     - `contentRange?: string`,
     - `contentLength?: number` (mặc định `object.range ? object.range.length : object.size`),
     - `etag?: string`,
     - `vary?: string`.
  2. Trong `apps/server/src/lib/study-pack-audio.ts`:
     - Import `parseByteRange` từ `./byte-range` và `resolveLibraryAudioMimeType` từ `@teacher-os/api/lib/quiz-media`.
     - Helper `resolveAudioMediaType(objectContentType, audioName, key)`: nếu `objectContentType` khác rỗng và khác `"application/octet-stream"` (sau chuẩn hoá) thì dùng nó; ngược lại gọi `resolveLibraryAudioMimeType(audioName || key.split("/").pop() || "", "") ?? "audio/mpeg"`.
     - Helper `buildWeakEtag(key, size, storeEtag?)`: ưu tiên `storeEtag` (nếu hợp lệ dạng quoted string / `W/"..."`), ngược lại dựng `W/"${size}-${key}"` (encode ký tự không hợp lệ).
     - Helper `etagMatches(ifNoneMatch, etag)`: so khớp `If-None-Match` (hỗ trợ `*` và danh sách cách nhau dấu phẩy, weak comparison theo RFC 9110 §8.8.3.2).
     - Helper `sanitizeOutboundRange(raw)`: chỉ chấp nhận single-byte range hợp lệ `/^bytes=(?:(\d+)-(\d*)|-([1-9]\d*))$/` với các số nguyên `<= Number.MAX_SAFE_INTEGER` và (khi cả `start` & `end` đều có) `start <= end`; trả chuỗi chuẩn hoá hoặc `null`.
     - Helper `parseValidatedContentRange(raw, maxBytes, declaredLength)`: parse `/^bytes (\d+)-(\d+)\/(\d+|\*)$/`, kiểm `start <= end`, `(total === "*" || end < total)`, `sliceLen = end - start + 1 <= maxBytes`, và `(declaredLength === null || declaredLength === sliceLen)`.
     - Trong `serveStudyPackAudio(options)` thêm các field optional: `rangeHeader?: string | null`, `ifNoneMatch?: string | null`, `cacheControl?: string`, `vary?: string`.
       - Mặc định `cacheControl` là `"private, no-store"` (không thay đổi 3 route giáo viên).
       - Nhánh R2 (`key`):
         - Kiểm tra `hasSingleRange = typeof options.rangeHeader === "string" && options.rangeHeader.trim().startsWith("bytes=") && !options.rangeHeader.includes(",")`.
         - Nếu `!hasSingleRange` và `options.ifNoneMatch` được gửi và `store.head`: gọi `head = await store.head(key)`; nếu `!head` trả `404`; tính `etag = buildWeakEtag(key, head.size, head.etag)`; nếu `etagMatches(options.ifNoneMatch, etag)` trả `304 Not Modified` kèm `ETag`, `Cache-Control`, `Accept-Ranges: bytes`, `Vary` (nếu có), `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`.
         - Nếu `hasSingleRange`:
           - Nếu `store.head` tồn tại: gọi `head = await store.head(key)`; nếu `!head` trả `404`; parse `parsed = parseByteRange(options.rangeHeader!, head.size)`; nếu `!parsed` trả `416` (`Content-Range: bytes */${head.size}`, `Accept-Ranges: bytes`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, `Cache-Control: private, no-store`, `Vary` nếu có).
           - Gọi `object = await store.get(key, { offset: parsed.start, length: parsed.end - parsed.start + 1 })`; nếu `!object` trả `404`.
           - Kiểm tra TOCTOU kích thước: nếu `parsed.start >= object.size`, gọi `await object.body.cancel().catch(() => {})` và trả `416` với `bytes */${object.size}`.
           - Nếu `object.range` tồn tại: tính `effectiveEnd = Math.min(parsed.end, object.size - 1)` và `effectiveLength = effectiveEnd - parsed.start + 1` (khớp `object.range.length`), trả `mediaObjectResponse(object, { mediaType, mediaName, status: 206, acceptRanges: true, contentRange: \`bytes ${parsed.start}-${effectiveEnd}/${object.size}\`, contentLength: effectiveLength, cacheControl, etag: buildWeakEtag(key, object.size, object.etag ?? head.etag), vary: options.vary })`.
           - Nếu `!object.range` (store không hỗ trợ range): rơi về trả `200` full object (`mediaObjectResponse` với `status: 200`, `acceptRanges: true`, `cacheControl`, `etag`, `vary`) — tuyệt đối không buffer cả file vào RAM.
           - Nếu `store.head` không tồn tại: gọi `store.get(key)` để lấy `object` (`404` nếu null) và parse `parseByteRange(options.rangeHeader!, object.size)`: nếu `null` hủy `object.body` và trả `416`; nếu hợp lệ, hủy `object.body` cũ rồi gọi `ranged = await store.get(key, { offset: parsed.start, length: parsed.end - parsed.start + 1 })`; nếu `ranged?.range` tồn tại thì trả `206`, ngược lại trả `200` full stream.
         - Nếu `!hasSingleRange`: gọi `object = await store.get(key)` (`404` nếu null); kiểm `etag = buildWeakEtag(key, object.size, object.etag)`; nếu `options.ifNoneMatch && etagMatches(options.ifNoneMatch, etag)` hủy `object.body` và trả `304`; ngược lại trả `mediaObjectResponse(object, { mediaType, mediaName, status: 200, acceptRanges: true, cacheControl, etag, vary: options.vary })`.
     - Trong `streamStudyPackAudio(audioUrl, fetchImpl, maxBytes, options?: { rangeHeader?: string | null; cacheControl?: string; vary?: string })`:
       - Tách 2 timer:
         - `armReadTimeout()` / `clearReadTimeout()` (`STUDY_PACK_AUDIO_TIMEOUT_MS = 15_000`): CHỈ bật trước `fetchImpl` + vòng đọc `firstChunk`, rồi **clear ngay trước khi `return new Response(stream)`**; trong `pull()`, CHỈ gọi `armReadTimeout()` ngay trước `await reader.read()` và `clearReadTimeout()` trong `finally` ngay khi `read()` kết thúc!
         - `lifetimeTimer` (`STUDY_PACK_AUDIO_MAX_LIFETIME_MS = 120_000`): trần tối đa chống Slow-Loris DoS, clear khi stream `close()` / `error()` / `cancel()`.
       - Chuẩn hoá `outboundRange = sanitizeOutboundRange(options?.rangeHeader)`. Nếu hợp lệ, gửi `headers: { Range: outboundRange }` trong `fetchImpl`.
       - Chạy kiểm tra SSRF `response.redirected || (response.url && !isAllowedStudyPackAudioUrl(response.url))` **TRƯỚC** nhánh `416` và `!response.ok`!
       - Nếu `outboundRange && response.status === 416`: hủy body + `clearAllTimers()`, trả `416` kèm `Accept-Ranges: bytes`, `Content-Range` (nếu khớp `/^bytes \*\/\d+$/`), và đủ 5 security headers (`nosniff`, `CSP`, `CORP: same-site`, `Referrer-Policy: no-referrer`, `Cache-Control: private, no-store`).
       - Chỉ chấp nhận `response.status === 200 || (Boolean(outboundRange) && response.status === 206)`.
       - Nếu `response.status === 206`: validate `Content-Range` qua `parseValidatedContentRange`; nếu không hợp lệ → hủy body + `clearAllTimers()` + trả `audioNotFoundResponse()` (không bao giờ hạ `206` xuống `200`!).
       - Trả response `206` (hoặc `200`) kèm `Accept-Ranges: bytes` (khi upstream là `206` hoặc gửi `Accept-Ranges: bytes`), `Content-Range` (khi `206`), `Cache-Control: options?.cacheControl ?? "private, no-store"`, `Vary` (nếu có).
- **Success criteria:** `study-pack-audio.test.ts` và `media-response.test.ts` pass 100%.
- **Verify:** `pnpm --filter server exec vitest run src/lib/study-pack-audio.test.ts src/lib/media-response.test.ts` exits 0 và toàn bộ tests pass.

### Task 1.4 — Truyền `Range`/`If-None-Match`/`private, no-cache` ở 2 route audio học viên và vá CORP/CORS trong `app.ts`

- **Goal:** Cả `/api/student/practice/:testId/audio` và `/api/student/assignments/:assignmentId/audio` đều stream `Range` đúng, hỗ trợ `ETag`/`304` (`private, no-cache` + `Vary: Cookie, x-student-org-id`), đặt `CORP: same-site` + `Referrer-Policy: no-referrer`, và cho phép/expose Range + ETag headers trong CORS.
- **Target files and symbols:**
  - `apps/server/src/routes/student-practice.ts` (`GET /practice/:testId/audio`)
  - `apps/server/src/routes/student.ts` (`GET /assignments/:assignmentId/audio`)
  - `apps/server/src/app.ts` (`buildApp`: CORP path array + `corsMiddleware`)
- **Steps:**
  1. Trong `apps/server/src/routes/student-practice.ts` (handler `/practice/:testId/audio`), truyền `rangeHeader: c.req.header("Range")`, `ifNoneMatch: c.req.header("If-None-Match")`, `cacheControl: "private, no-cache"`, `vary: "Cookie, x-student-org-id"` vào `serveStudyPackAudio(...)`.
  2. Trong `apps/server/src/routes/student.ts` (handler `/assignments/:assignmentId/audio`), truyền cùng 4 tham số trên vào `serveStudyPackAudio(...)`.
  3. Trong `apps/server/src/app.ts`:
     - Thêm `"/api/student/practice/:testId/audio"` vào danh sách path đặt `Cross-Origin-Resource-Policy: same-site` và `Referrer-Policy: no-referrer` (ngay cạnh `"/api/student/assignments/:assignmentId/audio"`).
     - Trong `corsMiddleware`, thêm `"Range"` và `"If-None-Match"` vào `allowHeaders` và thêm `exposeHeaders: ["Accept-Ranges", "Content-Range", "Content-Length", "ETag"]`.
- **Success criteria:** Toàn bộ server audio tests pass, bao gồm `200`, `206`, `304`, `416`, `OPTIONS` preflight, `CORP: same-site`, `Referrer-Policy: no-referrer`, và `study-pack.test.ts` (3 route giáo viên vẫn `private, no-store`).
- **Verify:** `pnpm --filter server exec vitest run src/lib/study-pack-audio.test.ts src/lib/media-response.test.ts src/routes/student-practice-library-sync.test.ts src/routes/student-quiz.test.ts src/routes/study-pack.test.ts` exits 0 và toàn bộ tests pass.

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
