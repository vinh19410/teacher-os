---
title: fix-audio-filename-aac-928
date: 2026-11-25
summary: "Support .aac extension in audioFilename via exact allowlist table with TDD unit and pipeline tests (#928)"
---

# fix-audio-filename-aac-928

# 2026-11-25 — Issue #928 (`audioFilename` hỗ trợ đuôi `.aac` trong pipeline chấm AI Speaking)

- **Bối cảnh:** Trong quá trình review #924, phát hiện `audioFilename(mime)` tại `apps/server/src/lib/placement-ai/run-placement-grading.ts:107-122` thiếu nhánh `audio/aac`, khiến bản ghi Speaking dạng `audio/aac` (được phép trong `LIBRARY_AUDIO_MIME`) bị gắn nhầm tên `speaking.webm` khi gửi sang `grader.transcribe(...)`.
- **Thay đổi:** Export `audioFilename(mime)` trong `apps/server/src/lib/placement-ai/run-placement-grading.ts`, chuẩn hóa đầu vào bằng `normalizeMediaType(mime)` và thay chuỗi `.includes(...)` bằng bảng allowlist chính xác `AUDIO_EXTENSION_BY_MIME` (`Object.hasOwn`, 30 khóa phủ đủ `LIBRARY_AUDIO_MIME`, `QUIZ_MEDIA_MIME_ALIASES` gồm 6 alias AAC/ADTS và `audio/opus`, cùng `video/mp4`/`video/webm`). Bổ sung 47 unit test tại `apps/server/src/lib/placement-ai/run-placement-grading.test.ts` (gồm drift guard với `LIBRARY_AUDIO_MIME`, MIME nhiễu và prototype keys) và 1 integration test tải lên `aacAdtsBytes()` tại `apps/server/src/routes/placement-ai-grading.test.ts` dùng spy cục bộ trong `createHarness` (không đụng `fake-grader.ts`).
- **Quyết định & lưu ý vận hành:** Giữ nguyên `package.json` (`0.0.25`) và `CHANGELOG.md` để bảo toàn bộ đếm `v0.0.25-beta.<N>` của `scripts/notify-discord-changelog.mjs`. Ghi nhận lưu ý follow-up ngoài phạm vi #928: tài liệu OpenAI `/v1/audio/transcriptions` (`gpt-4o-transcribe`) không liệt kê raw `.aac` và `packages/api/src/lib/media-magic.ts:345-351` hiện nhận cả ISO-BMFF/ID3v2 dưới `audio/aac` — cần kiểm nghiệm thực tế trên staging và theo dõi ở issue riêng nếu phát sinh HTTP 400 từ OpenAI.
- **Xác minh:** TDD Red `1 failed / 47 passed` (`expected 'speaking.webm' to be 'speaking.aac'`) → TDD Green `95/95 passed` (`run-placement-grading.test.ts`: 47/47, `placement-ai-grading.test.ts`: 48/48); `pnpm exec biome check .` (2.519 file / 0 lỗi); `VITEST_SKIP_SLOW=1 pnpm --filter server test` (132/132 file, 1.774/1.774 test); `pnpm --filter server run test:ledger` (9 passed | 1 expected fail); `VITE_SERVER_URL=http://localhost:8000 pnpm check-types` (14/14 tasks); `VITE_SERVER_URL=http://localhost:8000 pnpm build` (7/7 tasks); local `code-reviewer` kết luận **Approved** (`0 Critical / 0 Important / 0 Minor`).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
