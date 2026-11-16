---
title: "feat(ui): remove audio filename label below listening audio player"
description: "Ẩn dòng hiển thị tên file âm thanh (🔊 <audioName>) bên dưới trình phát <audio controls> trong QuizPaper khi có audioSrc, chống nháy fallback khi hasAudio=true và bổ sung aria-label=\"Bài nghe\"."
status: completed
priority: P1
effort: "1h"
issue: 732
branch: "vinh19410/xóa-mp3-file-name"
base_branch: "develop"
tags: ["ui", "listening", "quiz-paper", "study-pack"]
created: 2026-11-16
---

# Plan: Ẩn tên file `.mp3` bên dưới audio tracker bài nghe (`QuizPaper`) (#732)

- **Issue:** [#732](https://github.com/vinh19410/teacher-os/issues/732)
- **Plan ID:** `teacher-os/261116-0428`

## Overview

Khi học viên làm bài nghe (`skill === "listening"`) hoặc xem lại bài làm đã nộp (và giáo viên mở tab `"Làm thử"` trong Study Pack `StudyPackItemViewer`), `QuizPaper` trong `packages/ui/src/components/quiz/quiz-paper.tsx:208-223` hiện render một dòng `<p className="text-muted-foreground text-xs">🔊 {detail.audioName.trim()}</p>` ngay bên dưới thanh `<audio controls data-testid="quiz-audio-player" />` (ví dụ `🔊 exercise.mp3`). Ngoài ra, khi `useAssignmentAudioObjectUrl` (`apps/student/src/lib/repos/quiz.ts:568-570`) hoặc `StudyPackItemViewer` vừa mount trước `useEffect`, trạng thái khởi tạo (`audioSrc = null, audioLoading = false, audioError = false`) rơi tạm vào nhánh fallback dòng `231` làm nháy tên file `.mp3` ở frame đầu. Kế hoạch này gỡ bỏ dòng tên file bên dưới audio tracker, thêm `aria-label="Bài nghe"`, và ưu tiên nhánh `"Đang tải file nghe…"` khi `audioLoading || detail.hasAudio` (sau `audioError`).

## Outcome

- Thanh `<audio controls data-testid="quiz-audio-player" aria-label="Bài nghe" />` khi có `audioSrc` không còn render dòng `🔊 <audioName>` bên dưới ở cả 3 bề mặt dùng `QuizPaper` có `audioSrc`: làm bài học viên (`QuizTakeView`), xem lại bài làm học viên (`AttemptDetailScreen`), và tab `"Làm thử"` trong Study Pack của giáo viên (`StudyPackItemViewer` → `PreviewQuizSimulation`).
- Khi `detail.hasAudio === true` và chưa có `audioSrc` (bao gồm frame render đầu tiên trước `useEffect`), component hiển thị `"Đang tải file nghe…"` (trừ khi `audioError === true` hiển thị `"Không tải được file nghe."`) để không bao giờ nháy `🔊 <audioName>`.
- Nhánh fallback khi `!detail.hasAudio` (`audioLoading = false`, `audioError = false`) vẫn giữ `<p>🔊 {detail.audioName.trim() || "Chưa đính file nghe"}</p>` cho Admin xem trước thư viện (`apps/admin/src/components/library/test-preview-overlay.tsx:288,301`, kiểm chứng bởi `apps/e2e/specs/admin-library-listening.spec.ts:301`) và `/assignments/preview` (`apps/web/src/routes/_auth/assignments/preview.tsx:226` vốn không truyền `audioSrc`).

## Non-Goals (Phạm vi bảo toàn)

- Không thêm prop boolean mới vào `QuizPaperProps` (`packages/ui/src/components/quiz/quiz-paper.tsx`).
- Không xóa nhánh fallback cuối (`!audioSrc && !audioError && !audioLoading && !detail.hasAudio` → `<p>🔊 {detail.audioName.trim() || "Chưa đính file nghe"}</p>`).
- Không sửa `QuizPaperDetail` (vẫn giữ `"audioName"`), schema database, `packages/api` contracts hay server endpoints.
- Không sửa các màn soạn đề/quản trị của giáo viên và admin (`apps/web/src/components/study-packs/study-pack-item-viewer.tsx` ở tab `"Đề & Đáp án"`, `apps/admin/src/components/library/audio-uploader.tsx`, `apps/web/src/components/assignments/prompt-composer.tsx`, `apps/web/src/components/assignments/student-preview-paper.tsx`, `apps/web/src/components/assignments/prompt-preview-aside.tsx`, `apps/web/src/components/assignment-tests/test-preview-paper.tsx`, `apps/web/src/components/classes/assign-class-prompt-modal.tsx`).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Gỡ dòng hiển thị `🔊 <audioName>` bên dưới `<audio>` trong `QuizPaper` khi `audioSrc` tồn tại và bổ sung `aria-label="Bài nghe"` | P1 |
| 2 | Ngăn nháy fallback `🔊 <audioName>` ở render đầu khi `detail.hasAudio === true` trong khi bảo toàn fallback `!detail.hasAudio` cho Admin preview | P1 |
| 3 | Kiểm chứng TDD unit test (Student & Web Study Pack), targeted E2E trên 3 viewport × light/dark (`take` + `review`), local gates, review cô lập và ship beta lên `develop` | P1 |

## Files to Touch

- Modify: `packages/ui/src/components/quiz/quiz-paper.tsx` (hàm `QuizPaper`, dòng `208-233`)
- Modify: `apps/student/test/quiz-paper.test.tsx` (thêm test case cho nhánh có `audioSrc`, fallback không `hasAudio`, chống nháy `hasAudio`, `audioLoading` và `audioError`)
- Modify: `apps/web/src/components/study-packs/study-pack-item-viewer.test.tsx` (bổ sung assertion khẳng định tab `"Làm thử"` render `quiz-audio-player` với `aria-label="Bài nghe"` và không render `library-part1.mp3` hay `🔊`)
- Modify: `apps/e2e/specs/study-pack.spec.ts` (assert không hiển thị `education.mp3` / `🔊` ở tab `"Làm thử"` giáo viên, màn `take` và màn `review` học viên; kiểm tra 3 viewport × light/dark + reflow `320×568` ở `take` và chụp đủ 7 ảnh POT `732-quiz-audio-*.png`)
- Modify: `CHANGELOG.md` (ghi mục `### Changed` dưới `## 2026-11-16`)

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: TDD Unit Test & QuizPaper Implementation](./phase-01-start.md) | Pending |
| 2 | [Phase 2: E2E Verification, Review & Beta Ship](./phase-02-verify-and-ship.md) | Pending |

## Success Criteria

- [ ] `QuizPaper` khi `skill === "listening"` và có `audioSrc` chỉ render `<audio data-testid="quiz-audio-player" aria-label="Bài nghe">` mà không render `detail.audioName` hay `🔊` ở cả `mode="take"`, `mode="review"`, và `StudyPackItemViewer` tab `"Làm thử"`.
- [ ] Khi `detail.hasAudio === true` và chưa có `audioSrc`, `audioError === true` hiển thị `"Không tải được file nghe."` và `audioLoading || detail.hasAudio` hiển thị `"Đang tải file nghe…"` (không nháy `🔊 <audioName>` ở frame đầu).
- [ ] Khi `!detail.hasAudio` (`audioLoading = false`, `audioError = false`), nhánh fallback vẫn render `🔊 {detail.audioName.trim() || "Chưa đính file nghe"}`.
- [ ] Unit tests (`student`, `@teacher-os/ui`, `admin`, `web` Study Pack & simulation) và `pnpm test` đều pass.
- [ ] E2E lẻ `apps/e2e/specs/study-pack.spec.ts` pass với 0 overflow trên 3 viewport (`1440×900`, `768×1024`, `375×812`) × 2 theme (`light`, `dark`) + reflow `320×568`, khôi phục sạch 17 ảnh lịch sử và sinh đủ 7 ảnh POT `732-quiz-audio-*.png`.
- [ ] `pnpm exec biome check .` và `pnpm check-types` exit `0`.
- [ ] Review cô lập đạt `0 Critical / 0 Important`, PR mở nhắm vào `develop`, squash-merge thành công, post-merge `CI` + `Deploy Staging` xanh, đăng nhận xét hậu kiểm của `kongming` (lên PR & Issue `#732`) và comment POT đầy đủ lên Issue `#732`.

## Red Team Review

### Session — 2026-11-16
**Findings:** 12 thô từ 2 reviewer độc lập (Security Adversary: 1 Critical, 3 High, 3 Medium; Assumption Destroyer: 1 Critical, 2 High, 2 Medium) — gộp trùng còn 7 vấn đề trọng tâm (6 Accept / 1 Partial-Accept bằng thiết kế tốt hơn từ Kongming).

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Thiếu số Issue thật, sai đường dẫn `pr-body-contract.cjs` và gộp `gh pr create` với `--linked-pr` | Critical | Accept (tạo Issue `#732` trước Phase 1, dùng `~/.gemini/config/ak-runtime/hooks/lib/pr-body-contract.cjs` và `teacher-os/261116-0428`) | `plan.md`, `phase-02-verify-and-ship.md` |
| 2 | Nháy/lộ `🔊 <audioName>` qua fallback dòng `231` khi `useAssignmentAudioObjectUrl` vừa mount hoặc chưa tải audio | High | Accept (ưu tiên `audioError` rồi `audioLoading \|\| detail.hasAudio` trước fallback `!detail.hasAudio` thay vì thêm prop mới; giữ nguyên Admin preview `!detail.hasAudio`) | `plan.md`, `phase-01-start.md` |
| 3 | Chạy `study-pack.spec.ts` ghi đè 17 ảnh tracked (`702-*`, `720-*`, `class-study-pack-*`) nhưng chỉ revert `702-*` | High | Accept (revert đủ 3 nhóm và giữ `git status` sạch) | `phase-02-verify-and-ship.md` |
| 4 | `pnpm design:compare -- --screens s-quiz-listening` lỗi `--`, redirect 409 ở `in_progress`, không seed `audio_url`, clone repo ngoài | High | Accept (gỡ `design:compare` khỏi Phase 2; dùng E2E thực có audio blob 3 viewport × 2 theme + `review` làm visual gate) | `phase-02-verify-and-ship.md` |
| 5 | `study-pack.spec.ts` khôi phục viewport `1280×720` thay vì `1440×900` và thiếu ảnh POT `mode="review"` | Medium | Accept (khôi phục `1440×900` bằng `try/finally` và chụp thêm ảnh `review`) | `phase-02-verify-and-ship.md` |
| 6 | Xóa tên file khiến `<audio controls>` thiếu accessible name (`aria-label`) | Medium | Accept (thêm `aria-label="Bài nghe"` khớp khuyến nghị Kongming và kiểm chứng unit + E2E) | `plan.md`, `phase-01-start.md`, `phase-02-verify-and-ship.md` |
| 7 | Lệnh `pnpm --filter <pkg> test -- <files>` bỏ qua filter Vitest; Test 3 thiếu `skill: "listening"`; thiếu assert cho `StudyPackItemViewer` tab `"Làm thử"` | Medium | Accept (đổi sang `exec vitest run`, bổ sung `skill: "listening"` + `hasAudio: true` cho Test 3, và thêm assert trong `study-pack-item-viewer.test.tsx`) | `plan.md`, `phase-01-start.md`, `phase-02-verify-and-ship.md` |

## Validation Log

### Verification Results
- **Tier:** Light (2 phases)
- **Claims checked:** 14
- **Verified:** 14 | **Failed:** 0 | **Unverified:** 0
- Đã kiểm chứng trực tiếp trên mã nguồn: `packages/ui/src/components/quiz/quiz-paper.tsx:29-45,206-234`, `apps/student/src/lib/repos/quiz.ts:563-604`, `apps/student/src/components/quiz/quiz-take-view.tsx:360-364,548-580`, `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.detail.tsx:91-98,258-290`, `packages/api/src/lib/library-quiz-preview.ts:32-80`, `apps/admin/src/components/library/test-preview-overlay.tsx:288-308`, `apps/web/src/components/study-packs/study-pack-item-viewer.tsx:139-146,709-723`, `apps/web/src/components/study-packs/study-pack-item-viewer.test.tsx:287-319`, `apps/web/src/routes/_auth/assignments/preview.tsx:226-235`, `apps/student/test/quiz-paper.test.tsx:19-32,914-951`, `apps/e2e/specs/study-pack.spec.ts:33-39,209,412-425,475-493,515-524,579-658`, `apps/e2e/specs/admin-library-listening.spec.ts:301`, `scripts/design-compare/screens.json:324-348`, `apps/e2e/scripts/design-seed.ts:695-767`.

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-verify-and-ship.md`
- Decision deltas checked: 7
- Reconciled stale references: 7
- Unresolved contradictions: 0

<!-- slug: remove-audio-tracker-mp3-filename -->
