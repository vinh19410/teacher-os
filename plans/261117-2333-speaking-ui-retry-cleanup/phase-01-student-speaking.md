# Phase 01 — `apps/student` Speaking UI, State Machine & Tests

## Files Owned
- `apps/student/src/lib/placement-test-helpers.ts`
- `apps/student/src/lib/speaking-audio-merger.ts` (new)
- `apps/student/src/components/placement/placement-speaking-step.tsx`
- `apps/student/test/placement-test.test.tsx`

## Requirements & Design
1. **State machine (`placement-test-helpers.ts`):**
   - `MAX_SPEAKING_RETRIES_PER_TASK = 2`
   - `SpeakingPhase`: `"idle" | "reading" | "prep" | "answer" | "paused" | "done"`
   - `SpeakingSessionState`: thêm `retriesUsedForCurrentTask: number` (reset về `0` khi sang câu mới trong `startSpeakingTaskReading`, giữ nguyên khi retry trong câu).
   - Thêm helper:
     - `canRetrySpeakingTask(session)`: `session.status === "active" && session.phase === "paused" && session.retriesUsedForCurrentTask < MAX_SPEAKING_RETRIES_PER_TASK`
     - `transitionSpeakingToPaused(session)`: chuyển từ `answer` → `paused` (`secondsLeft: 0`).
     - `retrySpeakingCurrentTask(session, tasks)`: khi `canRetrySpeakingTask(session)` true, tăng `retriesUsedForCurrentTask + 1`, chuyển sang `phase: "answer"`, `secondsLeft: answerSeconds`.
   - `transitionSpeakingNextTask(session, tasks)` cho phép chuyển từ `answer` hoặc `paused` sang câu tiếp theo (hoặc `completed`).
2. **Per-task MediaRecorder & Audio Concatenation (`speaking-audio-merger.ts` + `placement-speaking-step.tsx`):**
   - Giữ 1 `MediaStream` xuyên suốt (xin quyền 1 lần), tạo `MediaRecorder` mới cho mỗi lượt ghi của từng câu (`recordedSegmentsRef.current[taskIndex] = { blob, durationMs }`).
   - Khi hoàn thành (hoặc kết thúc sớm sau khi có ít nhất 1 segment đã/đang ghi), dừng recorder đang chạy (nếu có), thu toàn bộ segment cuối theo thứ tự `0..tasks.length-1`, gọi `mergeSpeakingAudioSegments(segments)`:
     - Nếu chỉ có 1 segment hợp lệ hoặc `AudioContext` không khả dụng: dùng `AudioContext.decodeAudioData` khi có thể; nếu thất bại/không có `AudioContext`, trả fallback blob (blob duy nhất nếu 1 segment, hoặc nối `new Blob(blobs, { type })`).
     - Khi decode thành công bằng `AudioContext`: resample/mix xuống 16 kHz mono 16-bit PCM WAV (`audio/wav`) để bảo đảm tương thích mọi trình duyệt & nhỏ gọn (~1.9 MB/phút, < 50 MB).
3. **UI (`placement-speaking-step.tsx`):**
   - Header card: chỉ giữ `Phần 5 / 5 · Nói (Speaking)` và tiêu đề gọn `Kiểm tra Speaking` (bỏ `CardDescription` dài dòng).
   - Màn chờ (`idle`): giữ 3 ô thông số gọn (`Số câu hỏi`, `Thời lượng ước tính`, `Phương thức`) và 2 nút `Bắt đầu làm bài Speaking` / `Bỏ qua phần Speaking`; bỏ danh sách `<ol>` 3 bước hướng dẫn.
   - Pha `prep`: bỏ dòng nhắc dài bên dưới nút; đưa đồng hồ đếm ngược cỡ lớn (`text-4xl font-mono font-bold tabular-nums`) ra chính giữa màn hình (`text-center`) với nhãn `Thời gian chuẩn bị`, bên dưới là cụm nút `Nghe lại câu hỏi` và `Trả lời ngay →`.
   - Pha `answer`: giữa màn hình hiển thị nút tròn đỏ (`size-16 rounded-full bg-destructive text-destructive-foreground shadow-md hover:bg-destructive/90`) với icon `<Pause />` (`aria-label="Dừng ghi âm câu hiện tại"`), kèm đồng hồ đếm ngược thời gian trả lời bên dưới.
   - Pha `paused`: hiển thị thời lượng đã ghi của câu hiện tại, nút `Ghi lại câu này (còn X/2)` (disabled khi `retriesUsedForCurrentTask >= 2`, hiện `Đã hết lượt ghi lại (0/2)`), và nút chính `Câu tiếp theo →` / `Hoàn thành phần Speaking`.
   - Màn xem lại (`recordedAudio`): bỏ nút `Ghi lại từ đầu`.
   - Footer tách riêng: ngăn cách bằng `border-t pt-3`, đặt nút `Kết thúc phần Speaking` (`variant="ghost"` / `size="sm"`), bấm khi đang làm bài chưa xong hết sẽ mở khung xác nhận inline ngắn (`Xác nhận kết thúc sớm` / `Tiếp tục làm bài`).
4. **Tests (`placement-test.test.tsx`):**
   - Test state machine mới: `transitionSpeakingToPaused`, `canRetrySpeakingTask`, `retrySpeakingCurrentTask` tối đa 2 lần, lần 3 bị chặn.
   - Render test `PlacementSpeakingStep` kiểm tra không còn đoạn hướng dẫn dài/`<ol>`, và test `mergeSpeakingAudioSegments` fallback.

## Validation
`pnpm --filter student test && pnpm --filter student check-types`
