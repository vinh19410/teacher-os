---
phase: 3
title: "E2E & Regression Verification"
status: completed
priority: P0
effort: "45m"
dependencies: [1, 2]
---

# Phase 3: E2E & Regression Verification

## Goal

Cập nhật stub `fetchExternalAudio` trong `apps/e2e/src/boot.ts` (trả MP3 hợp lệ nhiều frame + hỗ trợ HTTP `Range` 206/416), cập nhật spec E2E `study-pack.spec.ts` khớp hợp đồng direct streaming URL (take + review + kiểm Range 206 và `crossOrigin="use-credentials"`), bổ sung unit test cho `createFsMediaStore.head()` + clamped `get(key, range)`, và chạy đầy đủ local quality gates.

## Files to Create / Modify

- Modify: `apps/e2e/src/boot.ts`
- Modify: `apps/e2e/specs/study-pack.spec.ts`
- Create: `apps/e2e/src/fs-media-store.test.ts` (nếu vitest chạy được ở e2e, hoặc xác minh trực tiếp qua `apps/server` / node test)

## Tasks & Steps

### Task 3.1 — Cập nhật `apps/e2e/src/boot.ts` (MP3 hợp lệ hỗ trợ `Range` 206) và `apps/e2e/specs/study-pack.spec.ts`

<!-- Updated: Red Team Session 2026-11-24 - Cập nhật apps/e2e/src/boot.ts hỗ trợ Range 206 và MP3 multi-frame hợp lệ để Chromium đạt readyState >= 1 mà không fire onError -->

- **Goal:** Stub `fetchExternalAudio` trong E2E trả MP3 nhiều frame câm hợp lệ và hỗ trợ `Range` (`206 Partial Content` + `Content-Range` + `Accept-Ranges: bytes`); spec `study-pack.spec.ts` kiểm chứng `<audio>` trên cả take và review detail trỏ đúng URL streaming với `crossorigin="use-credentials"`, không đứng ở `"Đang tải file nghe…"`, tải metadata hợp lệ (`readyState >= 1`), và API trả `206` với `Range: bytes=0-3`.
- **Target files and symbols:**
  - `apps/e2e/src/boot.ts` (`fetchExternalAudio`)
  - `apps/e2e/specs/study-pack.spec.ts` (dòng ~632-645 và ~718-723)
- **Steps:**
  1. Trong `apps/e2e/src/boot.ts` (`fetchExternalAudio: async (input, init) => ...`):
     - Tạo fixture MP3 hợp lệ gồm nhiều frame MPEG1 Layer3 128kbps 44.1kHz (417 byte mỗi frame × 10 frame = 4170 byte, header `0xff 0xfb 0x90 0x00` lặp đúng ranh giới 417 byte để Chromium FFmpeg demuxer decode thành công `readyState >= 1` và `duration > 0`).
     - Đọc header `Range` từ `init?.headers` (hỗ trợ cả `Headers`, record, tuple array). Nếu có single-byte `Range` hợp lệ (`bytes=start-end`): trả `206` với slice tương ứng, `Content-Type: audio/mpeg`, `Content-Range: bytes ${start}-${end}/${total}`, `Content-Length: ${slice.byteLength}`, `Accept-Ranges: bytes`; nếu vượt biên trả `416`; nếu không có `Range` trả `200` kèm `Accept-Ranges: bytes`.
  2. Trong `apps/e2e/specs/study-pack.spec.ts`:
     - Tại dòng ~634 (màn `take`), thay `toHaveAttribute("src", /^blob:/)` bằng:
       - `toHaveAttribute("src", /\/api\/student\/assignments\/[^/]+\/audio/)`
       - `toHaveAttribute("crossorigin", "use-credentials")`
       - Kiểm tra `"Đang tải file nghe…"` không xuất hiện (`toHaveCount(0)`), `"Không tải được file nghe."` không xuất hiện (`toHaveCount(0)`), và `<audio>` đạt `readyState >= 1` (chờ qua `expect.poll`).
       - Gửi request `GET /api/student/assignments/${day1AssignmentId}/audio` kèm `Range: bytes=0-3` và xác nhận `status === 206`, `Accept-Ranges: bytes`, `Content-Range: bytes 0-3/...`, `Content-Length: 4`.
     - Tại dòng ~720 (màn `review detail`), thay `toHaveAttribute("src", /^blob:/)` bằng kiểm tra `/\/api\/student\/assignments\/[^/]+\/audio/`, `crossorigin="use-credentials"`, và `readyState >= 1`.
- **Success criteria:** Spec `apps/e2e/specs/study-pack.spec.ts` pass với port override chuẩn của repo.
- **Verify:** `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/study-pack.spec.ts` exits 0 và toàn bộ test cases trong spec pass.

### Task 3.2 — Chạy toàn bộ local quality gates (lint, typecheck, unit tests)

- **Goal:** Đảm bảo không có lỗi format/lint, lỗi TypeScript hay regression trên `apps/server`, `packages/ui`, `apps/student`, và `apps/e2e`.
- **Target files and symbols:** Toàn bộ workspace (read-only lint + typecheck + affected test suites).
- **Steps:**
  1. Chạy `pnpm exec biome check .` (nếu có lỗi format thì chạy `pnpm check:fix` rồi chạy lại `pnpm exec biome check .`).
  2. Chạy `pnpm check-types`.
  3. Chạy unit tests của các package chịu ảnh hưởng (`apps/server`, `packages/ui`, `apps/student`).
- **Success criteria:** Tất cả lệnh thoát với exit code `0`, 0 failed tests, 0 type errors, 0 biome diagnostics.
- **Verify:** `pnpm exec biome check . && pnpm check-types && pnpm --filter @teacher-os/ui test && pnpm --filter student test && pnpm --filter server exec vitest run src/lib/study-pack-audio.test.ts src/lib/media-response.test.ts src/routes/student-practice-library-sync.test.ts src/routes/student-quiz.test.ts src/routes/study-pack.test.ts` exits 0.

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
