---
phase: 4
title: "Màn kết quả Speaking + e2e + gate cuối"
status: pending
priority: P1
effort: "3h"
dependencies: [3]
---

# Phase 4: Màn kết quả Speaking + e2e + gate cuối

## Goal
Sau khi nộp đề Speaking, màn kết quả hiện bài nói đã nộp và cho nghe/xem lại, thay cho score card 0/0. Toàn bộ luồng (kéo-thả, upload, reload, thay file, nộp, nghe lại) được chứng minh trên trình duyệt thật. Mọi gate local đều xanh. Runbook ghi bước bật R2.

## Bối cảnh
- Summary: `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx` (`AttemptSummaryPage`), gồm `AttemptScoreCard`, link "Xem giải thích chi tiết" và `AttemptCompactList`. Sau #304 trang này đã có nhánh Writing (`summary.essay !== null`).
- E2E: `apps/e2e/specs/student-quiz-take-review.spec.ts` (chứa `openPaper`, helper này chờ `getByTestId("navigator-progress")`; Speaking đáp ứng nhờ `QuizSpeakingFooter` ở Phase 3) và `apps/e2e/specs/helpers-quiz.ts` (seed). <!-- Updated: Red Team 2026-10-02 --> `QuizSeedPrompt` hiện chưa có `cueTopic`/`cuePoints`; INSERT ghi cứng cột `cue_topic`, `cue_points`. Store file e2e lấy từ Phase 1 (`apps/e2e/src/fs-media-store.ts`).
- Port e2e: `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103` (AGENTS.md).
- Runbook: `docs/production-release-runbook.md`.

## Files to Create / Modify
- Modify: `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx`
- Modify: `apps/student/test/attempt-summary.test.tsx`
- Modify: `apps/e2e/specs/helpers-quiz.ts`
- Modify: `apps/e2e/specs/student-quiz-take-review.spec.ts`
- Create: `apps/e2e/fixtures/speaking-sample.mp3` (file audio thật, nhỏ: khoảng 1–2 giây im lặng, < 20KB)
- Modify: `docs/production-release-runbook.md`
- Modify: `CHANGELOG.md` (mục `## 2026-10-02` → `### Added`)

## Tasks & Steps

### 4.1 Summary nhánh Speaking
- [ ] Khi `summary.skill === "speaking"` (field optional: vắng mặt nghĩa là không phải Speaking): không render `AttemptScoreCard`, link chi tiết và "Bảng đáp án". Thay vào đó:
  - Heading "Bài nói của bạn".
  - Nếu `summary.media`: dùng `Attachment state="done"` (icon audio/video, tên file, `formatMediaSize`, định dạng) và `QuizMediaPlayer` (attemptId, media, không có localUrl, nên bấm "Nghe lại bài nói" mới tải).
  - Nếu `summary.media === null` (attempt cũ nộp trước feature): "Bài này được nộp khi chưa có file bài nói." với `text-muted-fg`.
  - Ghi chú `text-muted-fg text-sm`: "Giáo viên sẽ chấm bài nói của bạn."
- [ ] Giữ dòng "Bạn đã nộp bài lúc … · hoàn thành trong …".
- [ ] Test `attempt-summary.test.tsx`:
  - Summary Speaking có media: hiện "Bài nói của bạn", tên file, nút "Nghe lại bài nói", không có "Xem giải thích chi tiết".
  - Speaking `media: null`: hiện câu "chưa có file".
  - Reading (`skill: "reading"`, `media: null`): vẫn hiện score card.
  - Summary không có key `skill`/`media` (server cũ): vẫn hiện score card, không throw.

### 4.2 Seed helper
- [ ] `QuizSeedPrompt` thêm `cueTopic?: string`, `cuePoints?: string`, ghi vào cột `cue_topic`, `cue_points` (mặc định `""`). Nếu #304 đã thêm `prompt?` thì giữ.

### 4.3 Fixture audio
- [ ] Tạo `apps/e2e/fixtures/speaking-sample.mp3` bằng `ffmpeg -f lavfi -i anullsrc=r=22050:cl=mono -t 1 -b:a 32k speaking-sample.mp3`, rồi commit file nhị phân. Đây là file MP3 hợp lệ để `<audio>` load được metadata.

### 4.4 E2E
- [ ] Thêm fixture ở **cuối** mảng prompts để không lệch các index `assignmentIds` đang dùng: `title: "Đề speaking: a place you like"`, `skill: "speaking"`, `part: "part2"`, `type: "place"`, `intro: "<p>Hãy ghi âm trong một lần, không cắt ghép.</p>"`, `cueTopic: "a place you like to visit"`, `cuePoints: "where it is\nwhen you go there\nwhy you like it"`, `passage: ""`, `note: ""`, `questions: []`. Nếu spec có assert đếm tổng số đề thì cập nhật.
- [ ] Test `"speaking paper: drag-and-drop upload, survives reload, replace, submit and play back on summary"`:
  1. `signIn`, `openPaper(page, titleSpeaking)`, bắt đầu làm bài.
  2. Thấy "Describe a place you like to visit", "You should say:", intro "Hãy ghi âm trong một lần", card "Hướng dẫn làm bài" có dòng Part 2 "1 phút chuẩn bị". Không có "không có câu hỏi tự chấm". Nút "Nộp bài" bị disable.
  3. Upload bằng **drag & drop**: đọc fixture bằng `fs`, dùng `page.evaluateHandle` dựng `DataTransfer` với `new File([...], "speaking-sample.mp3", { type: "audio/mpeg" })`, rồi `dispatchEvent("drop", { dataTransfer })` lên vùng dropzone (`getByRole("button", { name: /Kéo thả file/ })`). Chờ "speaking-sample.mp3" và nút "Xoá" xuất hiện. Nút "Nộp bài" được enable. Có phần tử `audio` với `aria-label="Bài nói đã nộp"`.
  4. Chọn file sai định dạng qua `setInputFiles` với buffer `.pdf`: thấy thông báo "Định dạng không hỗ trợ" và file cũ vẫn còn.
  5. `page.reload()`: vẫn thấy "speaking-sample.mp3". Bấm "Nghe lại bài nói": phần tử `audio` có `src` bắt đầu bằng `blob:`.
  6. "Thay file" bằng `setInputFiles` với cùng fixture nhưng tên `answer-v2.mp3`: tên mới hiện ra, tên cũ biến mất.
  7. Bấm "Nộp bài", chuyển sang summary: thấy "Bài nói của bạn", "answer-v2.mp3", "Giáo viên sẽ chấm bài nói của bạn", không có "Xem giải thích chi tiết". Bấm "Nghe lại bài nói": `audio[src^="blob:"]` visible.
- [ ] Test `"speaking paper: removing the file disables submit again"`: upload, Xoá, xác nhận dialog. Dropzone hiện lại và "Nộp bài" bị disable.
- [ ] Chạy lại toàn bộ spec để chắc các test Reading/Writing cũ vẫn xanh.

### 4.5 Runbook + changelog
- [ ] `docs/production-release-runbook.md`: thêm bước trước deploy của release này:
  - Bật R2 trên tài khoản Cloudflare (Dashboard → R2 → Purchase/Enable, free tier); cần cả cho `alchemy dev` local.
  - Token `CLOUDFLARE_API_TOKEN` của GitHub (prod + staging) phải có quyền "Workers R2 Storage: Edit". Diễn tập trên staging trước.
  - `alchemy deploy` tạo bucket `media` private, bind vào Worker server dưới tên `MEDIA`. Sau deploy: kiểm dev-url của bucket đang tắt (`wrangler r2 bucket dev-url get <tên bucket>`) và tên bucket theo stage không trùng nhau.
  - Backup D1 trước khi apply migration 0032 (thêm cột media trên `quiz_attempt`). Sau deploy chạy `SELECT media_key FROM quiz_attempt LIMIT 0` vì `/readyz` không kiểm cột.
  - Field mới của summary là optional; bundle cũ + server mới có thể lỗi đến khi reload (cùng cửa sổ #304). <!-- Updated: Red Team 2026-10-02 -->
- [ ] `CHANGELOG.md` mục `## 2026-10-02` (đã tồn tại sau #304) → `### Added`: "Trang làm bài học viên có màn nộp bài Speaking: hiển thị câu hỏi/cue card và hướng dẫn, tải lên 1 file audio/video (kéo thả, tối đa 50 MB) lưu trên R2, nghe lại trước và sau khi nộp."

### 4.6 Gate cuối
- [ ] `pnpm check`
- [ ] `pnpm check-types`
- [ ] `pnpm --filter @teacher-os/infra check-types`
- [ ] `pnpm --filter server test`
- [ ] `pnpm --filter student test`
- [ ] `pnpm --filter web test`
- [ ] `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e -- student-quiz-take-review`

## Verification
- Tất cả lệnh ở 4.6 đều xanh. Ghi tóm tắt output vào PR body.

## Follow-up (ngoài scope)
- Bổ sung vào issue follow-up "giáo viên chấm bài Writing/Speaking" của #304: giáo viên nghe file Speaking qua route riêng phía teacher, có kiểm org.
- Mở issue "Dọn object R2 mồ côi": job đối chiếu list prefix `quiz-media/`, so với `quiz_attempt.media_key`, chỉ xoá key không được tham chiếu và cũ hơn N giờ. Không dùng lifecycle rule theo prefix vì sẽ xoá cả bài đã nộp. <!-- Updated: Red Team 2026-10-02 -->
- Tuỳ chọn: ghi âm trực tiếp trên trình duyệt (MediaRecorder) để học viên khỏi phải dùng app ghi âm ngoài.
