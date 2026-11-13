---
phase: 1
title: "Phase 1: Hợp đồng MIME/extension/magic-byte, peekStream & xác thực storeUpload (TDD)"
status: done
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Hợp đồng MIME/extension/magic-byte, peekStream & xác thực storeUpload (TDD)

## Goal

Xây dựng theo quy trình TDD (Red → Green) bộ hàm thuần đối chiếu đuôi file + magic-byte chống polyglot tại `@teacher-os/api/material-contracts`, bộ đọc sớm đầu luồng `peekStream` an toàn khoá reader tại `apps/server/src/lib/peek-stream.ts`, tích hợp chặn trước `store.put` trong `apps/server/src/routes/materials.ts`, di chuyển các fixture upload giả trong test hiện hữu sang chữ ký thật và cập nhật bộ kiểm thử tiền kiểm tại `apps/web`.

## Files to Create / Modify

- Modify: `packages/api/src/material-contracts.ts` — chuẩn hoá tên qua `sanitizeMediaFileName` (chặn dotfile bắt đầu bằng `.`), mở rộng alias trình duyệt/container hợp lệ trong `resolveMaterialMimeType`, xuất `MATERIAL_MAGIC_PEEK_BYTES`, `materialExtensionMatches`, `matchesMaterialMagic` (tương thích `noUncheckedIndexedAccess: true`), cập nhật chú thích đầu file.
- Modify: `packages/api/src/material-contracts.test.ts` — bổ sung ma trận kiểm thử cho `resolveMaterialMimeType`, `materialExtensionMatches`, `matchesMaterialMagic` (đủ 10 MIME, MP3 ID3v2 10 byte + Layer III sync, chặn UTF-16LE BOM `FF FE` / `ID3<html>` / `<!--ftyp-->` / `RIFF<!--WEBP-->` / `%PDF-<html>` / `PK\x03\x04<html>` / `ftyp` HEIC-AVIF-MOV, chuỗi ngắn, dotfile, thuộc tính prototype).
- Create: `apps/server/src/lib/peek-stream.ts` — triển khai `peekStream(body, maxBytes, maxEmptyChunks?)` pull-based với tách cờ `cancelled` / `sourceDone` / `releaseLock()` idempotent và chặn spin chunk 0 byte.
- Create: `apps/server/src/lib/peek-stream.test.ts` — kiểm thử đơn vị `peekStream` (chunk 1 byte, backpressure không hút trước phần đuôi, luồng ngắn hơn `maxBytes`, race đồng thời giữa `pull()` và `cancel()`, giải phóng khoá `reader` khi EOF/lỗi/cancel, và chặn chuỗi chunk 0 byte vượt ngưỡng).
- Modify: `apps/server/src/routes/materials.ts` — tích hợp `materialExtensionMatches`, `peekStream(body, Math.min(MATERIAL_MAGIC_PEEK_BYTES, size + 1))`, `matchesMaterialMagic` và `body.cancel()` vào `storeUpload` trước `store.put`.
- Modify: `apps/server/src/routes/materials.test.ts` — cập nhật helper `upload()` + các fixture PDF/MP3/OOXML/MP4 sang chữ ký thật hợp lệ và thêm bộ test âm cho lệch đuôi, lệch magic-byte/polyglot, Slowloris `size < 64` và lệch `Content-Length` ở cả ngưỡng `<= 64` byte lẫn `> 64` byte trên cả 2 route ngân hàng và buổi học.
- Modify: `apps/web/src/lib/repos/materials.test.ts` — bổ sung kiểm thử `prepareMaterialUpload` chặn `File.type` nguy hiểm (`text/html`), đuôi lạ (`a.bin`), dotfile (`..pdf`), và chấp nhận `application/octet-stream` / alias trình duyệt hợp lệ (`.m4a` `video/mp4`, `.docx` `application/x-zip-compressed`).

## Tasks & Steps

<!-- Updated: Red Team & Validation Session 1 - harden polyglot signatures, alias parity, peekStream cancel/lock safety, and >64B size mismatch coverage -->

### Task 1.1 — Viết bài kiểm thử đỏ (Red) cho `material-contracts` và `prepareMaterialUpload`
- **Goal:** Bổ sung đầy đủ các ca kiểm thử cho quy tắc đối chiếu đuôi file ↔ MIME (kèm chuẩn hoá tên file + alias trình duyệt) và chữ ký magic-byte chống polyglot trước khi viết code triển khai, chứng minh bộ kiểm thử bắt lỗi (Red state).
- **Target files and symbols:**
  - `packages/api/src/material-contracts.test.ts` (import `MATERIAL_MAGIC_PEEK_BYTES`, `materialExtensionMatches`, `matchesMaterialMagic`, `resolveMaterialMimeType`).
  - `apps/web/src/lib/repos/materials.test.ts` (`describe("prepareMaterialUpload")`).
- **Steps:**
  1. Trong `packages/api/src/material-contracts.test.ts`, cập nhật `describe("resolveMaterialMimeType")`:
     - Đổi ca `("a.bin", "application/pdf")` sang kỳ vọng `null`, thêm ca dương `("a.pdf", "application/pdf") -> "application/pdf"`.
     - Thêm các ca dương thực tế trình duyệt/OS: `("clip.mp4", "application/octet-stream") -> "video/mp4"`, `("clip.mp4", "APPLICATION/OCTET-STREAM; charset=binary") -> "video/mp4"`, `("voice.m4a", "video/mp4") -> "audio/mp4"`, `("voice.m4a", "audio/mp4a-latm") -> "audio/mp4"`, `("track.mp3", "audio/x-mp3") -> "audio/mpeg"`, `("x.jpg", "image/pjpeg") -> "image/jpeg"`, `("x.png", "image/x-png") -> "image/png"`, `("Bai 1.docx", "application/x-zip-compressed") -> DOCX`, `("Đề 1.pdf ", "application/pdf") -> "application/pdf"` (khoảng trắng cuối được `sanitizeMediaFileName` trim).
     - Thêm các ca âm: `("doc.pdf", "text/html") -> null`, `("answer.mp3", "text/html") -> null`, `("payload.html", "audio/mpeg") -> null`, `("mismatch.pdf", "audio/mpeg") -> null`, `(".pdf", "application/pdf") -> null`, `("..pdf", "application/pdf") -> null`, `(".hidden.pdf", "application/pdf") -> null`, `("\u200B.pdf", "") -> null`, `(`${"a".repeat(200)}.pdf`, "application/pdf") -> null`, `("a.toString", "") -> null`, `("a.mp3", "constructor") -> null`.
  2. Thêm `describe("materialExtensionMatches")` trong `packages/api/src/material-contracts.test.ts` kiểm tra khớp hoa/thường (`"Bài 1.PDF"` với `"application/pdf"` -> `true`, `"a.jpg"` và `"a.jpeg"` với `"image/jpeg"` -> `true`), từ chối lệch MIME (`"payload.html"` với `"audio/mpeg"` -> `false`, `"x.pdf"` với `"audio/mpeg"` -> `false`), từ chối dotfile (`".mp3"`, `"..mp3"`, `".hidden.mp3"` -> `false`), và từ chối tên đụng `Object.prototype` (`"a.constructor"` -> `false`).
  3. Thêm `describe("matchesMaterialMagic")` trong `packages/api/src/material-contracts.test.ts`:
     - Kiểm `MATERIAL_MAGIC_PEEK_BYTES === 64`.
     - Kiểm mẫu hợp lệ cho đủ 10 MIME trong `MATERIAL_MIME`:
       - PDF (`%PDF-1.7\n`), PNG (`89 50 4E 47 0D 0A 1A 0A`), JPEG (`FF D8 FF E0`), WEBP (`RIFF\x24\x00\x00\x00WEBPVP8 `), DOCX/PPTX/XLSX (header ZIP Local 30 byte mở đầu bằng `50 4B 03 04`, method `8` tại `8..9`, `fileNameLength = 19` tại `26..27`), MP3 có tag ID3v2 10 byte (`49 44 33 04 00 00 00 00 00 23`), MP3 raw MPEG-1 Layer III frame (`FF FB 90 64`), M4A/MP4 (`00 00 00 18 66 74 79 70 4D 34 41 20 00 00 00 00` và `isom`).
     - Kiểm mẫu âm và polyglot:
       - Payload HTML `<html><body>xss</body></html>` và văn bản `"hello world"` trả `false` với tất cả 10 MIME.
       - UTF-16LE BOM HTML `\uFEFF <html>` (`FF FE 20 00 3C 00...`) và ASCII `ID3<html><script>alert(1)</script>` trả `false` với `"audio/mpeg"`.
       - MP3 có reserved version (`FF E8 90 00`), ADTS AAC layer `00` (`FF F1 50 80`), Layer I `0xFE` (`FF FE 90 00`), free-bitrate `0x00` (`FF FB 00 00`), hoặc toàn bit 1 (`FF FF FF FF`) đều trả `false`.
       - `<!--ftyp--><html>` (`3C 21 2D 2D 66 74 79 70...`), QuickTime `.mov` (`00 00 00 14 66 74 79 70 71 74 20 20`), HEIC (`ftypheic`) và AVIF (`ftypavif`) đều trả `false` với `"audio/mp4"` và `"video/mp4"`.
       - `RIFF<!--WEBP--><html>` và `RIFF\x24\x00\x00\x00WAVEfmt ` trả `false` với `"image/webp"`.
       - `%PDF-<html>` và `"  %PDF-1.4"` trả `false` với `"application/pdf"`.
       - `PK\x03\x04<html><script>alert(1)</script></html>` trả `false` với cả 3 MIME OOXML.
       - Buffer rỗng hoặc cắt cụt ngắn hơn độ dài tối thiểu của từng MIME trả `false`; MIME lạ `"text/html"` trả `false`.
  4. Trong `apps/web/src/lib/repos/materials.test.ts`, bổ sung vào `describe("prepareMaterialUpload")`:
     - `fileOf("spoof.mp3", "text/html", 100)` -> `{ ok: false }` với thông báo `/Định dạng chưa hỗ trợ/`.
     - `fileOf("a.bin", "application/pdf", 100)` -> `{ ok: false }` với thông báo `/Định dạng chưa hỗ trợ/`.
     - `fileOf("..pdf", "application/pdf", 100)` -> `{ ok: false }` với thông báo `/Định dạng chưa hỗ trợ/`.
     - `fileOf("bai-giang.mp4", "application/octet-stream", 1000)` -> `{ ok: true, mimeType: "video/mp4" }`.
     - `fileOf("nghe-win.m4a", "video/mp4", 1000)` -> `{ ok: true, mimeType: "audio/mp4" }`.
     - `fileOf("giao-an.docx", "application/x-zip-compressed", 1000)` -> `{ ok: true, mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }`.
- **Success criteria:** Các bài kiểm thử mới xuất hiện trong hai file test và chạy đỏ do hàm mới chưa tồn tại / hành vi cũ chưa siết.
- **Verify:** `pnpm --filter @teacher-os/api test` kết thúc với mã thoát khác 0 (Red phase bắt buộc đỏ; nếu thoát 0 là sai).

### Task 1.2 — Triển khai (Green) hợp đồng `material-contracts.ts` và xác nhận `api` + `web` + `check-types` xanh
- **Goal:** Hiện thực hoá quy tắc đối chiếu đuôi file và bảng chữ ký magic-byte chống polyglot trong `packages/api/src/material-contracts.ts` (tương thích chặt với `noUncheckedIndexedAccess: true`) để toàn bộ unit test và kiểm kiểu tĩnh của `@teacher-os/api` và `apps/web` xanh.
- **Target files and symbols:**
  - `packages/api/src/material-contracts.ts` (`MATERIAL_MAGIC_PEEK_BYTES`, `resolveMaterialMimeType`, `materialExtensionMatches`, `matchesMaterialMagic`).
- **Steps:**
  1. Trong `packages/api/src/material-contracts.ts`, import thêm `sanitizeMediaFileName` từ `"./lib/quiz-media"` và cập nhật chú thích đầu file nêu rõ: tên file, đuôi file, loại MIME và trần dung lượng được tiền kiểm 1:1 giữa client và server; chữ ký nhị phân đầu file (`matchesMaterialMagic`) được server xác thực trực tiếp trên stream upload trước khi ghi kho.
  2. Mở rộng `MATERIAL_MIME_ALIASES` bổ sung: `"audio/mp4a-latm": "audio/mp4"`, `"audio/x-mp3": "audio/mpeg"`, `"audio/mpeg3": "audio/mpeg"`, `"audio/x-mpeg-3": "audio/mpeg"`, `"image/pjpeg": "image/jpeg"`, `"image/x-png": "image/png"`, `"application/x-pdf": "application/pdf"`.
  3. Viết hàm nội bộ `extensionMime(fileName: string): string | null` (chú ý `?? null` cho `noUncheckedIndexedAccess: true`):
     - Gọi `const clean = sanitizeMediaFileName(fileName); if (!clean || clean.startsWith(".")) return null;`.
     - Tìm `const dot = clean.lastIndexOf("."); if (dot <= 0 || dot === clean.length - 1) return null;`.
     - Lấy `const ext = clean.slice(dot + 1).toLowerCase();`.
     - Trả `Object.hasOwn(MATERIAL_EXTENSION_TYPES, ext) ? (MATERIAL_EXTENSION_TYPES[ext] ?? null) : null`.
  4. Xuất `export function materialExtensionMatches(fileName: string, mimeType: string): boolean`:
     - Chuẩn hoá `const normalized = normalizeMediaType(mimeType)`.
     - Trả `Object.hasOwn(MATERIAL_MIME, normalized) && extensionMime(fileName) === normalized`.
  5. Cập nhật `export function resolveMaterialMimeType(fileName: string, browserType: string): string | null`:
     - Lấy `const extMime = extensionMime(fileName); if (!extMime) return null;`.
     - Lấy `const normalized = normalizeMediaType(browserType)`.
     - Nếu `normalized === "" || normalized === "application/octet-stream"` trả `extMime`.
     - Nếu `extMime === "audio/mp4" && normalized === "video/mp4"` trả `"audio/mp4"`.
     - Nếu `OOXML_MIMES.has(extMime) && (normalized === "application/zip" || normalized === "application/x-zip-compressed")` trả `extMime`.
     - Lấy `const canonical = Object.hasOwn(MATERIAL_MIME_ALIASES, normalized) ? (MATERIAL_MIME_ALIASES[normalized] ?? normalized) : normalized`.
     - Trả `Object.hasOwn(MATERIAL_MIME, canonical) && canonical === extMime ? canonical : null`.
  6. Xuất `export const MATERIAL_MAGIC_PEEK_BYTES = 64;` và `export function matchesMaterialMagic(mimeType: string, head: Uint8Array): boolean` (đọc byte qua helper an toàn kiểu / `DataView` để không vi phạm `noUncheckedIndexedAccess: true`):
     - `"application/pdf"`: `head.byteLength >= 8`, khớp `25 50 44 46 2D` (`%PDF-`) tại `0..4`, byte `[5]` thuộc `{0x31, 0x32}` (`'1'|'2'`), byte `[6] === 0x2e` (`'.'`), byte `[7]` trong `0x30..0x39`.
     - `"image/png"`: `head.byteLength >= 8`, khớp `89 50 4E 47 0D 0A 1A 0A` tại `0..7`.
     - `"image/jpeg"`: `head.byteLength >= 3`, khớp `FF D8 FF` tại `0..2`.
     - `"image/webp"`: `head.byteLength >= 16`, khớp `RIFF` tại `0..3`, `WEBP` tại `8..11`, và 4 byte `12..15` thuộc `{"VP8 ", "VP8L", "VP8X"}`.
     - Ba MIME OOXML (`docx`, `pptx`, `xlsx`): `head.byteLength >= 30`, khớp `50 4B 03 04` tại `0..3`, compression method uint16LE tại `8..9` là `0` hoặc `8`, và `fileNameLength` uint16LE tại `26..27` `> 0`.
     - `"audio/mpeg"`:
       - Nhánh ID3v2: `head.byteLength >= 10`, khớp `49 44 33` (`ID3`) tại `0..2`, major version `b3 >= 2 && b3 <= 4`, revision `b4 < 0xff`, và `((b6 | b7 | b8 | b9) & 0x80) === 0`.
       - Nhánh MPEG Layer III frame sync: `head.byteLength >= 4`, `b0 === 0xff`, `(b1 & 0xe0) === 0xe0`, `(b1 & 0x18) !== 0x08`, `(b1 & 0x06) === 0x02` (chỉ Layer III — loại `0xfe`/`0xff`), `(b2 & 0xf0) !== 0x00 && (b2 & 0xf0) !== 0xf0`, và `(b2 & 0x0c) !== 0x0c`.
     - `"audio/mp4"` và `"video/mp4"`: `head.byteLength >= 12`, `boxSize` uint32BE tại `0..3` thoả `boxSize === 1 || (boxSize >= 16 && boxSize <= 4096)`, khớp `66 74 79 70` (`ftyp`) tại `4..7`, `major_brand` tại `8..11` gồm 4 byte ASCII in được (`0x20..0x7e`) và không nằm trong tập cấm `{"qt  ", "heic", "heix", "hevc", "hevx", "mif1", "msf1", "avif", "avis", "jp2 "}`.
- **Success criteria:** Toàn bộ unit test và `check-types` của `@teacher-os/api` cùng unit test liên quan của `apps/web` chạy xanh 0 lỗi.
- **Verify:** `pnpm --filter @teacher-os/api check-types && pnpm --filter @teacher-os/api test && pnpm --filter web exec vitest run src/lib/repos/materials.test.ts src/components/materials/material-picker.test.tsx` kết thúc với mã thoát 0.

### Task 1.3 — Viết bài kiểm thử đỏ (Red) cho `peekStream` và xác thực `storeUpload` trên server
- **Goal:** Tạo test đơn vị cho `peekStream` (gồm cả race `pull`/`cancel` và giới hạn chunk 0 byte) và bổ sung các ca kiểm thử âm/dương cho `storeUpload` (kèm nâng cấp fixture hợp lệ và ca lệch `Content-Length` `> 64` byte) trước khi sửa code server.
- **Target files and symbols:**
  - `apps/server/src/lib/peek-stream.test.ts` (mới).
  - `apps/server/src/routes/materials.test.ts` (`upload`, ca kiểm thử file upload và ca kiểm thử bảo mật #676).
- **Steps:**
  1. Tạo `apps/server/src/lib/peek-stream.test.ts` kiểm tra `peekStream(body, maxBytes, maxEmptyChunks?)` (import từ `./peek-stream`):
     - Luồng phát từng chunk 1 byte (tổng 150 byte, `maxBytes = 64`): `head` dài 64 byte khớp `0..63`, `ended === false`, số chunk đã kéo từ nguồn ngay sau `peekStream` đúng bằng 64 (backpressure pull-based), đọc hết `stream` thu lại đúng 150 byte gốc và khoá reader trên `body` đã được giải phóng (`body.locked === false`).
     - Bỏ qua vài chunk rỗng `new Uint8Array(0)` xen kẽ hợp lệ ở cả giai đoạn peek lẫn passthrough, nhưng nếu nguồn bơm liên tiếp quá ngưỡng chunk rỗng (ví dụ 20 chunk `Uint8Array(0)` liên tiếp) thì ném lỗi chống CPU spin và giải phóng khoá `reader`.
     - Luồng ngắn hơn `maxBytes` (10 byte khi `maxBytes = 64`): `head` dài 10 byte, `readBytes === 10`, `ended === true`, `body.locked === false`, đọc `stream` thu lại đúng 10 byte.
     - Race đồng thời giữa `pull()` đang chờ `reader.read()` và lời gọi `peeked.stream.cancel("abort")`: không ném `TypeError: Controller is already closed`, truyền đúng lý do `"abort"` xuống `cancel` của nguồn và giải phóng `body.locked === false`.
  2. Trong `apps/server/src/routes/materials.test.ts`:
     - Thêm các helper tạo fixture có chữ ký thật hợp lệ:
       - `pdfFixture(tail: number[] = [])` mở đầu bằng 8 byte `%PDF-1.4` (`0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34`) nối thêm `tail`.
       - `zipFixture()` tạo 31 byte ZIP Local File Header hợp lệ (`50 4B 03 04`, method `0` tại `8..9`, `fileNameLength = 1` tại `26..27`, tên `'a'`).
       - `mp3Id3Fixture()` 10 byte ID3v2.4 hợp lệ `[0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 10]` (giữ đúng tổng 10 byte để `Range: bytes=2-4` trả `bytes 2-4/10` với dãy `new Uint8Array([0x33, 4, 0])`).
       - `mp4Fixture()` 16 byte `ftypisom` hợp lệ `[0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0]`.
     - Trong hàm `upload()`, khi `options.bytes` không truyền vào, chọn byte mặc định theo `options.type ?? PDF` (`zipFixture()` cho 3 MIME OOXML, `mp3Id3Fixture()` cho `audio/mpeg`, `mp4Fixture()` cho `audio/mp4` / `video/mp4`, `pdfFixture()` cho các trường hợp còn lại).
     - Cập nhật 3 vị trí truyền `bytes` tường minh trong các ca dương hiện hữu: `Bài nghe 1.mp3` dùng `mp3Id3Fixture()` (cập nhật slice `Range: bytes=2-4` sang `new Uint8Array([0x33, 4, 0])`), `Worksheet.pdf` dùng `pdfFixture([9, 8, 7])` (cập nhật kỳ vọng tải về sang `pdfFixture([9, 8, 7])`), `GT Worksheet.pdf` dùng `pdfFixture([5, 6])` (cập nhật kỳ vọng tải về sang `pdfFixture([5, 6])`).
     - Thêm test mới `"upload validates filename extension against Content-Type and verifies magic bytes before storing (#676)"` phủ:
       - `PUT /api/materials/files` với `Content-Type: audio/mpeg` + `X-File-Name: payload.html` + body HTML -> `415` `code: "UNSUPPORTED_FILE_TYPE"`, `memory.objects.size` không đổi và `body` nguồn được `cancel()`.
       - `PUT /api/materials/files` với `Content-Type: audio/mpeg` + `X-File-Name: lesson.pdf` + body `pdfFixture()` -> `415` `code: "UNSUPPORTED_FILE_TYPE"`, kho không lưu.
       - `PUT /api/materials/files` với `Content-Type: audio/mpeg` + `X-File-Name: spoof.mp3` + body HTML ASCII, UTF-16LE BOM HTML (`\uFEFF <html>`), hoặc `ID3<html>...` -> đều `415` `code: "UNSUPPORTED_FILE_TYPE"`, kho không lưu và stream gốc được `cancel()`.
       - `PUT /api/materials/files` với `Content-Type: video/mp4` + `X-File-Name: spoof.mp4` + body `<!--ftyp--><html>...` -> `415` `code: "UNSUPPORTED_FILE_TYPE"`.
       - `PUT /api/classes/class-1/sessions/${SESSION_DATE}/materials/files` với `Content-Type: application/pdf` + `X-File-Name: fake.pdf` + body `<html>not pdf</html>` -> `415` `code: "UNSUPPORTED_FILE_TYPE"`, kho và `lesson_material` không ghi dòng mới.
       - Lệch `Content-Length` ở cả ngưỡng ngắn (`<= 64` byte, kể cả gửi 11 byte khi khai `Content-Length: 10` và giữ mở luồng không đóng — chống Slowloris) LẪN ngưỡng dài (`> 64` byte đi xuyên qua `store.put` → `enforceDeclaredSize` → `MediaSizeMismatchError` → `discard()`: gửi 150 byte hợp lệ mở đầu bằng `%PDF-1.4` với `Content-Length: 300` thiếu byte và `Content-Length: 100` thừa byte) -> tất cả trả `400` `code: "INVALID_FILE"` và `memory.objects.size` không tăng sau `settle()`.
       - Ca dương cho `.jpeg` (`FF D8 FF E0`), `.png` (`89 50 4E 47 0D 0A 1A 0A`), `.webp` (`RIFF....WEBPVP8 `), `.m4a` (`ftyp`), raw MPEG Layer III `.mp3` (`FF FB 90 64`), và stream chia nhỏ từng 1 byte (tổng 120 byte) đều trả `201` và tải về khớp từng byte.
- **Success criteria:** Hai file test tồn tại và chạy thất bại vì `./peek-stream` chưa có và `storeUpload` chưa chặn lệch đuôi/magic.
- **Verify:** `pnpm --filter server exec vitest run src/lib/peek-stream.test.ts src/routes/materials.test.ts` kết thúc với mã thoát khác 0 (Red phase bắt buộc đỏ).

### Task 1.4 — Triển khai (Green) `peekStream` và tích hợp xác thực vào `storeUpload`
- **Goal:** Hiện thực hoá `apps/server/src/lib/peek-stream.ts` và nối vào `storeUpload` trong `apps/server/src/routes/materials.ts` để toàn bộ kiểm thử đơn vị/route, kiểm tra kiểu tĩnh toàn monorepo và Biome check đều xanh.
- **Target files and symbols:**
  - `apps/server/src/lib/peek-stream.ts` (`PeekedStream`, `peekStream`).
  - `apps/server/src/routes/materials.ts` (`storeUpload`).
- **Steps:**
  1. Tạo `apps/server/src/lib/peek-stream.ts`:
     - Xuất `interface PeekedStream { head: Uint8Array; readBytes: number; ended: boolean; stream: ReadableStream<Uint8Array>; }`.
     - Xuất `async function peekStream(body: ReadableStream<Uint8Array>, maxBytes: number, maxEmptyChunks = 16): Promise<PeekedStream>`:
       - Lấy `const reader = body.getReader()`; quản lý `let sourceDone = false`, `let cancelled = false`, `let released = false`, `const chunks: (Uint8Array | undefined)[] = []`, `let chunkIndex = 0`, `let readBytes = 0`.
       - Viết hàm idempotent `releaseReader()` xoá `chunks.length = 0` và nếu `!released` thì đặt `released = true` rồi `try { reader.releaseLock(); } catch {}`.
       - Trong khối `try/catch` của vòng peek đầu (`while (readBytes < maxBytes)`): đọc `const step = await reader.read()`; nếu `step.done` đặt `sourceDone = true`, gọi `reader.releaseLock()` (đánh dấu `released = true`, giữ `chunks` để replay) rồi `break`; nếu `step.value.byteLength === 0` tăng bộ đếm `emptyStreak` (vượt `maxEmptyChunks` thì ném `new Error("stream stalled with empty chunks")`) rồi `continue`; ngược lại reset `emptyStreak = 0`, đẩy `step.value` vào `chunks` và cộng `readBytes += step.value.byteLength`. Trong `catch (err)`: gọi `await reader.cancel().catch(() => undefined)`, `releaseReader()`, rồi `throw err`.
       - Chép `Math.min(maxBytes, readBytes)` byte đầu từ `chunks` sang `head`.
       - Tạo `stream = new ReadableStream<Uint8Array>({ pull, cancel })`:
         - Trong `pull(controller)`: nếu `cancelled` thì `return`; nếu `chunkIndex < chunks.length` thì lấy `const buffered = chunks[chunkIndex]; chunks[chunkIndex] = undefined; chunkIndex += 1;` (nếu `buffered` tồn tại thì `controller.enqueue(buffered)`); nếu `chunkIndex >= chunks.length && sourceDone` thì gọi `releaseReader()`, nếu `!cancelled` gọi `controller.close()`, rồi `return`; nếu đã enqueue `buffered` thì `return`; ngược lại đọc passthrough với vòng bỏ qua chunk 0 byte (có kiểm `emptyStreak > maxEmptyChunks`): bọc `reader.read()` trong `try/catch` (lỗi thì `releaseReader()` rồi `throw`), ngay sau `await` kiểm `if (cancelled) return;`, nếu `next.done` đặt `sourceDone = true`, `releaseReader()`, `controller.close()`, còn không thì `controller.enqueue(next.value)`.
         - Trong `cancel(reason)`: đặt `cancelled = true; chunks.length = 0; try { if (!sourceDone) { sourceDone = true; await reader.cancel(reason); } } finally { releaseReader(); }`.
  2. Trong `apps/server/src/routes/materials.ts`:
     - Import `MATERIAL_MAGIC_PEEK_BYTES`, `materialExtensionMatches`, `matchesMaterialMagic` từ `"@teacher-os/api/material-contracts"` và `peekStream` từ `"../lib/peek-stream"`.
     - Trong `storeUpload`:
       - Viết helper nhỏ `cancelRawBody = () => c.req.raw.body?.cancel().catch(() => undefined)` và `await cancelRawBody()` trước các nhánh trả lỗi sớm (`!check.ok`, `!name || body === null`, `!materialExtensionMatches(name, check.mimeType)`).
       - Kiểm `if (!materialExtensionMatches(name, check.mimeType))` -> `await cancelRawBody();` rồi trả `{ ok: false, response: materialError(c, 415, "UNSUPPORTED_FILE_TYPE") }`.
       - Gọi `peekStream(body, Math.min(MATERIAL_MAGIC_PEEK_BYTES, size + 1))` trong `try/catch` (nếu lỗi luồng thì `console.error("[materials] upload stream failed", { error })` và trả `c.json({ error: "upload failed" }, 500)`).
       - Nếu `(peeked.ended && peeked.readBytes !== size) || peeked.readBytes > size`: `await peeked.stream.cancel().catch(() => undefined)` và trả `{ ok: false, response: materialError(c, 400, "INVALID_FILE") }`.
       - Nếu `!matchesMaterialMagic(check.mimeType, peeked.head)`: `await peeked.stream.cancel().catch(() => undefined)` và trả `{ ok: false, response: materialError(c, 415, "UNSUPPORTED_FILE_TYPE") }`.
       - Truyền `peeked.stream` vào `await store.put(objectKey, peeked.stream, { contentType: check.mimeType, size })`; trong `catch` của `store.put`, gọi `await peeked.stream.cancel().catch(() => undefined)` cùng `discard()`.
- **Success criteria:** Tất cả bài test của `peek-stream.test.ts`, `materials.test.ts`, `api`, `web`, kiểm tra kiểu tĩnh toàn monorepo và Biome check đều xanh 0 lỗi.
- **Verify:** `pnpm --filter server exec vitest run src/lib/peek-stream.test.ts src/routes/materials.test.ts && pnpm check-types && pnpm exec biome check .` kết thúc với mã thoát 0.

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

- `pnpm --filter @teacher-os/api check-types && pnpm --filter @teacher-os/api test`
- `pnpm --filter server exec vitest run src/lib/peek-stream.test.ts src/routes/materials.test.ts`
- `pnpm --filter web exec vitest run src/lib/repos/materials.test.ts src/components/materials/material-picker.test.tsx`
- `pnpm check-types`
- `pnpm exec biome check .`
