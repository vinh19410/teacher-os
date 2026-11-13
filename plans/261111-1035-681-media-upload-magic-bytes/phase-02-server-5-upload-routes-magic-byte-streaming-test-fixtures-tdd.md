---
phase: 2
title: "Phase 2: Server 5 upload routes, magic-byte streaming & test fixtures (TDD)"
status: pending
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: Server 5 upload routes, magic-byte streaming & test fixtures (TDD)

## Goal

Áp dụng hợp đồng xác thực 3 lớp (`X-File-Name` đuôi file ↔ `Content-Type` ↔ chữ ký magic-byte 64 byte đầu) lên toàn bộ 5 route upload nhị phân của `apps/server` theo quy trình TDD (Red → Green), bổ sung `PeekedStream.abort()` giải phóng khoá reader an toàn kể cả sau `pipeThrough`, thêm CAS/cleanup cho Vocab audio, giới hạn cứng byte đọc trên Exam Import chống OOM, và nâng cấp toàn bộ fixture test sang byte thật.

## Files to Create / Modify

- Modify: `apps/server/src/lib/peek-stream.ts` & `apps/server/src/lib/peek-stream.test.ts` — bổ sung phương thức `abort(reason?: unknown): Promise<void>` trên `PeekedStream` để huỷ `reader` gốc và giải phóng khoá ngay cả khi `peeked.stream.locked === true` (sau `pipeThrough`), kèm unit test.
- Create: `apps/server/src/lib/test-media-fixtures.ts` — cung cấp bộ tạo byte hợp lệ tối thiểu dùng chung cho test server (`mp3Bytes`, `mp3Id3Bytes`, `mp4Bytes`, `wavBytes`, `oggBytes`, `webmBytes`, `aacAdtsBytes`, `movQtFtypBytes`, `movLegacyWideMdatBytes`, `pngBytes`, `jpegBytes`).
- Modify: `apps/server/src/routes/student.ts` — chuẩn hoá `contentType` của `.m4a` + `video/mp4` về `audio/mp4`, tích hợp `quizMediaExtensionMatches`, `peekStream` (bọc `try/catch`), `peeked.abort()` và `matchesQuizMediaMagic(contentType, peeked.head, size)` vào `PUT /attempts/:attemptId/media`.
- Modify: `apps/server/src/routes/student-quiz-media.test.ts` — nâng cấp toàn bộ lời gọi chạm `store.put` (gồm cả 7 ca `200` và ca đua CAS `409` tại dòng 684) sang `mp3Bytes` / `mp4Bytes`, thêm bài test chặn lệch đuôi, polyglot thế hệ 1 & 2, `.m4a` + `video/mp4` mang `ftypqt  `, lệch `Content-Length` `<= 64B` & `> 64B`, và ca dương cho WAV/OGG/WebM/AAC/MOV.
- Modify: `apps/server/src/routes/admin-library.ts` — đưa khối kiểm `Content-Length`, `Content-Type`, `sanitizeMediaFileName` và `libraryAudioExtensionMatches` lên trước `loadTestRow(testId)`, bọc `peekStream` trong `try/catch`, dùng `peeked.abort()` và kiểm `matchesLibraryAudioMagic(contentType, peeked.head, size)` trước `loadPartRow` / `store.put`.
- Modify: `apps/server/src/routes/admin-library-audio.test.ts` — nâng cấp fixture trong `audioPut` (và các ca `.m4a` / `.wav`) sang byte thật hợp lệ, thêm test chặn `payload.html`, polyglot HTML/UTF-16LE BOM/`ID3\x04<html>`, và lệch `Content-Length` `> 64B`.
- Modify: `apps/server/src/routes/placement-test.ts` — tích hợp `libraryAudioExtensionMatches`, `peekStream` (bọc `try/catch` trả `500 { error: "audio upload failed" }`), `peeked.abort()` và `matchesLibraryAudioMagic(contentType, peeked.head, size)` vào `PUT /audio`.
- Modify: `apps/server/src/routes/placement-test.test.ts` — nâng cấp `uploadSampleAudio` dùng `mp3Id3Bytes(content)` (cập nhật đối chiếu dòng 412) và thêm test chặn lệch đuôi / polyglot / lệch `Content-Length` trên `/api/placement-test/audio`.
- Modify: `apps/server/src/routes/vocab-teacher.ts` — chuẩn hoá `"audio/mp3"` → `"audio/mpeg"`, dùng `LIBRARY_AUDIO_MIME`, bắt buộc `X-File-Name`, kiểm `libraryAudioExtensionMatches`, bọc `peekStream` trong `try/catch`, kiểm `matchesLibraryAudioMagic`, trả thống nhất `code: VOCAB_ERROR_CODES.INVALID_AUDIO` cho cả `400` lệch kích thước/tên lẫn `415`, và bọc `db.update(vocabWord)` trong `try/catch` kèm điều kiện CAS theo `oldKey` + `.returning()` (dọn `newKey` nếu `updated.length === 0` hoặc DB lỗi).
- Modify: `apps/server/src/routes/vocab-teacher.test.ts` — cập nhật `createMemoryMediaStore.put` gọi `enforceDeclaredSize(body, meta.size)`, truyền `X-File-Name` cho ca dương và bổ sung các ca: thiếu `X-File-Name` (`400`), `payload.html` (`415`), polyglot HTML/UTF-16LE BOM (`415`), `audio/mp3` → `audio/mpeg` & `audio/wave` (`200`), lệch `Content-Length` `> 64B` ở cả hai chiều ngắn/dài (`400`, giữ nguyên `audioKey`), và đua CAS/xoá từ giữa chừng không rò rỉ object.
- Modify: `apps/server/src/lib/exam-import/validate-file.ts` — kiểm `matchesMaterialMagic(mimeType, head)` trên tối đa 64 byte đầu + kiểm marker JPEG `0xc0..0xfe` tại `head[3]` (chặn `\xff\xd8\xff<html>`), fail-closed `{ ok: false, reason: "type" }` với mọi MIME ngoài 3 kiểu cho phép.
- Modify: `apps/server/src/lib/exam-import/validate-file.test.ts` — đổi ca PNG/JPEG sang `pngBytes` / `jpegBytes` thật và bổ sung ca từ chối `new ArrayBuffer(8)`, `\xff\xd8\xff<html>`, `%PDF-<html>`, `"  %PDF-1.4"`, và `"text/html"`.
- Modify: `apps/server/src/routes/exam-imports.ts` — kiểm `materialExtensionMatches(fileName, mimeType)` trước khi đọc body, và thay `c.req.raw.arrayBuffer()` bằng helper đọc stream giới hạn cứng `declaredSize` (ngắt + `cancel()` ngay tại byte `declaredSize + 1`, trả `400 INVALID_FILE` `reason: "size"` chống OOM).
- Modify: `apps/server/src/routes/exam-imports.test.ts` — bổ sung ca dương nhập đề ảnh PNG/JPEG thật (`200`), ca âm chặn lệch đuôi, ảnh PNG/JPEG mang HTML (`reason: "type"`), và stream khai `Content-Length: 100` nhưng bơm vượt ngưỡng bị ngắt sớm (`reason: "size"`, 0 job, 0 object R2, ví nguyên 30 Cr).

## Tasks & Steps

<!-- Updated: Red Team & Validation Session 1 - add PeekedStream.abort(), enforceDeclaredSize in vocab-teacher.test.ts, student 409 CAS fixture, Vocab CAS/cleanup, bounded stream read in exam-imports.ts, and JPEG marker check -->

### Task 2.1 — Mở rộng test cho `peekStream.abort()`, tạo `test-media-fixtures.ts` & viết bài kiểm thử đỏ (Red) cho cả 5 bề mặt server
- **Goal:** Bổ sung test cho `peeked.abort()` trên stream đã `locked`, xây dựng `apps/server/src/lib/test-media-fixtures.ts` đạt chuẩn cấu trúc thật (vượt qua cả các quy tắc chống polyglot thế hệ 2) và cập nhật/mở rộng 6 file test của server trước khi sửa route, chứng minh trạng thái Đỏ (Red).
- **Target files and symbols:**
  - `apps/server/src/lib/peek-stream.test.ts`
  - `apps/server/src/lib/test-media-fixtures.ts` (file mới)
  - `apps/server/src/routes/student-quiz-media.test.ts`
  - `apps/server/src/routes/admin-library-audio.test.ts`
  - `apps/server/src/routes/placement-test.test.ts`
  - `apps/server/src/routes/vocab-teacher.test.ts`
  - `apps/server/src/lib/exam-import/validate-file.test.ts`
  - `apps/server/src/routes/exam-imports.test.ts`
- **Steps:**
  1. Trong `apps/server/src/lib/peek-stream.test.ts`, thêm ca kiểm thử: sau khi khoá `peeked.stream.getReader()` (mô phỏng `pipeThrough`), gọi `await peeked.abort("store error")` không ném `TypeError`, huỷ `body` nguồn với lý do `"store error"` và giải phóng `body.locked === false`.
  2. Tạo `apps/server/src/lib/test-media-fixtures.ts` xuất các hàm thuần trả `Uint8Array`:
     - `mp3Bytes(length = 16, fill = 1)`: `length >= 4`, ghi `[0xff, 0xfb, 0x90, 0x64]` rồi điền `fill`.
     - `mp3Id3Bytes(tagText = "")`: ghép 14 byte header ID3v2.4 có padding hợp lệ `[0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0]` với UTF-8 của `tagText` (đảm bảo `head[10] === 0` vượt qua kiểm tra chống `ID3\x04<html>`).
     - `mp4Bytes(length = 16, fill = 7, brand = "isom")`: `length >= 16`, ghi `[0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, ...brandAscii4B, 0, 0, 0, 0]` rồi điền `fill`.
     - `wavBytes(length = 24, fill = 2)`: `length >= 20`, ghi `RIFF`, `uint32LE(length - 8)`, `WAVEfmt `, `uint32LE(16)` tại `16..19`, rồi điền `fill`.
     - `oggBytes(length = 28, fill = 3)`: `length >= 28`, ghi `OggS`, `0x00`, `0x02`, `uint32LE(0)` tại `18..21`, `0x01` tại `[26]`, `0x01` tại `[27]`, rồi điền `fill`.
     - `webmBytes(length = 36, fill = 4)`: `length >= 36`, ghi 35 byte EBML hợp lệ `[0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01, 0x42, 0xf2, 0x81, 0x04, 0x42, 0xf3, 0x81, 0x08, 0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d, 0x42, 0x87, 0x81, 0x02, 0x42, 0x85, 0x81, 0x02]` rồi điền `fill`.
     - `aacAdtsBytes(length = 16, fill = 5)`: `length >= 7`, ghi `[0xff, 0xf1, 0x50, 0x80, 0x02, 0x1f, 0xfc]` rồi điền `fill`.
     - `movQtFtypBytes(length = 20, fill = 6)`: gọi `mp4Bytes(length, fill, "qt  ")`.
     - `movLegacyWideMdatBytes(length = 24, fill = 8)`: `length >= 16`, ghi `[0, 0, 0, 8, 0x77, 0x69, 0x64, 0x65, 0, 0, 0, 16, 0x6d, 0x64, 0x61, 0x74]` rồi điền `fill`.
     - `pngBytes(length = 16, fill = 9)`: `length >= 8`, ghi `[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]` rồi điền `fill`.
     - `jpegBytes(length = 16, fill = 10)`: `length >= 4`, ghi `[0xff, 0xd8, 0xff, 0xe0]` rồi điền `fill`.
  3. Cập nhật fixture hiện hữu và bổ sung ca âm/polyglot/size-mismatch trong cả 6 file test:
     - `student-quiz-media.test.ts`: nâng cấp cả 7 ca `200` lẫn ca đua CAS `409` tại dòng 684 (`mp3Bytes(10, 9)`) và `mp4Bytes(3000, 7)`; thêm test chặn `payload.html`, `.mp3`, `ID3\x04<html><script>`, UTF-16LE BOM, `RIFF<a  WAVEfmt ><script>`, `OggS\x00\x02<html>`, `\x1a\x45\xdf\xa3<html><!--webm-->`, `<!--ftyp--><html>`, `\x00\x00\x00\x08wide<!--mdat--><html>`, `voice.m4a` + `video/mp4` mang `ftypqt  ` (`415`), ca dương `voice.m4a` + `video/mp4` mang `ftypM4A ` được lưu thành `mediaType === "audio/mp4"`, lệch `Content-Length` `<= 64B` & `> 64B` (`400`), và ca dương cho WAV/OGG/WebM/AAC/MOV.
     - `admin-library-audio.test.ts`: nâng cấp `audioPut` mặc định sang `mp3Bytes(4, 1)`, các ca `.m4a` (`mp4Bytes(16, 7, "M4A ")`), `.mp3` (`mp3Bytes(5, 5)`, `mp3Bytes(6, 3)`, `mp3Bytes(6, 4)`), `.wav` (`wavBytes(24, 2)`); thêm test chặn `payload.html`, `ID3\x04<html>`, UTF-16LE BOM (`415 UNSUPPORTED_AUDIO_TYPE`) và lệch `Content-Length` `> 64B` (`400 INVALID_AUDIO`).
     - `placement-test.test.ts`: nâng cấp `uploadSampleAudio` dùng `mp3Id3Bytes(content)` (cập nhật dòng 412) và thêm test chặn `payload.html`, `ID3\x04<html>`, UTF-16LE BOM (`415 UNSUPPORTED_AUDIO_TYPE`), lệch `Content-Length` (`400 INVALID_AUDIO`).
     - `vocab-teacher.test.ts`: bọc `enforceDeclaredSize(body, meta.size)` trong `createMemoryMediaStore.put`, thêm `X-File-Name` cho ca dương dòng 205, và thêm test thiếu `X-File-Name` (`400`), `payload.html` (`415`), `ID3\x04<html>` / UTF-16LE BOM (`415`), `audio/mp3` → `audio/mpeg` & `audio/wave` (`200`), lệch `Content-Length` `> 64B` cả hai chiều 150B khai 300 & stream 75B+75B khai 100 (`400` kèm `code: VOCAB_ERROR_CODES.INVALID_AUDIO`, giữ nguyên `audioKey`), và đua CAS/lỗi DB dọn sạch `newKey`.
     - `validate-file.test.ts` & `exam-imports.test.ts`: nâng cấp PNG/JPEG sang `pngBytes`/`jpegBytes`; thêm test từ chối `\xff\xd8\xff<html>`, `new ArrayBuffer(8)`, `%PDF-<html>`, lệch đuôi `payload.html`/`wrong.pdf`, ảnh mang HTML (`400 INVALID_FILE` `reason: "type"`), và stream bơm vượt `Content-Length` bị ngắt ngay tại byte `declaredSize + 1` (`400 INVALID_FILE` `reason: "size"`, không đọc phần đuôi phía sau).
- **Success criteria:** Các file test cập nhật xong và chạy thất bại tại các ca mới vì code server chưa triển khai.
- **Verify:** `pnpm --filter server exec vitest run src/lib/peek-stream.test.ts src/lib/exam-import/validate-file.test.ts src/routes/exam-imports.test.ts src/routes/student-quiz-media.test.ts src/routes/admin-library-audio.test.ts src/routes/placement-test.test.ts src/routes/vocab-teacher.test.ts` kết thúc với mã thoát khác 0 (Red phase bắt buộc đỏ; nếu thoát 0 là sai).

### Task 2.2 — Triển khai (Green) `peekStream.abort()` và xác thực đuôi file + magic-byte trên cả 5 route server
- **Goal:** Hiện thực hoá `PeekedStream.abort()` và khóa toàn bộ 5 route upload nhị phân của `apps/server` để toàn bộ test suite `server`, `check-types` và `biome check` xanh 0 lỗi.
- **Target files and symbols:**
  - `apps/server/src/lib/peek-stream.ts` (`PeekedStream.abort`, `peekStream`)
  - `apps/server/src/routes/student.ts` (`PUT /attempts/:attemptId/media`)
  - `apps/server/src/routes/admin-library.ts` (`PUT /tests/:id/parts/:part/audio`)
  - `apps/server/src/routes/placement-test.ts` (`PUT /audio`)
  - `apps/server/src/routes/vocab-teacher.ts` (`PUT /words/:wordId/audio`)
  - `apps/server/src/lib/exam-import/validate-file.ts` (`inspectExamFile`)
  - `apps/server/src/routes/exam-imports.ts` (`POST /exam-imports`)
- **Steps:**
  1. Trong `apps/server/src/lib/peek-stream.ts`, thêm `abort: (reason?: unknown) => Promise<void>` vào `PeekedStream` thực thi cùng logic `cancelled = true; chunks.length = 0; try { if (!sourceDone) { sourceDone = true; await reader.cancel(reason).catch(() => undefined); } } finally { releaseReader(true); }`, và gọi lại `abort(reason)` từ `cancel(reason)` của `ReadableStream` để mọi nơi trong `apps/server` gọi `await peeked.abort()` luôn an toàn dù `peeked.stream.locked` là `true` hay `false`.
  2. **Speaking (`apps/server/src/routes/student.ts`):**
     - Sau khi sanitize `name`, nếu `contentType === "video/mp4" && name.toLowerCase().endsWith(".m4a")` thì chuẩn hoá `contentType = "audio/mp4"`.
     - Kiểm `!quizMediaExtensionMatches(name, contentType)` → `await c.req.raw.body?.cancel().catch(() => undefined); return c.json({ error: "unsupported media type" }, 415);`.
     - Sau kiểm `attempt` và `body !== null`, bọc `peekStream(body, Math.min(QUIZ_MEDIA_MAGIC_PEEK_BYTES, size + 1))` trong `try/catch` (lỗi trả `500 { error: "upload failed" }`); lệch `size` sớm → `await peeked.abort(); return c.json({ error: "size mismatch" }, 400);`; `!matchesQuizMediaMagic(contentType, peeked.head, size)` → `await peeked.abort(); return c.json({ error: "unsupported media type" }, 415);`; truyền `peeked.stream` vào `store.put` (trong `catch` gọi `await peeked.abort()` + `discardNew()`).
  3. **Library audio (`apps/server/src/routes/admin-library.ts`):**
     - Đưa khối kiểm `Content-Length` (`400 INVALID_AUDIO` / `413 AUDIO_TOO_LARGE`), `Content-Type` (`415 UNSUPPORTED_AUDIO_TYPE`), `sanitizeMediaFileName` (`400 INVALID_AUDIO`) và `libraryAudioExtensionMatches` (`415 UNSUPPORTED_AUDIO_TYPE`, kèm `body?.cancel()`) lên ngay sau kiểm `!store` (trước `loadTestRow(testId)`).
     - Sau kiểm `test` / `part` và `requestBody !== null`, bọc `peekStream` trong `try/catch` (lỗi trả `500 { error: "audio upload failed" }`); lệch `size` sớm → `await peeked.abort(); return libraryError(c, 400, "INVALID_AUDIO");`; `!matchesLibraryAudioMagic(contentType, peeked.head, size)` → `await peeked.abort(); return libraryError(c, 415, "UNSUPPORTED_AUDIO_TYPE");`; truyền `peeked.stream` vào `store.put` (trong `catch` gọi `await peeked.abort()` + `discardNew()`).
  4. **Placement audio (`apps/server/src/routes/placement-test.ts`):**
     - Kiểm `!libraryAudioExtensionMatches(name, contentType)` → `body?.cancel()` + `415 UNSUPPORTED_AUDIO_TYPE`.
     - Bọc `peekStream` trong `try/catch` (lỗi trả `500 { error: "audio upload failed" }`); lệch `size` sớm → `await peeked.abort()` + `400 INVALID_AUDIO`; `!matchesLibraryAudioMagic(contentType, peeked.head, size)` → `await peeked.abort()` + `415 UNSUPPORTED_AUDIO_TYPE`; truyền `peeked.stream` vào `store.put` (trong `catch` gọi `await peeked.abort()` + `discardObject()`).
  5. **Vocab word audio (`apps/server/src/routes/vocab-teacher.ts`):**
     - Chuẩn hoá `rawType === "audio/mp3" ? "audio/mpeg" : rawType`, kiểm thuộc `LIBRARY_AUDIO_MIME` (`415 INVALID_AUDIO`), bắt buộc `X-File-Name` hợp lệ (`400 INVALID_AUDIO`), kiểm `libraryAudioExtensionMatches` (`415 INVALID_AUDIO`).
     - Sau truy vấn `wordRow` (`404 WORD_NOT_FOUND`, kèm `body?.cancel()`), bọc `peekStream` trong `try/catch` (lỗi trả `500 { error: "upload failed" }`), lệch `size` sớm → `await peeked.abort()` + `400 { error: "size mismatch", code: VOCAB_ERROR_CODES.INVALID_AUDIO }` (cập nhật luôn nhánh `MediaSizeMismatchError` kèm `code: VOCAB_ERROR_CODES.INVALID_AUDIO`), `!matchesLibraryAudioMagic` → `await peeked.abort()` + `415 INVALID_AUDIO`.
     - Sau `store.put(newKey, peeked.stream, { contentType, size })`, thực thi `db.update(vocabWord)` trong `try/catch` với điều kiện CAS `and(eq(vocabWord.id, wordId), oldKey === null ? isNull(vocabWord.audioKey) : eq(vocabWord.audioKey, oldKey))` và `.returning({ id: vocabWord.id })`: nếu DB ném lỗi thì `await store.delete(newKey).catch(() => undefined)` rồi ném lỗi; nếu `updated.length === 0` thì xoá `newKey`, kiểm lại xem từ còn tồn tại không để trả `404 WORD_NOT_FOUND` hoặc `409 { error: "audio changed", code: VOCAB_ERROR_CODES.INVALID_AUDIO }`; chỉ khi thắng CAS và `oldKey !== null` mới xoá `oldKey`.
  6. **Exam-imports (`apps/server/src/lib/exam-import/validate-file.ts` & `apps/server/src/routes/exam-imports.ts`):**
     - Trong `validate-file.ts`: kiểm `matchesMaterialMagic(mimeType, head)` trên tối đa 64 byte đầu; với `image/jpeg` kiểm thêm `head.byteLength >= 4 && (head[3] ?? 0) >= 0xc0 && (head[3] ?? 0) <= 0xfe`; với `image/png` hoặc `image/jpeg` trả `{ ok: true, pageCount: 1 }`; với `mimeType !== "application/pdf"` trả `{ ok: false, reason: "type" }`.
     - Trong `exam-imports.ts`: kiểm `!materialExtensionMatches(fileName, mimeType)` trước khi đọc body (`body?.cancel()` + `400 INVALID_FILE` `reason: "type"`); thay `c.req.raw.arrayBuffer()` bằng helper `readBoundedExamBody(c.req.raw.body, declaredSize)` đọc qua `getReader()` vào `Uint8Array(declaredSize)`, nếu `body === null`, tổng byte `!== declaredSize`, hoặc vượt `declaredSize` ngay giữa chừng thì `reader.cancel()` và trả `400 INVALID_FILE` `reason: "size"`.
- **Success criteria:** Toàn bộ test suite `apps/server`, kiểm kiểu tĩnh toàn monorepo và Biome check xanh 0 lỗi.
- **Verify:** `pnpm --filter server test && pnpm check-types && pnpm exec biome check .` kết thúc với mã thoát 0.

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

## Verification

- `pnpm --filter server exec vitest run src/lib/peek-stream.test.ts src/lib/exam-import/validate-file.test.ts src/routes/exam-imports.test.ts src/routes/student-quiz-media.test.ts src/routes/admin-library-audio.test.ts src/routes/placement-test.test.ts src/routes/vocab-teacher.test.ts`
- `pnpm --filter server test`
- `pnpm check-types`
- `pnpm exec biome check .`
