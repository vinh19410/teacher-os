---
phase: 2
title: "Phase 2: Profile & Student UI Enforcement + E2E"
status: completed
priority: P1
effort: 2h
dependencies: [1]
---

# Phase 2: Profile & Student UI Enforcement + E2E

## Goal

Loại bỏ hoàn toàn khả năng bỏ qua bài test Speaking trên cả giao diện công khai (`apps/profile`) và cổng học viên (`apps/student`), chặn nộp bài nếu chưa có bản ghi âm hợp lệ khi đề có câu Speaking, giải quyết dead-end khi file > 50 MB, và cập nhật unit test cùng E2E specs liên quan.

## Requirements

- [x] `apps/profile/public/kiem-tra-dau-vao/grading.js`:
  - Cập nhật `resolveSpeakingSubmitDecision({ hasSpeakingTasks, hasValidBlob })` để khi `!hasSpeakingTasks` trả `{ finalMode: "none", needsSpeakingDecision: false, blockedByMissingSpeaking: false }`; khi `hasSpeakingTasks && hasValidBlob` trả `{ finalMode: "upload", needsSpeakingDecision: false, blockedByMissingSpeaking: false }`; khi `hasSpeakingTasks && !hasValidBlob` trả `{ finalMode: null, needsSpeakingDecision: false, blockedByMissingSpeaking: true }`.
- [x] `apps/profile/public/kiem-tra-dau-vao/test.js`:
  - Xóa nút `#skipSpeakingBtn`, xóa handler `skipBtn`, xóa khối `.speaking-skipped-box`, không lưu/khôi phục `speakingMode: "skipped"` trong `localStorage` (normalize bản nháp cũ `"skipped"` về `"none"`). Đổi fallback `submission?.speakingStatus ?? "skipped"` ở `renderResultStep()` (`test.js:3811`) sang `"none"`.
  - Trong `handleRequestSubmit()`: xóa `unansweredConfirmState = null` cho mọi nhánh return sớm do lỗi Speaking (`isSpeakingBusy()`, `recordedBlob.size > SPEAKING_MAX_BYTES`, và `speakingDecision.blockedByMissingSpeaking`). Khi `blockedByMissingSpeaking` là `true`, đặt `speakingMediaError = "Phần Speaking là bắt buộc. Vui lòng hoàn thành ghi âm bài nói trước khi nộp bài."`, `render()`, và cuộn tới `#speakingErrorBanner` / `#speakingRecorderCard` (không mở `#unansweredConfirmBox`).
  - Khi đã có `hasValidBlob` (hoặc `!hasSpeakingTasks`) nhưng còn câu trắc nghiệm/Writing bỏ trống, `#unansweredConfirmBox` vẫn hoạt động bình thường với `resolvedSpeakingMode` là `"upload"` (hoặc `"none"`).
  - Trong `reviewBox` (`test.js:3510-3516`): chỉ khi `isTooLarge` (`> SPEAKING_MAX_BYTES`), hiển thị nút "Xóa bản ghi & ghi lại" để reset `recordedBlob` / `recordedBlobUrl` / `speakingDurationSec` về trạng thái sẵn sàng ghi lại (tránh dead-end; không thêm nút ghi lại vào `reviewBox` hợp lệ để giữ nguyên #780).
  - Bỏ cụm "chọn Bỏ qua phần Speaking" / "chọn Bỏ qua" trong các thông báo lỗi micro, `!hasMediaApi`, file > 50 MB; xử lý mã `PLACEMENT_SPEAKING_REQUIRED` ở `executeSubmission()` (`res.status === 400`) và không cuộn lên `top: 0` khi có `submitError` (cuộn tới `#submitErrorBanner`).
- [x] `apps/student/src/components/placement/placement-speaking-step.tsx`, `placement-test-runner.tsx`, và `apps/student/src/lib/placement-test-helpers.ts`:
  - Xóa nút "Bỏ qua phần Speaking" (`handleSkip`, `SkipForward`, khối `speaking-skipped-notice`, prop `onSkipSpeaking` và `speakingMode` khỏi `PlacementSpeakingStep`); chuẩn hóa `PlacementDraftState` (normalize draft `"skipped"` cũ trong `localStorage` về `"none"`).
  - Cập nhật intro notice ở `placement-test-runner.tsx:493-495` bỏ câu "Nếu thiết bị chưa có micro, bạn vẫn có thể bỏ qua phần Speaking." và thay bằng lưu ý cần micro để hoàn thành phần Speaking.
  - Cập nhật `handleRequestSubmit` trong `placement-test-runner.tsx`: khi `hasSpeakingTasks && !hasValidBlob`, gọi `setConfirmUnanswered(null)`, `setSubmitError("Phần Speaking là bắt buộc. Vui lòng hoàn thành ghi âm bài nói trước khi nộp bài.")` và `return`. Khi đã có `recordedAudio` hợp lệ (hoặc `!hasSpeakingTasks`) mà còn câu trắc nghiệm/Writing trống, `confirmUnanswered` vẫn cho xác nhận nộp với `resolvedSpeakingMode` là `"upload"` (hoặc `"none"`).
  - Chỉ khi `recordedAudio.blob.size > PLACEMENT_SPEAKING_MAX_BYTES` trong `PlacementSpeakingStep`, hiển thị nút "Xóa bản ghi & ghi lại" (`onRecordedAudioChange(null)` + reset session) để tránh dead-end (giữ nguyên `reviewBox` hợp lệ không có nút ghi lại theo #780).
  - Cập nhật thông báo `!hasMediaApi`, lỗi micro, và `> 50 MB` bỏ lời khuyên "chọn Bỏ qua phần Speaking".
  - Giữ nguyên nút "Kết thúc phần Speaking" sớm (nếu đã thu ít nhất 1 câu hợp lệ thì hợp nhất thành `recordedAudio` và cho phép nộp; nếu chưa thu câu nào thì `recordedAudio` vẫn là `null` nên bị chặn nộp).
- [x] Cập nhật unit tests và E2E specs:
  - `apps/profile/tests/placement-test.test.mjs`: cập nhật `resolveSpeakingSubmitDecision` cases.
  - `apps/student/test/placement-test.test.tsx`: cập nhật test luồng đầy đủ (dòng 414-629) dùng mock `MediaRecorder` + mock `PUT .../speaking` (`speakingStatus: "uploaded"`), cập nhật test dòng 1144-1179 (kiểm chặn nộp khi chưa ghi âm Speaking + xác nhận unanswered khi đã có audio hợp lệ), gỡ `speakingMode` & `onSkipSpeaking` ở 3 chỗ render `PlacementSpeakingStep` (dòng 1461, 1594, 1683).
  - `apps/e2e/specs/profile-placement-test.spec.ts`: bỏ thao tác click `#skipSpeakingBtn` ở dòng 1168-1208; kiểm tra khi chưa ghi âm Speaking mà bấm `#submitTestBtn` thì bị chặn bởi `#speakingErrorBanner` và không mở `#unansweredConfirmBox`, đồng thời vẫn có bài test thu âm + nộp đầy đủ bằng `installSyntheticMediaRecorder`.
  - `apps/e2e/specs/placement-lead-org-drift.spec.ts`: cài synthetic `MediaRecorder` / `getUserMedia` + `speechSynthesis` và ghi âm nhanh (hoặc kết thúc sớm sau khi thu 1 câu) trước khi nộp thay cho `#skipSpeakingBtn`.
  - `apps/e2e/specs/student-placement-test.spec.ts`: tách `installSyntheticSpeakingDevice(page)` làm helper dùng chung cho cả test 1 (dòng 153-495: ghi âm 1 câu -> kết thúc sớm -> nộp bài kèm upload Speaking) và test 2 (dòng 497+), đồng thời verify không có nút "Bỏ qua phần Speaking" và bị chặn nộp khi chưa ghi âm Speaking.
  - `apps/e2e/specs/placement-ai-grading.spec.ts`: đổi payload API sang `speakingMode: "upload"` kèm `PUT /public/placement-test/submissions/:id/speaking-media` với audio WebM hợp lệ, đồng thời scope locator `getByTestId("writing-error-highlighter").getByRole("button", { name: "Xoá lỗi 1" })` và cập nhật assertion POT/highlights nếu có cả Speaking AI draft (hoặc giữ nguyên POT layout).

## Files to Create / Modify

- Modify: `apps/profile/public/kiem-tra-dau-vao/grading.js`
- Modify: `apps/profile/public/kiem-tra-dau-vao/test.js`
- Modify: `apps/profile/tests/placement-test.test.mjs`
- Modify: `apps/student/src/lib/placement-test-helpers.ts`
- Modify: `apps/student/src/components/placement/placement-speaking-step.tsx`
- Modify: `apps/student/src/components/placement/placement-test-runner.tsx`
- Modify: `apps/student/test/placement-test.test.tsx`
- Modify: `apps/e2e/specs/profile-placement-test.spec.ts`
- Modify: `apps/e2e/specs/student-placement-test.spec.ts`
- Modify: `apps/e2e/specs/placement-lead-org-drift.spec.ts`
- Modify: `apps/e2e/specs/placement-ai-grading.spec.ts`

## Tests Before (TDD)

1. `apps/profile/tests/placement-test.test.mjs`: cập nhật unit test `resolveSpeakingSubmitDecision` chứng minh khi `hasSpeakingTasks: true, hasValidBlob: false` luôn trả `blockedByMissingSpeaking: true` và `finalMode: null`.
2. `apps/student/test/placement-test.test.tsx`:
   - Xác nhận tab Speaking không render nút "Bỏ qua phần Speaking".
   - Khi chưa có bản ghi âm Speaking, bấm "Hoàn thành & Nộp bài 5 kỹ năng" hiển thị thông báo lỗi bắt buộc Speaking và KHÔNG gửi `POST /api/student/placement-test/submissions` cũng như KHÔNG mở `placement-unanswered-confirm`.
   - Khi đã có bản ghi âm hợp lệ nhưng còn câu trắc nghiệm bỏ trống, `placement-unanswered-confirm` vẫn mở và gửi với `speakingMode: "upload"` + `PUT .../speaking`.

## Refactor & Implementation Steps

1. Sửa `apps/profile/public/kiem-tra-dau-vao/grading.js` và `apps/profile/public/kiem-tra-dau-vao/test.js`.
2. Sửa `apps/student/src/lib/placement-test-helpers.ts`, `apps/student/src/components/placement/placement-speaking-step.tsx`, và `apps/student/src/components/placement/placement-test-runner.tsx`.
3. Cập nhật unit tests `apps/profile/tests/placement-test.test.mjs` và `apps/student/test/placement-test.test.tsx`.
4. Cập nhật 4 E2E specs trong `apps/e2e/specs/` (`profile-placement-test.spec.ts`, `student-placement-test.spec.ts`, `placement-lead-org-drift.spec.ts`, `placement-ai-grading.spec.ts`).

## Tests After

- `node --test apps/profile/tests/placement-test.test.mjs apps/profile/tests/placement-result.test.mjs`
- `pnpm --filter student test`
- `pnpm check-types && pnpm exec biome check .`
- Chạy từng E2E spec liên quan (`profile-placement-test.spec.ts`, `student-placement-test.spec.ts`, `placement-lead-org-drift.spec.ts`, `placement-ai-grading.spec.ts`) với `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105`.

## Todo

- [x] Viết Tests Before cho `apps/profile` và `apps/student`
- [x] Cập nhật `grading.js` và `test.js` của `apps/profile`
- [x] Cập nhật `placement-test-helpers.ts`, `placement-speaking-step.tsx`, `placement-test-runner.tsx` của `apps/student`
- [x] Cập nhật unit tests của `apps/profile` và `apps/student`
- [x] Cập nhật 4 E2E specs liên quan và chạy verify

## Verification

- `pnpm --filter @teacher-os/api test && pnpm --filter server test && pnpm --filter student test`
- `node --test apps/profile/tests/placement-test.test.mjs apps/profile/tests/placement-result.test.mjs`
- `pnpm check-types && pnpm exec biome check .`
- Chạy từng E2E spec liên quan (`profile-placement-test.spec.ts`, `student-placement-test.spec.ts`, `placement-lead-org-drift.spec.ts`, `placement-ai-grading.spec.ts`)

## Success Criteria

- Người dùng không thể bỏ qua Speaking ở cả `apps/profile` lẫn `apps/student` khi đề có Speaking.
- Toàn bộ unit test, typecheck, biome check và các E2E spec liên quan đều pass.
