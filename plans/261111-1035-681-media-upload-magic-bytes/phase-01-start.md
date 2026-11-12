---
phase: 1
title: "Phase 1: Hợp đồng magic-byte/extension dùng chung tại @teacher-os/api & đồng bộ client uploaders (TDD)"
status: pending
priority: P1
effort: "1.5h"
dependencies: []
---

# Phase 1: Hợp đồng magic-byte/extension dùng chung tại `@teacher-os/api` & đồng bộ client uploaders (TDD)

## Goal

Xây dựng theo quy trình TDD (Red → Green) module nhận diện chữ ký nhị phân container dùng chung `packages/api/src/lib/media-magic.ts` cùng bộ hàm chuẩn hoá/đối chiếu đuôi file ↔ MIME trong `packages/api/src/lib/quiz-media.ts` cho đủ 12 MIME của `QUIZ_MEDIA_TYPES` và 9 MIME của `LIBRARY_AUDIO_MIME` (bảo toàn `reason: "name"` của `validateQuizMediaFiles`, phủ đủ alias Windows/Linux/macOS/Android và chặn polyglot thế hệ 2), sau đó đồng bộ các trình tải audio phía client (`student`, `admin`, `web` Placement & Vocab) cùng unit test.

## Files to Create / Modify

- Create: `packages/api/src/lib/media-magic.ts` — xuất `QUIZ_MEDIA_MAGIC_PEEK_BYTES = 64`, `matchesQuizMediaMagic(mimeType, head, totalSize?)` và `matchesLibraryAudioMagic(mimeType, head, totalSize?)` cho 7 họ container (MP3, WAV, OGG, WebM, AAC, ISO-BMFF MP4/M4A, QuickTime MOV), dùng `new DataView(head.buffer, head.byteOffset, head.byteLength)` và tương thích `noUncheckedIndexedAccess: true`.
- Modify: `packages/api/src/lib/quiz-media.ts` — đưa kiểm `sanitizeMediaFileName(file.name) === null` lên trước `resolveQuizMediaType` trong `validateQuizMediaFiles`, siết `resolveQuizMediaType` & `resolveLibraryAudioMimeType` (chặn dotfile, chỉ fallback tự do khi `browserType` là `""` hoặc `"application/octet-stream"`, bảng alias OS/trình duyệt đầy đủ, `.m4a` + `video/mp4` → `"audio/mp4"`, `.webm` + `video/webm` → `"audio/webm"` cho audio), xuất `quizMediaExtensionMatches`, `libraryAudioExtensionMatches` và re-export các helper từ `./media-magic`.
- Create: `packages/api/src/lib/quiz-media.test.ts` — kiểm thử đầy đủ ma trận 12 MIME, các biến thể iOS/Android/Windows/macOS/Linux hợp lệ, `validateQuizMediaFiles` (`reason: "name"` vs `"type"`), và toàn bộ vector giả mạo/polyglot thế hệ 1 & 2.
- Modify: `apps/student/src/components/quiz/speaking-submission-panel.tsx` — bổ sung `.opus`, `.wave`, `.qt` vào `MEDIA_ACCEPT` để đồng bộ với `EXTENSION_TYPES`.
- Modify: `apps/student/test/quiz-media.test.ts` — cập nhật kỳ vọng dòng 43–45 từ `"audio/mpeg"` sang `null` cho `("answer.mp3", "text/html")`, giữ nguyên bài test `reason: "name"` ở dòng 127–134, và bổ sung các ca chặn `("payload.html", "audio/mpeg")`, dotfile `(".mp3", "audio/mpeg")`, cùng ca hợp lệ `("voice.m4a", "video/mp4") -> "audio/mp4"`.
- Modify: `apps/admin/src/components/library/audio-uploader.tsx` — thay kiểm tra `file.type.toLowerCase() in LIBRARY_AUDIO_MIME` bằng `resolveLibraryAudioMimeType(file.name, file.type)` và bổ sung các đuôi audio vào `accept`.
- Modify: `apps/admin/src/components/library/audio-uploader.test.tsx` — thêm kiểm thử `audioRejectMessage` chặn đuôi sai (`payload.html` mang `audio/mpeg`), chặn `File.type` nguy hiểm (`section.mp3` mang `text/html`), chặn file `0 B`, và cho qua `.m4a`/`.webm`/`.opus` hợp lệ.
- Modify: `apps/web/src/components/placement-test/clip-audio-field.tsx` — xuất helper thuần `placementAudioErrorMessage` & `preparePlacementAudioFile`, thay `file.type || "audio/mpeg"` bằng `resolveLibraryAudioMimeType(file.name, file.type)`, tách thông báo file `0 B` khỏi `> 20 MB`, và ánh xạ `PlacementHttpError.code` (`UNSUPPORTED_AUDIO_TYPE`, `AUDIO_TOO_LARGE`, `INVALID_AUDIO`) sang tiếng Việt rõ ràng.
- Create: `apps/web/src/components/placement-test/clip-audio-field.test.ts` — kiểm thử đơn vị cho `preparePlacementAudioFile` và `placementAudioErrorMessage`.
- Modify: `apps/web/src/components/vocab/vocab-deck-editor.tsx` — xuất helper `prepareVocabAudioUpload(file)` dùng `resolveLibraryAudioMimeType(file.name, file.type)` + giới hạn `QUIZ_MEDIA_MAX_BYTES`, theo dõi `uploadingWordId` để khóa hàng đang tải, bỏ header `"Content-Length"`, gửi `"X-File-Name": encodeURIComponent(file.name)` kèm `"Content-Type"`, và hiển thị thông báo rõ theo mã HTTP `415`/`413`.
- Modify: `apps/web/src/components/vocab/vocab-word-row.tsx` — mở rộng `accept` theo `LIBRARY_AUDIO_MIME` + đuôi audio, khóa dropzone khi `saving`, và phân nhánh `onReject(reason)` đúng theo từng `QuizMediaRejectReason` (`none`, `multiple`, `size`, `empty`, `name`, `type`).
- Create: `apps/web/src/components/vocab/vocab-audio-upload.test.ts` — kiểm thử đơn vị cho `prepareVocabAudioUpload` và thông báo từ chối `vocabAudioRejectMessage(reason)`.

## Tasks & Steps

<!-- Updated: Red Team & Validation Session 1 - preserve validateQuizMediaFiles reason:"name", fix admin filter, harden generation-2 polyglot checks, add Windows/Linux/macOS/Android aliases (.aac/.opus/.webm), and refine Vocab/Placement client UX -->

### Task 1.1 — Viết bài kiểm thử đỏ (Red) cho `media-magic` & `quiz-media` tại `packages/api` và `apps/student`
- **Goal:** Thiết lập toàn bộ ma trận kiểm thử dương/âm cho 12 MIME `QUIZ_MEDIA_TYPES` và 9 MIME `LIBRARY_AUDIO_MIME` (gồm cả `validateQuizMediaFiles`, alias thực tế và vector polyglot thế hệ 2) trước khi viết code triển khai, chứng minh trạng thái Đỏ (Red).
- **Target files and symbols:**
  - `packages/api/src/lib/quiz-media.test.ts` (file mới: import `QUIZ_MEDIA_MAGIC_PEEK_BYTES`, `matchesQuizMediaMagic`, `matchesLibraryAudioMagic`, `quizMediaExtensionMatches`, `libraryAudioExtensionMatches`, `resolveQuizMediaType`, `resolveLibraryAudioMimeType`, `validateQuizMediaFiles`).
  - `apps/student/test/quiz-media.test.ts` (`describe("resolveQuizMediaType — chuẩn hoá MIME bài nói Speaking (#305)")`).
- **Steps:**
  1. Tạo `packages/api/src/lib/quiz-media.test.ts` phủ các nhóm kiểm thử sau:
     - `QUIZ_MEDIA_MAGIC_PEEK_BYTES === 64`.
     - `validateQuizMediaFiles`: tên dài > 200 ký tự `${"a".repeat(201)}.mp3` trả `{ ok: false, reason: "name" }`; tên toàn khoảng trắng/ký tự điều khiển `"\u200B  "` trả `reason: "name"`; dotfile `".mp3"` hoặc lệch MIME `("answer.mp3", "text/html")` trả `reason: "type"`.
     - `resolveQuizMediaType` & `resolveLibraryAudioMimeType`:
       - Ca dương khi `browserType` rỗng hoặc `"application/octet-stream"` (kể cả `; charset=binary`) trên `.mp3`, `.m4a`, `.aac`, `.wav`, `.wave`, `.weba`, `.ogg`, `.oga`, `.opus`, `.mp4`, `.mov`, `.qt`, `.webm` (`resolveQuizMediaType("clip.webm", "") === "video/webm"`, `resolveLibraryAudioMimeType("clip.webm", "") === "audio/webm"`).
       - Ca dương cho các cặp OS/trình duyệt thực tế: `("memo.m4a", "audio/x-m4a") -> "audio/x-m4a"`, `("voice.m4a", "video/mp4") -> "audio/mp4"`, `("voice.m4a", "audio/m4a") -> "audio/mp4"`, `("voice.m4a", "audio/mp4a-latm") -> "audio/mp4"`, `("voice.m4a", "audio/aac") -> "audio/aac"`, `("win.aac", "audio/vnd.dlna.adts") -> "audio/aac"`, `("win.aac", "audio/adts") -> "audio/aac"`, `("rec.aac", "audio/x-hx-aac-adts") -> "audio/aac"`, `("rec.aac", "audio/x-aac") -> "audio/aac"`, `("rec.aac", "audio/aacp") -> "audio/aac"`, `("track.mp3", "audio/mp3") -> "audio/mpeg"`, `("track.mp3", "audio/x-mpeg") -> "audio/mpeg"`, `("clip.wav", "audio/x-wav") -> "audio/x-wav"`, `("clip.wav", "audio/wave") -> "audio/wave"`, `("clip.wav", "audio/vnd.wave") -> "audio/wav"`, `("note.opus", "audio/opus") -> "audio/ogg"`, `("note.opus", "audio/x-opus+ogg") -> "audio/ogg"`, `("note.ogg", "audio/x-vorbis+ogg") -> "audio/ogg"`, `("note.ogg", "audio/x-speex+ogg") -> "audio/ogg"`, `("note.ogg", "application/ogg") -> "audio/ogg"`, `("disk.webm", "video/webm")` -> `"video/webm"` ở `resolveQuizMediaType` nhưng `"audio/webm"` ở `resolveLibraryAudioMimeType`, `("C:\\fakepath\\IMG_0001.MOV ", "") -> "video/quicktime"`.
       - Ca âm trả `null`: `("answer.mp3", "text/html")`, `("payload.html", "audio/mpeg")`, `("bai.pdf", "audio/mpeg")`, `(".mp3", "audio/mpeg")`, `("..mp3", "")`, `(".hidden.m4a", "audio/mp4")`, `("a.toString", "")`, `("a.mp3", "constructor")`, và trên `resolveLibraryAudioMimeType`: `("v.mov", "video/quicktime") -> null`, `("v.mp4", "video/mp4") -> null`.
     - `quizMediaExtensionMatches` & `libraryAudioExtensionMatches`:
       - Khớp các cặp hợp lệ (`.m4a` khớp `"audio/mp4"`, `"audio/x-m4a"`, `"audio/aac"`, **từ chối** `"video/mp4"` để không lọt `qt  `; `.webm` khớp `"audio/webm"` và `"video/webm"` trên `quizMediaExtensionMatches`, chỉ khớp `"audio/webm"` trên `libraryAudioExtensionMatches`), từ chối `payload.html`, dotfile, prototype key.
     - `matchesQuizMediaMagic` & `matchesLibraryAudioMagic` (gồm cả test trên `Uint8Array.subarray` có `byteOffset > 0` mô phỏng Node `Buffer` slab pool):
       - Mẫu hợp lệ cho đủ 12 MIME: MP3 ID3v2.3/2.4 (`ID3\x04\x00\x00\x00\x00\x00\x0a\x00\x00\x00\x00` và `TIT2`) & raw MPEG-1/2 Layer III 4 byte (`FF FB 90 64`, `FF F3 84 64`), WAV `>= 20` byte (`RIFF` `riffSize=36` + `WAVEfmt ` `subchunkSize=16`, CoreAudio `RIFF....WAVEFLLR`, và `RF64\xff\xff\xff\xffWAVEds64`), OGG BOS 28 byte (`OggS\x00\x02`, `seq=0` tại `18..21`, `segments=1` tại `[26]`), WebM EBML 35 byte (`1A 45 DF A3 9F 42 86 ... 42 82 84 "webm"` và `42 82 88 "matroska"`), AAC ADTS 7 byte (`FF F1 50 80 02 1F FC`), AAC ID3v2, AAC `ftyp` `M4A `, MP4/M4A `ftyp` (`M4A `, `mp42`, `isom`, `3gp4`; `qt  ` chỉ hợp lệ trên `video/mp4` và `video/quicktime`), QuickTime MOV (`ftypqt  `, legacy `wide` 8B + `mdat` `size=16`, legacy `moov` + `mvhd`, và legacy `free` 8192B > 4 KiB khi `totalSize = 16384`).
       - Toàn bộ vector giả mạo/polyglot bắt buộc trả `false`: `<html><body>xss</body></html>`, UTF-16LE BOM `\uFEFF <html>` (`FF FE 20 00...`), `ID3<html>`, `ID3\x04<html><script>alert(1)</script>`, `RIFF<!--WAVE<html>`, `RIFF<a  WAVEfmt ><script>alert(1)</script>`, `OggS<html>...`, `OggS\x00\x02<html><script>alert(1)</script>`, `\x1a\x45\xdf\xa3<html><!--webm--><script>`, `<!--ftyp--><html>`, `<!--mdat--><html>`, `\x00\x00\x00\x08wide<!--mdat--><html>`, `\x00\x00\x00\x08free<html><script>`, `ftyp` `boxSize > totalSize`, `ftyp` ảnh `heic`/`avif`/`mif1`/`jp2 `, và mọi `video/*` trên `matchesLibraryAudioMagic`.
  2. Trong `apps/student/test/quiz-media.test.ts`, đổi test ở dòng 43–45 sang khẳng định `resolveQuizMediaType("answer.mp3", "text/html")` trả `null`, thêm `("payload.html", "audio/mpeg") -> null`, `(".mp3", "audio/mpeg") -> null`, và `("voice.m4a", "video/mp4") -> "audio/mp4"`.
- **Success criteria:** Hai file test chứa đầy đủ các ca kiểm thử trên và chạy thất bại vì `./media-magic` cùng các hàm mới chưa tồn tại.
- **Verify:** `pnpm --filter @teacher-os/api test` kết thúc với mã thoát khác 0 (Red phase bắt buộc đỏ; nếu thoát 0 là sai).

### Task 1.2 — Triển khai (Green) `media-magic.ts`, `quiz-media.ts` & `speaking-submission-panel.tsx` và xác nhận `api` + `student` xanh
- **Goal:** Hiện thực hoá `packages/api/src/lib/media-magic.ts` và nâng cấp `packages/api/src/lib/quiz-media.ts` + `speaking-submission-panel.tsx` (tuân thủ nghiêm `noUncheckedIndexedAccess: true` và `DataView` với `byteOffset`) để toàn bộ unit test + kiểm kiểu của `@teacher-os/api` và `apps/student` xanh.
- **Target files and symbols:**
  - `packages/api/src/lib/media-magic.ts` (`QUIZ_MEDIA_MAGIC_PEEK_BYTES`, `matchesQuizMediaMagic`, `matchesLibraryAudioMagic`).
  - `packages/api/src/lib/quiz-media.ts` (`resolveQuizMediaType`, `quizMediaExtensionMatches`, `resolveLibraryAudioMimeType`, `libraryAudioExtensionMatches`, `validateQuizMediaFiles`).
  - `apps/student/src/components/quiz/speaking-submission-panel.tsx` (`MEDIA_ACCEPT`).
- **Steps:**
  1. Tạo `packages/api/src/lib/media-magic.ts`:
     - Xuất `export const QUIZ_MEDIA_MAGIC_PEEK_BYTES = 64;`.
     - Luôn dựng `DataView` qua `new DataView(head.buffer, head.byteOffset, head.byteLength)` và truy cập byte qua `head[i] ?? 0` / helper để tương thích `noUncheckedIndexedAccess: true` và Node `Buffer` slab pool:
       - `matchesId3v2(head)`: `head.byteLength >= 10`, `hasBytesAt(head, 0, [0x49, 0x44, 0x33])`, `major = head[3] ?? 0` trong `2..4`, `rev = head[4] ?? 0xff` thoả `rev <= 2`, `flags = head[5] ?? 0xff` thoả `(major === 2 ? (flags & 0x3f) === 0 : major === 3 ? (flags & 0x1f) === 0 : (flags & 0x0f) === 0)`, `((head[6] ?? 0x80) | (head[7] ?? 0x80) | (head[8] ?? 0x80) | (head[9] ?? 0x80)) & 0x80 === 0`; ngoài ra nếu `head.byteLength >= 14` và không bật cờ extended header (`major >= 3 && (flags & 0x40) !== 0`), kiểm `head[10] === 0` (padding) hoặc các byte frame ID (`10..12` cho v2, `10..13` cho v3/v4) đều thuộc `[A-Z0-9]`.
       - `matchesMpegLayer3Sync(head)`: `head.byteLength >= 4`, `b0 === 0xff`, `(b1 & 0xe0) === 0xe0`, `(b1 & 0x18) !== 0x08`, `(b1 & 0x06) === 0x02`, `(b2 & 0xf0) !== 0x00 && (b2 & 0xf0) !== 0xf0`, `(b2 & 0x0c) !== 0x0c`.
       - `matchesWav(head, totalSize)`: `head.byteLength >= 20`, `cap = totalSize !== undefined ? Math.min(totalSize, QUIZ_MEDIA_MAX_BYTES) : QUIZ_MEDIA_MAX_BYTES`, `WAVE` tại `8..11`, FourCC tại `12..15` thoả `isAsciiAlnumOrSpace`, `riffSize = view.getUint32(4, true)`, `subSize = view.getUint32(16, true)`: nếu `0..3` là `RF64` thì cần `riffSize === 0xffffffff` và `12..15` là `ds64` (`subSize >= 28 && subSize <= 1024`); nếu `0..3` là `RIFF` thì cần `riffSize >= 12 && riffSize <= cap` và `subSize <= cap` (nếu `12..15` là `fmt ` thì `16 <= subSize && subSize <= 1024`).
       - `matchesOgg(head)`: `head.byteLength >= 27`, `OggS` tại `0..3`, `head[4] === 0x00`, `flags = head[5] ?? 0xff` thoả `(flags & 0xf8) === 0 && (flags & 0x02) === 0x02 && (flags & 0x01) === 0`, `view.getUint32(18, true) === 0`, và `(head[26] ?? 0) >= 1`.
       - `matchesWebm(head)`: `head.byteLength >= 16`, `1A 45 DF A3` tại `0..3`, tính độ dài VINT `vintLen` (`1..8` theo bit dẫn của `head[4] ?? 0`, từ chối nếu `head[4] === 0`), kiểm `4 + vintLen < head.byteLength` và `firstChild = head[4 + vintLen] ?? 0` thuộc `{0x42, 0xec, 0xbf}`, đồng thời quét từ `4 + vintLen` tìm phần tử `[0x42, 0x82]` theo sau bởi `[0x84, ..."webm"]` hoặc `[0x88, ..."matroska"]`.
       - `matchesAdtsSync(head)`: `head.byteLength >= 7`, `b0 === 0xff`, `(b1 & 0xf6) === 0xf0`, `((b2 >> 2) & 0x0f) < 13`, `(((b3 & 0x03) << 11) | (b4 << 3) | ((b5 >> 5) & 0x07)) >= 7`.
       - `matchesIsoBmffFtyp(head, totalSize, allowQtBrand)` & `matchesLegacyQuickTimeAtom(head, totalSize)` theo đúng đặc tả đã gia cố ở `plan.md` (gồm kiểm `mdatSize` sau `wide`, cho phép `free`/`skip` tới `cap` và kiểm FourCC kế tiếp khi `size <= head.byteLength - 8`).
     - Xuất `matchesQuizMediaMagic` và `matchesLibraryAudioMagic` (từ chối ngay nếu `totalSize !== undefined && (!Number.isSafeInteger(totalSize) || totalSize <= 0)`).
  2. Trong `packages/api/src/lib/quiz-media.ts`:
     - Bổ sung `wave: "audio/wav"`, `opus: "audio/ogg"`, `qt: "video/quicktime"` vào `EXTENSION_TYPES`.
     - Khai báo tường minh `COMPATIBLE_QUIZ_MIMES_BY_EXT: Readonly<Record<string, readonly string[]>>`:
       - `mp3: ["audio/mpeg"]`
       - `m4a: ["audio/mp4", "audio/x-m4a", "audio/aac"]`
       - `mp4: ["video/mp4", "audio/mp4"]`
       - `aac: ["audio/aac", "audio/mp4", "audio/x-m4a"]`
       - `wav: ["audio/wav", "audio/x-wav", "audio/wave"]`, `wave: ["audio/wav", "audio/x-wav", "audio/wave"]`
       - `webm: ["video/webm", "audio/webm"]`, `weba: ["audio/webm"]`
       - `ogg: ["audio/ogg"]`, `oga: ["audio/ogg"]`, `opus: ["audio/ogg"]`
       - `mov: ["video/quicktime"]`, `qt: ["video/quicktime"]`
     - Khai báo `QUIZ_MEDIA_MIME_ALIASES`: ánh xạ `audio/mp3`, `audio/x-mp3`, `audio/x-mpeg`, `audio/mpeg3`, `audio/x-mpeg-3` → `audio/mpeg`; `audio/m4a`, `audio/mp4a-latm` → `audio/mp4`; `audio/vnd.wave` → `audio/wav`; `audio/x-aac`, `audio/aacp`, `audio/vnd.dlna.adts`, `audio/adts`, `audio/x-hx-aac-adts` → `audio/aac`; `audio/opus`, `audio/x-opus+ogg`, `audio/x-vorbis+ogg`, `audio/x-speex+ogg`, `video/ogg`, `application/ogg` → `audio/ogg`.
     - Cập nhật `validateQuizMediaFiles`: kiểm `if (sanitizeMediaFileName(file.name) === null) return { ok: false, reason: "name", file };` **trước** `const type = resolveQuizMediaType(file.name, file.type);`.
     - Cập nhật `resolveQuizMediaType`, `quizMediaExtensionMatches`, `resolveLibraryAudioMimeType` (xử lý cả `ext === "webm"` với `browserType` là `""`, `"application/octet-stream"` hoặc `"video/webm"` → `"audio/webm"`), `libraryAudioExtensionMatches`, và re-export `QUIZ_MEDIA_MAGIC_PEEK_BYTES`, `matchesQuizMediaMagic`, `matchesLibraryAudioMagic`.
  3. Trong `apps/student/src/components/quiz/speaking-submission-panel.tsx`, thêm `".opus"`, `".wave"`, `".qt"` vào `MEDIA_ACCEPT`.
- **Success criteria:** Toàn bộ test và kiểm kiểu của `@teacher-os/api` và `apps/student` chạy xanh 0 lỗi.
- **Verify:** `pnpm --filter @teacher-os/api check-types && pnpm --filter @teacher-os/api test && pnpm --filter student check-types && pnpm --filter student test` kết thúc với mã thoát 0.

### Task 1.3 — Đồng bộ 3 client uploader audio (`admin` Library, `web` Placement & Vocab) kèm kiểm thử TDD
- **Goal:** Xoá bỏ hoàn toàn mẫu `file.type || "audio/mpeg"` trên các uploader audio của Admin/Web, gửi `X-File-Name` + khóa hàng đang tải ở Vocab, phân nhánh đúng `QuizMediaRejectReason` ở `VocabWordRow` và ánh xạ mã lỗi tiếng Việt ở `ClipAudioField`.
- **Target files and symbols:**
  - `apps/admin/src/components/library/audio-uploader.tsx` & `apps/admin/src/components/library/audio-uploader.test.tsx`.
  - `apps/web/src/components/placement-test/clip-audio-field.tsx` & `apps/web/src/components/placement-test/clip-audio-field.test.ts` (mới).
  - `apps/web/src/components/vocab/vocab-deck-editor.tsx`, `apps/web/src/components/vocab/vocab-word-row.tsx`, & `apps/web/src/components/vocab/vocab-audio-upload.test.ts` (mới).
- **Steps:**
  1. Viết/cập nhật bài kiểm thử trước (Red):
     - Trong `apps/admin/src/components/library/audio-uploader.test.tsx`: thêm test cho `audioRejectMessage` với `payload.html` (`audio/mpeg`), `section-1.mp3` (`text/html`), file `0 B`, và ca hợp lệ `section-1.m4a` (`""`) / `section-1.webm` (`video/webm`).
     - Tạo `apps/web/src/components/placement-test/clip-audio-field.test.ts`: kiểm `preparePlacementAudioFile(file)` (chấp nhận `.m4a` rỗng/`video/mp4`, `.webm` `video/webm`, chặn `0 B` với thông báo rỗng riêng, chặn `> 20 MB`, chặn `payload.html` / `text/html`) và `placementAudioErrorMessage(error)` ánh xạ `UNSUPPORTED_AUDIO_TYPE`, `AUDIO_TOO_LARGE`, `INVALID_AUDIO`.
     - Tạo `apps/web/src/components/vocab/vocab-audio-upload.test.ts`: kiểm `prepareVocabAudioUpload(file)` (trả `{ ok: true, contentType, encodedFileName }` cho `.mp3` rỗng, `.m4a` `video/mp4`, `.webm` `video/webm`, `.opus` `audio/opus`; từ chối `payload.html`, `text/html`, `clip.mp4`, `0 B`, `> 50 MB`) và `vocabAudioRejectMessage(reason)` cho đủ 6 giá trị `QuizMediaRejectReason`.
  2. Chạy riêng từng lệnh kiểm tra Red: `pnpm --filter admin test` (phải thoát khác 0) và `pnpm --filter web exec vitest run src/components/placement-test/clip-audio-field.test.ts src/components/vocab/vocab-audio-upload.test.ts` (phải thoát khác 0).
  3. Cập nhật code client (Green):
     - `apps/admin/src/components/library/audio-uploader.tsx`: dùng `resolveLibraryAudioMimeType(file.name, file.type)`, tách kiểm `file.size <= 0`, mở rộng `accept` thêm `.mp3,.m4a,.aac,.wav,.wave,.ogg,.oga,.opus,.webm,.weba`.
     - `apps/web/src/components/placement-test/clip-audio-field.tsx`: xuất `preparePlacementAudioFile` & `placementAudioErrorMessage` (dùng `isPlacementHttpError` đọc `error.code`), mở rộng `ACCEPT_AUDIO` thêm các đuôi audio, cập nhật `handleFileChange`.
     - `apps/web/src/components/vocab/vocab-deck-editor.tsx` & `vocab-word-row.tsx`: xuất `prepareVocabAudioUpload` & `vocabAudioRejectMessage`, gửi `"X-File-Name": prepared.encodedFileName` + `"Content-Type": prepared.contentType` (bỏ `"Content-Length"`), giữ state `uploadingWordId` để truyền `saving={savingId === row.id || uploadingWordId === row.id}` xuống `VocabWordRow`, hiển thị toast cụ thể khi `res.status === 415` / `413`, và trong `VocabWordRow` bỏ qua `reason === "none"` (khi kéo-thả text), báo đúng thông báo tiếng Việt cho `multiple` / `size` / `empty` / `name` / `type`.
- **Success criteria:** Toàn bộ test và kiểm kiểu của `admin` và `web` chạy xanh 0 lỗi, không còn `file.type || "audio/mpeg"` trong `apps/`.
- **Verify:** `pnpm --filter admin check-types && pnpm --filter admin test && pnpm --filter web check-types && pnpm --filter web exec vitest run src/components/placement-test/clip-audio-field.test.ts src/components/vocab/vocab-audio-upload.test.ts src/lib/exam-file-check.test.ts` kết thúc với mã thoát 0.

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
- `pnpm --filter student check-types && pnpm --filter student test`
- `pnpm --filter admin check-types && pnpm --filter admin test`
- `pnpm --filter web check-types && pnpm --filter web exec vitest run src/components/placement-test/clip-audio-field.test.ts src/components/vocab/vocab-audio-upload.test.ts src/lib/exam-file-check.test.ts`
