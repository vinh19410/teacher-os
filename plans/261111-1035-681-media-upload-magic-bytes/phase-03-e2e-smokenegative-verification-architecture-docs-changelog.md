---
phase: 3
title: "Phase 3: E2E negative & smoke verification, architecture docs & changelog"
status: pending
priority: P1
effort: "0.5h"
dependencies: [1, 2]
---

# Phase 3: E2E negative & smoke verification, architecture docs & changelog

## Goal

Bổ sung kịch bản E2E kiểm tra âm thực tế trên stack preview (`8100/8101/8103/8104/8105`) đánh trực tiếp vào cả 5 route server (`Speaking`, `Admin Library`, `Placement Test`, `Vocab`, `Exam Imports`), chạy trọn vẹn bộ E2E dương liên quan (gồm cả học viên phát lại audio từ vựng, trang profile placement test, chấm bài Speaking và nhập đề AI thành công), cập nhật `docs/system-architecture.md` + `CHANGELOG.md`, và vượt toàn bộ cổng chất lượng local.

## Files to Create / Modify

- Create: `apps/e2e/specs/media-upload-magic-bytes.spec.ts` — kiểm chứng âm thực tế trên stack Hono Node + `createFsMediaStore`: gửi request lệch đuôi (`payload.html`) và polyglot HTML giả mạo (`spoof.mp3`, `spoof.png`, `spoof.jpg`) lên cả 5 endpoint (`PUT /api/student/attempts/:attemptId/media`, `PUT /api/admin/library/tests/:id/parts/:part/audio`, `PUT /api/placement-test/audio`, `PUT /api/kernel/vocab/words/:wordId/audio`, `POST /api/exam-imports`), khẳng định trả đúng `415`/`400` và không tạo bản ghi bẩn hay trừ Credit.
- Modify: `docs/system-architecture.md` — bổ sung liên kết tại dòng Speaking của `## Boundary map` và thêm 1 quy tắc kiến trúc ngắn gọn ở cuối `## Architectural rules` trỏ tới hợp đồng xác thực upload nhị phân 3 lớp cùng ranh giới tiền tố 64 byte (defense-in-depth bên cạnh `nosniff` + CSP `sandbox`).
- Modify: `CHANGELOG.md` — ghi nhận thay đổi bảo mật `#681` dưới mục `## 2026-11-11` → `### Fixed`.

## Tasks & Steps

<!-- Updated: Red Team & Validation Session 1 - add real negative server E2E spec across all 5 endpoints, keep full vocab-srs serial playback test, and include ai-exam-import-ac-001, profile-placement-test, and teacher-grade-submission -->

### Task 3.1 — Tạo spec E2E âm `media-upload-magic-bytes.spec.ts` & chạy kiểm chứng E2E trên cả 5 bề mặt upload
- **Goal:** Chứng minh trên stack E2E thật (`createFsMediaStore` + Vite preview) rằng: (a) cả 5 route server thực sự từ chối `415`/`400` đối với upload lệch đuôi và polyglot HTML mà không ghi file rác hay trừ Credit, và (b) toàn bộ các luồng upload & phát lại thật của học viên, giáo viên và admin đều xanh 100%.
- **Target files and symbols:**
  - `apps/e2e/specs/media-upload-magic-bytes.spec.ts` (file mới)
  - Các spec hồi quy dương hiện hữu: `admin-library-listening.spec.ts`, `placement-test-editor.spec.ts`, `profile-placement-test.spec.ts`, `vocab-srs.spec.ts`, `ai-exam-import-ac-001.spec.ts`, `ai-exam-import-ac-004.spec.ts`, `student-quiz-take-review.spec.ts`, `teacher-grade-submission.spec.ts`.
- **Steps:**
  1. Tạo `apps/e2e/specs/media-upload-magic-bytes.spec.ts` sử dụng các helper sẵn có trong `apps/e2e/specs/helpers.ts` (`signUpViaApi`, `ensureAdminAccount`, `mp3FixtureBytes`) và seed nhẹ:
     - Trên giáo viên (`WEB_ORIGIN`):
       - `PUT /api/placement-test/audio` với `payload.html` (`audio/mpeg`) và `spoof.mp3` (body `<!doctype html><script>alert(1)</script>`) → cả hai trả `415` `UNSUPPORTED_AUDIO_TYPE`.
       - Tạo 1 deck + 1 word qua `/api/kernel/vocab/*`, gửi `PUT /api/kernel/vocab/words/:wordId/audio` thiếu `X-File-Name` → `400`, gửi `payload.html` → `415`, gửi `spoof.mp3` mang HTML → `415`, kiểm `GET /api/kernel/vocab/decks/:deckId/words` vẫn có `audioKey === null`.
       - Gửi `POST /api/exam-imports` với `image/png` + `payload.html` và `image/jpeg` + `spoof.jpg` mang `\xff\xd8\xff<html>` → cả hai trả `400` `EXAM_IMPORT_ERROR_CODES.INVALID_FILE` (`reason: "type"`), kiểm `/api/credits/wallet` vẫn nguyên `30` Credit.
     - Trên admin (`ADMIN_ORIGIN`): tạo 1 đề Listening nháp qua API `/api/admin/library/tests`, gửi `PUT /api/admin/library/tests/:id/parts/s1/audio` với `payload.html` và `spoof.mp3` mang HTML → cả hai trả `415` `UNSUPPORTED_AUDIO_TYPE`, `GET .../parts/s1/audio` vẫn `404`.
     - Trên học viên (`STUDENT_ORIGIN`): tạo/mở 1 attempt Speaking, gửi `PUT /api/student/attempts/:attemptId/media` với `payload.html` và `spoof.mp3` mang HTML → cả hai trả `415`, `GET .../media` vẫn `404`.
  2. Kiểm tra các cổng `8100`, `8101`, `8103`, `8104`, `8105` trống rồi chạy E2E trên stack preview thật phủ cả spec âm mới lẫn toàn bộ các luồng dương liên quan (giữ trọn chuỗi `serial` của `vocab-srs.spec.ts` để kiểm cả bước học viên phát lại audio từ `createFsMediaStore`).
- **Success criteria:** Spec âm mới cùng toàn bộ các spec E2E mục tiêu chạy xanh 100% trên stack preview thật.
- **Verify:** `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/media-upload-magic-bytes.spec.ts specs/admin-library-listening.spec.ts specs/placement-test-editor.spec.ts specs/profile-placement-test.spec.ts specs/vocab-srs.spec.ts specs/ai-exam-import-ac-001.spec.ts specs/ai-exam-import-ac-004.spec.ts specs/teacher-grade-submission.spec.ts` và `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/student-quiz-take-review.spec.ts -g "speaking paper:"` đều kết thúc với mã thoát 0.

### Task 3.2 — Cập nhật `docs/system-architecture.md`, `CHANGELOG.md` và chạy toàn bộ cổng chất lượng local
- **Goal:** Đồng bộ tài liệu kiến trúc pointer-first (phù hợp chế độ `--beta` khi hợp đồng upload đổi), cập nhật `CHANGELOG.md` cho `#681`, và xác nhận toàn bộ gate `biome`, `check-types`, `pnpm test` trên monorepo xanh 0 lỗi.
- **Target files and symbols:**
  - `docs/system-architecture.md` (mục `## Boundary map` và `## Architectural rules`).
  - `CHANGELOG.md` (mục `## 2026-11-11` → `### Fixed`).
- **Steps:**
  1. Trong `docs/system-architecture.md`:
     - Ở bảng `## Boundary map` dòng Speaking submission files, bổ sung liên kết tới `apps/server/src/lib/peek-stream.ts`, `packages/api/src/lib/quiz-media.ts`, và `packages/api/src/lib/media-magic.ts`.
     - Ở cuối `## Architectural rules`, thêm 1 gạch đầu dòng evergreen (không gắn ngày/số phase) ghi rõ bất biến: mọi đường upload nhị phân vào `MediaStore` / R2 phải xác thực đồng thời tên/đuôi file đã chuẩn hoá (`sanitizeMediaFileName`), `Content-Type` allowlist và chữ ký magic-byte 64 byte đầu (`peekStream` cho luồng streaming hoặc lát cắt đầu bộ nhớ cho Exam Import) trước khi ghi kho hay giữ Credit; kiểm tra 64 byte đầu chỉ xác thực header định dạng (defense-in-depth), còn ranh giới cách ly thực thi khi phát lại vẫn do `Content-Type` lưu trong DB + `X-Content-Type-Options: nosniff` + CSP `sandbox` đảm nhiệm.
  2. Trong `CHANGELOG.md`, dưới `## 2026-11-11` → `### Fixed`, thêm mục mô tả mở rộng xác thực đuôi file (`X-File-Name`) + chữ ký magic-byte 64 byte đầu luồng sang 5 bề mặt còn lại: Speaking (`PUT /api/student/attempts/:attemptId/media` + `resolveQuizMediaType` / `matchesQuizMediaMagic` cho 12 MIME), Library audio (`PUT /api/admin/library/tests/:id/parts/:part/audio`), Placement audio (`PUT /api/placement-test/audio`), Vocab audio (`PUT /api/kernel/vocab/words/:wordId/audio`, bắt buộc `X-File-Name` + CAS), và ảnh PNG/JPEG của AI Exam Import (`POST /api/exam-imports` đọc giới hạn `declaredSize` + `inspectExamFile`), kèm đồng bộ các uploader audio ở client (#681).
  3. Chạy toàn bộ cổng chất lượng local của monorepo: `pnpm exec biome check .`, `pnpm check-types`, `pnpm test`.
- **Success criteria:** `docs/system-architecture.md` và `CHANGELOG.md` cập nhật đúng chuẩn repo, và cả 3 gate local thoát 0.
- **Verify:** `pnpm exec biome check . && pnpm check-types && pnpm test` kết thúc với mã thoát 0.

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

- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/media-upload-magic-bytes.spec.ts specs/admin-library-listening.spec.ts specs/placement-test-editor.spec.ts specs/profile-placement-test.spec.ts specs/vocab-srs.spec.ts specs/ai-exam-import-ac-001.spec.ts specs/ai-exam-import-ac-004.spec.ts specs/teacher-grade-submission.spec.ts`
- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/student-quiz-take-review.spec.ts -g "speaking paper:"`
- `pnpm exec biome check .`
- `pnpm check-types`
- `pnpm test`
