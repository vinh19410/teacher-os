---
phase: 1
title: "Phase 1: Sửa CSP media inline & hạ trần media 95 MB khớp Cloudflare edge"
status: todo
priority: P1
effort: "1.5h"
dependencies: []
---

# Phase 1: Sửa CSP media inline & hạ trần media 95 MB khớp Cloudflare edge

<!-- Updated: Red-Team & Validation Session 1 - normalizeMediaType + Object.hasOwn + octet-stream clamp, COOP/Referrer-Policy headers, 206 Partial Content test cases, clarified 413 comment -->

## Goal
Đảm bảo phản hồi file media `inline` (cả `200` và `206 Partial Content`) phát được trực tiếp trong tab trình duyệt mà vẫn khoá chặt thực thi script và cô lập `opener`/`Referer`, đồng thời hạ trần dung lượng upload audio/video xuống `95 * 1024 * 1024` bytes (`95 MB`) nằm dưới giới hạn 100 MB SI của Cloudflare Free/Pro edge.

## Files to Create / Modify
- Modify: `/root/projects/worktrees/teacher-os-647-materials-upload-student-e2e/packages/api/src/material-contracts.ts`
- Modify: `/root/projects/worktrees/teacher-os-647-materials-upload-student-e2e/packages/api/src/material-contracts.test.ts`
- Modify: `/root/projects/worktrees/teacher-os-647-materials-upload-student-e2e/apps/server/src/lib/material-file-response.ts`
- Create: `/root/projects/worktrees/teacher-os-647-materials-upload-student-e2e/apps/server/src/lib/material-file-response.test.ts`
- Modify: `/root/projects/worktrees/teacher-os-647-materials-upload-student-e2e/apps/server/src/routes/materials.test.ts`
- Modify: `/root/projects/worktrees/teacher-os-647-materials-upload-student-e2e/apps/web/src/components/materials/material-dialogs.tsx`
- Modify: `/root/projects/worktrees/teacher-os-647-materials-upload-student-e2e/apps/web/src/lib/repos/materials.ts`
- Modify: `/root/projects/worktrees/teacher-os-647-materials-upload-student-e2e/apps/web/src/lib/repos/materials.test.ts`

## Tasks & Steps

### Task 1.1 — Viết bài test đỏ (TDD Red) cho trần `MATERIAL_MEDIA_MAX_BYTES = 95 MiB` ở `@teacher-os/api`
- **Goal:** Khoá yêu cầu `MATERIAL_MEDIA_MAX_BYTES === 95 * 1024 * 1024` (`< 100_000_000` bytes SI của Cloudflare edge) bằng unit test thất bại trước khi sửa hằng số.
- **Target files and symbols:** `/root/projects/worktrees/teacher-os-647-materials-upload-student-e2e/packages/api/src/material-contracts.test.ts` (describe `"checkMaterialUpload"`, test `"caps documents at 25MB and media at 100MB"` tại dòng 74).
- **Steps:**
  1. Đổi tên test ở dòng 74 thành `"caps documents at 25MB and media at 95MB (below 100MB Cloudflare edge limit)"`.
  2. Thêm khẳng định `expect(MATERIAL_MEDIA_MAX_BYTES).toBe(95 * 1024 * 1024);` và `expect(MATERIAL_MEDIA_MAX_BYTES).toBeLessThan(100_000_000);`, đồng thời kiểm `checkMaterialUpload({ mimeType: "video/mp4", size: 96 * 1024 * 1024 })` trả `{ ok: false, reason: "size", maxBytes: 95 * 1024 * 1024 }`.
- **Success criteria:** Test tại `packages/api/src/material-contracts.test.ts` chạy đỏ vì `MATERIAL_MEDIA_MAX_BYTES` hiện vẫn là `100 * 1024 * 1024`.
- **Verify:** `pnpm --filter @teacher-os/api test -- material-contracts.test.ts` kết thúc với mã thoát khác 0 do lỗi khẳng định `expected 104857600 to be 99614720` (nếu lệnh thoát 0 là thất bại).

### Task 1.2 — Cập nhật `MATERIAL_MEDIA_MAX_BYTES = 95 * 1024 * 1024` (TDD Green cho `@teacher-os/api`)
- **Goal:** Đưa hằng số trần media xuống `95 * 1024 * 1024` bytes (`99_614_720` bytes) để `prepareMaterialUpload` chặn ngay tại client trước khi request cross-origin đụng ngưỡng 100 MB SI của Cloudflare Free/Pro edge (nơi edge trả trang HTML 413 không có CORS gây `TypeError`).
- **Target files and symbols:** `/root/projects/worktrees/teacher-os-647-materials-upload-student-e2e/packages/api/src/material-contracts.ts` (hằng số `MATERIAL_MEDIA_MAX_BYTES` tại dòng 20).
- **Steps:**
  1. Cập nhật comment và giá trị của `MATERIAL_MEDIA_MAX_BYTES` thành `95 * 1024 * 1024` (`99_614_720` bytes), ghi chú rõ lý do: Cloudflare Free/Pro zone giới hạn request body ở `100 MB` (`~100,000,000` bytes SI) và trả trang HTML 413 không có CORS trước khi vào Worker nếu vượt ngưỡng (nếu sau này cả staging và prod đều nâng lên gói Business ≥ 200 MB mới được tăng trần này).
- **Success criteria:** Bộ test contract của `@teacher-os/api` chuyển sang xanh hoàn toàn.
- **Verify:** `pnpm --filter @teacher-os/api test -- material-contracts.test.ts` thoát với mã `0` và in `passed`.

### Task 1.3 — Viết bài test đỏ (TDD Red) cho CSP tách theo `disposition` có chuẩn hoá MIME, ép `octet-stream` và header cô lập trên `materialFileResponse`
- **Goal:** Tạo bộ unit test chuyên biệt cho `materialFileResponse` (phủ cả `200`, `206`, `416`, `download`, MIME hỏng) và cập nhật test route `materials.test.ts`.
- **Target files and symbols:**
  - Create `/root/projects/worktrees/teacher-os-647-materials-upload-student-e2e/apps/server/src/lib/material-file-response.test.ts` (test hàm `materialFileResponse`, hằng `INLINE_MEDIA_CSP`, `STRICT_CSP`).
  - Modify `/root/projects/worktrees/teacher-os-647-materials-upload-student-e2e/apps/server/src/routes/materials.test.ts` (bổ sung kiểm tra `Content-Security-Policy`, `Cross-Origin-Opener-Policy`, `Referrer-Policy` tại dòng ~598-629 cho `/api/materials/:id/file` `200`/`206`/`?download=1`/PDF và dòng ~858 cho `/api/student/.../file`).
- **Steps:**
  1. Tạo `apps/server/src/lib/material-file-response.test.ts` kiểm tra đủ 6 nhóm:
     - `200` `kind: "media"`, `mimeType: "audio/mpeg"` (và biến thể hoa/tham số `"Audio/MPEG"`), `download: false` → `Content-Disposition` bắt đầu bằng `inline;`, `Content-Type: "audio/mpeg"`, `Content-Security-Policy` bằng `INLINE_MEDIA_CSP` (chứa `default-src 'none'`, `media-src 'self'`, `style-src 'unsafe-inline'`, `img-src 'self' data:`, `frame-ancestors 'none'`, `sandbox allow-same-origin`, và **không** chứa `allow-scripts`), kèm `Cross-Origin-Opener-Policy: "same-origin"` và `Referrer-Policy: "no-referrer"`.
     - `206 Partial Content` với `Range: "bytes=0-3"` trên `kind: "media"`, `mimeType: "video/mp4"`: khi `download: false` trả `inline;` + `INLINE_MEDIA_CSP`; khi `download: true` trả `attachment;` + `STRICT_CSP`.
     - `200` `kind: "media"`, `mimeType: "audio/mpeg"`, `download: true` → `attachment;` + `STRICT_CSP` (`"default-src 'none'; frame-ancestors 'none'; sandbox"`).
     - `kind: "media"` nhưng `mimeType: null`, `"text/html"`, `"__proto__"`, hoặc `"application/pdf"` (`download: false`) → tự hạ xuống `attachment;` + `STRICT_CSP`; riêng các MIME ngoài `MATERIAL_MIME` (`null`, `"text/html"`, `"__proto__"`) bắt buộc trả `Content-Type: "application/octet-stream"` (không bao giờ phát `text/html` hay `object.contentType` chưa kiểm).
     - `kind: "file"`, `mimeType: "application/pdf"`, `download: false` → `attachment;`, `Content-Type: "application/pdf"`, `STRICT_CSP`.
     - `416 Range Not Satisfiable` (`Range: "bytes=99-100"`) trên `kind: "media"` → vẫn mang `STRICT_CSP`, `Cross-Origin-Opener-Policy: "same-origin"`, `Referrer-Policy: "no-referrer"`.
  2. Trong `apps/server/src/routes/materials.test.ts`, bổ sung kiểm tra `Content-Security-Policy`, `Cross-Origin-Opener-Policy` và `Referrer-Policy` trên `full` (`200` inline), `partial` (`206` inline), `download` (`?download=1`), `pdfFile` (`application/pdf`), và `student` file download.
- **Success criteria:** Test mới chạy đỏ trên code hiện tại vì `materialFileResponse` đang trả cứng `"default-src 'none'; sandbox"` và thiếu `COOP`/`Referrer-Policy`/`octet-stream` clamp.
- **Verify:** `pnpm --filter server test -- src/lib/material-file-response.test.ts` kết thúc với mã thoát khác 0 do lỗi khẳng định header (nếu lệnh thoát 0 là thất bại).

### Task 1.4 — Cài đặt `materialFileResponse` chuẩn hoá MIME + tách CSP + khoá `COOP`/`Referrer-Policy` (TDD Green cho `server`)
- **Goal:** Sửa `apps/server/src/lib/material-file-response.ts` để thoả mãn toàn bộ bất biến bảo mật và tương thích trình duyệt khi mở media trực tiếp trong tab mới.
- **Target files and symbols:** `/root/projects/worktrees/teacher-os-647-materials-upload-student-e2e/apps/server/src/lib/material-file-response.ts` (hàm `materialFileResponse`, hằng `STRICT_CSP`, `INLINE_MEDIA_CSP`).
- **Steps:**
  1. Import `normalizeMediaType` từ `@teacher-os/api/lib/quiz-media` và `MATERIAL_MIME` từ `@teacher-os/api/material-contracts`.
  2. Khai báo:
     - `export const STRICT_CSP = "default-src 'none'; frame-ancestors 'none'; sandbox";`
     - `export const INLINE_MEDIA_CSP = "default-src 'none'; media-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; sandbox allow-same-origin";`
     - Trong `LOCKED_HEADERS`: giữ `"X-Content-Type-Options": "nosniff"`, `"Cache-Control": "private, no-store"`, `"Accept-Ranges": "bytes"`, và thêm `"Cross-Origin-Opener-Policy": "same-origin"`, `"Referrer-Policy": "no-referrer"`.
  3. Viết helper chuẩn hoá MIME: `const normalizedMime = row.mimeType ? normalizeMediaType(row.mimeType) : ""; const allowlistedEntry = Object.hasOwn(MATERIAL_MIME, normalizedMime) ? MATERIAL_MIME[normalizedMime] : undefined;`.
  4. Tính `const inlineMedia = !request.download && row.kind === "media" && allowlistedEntry?.kind === "media";`, `const disposition = inlineMedia ? "inline" : "attachment";`, `const csp = inlineMedia ? INLINE_MEDIA_CSP : STRICT_CSP;`, và `const contentType = allowlistedEntry ? normalizedMime : "application/octet-stream";`.
  5. Trên nhánh `416 Range Not Satisfiable`, gắn `...LOCKED_HEADERS` và `"Content-Security-Policy": STRICT_CSP`. Trên nhánh `206` và `200`, gắn `...LOCKED_HEADERS`, `"Content-Security-Policy": csp`, `"Content-Type": contentType`, `"Content-Disposition": ...`.
- **Success criteria:** Cả `material-file-response.test.ts` lẫn `materials.test.ts` đều xanh.
- **Verify:** `pnpm --filter server test -- src/lib/material-file-response.test.ts src/routes/materials.test.ts` thoát với mã `0` và in `passed`.

### Task 1.5 — Cập nhật TDD cho copy `95 MB` và fallback `413` ở `apps/web`
- **Goal:** Đồng bộ dòng hướng dẫn `UPLOAD_HELP` sang `95 MB`, thêm xử lý `error.status === 413` trong `materialErrorMessage` (ghi chú rõ phạm vi same-origin/có-CORS), và khoá bằng unit test ở `apps/web`.
- **Target files and symbols:**
  - `/root/projects/worktrees/teacher-os-647-materials-upload-student-e2e/apps/web/src/lib/repos/materials.test.ts` (test `"rejects empty and oversized files with the per-kind cap"` tại dòng 55 và `"falls back by status and for network failures"` tại dòng 102).
  - `/root/projects/worktrees/teacher-os-647-materials-upload-student-e2e/apps/web/src/components/materials/material-dialogs.tsx` (`UPLOAD_HELP` tại dòng 324).
  - `/root/projects/worktrees/teacher-os-647-materials-upload-student-e2e/apps/web/src/lib/repos/materials.ts` (`materialErrorMessage` tại dòng 203).
- **Steps:**
  1. (Red) Trong `apps/web/src/lib/repos/materials.test.ts`: cập nhật kiểm tra file video vượt trần (`96 * 1024 * 1024` và `100_000_000` bytes) trả `"File quá lớn — tối đa 95 MB."`, file đúng trần (`95 * 1024 * 1024`) trả `ok: true`, thêm `expect(materialErrorMessage(new HttpError(413, "x"))).toBe("File quá lớn so với giới hạn cho phép.")`, và import `UPLOAD_HELP` từ `@/components/materials/material-dialogs` khẳng định chứa `"MP3/M4A/MP4 tối đa 95 MB"` (không chứa `"100 MB"`). Chạy `pnpm --filter web test -- src/lib/repos/materials.test.ts` xác nhận test đỏ.
  2. (Green) Sửa `UPLOAD_HELP` trong `apps/web/src/components/materials/material-dialogs.tsx:325` thành `"PDF, PNG/JPG/WEBP, DOCX/PPTX/XLSX tối đa 25 MB; MP3/M4A/MP4 tối đa 95 MB."` và thêm `if (error.status === 413) return "File quá lớn so với giới hạn cho phép.";` (kèm comment: phủ các phản hồi 413 có CORS nhưng không mang JSON `FILE_TOO_LARGE`; còn giới hạn Cloudflare edge không-CORS đã được chặn trước bởi trần `95 MiB` ở `prepareMaterialUpload`) trước dòng 204 trong `apps/web/src/lib/repos/materials.ts`.
- **Success criteria:** Toàn bộ unit test tài liệu của `apps/web` và `apps/student` đều xanh.
- **Verify:** `pnpm --filter web test -- src/lib/repos/materials.test.ts src/components/materials/material-picker.test.tsx src/components/class-detail/session-materials-modal.test.tsx src/routes/_auth/materials/index.test.tsx && pnpm --filter student test -- src/components/class/lesson-materials.test.tsx` thoát với mã `0`.

## Todo
- [ ] Task 1.1: Viết test đỏ cho `MATERIAL_MEDIA_MAX_BYTES = 95 * 1024 * 1024`
- [ ] Task 1.2: Hạ `MATERIAL_MEDIA_MAX_BYTES` xuống `95 * 1024 * 1024` và chạy xanh test `@teacher-os/api`
- [ ] Task 1.3: Viết test đỏ cho `materialFileResponse` chuẩn hoá MIME + tách CSP + `206` + `COOP`/`Referrer-Policy`
- [ ] Task 1.4: Cài đặt `INLINE_MEDIA_CSP` / `STRICT_CSP` / `octet-stream` clamp trong `material-file-response.ts` và chạy xanh test `server`
- [ ] Task 1.5: Cập nhật `UPLOAD_HELP` (`95 MB`) + fallback `413` trong `apps/web` theo TDD

## Verification
- `pnpm --filter @teacher-os/api test -- material-contracts.test.ts` (thoát 0)
- `pnpm --filter server test -- src/lib/material-file-response.test.ts src/routes/materials.test.ts` (thoát 0)
- `pnpm --filter web test -- src/lib/repos/materials.test.ts src/components/materials/material-picker.test.tsx src/components/class-detail/session-materials-modal.test.tsx src/routes/_auth/materials/index.test.tsx` (thoát 0)
- `pnpm --filter student test -- src/components/class/lesson-materials.test.tsx` (thoát 0)

## Success Criteria
- `INLINE_MEDIA_CSP` chỉ bật cho media có MIME chuẩn hoá thuộc allowlist media (`Object.hasOwn`) và `download === false`, không chứa `allow-scripts`; MIME ngoài allowlist bị ép về `application/octet-stream`; mọi phản hồi file mang `Cross-Origin-Opener-Policy: same-origin` và `Referrer-Policy: no-referrer`.
- `MATERIAL_MEDIA_MAX_BYTES` bằng `99,614,720` bytes (`95 MiB`), đồng bộ thông điệp `95 MB` trên toàn bộ UI upload.

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
