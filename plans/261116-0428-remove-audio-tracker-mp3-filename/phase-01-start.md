---
phase: 1
title: "Phase 1: TDD Unit Test & QuizPaper Implementation"
status: pending
priority: P1
effort: "25m"
dependencies: []
---

# Phase 1: TDD Unit Test & QuizPaper Implementation

## Goal
Viết unit test TDD chứng minh trạng thái RED trước, sau đó gỡ dòng hiển thị tên file `🔊 <audioName>` bên dưới `<audio>` trong `QuizPaper`, bổ sung `aria-label="Bài nghe"`, ngăn nháy fallback ở frame đầu khi `hasAudio === true`, và xác minh các package tiêu thụ (`@teacher-os/ui`, `student`, `admin`, `web`) đều pass.

## Files to Create / Modify
- Modify: `apps/student/test/quiz-paper.test.tsx`
- Modify: `packages/ui/src/components/quiz/quiz-paper.tsx`
- Modify: `apps/web/src/components/study-packs/study-pack-item-viewer.test.tsx`

## Tasks & Steps

### Task 1.1 — Pha RED: Thêm unit tests trong `apps/student/test/quiz-paper.test.tsx`
- **Goal:** Bổ sung bộ test `renderToStaticMarkup` khóa hành vi ẩn tên file `.mp3` và icon `🔊` khi có `audioSrc`, thêm `aria-label="Bài nghe"`, chống nháy `🔊` khi `detail.hasAudio === true` trước khi hook chạy `useEffect`, và bảo vệ nhánh fallback khi `!detail.hasAudio`.
- **Target files and symbols:** `apps/student/test/quiz-paper.test.tsx` (thêm khối `describe("QuizPaper — listening audio player không hiển thị tên file bên dưới (#732)", ...)` ở cuối file).
- **Steps:**
  1. Đọc lại phần cuối `apps/student/test/quiz-paper.test.tsx` (dòng `914–951`).
  2. Thêm `describe` mới gồm 3 test case với helper parts `buildQuizParts([{ stem: "Where is the speaker?", opts: ["A", "B"], pin: null }], "mcq")`:
     - Test 1 (`ẩn dòng tên file .mp3 và icon loa bên dưới thẻ <audio> ở cả take và review khi có audioSrc`): render `QuizPaper` với `detail={paperFields({ skill: "listening", type: "mcq", level: "IELTS Foundation", band: "5.0", audioName: "exercise.mp3", hasAudio: true, passage: "" })}`, `audioSrc="blob:http://localhost:8003/test-audio"` ở `mode="take"` và ở `mode="review"` (kèm `transcript="Sample transcript"`). Khẳng định HTML chứa `data-testid="quiz-audio-player"`, `aria-label="Bài nghe"`, `src="blob:http://localhost:8003/test-audio"`, KHÔNG chứa `"exercise.mp3"`, KHÔNG chứa `"🔊"`, và ở `mode="review"` vẫn chứa `data-testid="quiz-review-transcript"`.
     - Test 2 (`giữ nguyên dòng fallback '🔊 <audioName>' khi không có hasAudio và không có audioSrc (admin preview / đề chưa có audio thực)`): render `QuizPaper` với `detail={paperFields({ skill: "listening", type: "mcq", audioName: "section-1.mp3", passage: "" })}` (không đặt `hasAudio`, `audioSrc={null}`, `audioLoading={false}`, `audioError={false}`). Khẳng định HTML chứa `"🔊 section-1.mp3"` và không chứa `data-testid="quiz-audio-player"`.
     - Test 3 (`hiển thị trạng thái đang tải (kể cả render đầu khi hasAudio=true) và lỗi tải audio mà không lộ tên file .mp3`): dùng `detail={paperFields({ skill: "listening", type: "mcq", audioName: "exercise.mp3", hasAudio: true, passage: "" })}` kiểm tra 3 trường hợp:
       - (a) Render đầu trước `useEffect`: `audioSrc={null}`, `audioLoading={false}`, `audioError={false}` → chứa `"Đang tải file nghe…"`, KHÔNG chứa `"exercise.mp3"`, KHÔNG chứa `"🔊"`.
       - (b) Đang tải: `audioLoading={true}` → chứa `"Đang tải file nghe…"`, KHÔNG chứa `"exercise.mp3"`.
       - (c) Lỗi tải: `audioError={true}` → chứa `"Không tải được file nghe."`, KHÔNG chứa `"Đang tải file nghe…"`, KHÔNG chứa `"exercise.mp3"`.
  3. Chạy file test mục tiêu để chứng minh pha RED.
- **Success criteria:** Test 1 và Test 3(a) fail đúng lý do (`🔊 exercise.mp3` vẫn xuất hiện trong HTML); Test 2 và Test 3(b)/(c) pass.
- **Verify:** `pnpm --filter student exec vitest run test/quiz-paper.test.tsx` thoát với exit code khác `0` và báo assertion failure trên `"exercise.mp3"` / `"🔊"` / `"aria-label=\"Bài nghe\""` (nếu exit `0` nghĩa là test chưa bắt được hành vi cũ → coi là thất bại).

### Task 1.2 — Pha GREEN: Sửa `QuizPaper` trong `packages/ui/src/components/quiz/quiz-paper.tsx`
- **Goal:** Gỡ bỏ khối render `detail.audioName.trim()` bên dưới `<audio>`, thêm `aria-label="Bài nghe"`, và ưu tiên `audioError` rồi `audioLoading || detail.hasAudio` trước nhánh fallback `!detail.hasAudio`.
- **Target files and symbols:** `packages/ui/src/components/quiz/quiz-paper.tsx` (component `QuizPaper`, dòng `206–234`).
- **Steps:**
  1. Thay khối bên trong `{skill === "listening" && (...)}` (dòng `208–232`) bằng:
     ```tsx
     					{audioSrc ? (
     						// biome-ignore lint/a11y/useMediaCaption: Listening exam audio; transcript unlocks after submit (#702)
     						<audio
     							controls
     							preload="metadata"
     							src={audioSrc}
     							aria-label="Bài nghe"
     							className="w-full"
     							data-testid="quiz-audio-player"
     						/>
     					) : audioError ? (
     						<p role="alert" className="text-danger text-sm">
     							Không tải được file nghe.
     						</p>
     					) : audioLoading || detail.hasAudio ? (
     						<p className="text-muted-foreground text-sm">Đang tải file nghe…</p>
     					) : (
     						<p>🔊 {detail.audioName.trim() || "Chưa đính file nghe"}</p>
     					)}
     ```
  2. Chạy lại test `apps/student/test/quiz-paper.test.tsx`.
- **Success criteria:** Toàn bộ test trong `apps/student/test/quiz-paper.test.tsx` pass.
- **Verify:** `pnpm --filter student exec vitest run test/quiz-paper.test.tsx` exits `0` và in ra toàn bộ test passed (`0 failed`).

### Task 1.3 — Cập nhật `study-pack-item-viewer.test.tsx` & Xác minh regression tests các app liên quan
- **Goal:** Khóa hành vi ẩn `library-part1.mp3` / `🔊` và có `aria-label="Bài nghe"` trên bề mặt tab `"Làm thử"` của giáo viên (`StudyPackItemViewer`), đồng thời xác minh `@teacher-os/ui`, `admin`, `web` simulation pass toàn bộ.
- **Target files and symbols:** `apps/web/src/components/study-packs/study-pack-item-viewer.test.tsx` (test `"auto-loads audio and grades interactive simulation in Làm thử tab"`, dòng `287–319`).
- **Steps:**
  1. Trong `apps/web/src/components/study-packs/study-pack-item-viewer.test.tsx` (bên trong test dòng `287–319`), sau khi `<audio>` simulation được render (cả trước và sau khi bấm `"Nộp bài"`), assert:
     - `const simAudio = await screen.findByTestId("quiz-audio-player");` có `simAudio.getAttribute("src") === "blob:audio-sim"` và `simAudio.getAttribute("aria-label") === "Bài nghe"`.
     - `expect(screen.queryByText(/library-part1\.mp3/)).toBeNull();` và `expect(screen.queryByText(/🔊/)).toBeNull();` (cả ở trạng thái làm thử lẫn sau khi bấm `"Nộp bài"`).
  2. Chạy unit tests:
     - `pnpm --filter @teacher-os/ui test`
     - `pnpm --filter admin test`
     - `pnpm --filter web exec vitest run src/components/study-packs/study-pack-item-viewer.test.tsx src/components/assignments/preview-quiz-simulation.test.tsx`
- **Success criteria:** Tất cả test files trên đều pass hoàn toàn.
- **Verify:** Cả 3 lệnh đều thoát với exit code `0` (`0 failed`).

## Todo
- [ ] Task 1.1: Bổ sung TDD unit tests trong `apps/student/test/quiz-paper.test.tsx` và xác minh pha RED.
- [ ] Task 1.2: Sửa `packages/ui/src/components/quiz/quiz-paper.tsx` và xác minh pha GREEN.
- [ ] Task 1.3: Cập nhật `study-pack-item-viewer.test.tsx` và chạy unit tests `@teacher-os/ui`, `admin`, `web` simulation đều pass.

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
