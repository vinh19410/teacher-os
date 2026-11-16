---
title: remove-audio-tracker-mp3-filename-732
date: 2026-11-16
summary: "Ẩn nhãn tên file .mp3 dưới thanh audio tracker Listening trong QuizPaper, chống nháy frame đầu khi hasAudio=true và bổ sung aria-label=\"Bài nghe\" (#732)"
---

# remove-audio-tracker-mp3-filename-732

# 2026-11-16 — Issue #732 (Ẩn dòng tên file `.mp3` bên dưới audio tracker bài nghe trong `QuizPaper`)

- **Bối cảnh:** Khi làm bài hoặc xem lại bài nghe trong Study Pack (`LISTENING · IELTS FOUNDATION · BAND 5.0`), `QuizPaper` (`packages/ui/src/components/quiz/quiz-paper.tsx`) hiển thị thêm một dòng `<p>🔊 {detail.audioName.trim()}</p>` (ví dụ `🔊 exercise.mp3`) ngay bên dưới thanh `<audio controls>`. Ngoài ra, khi `useAssignmentAudioObjectUrl` hoặc `StudyPackItemViewer` vừa mount trước `useEffect`, frame render đầu (`audioSrc = null`, `audioLoading = false`, `audioError = false`) rơi tạm vào nhánh fallback nên có thể nháy tên file `.mp3`.
- **Quyết định kỹ thuật:**
  - Gỡ bỏ đoạn render `🔊 {detail.audioName.trim()}` trong nhánh `audioSrc ? (...)` và bổ sung `aria-label="Bài nghe"` lên thẻ `<audio controls data-testid="quiz-audio-player">` để giữ accessible name đạt WCAG 4.1.2 mà không phải thêm boolean prop mới vào `QuizPaperProps`.
  - Chuyển comment `biome-ignore lint/a11y/useMediaCaption` sang dạng `// biome-ignore ...` bên trong biểu thức ternary và đặt nhánh `audioError` trước `audioLoading || detail.hasAudio`, sau cùng mới tới fallback `<p>🔊 {detail.audioName.trim() || "Chưa đính file nghe"}</p>` khi `!detail.hasAudio` (bảo toàn contract xem trước Admin `apps/e2e/specs/admin-library-listening.spec.ts:301` và `/assignments/preview`).
  - Bỏ chạy `pnpm design:compare` trên màn `s-quiz-listening` vì `scripts/design-compare/screens.json:347` và `apps/e2e/scripts/design-seed.ts` để attempt ở trạng thái `in_progress` (bị route `$attemptId.tsx` redirect `409` về `/`) và không seed `audio_url`; thay thế bằng kiểm chứng E2E thực có blob audio trên 3 viewport × 2 theme + reflow `320×568` trong `apps/e2e/specs/study-pack.spec.ts`.
- **Thay đổi kiểm thử:**
  - `apps/student/test/quiz-paper.test.tsx`: Thêm 3 unit test TDD (chứng minh RED trước khi sửa code, GREEN `45/45` sau khi sửa).
  - `apps/web/src/components/study-packs/study-pack-item-viewer.test.tsx`: Khẳng định tab `"Làm thử"` có `aria-label="Bài nghe"` và không render `library-part1.mp3` hay `🔊` ở trước/sau khi nộp bài (`14/14` pass cùng `preview-quiz-simulation.test.tsx`).
  - `apps/e2e/specs/study-pack.spec.ts`: Assert ẩn `education.mp3` / `🔊` trên tab `"Làm thử"` giáo viên, màn `take` (`1440×900`, `768×1024`, `375×812` × `light`/`dark` + `320×568`) và màn `review` học viên, xuất 7 ảnh POT `plans/reports/732-quiz-audio-*.png`.
- **Xác minh local sau lần sửa code cuối:**
  - `pnpm exec biome check` (4 file sửa: `0` lỗi/cảnh báo; toàn repo `Checked 1460 files`, exit `0`).
  - `pnpm check-types`: `12/12` packages pass (`exit 0`).
  - `pnpm test`: `12/12` Turbo tasks (`server` `116` files / `1530 passed | 1 expected fail`) + `5/5` root script suites pass (`exit 0`).
  - E2E lẻ `apps/e2e/specs/study-pack.spec.ts` (`CAPTURE_POT_ISSUE=732`, cổng `8100..8105`): `2 passed (1.5m)`, đã khôi phục 17 ảnh lịch sử.
  - Review cô lập (`code-reviewer`) đạt Verdict **Approve** (`0 Critical / 0 Important / 2 Minor`).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
