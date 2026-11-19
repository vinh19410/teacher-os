# Phase 02 — `apps/profile` Speaking UI, State Machine & Tests

## Files Owned
- `apps/profile/public/kiem-tra-dau-vao/grading.js`
- `apps/profile/public/kiem-tra-dau-vao/speaking-audio.js` (new)
- `apps/profile/public/kiem-tra-dau-vao/test.js`
- `apps/profile/public/kiem-tra-dau-vao/test.css`
- `apps/profile/tests/placement-test.test.mjs`

## Requirements & Design
1. **State machine (`grading.js`):**
   - Đồng bộ y hệt Phase 01: `MAX_SPEAKING_RETRIES_PER_TASK = 2`, `retriesUsedForCurrentTask: 0`, `phase: "paused"`, `canRetrySpeakingTask`, `transitionSpeakingToPaused`, `retrySpeakingCurrentTask`, reset `retriesUsedForCurrentTask` khi `startSpeakingTaskReading`.
2. **Audio segment merger (`speaking-audio.js`):**
   - Export `mergeSpeakingAudioSegments(segments)` (WAV 16 kHz mono 16-bit PCM khi `AudioContext.decodeAudioData` khả dụng, fallback an toàn khi môi trường không có `AudioContext` hoặc dữ liệu fake).
3. **UI & Recorder (`test.js` + `test.css`):**
   - Header card: bỏ đoạn mô tả dài `Hệ thống sẽ tự động đọc lần lượt từng câu hỏi...`; giữ `Phần 5 / 5 · Nói (Speaking)` + tiêu đề gọn `Kiểm tra Speaking`.
   - Màn chờ (`#speakingOverviewCard`): bỏ `.speaking-overview-steps` (`<ol>` 3 bước), giữ 3 ô thông số (`Số câu hỏi`, `Thời lượng ước tính`, `Phương thức`) và 2 nút Bắt đầu / Bỏ qua.
   - Pha `prep`: đưa bộ đếm `#speakingTimerValue` ra khối căn giữa cỡ lớn (`speaking-center-stage`), bỏ đoạn nhắc `#speakingReplayStatus` dài mặc định (chỉ giữ trạng thái ngắn khi đang phát lại/đã phát lại nếu cần hoặc giữ gọn).
   - Pha `answer`: khối trung tâm hiển thị nút tròn đỏ `#speakingPauseBtn` (`speaking-pause-circle-btn`) có icon Pause ở giữa màn hình + bộ đếm `#speakingTimerValue` ở dưới.
   - Pha `paused`: hiển thị `#speakingRetryBtn` (`Ghi lại câu này (còn X/2)`, disabled khi hết 2 lần) và `#speakingNextTaskBtn` (`Câu tiếp theo →` / `Hoàn thành phần Speaking`).
   - Màn xem lại (`#speakingReviewBox`): bỏ `#retakeSpeakingBtn` (`Ghi lại từ đầu`).
   - Footer tách riêng (`.speaking-early-footer` với `border-top`): đặt `#speakingFinishEarlyBtn` (`Kết thúc phần Speaking`); bấm sẽ hiện khung xác nhận inline (`#speakingFinishConfirmBox` với `#confirmFinishEarlyBtn` và `#cancelFinishEarlyBtn`) trước khi kết thúc sớm.
   - Per-task `MediaRecorder`: mỗi lượt ghi câu mở 1 `MediaRecorder` trên cùng `mediaStream`; bấm `#speakingPauseBtn` hoặc hết giờ → `recorder.stop()` lưu segment vào `recordedSegments[taskIndex]` và chuyển sang `phase: "paused"`; retry câu đó ghi đè `recordedSegments[taskIndex]`; kết thúc phiên gọi `mergeSpeakingAudioSegments` để tạo `recordedBlob`.
4. **Tests (`apps/profile/tests/placement-test.test.mjs`):**
   - Cập nhật & bổ sung test state machine cho `paused` và giới hạn retry tối đa 2 lần/câu.

## Validation
`pnpm --filter profile test && pnpm --filter profile build`
