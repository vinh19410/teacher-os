---
phase: 2
title: "Phase 2: Defense-in-depth trên apps/profile, E2E 3 viewport & Full Gates"
status: todo
priority: P1
effort: "1h"
dependencies: [1]
---

# Phase 2: Defense-in-depth trên `apps/profile`, E2E 3 viewport & Full Gates

<!-- Updated: Red Team Session 1 - use grading.js pure exports for node:test without JSDOM, fix speakingMode 'none' precedence + result display, add localStorage reload redirect to Reading, serialize E2E describe with try/finally DB restore + awaited PRAGMA + clearRateLimits + env-gated POT capture -->

## Goal

Bổ sung lớp phòng thủ giao diện và điều hướng trên `apps/profile/public/kiem-tra-dau-vao/grading.js` + `test.js` để dù nhận snapshot thiếu Reading/Writing/Speaking vẫn hiển thị thông báo rõ ràng, nộp bài chuẩn xác khi không có Speaking, và tự điều hướng học viên quay lại phần Reading mới được backfill nếu khôi phục `localStorage` từ bước Writing/Speaking cũ; đồng thời bổ sung E2E regression test cô lập hoàn toàn cho `--fully-parallel`, chụp screenshot 3 viewport cho issue, và vượt qua toàn bộ quality gates của repo.

## Files to Create / Modify

- Modify: `apps/profile/public/kiem-tra-dau-vao/grading.js` (thêm các pure helper xuất ES module cho UI/state decisions)
- Modify: `apps/profile/tests/placement-test.test.mjs`
- Modify: `apps/profile/public/kiem-tra-dau-vao/test.js` (`init`, `renderIntroStep`, `renderReadingStep`, `renderWritingStep`, `handleRequestSubmit`, `renderSpeakingStep` [lines 2259–2900, recorderCard ở line 2787], `renderResultStep`)
- Modify: `apps/e2e/specs/profile-placement-test.spec.ts`
- Create (for POT via `CAPTURE_POT_ISSUE=<ISSUE_NUMBER>`): `plans/reports/<ISSUE_NUMBER>-entry-test-reading-desktop-1440x900.png`
- Create (for POT via `CAPTURE_POT_ISSUE=<ISSUE_NUMBER>`): `plans/reports/<ISSUE_NUMBER>-entry-test-reading-tablet-768x1024.png`
- Create (for POT via `CAPTURE_POT_ISSUE=<ISSUE_NUMBER>`): `plans/reports/<ISSUE_NUMBER>-entry-test-reading-mobile-375x812.png`

## Todo

- [x] Task 2.1 — Viết TDD Red tests cho pure defensive helpers trong `grading.js` & bất biến `apps/profile`
- [x] Task 2.2 — Cài đặt pure helpers vào `grading.js` và nối vào `test.js` (Green)
- [x] Task 2.3 — E2E regression test cô lập trên snapshot `v1` & chụp POT 3 viewport
- [x] Task 2.4 — Chạy toàn bộ Quality Gates tại local (`biome check`, `check-types`, `pnpm test`)

## Tasks & Steps

### Task 2.1 — Viết TDD Red tests cho pure defensive helpers trong `grading.js` & bất biến `apps/profile`

- **Goal:** Tạo bài test thất bại (Red) chạy trực tiếp bằng `node --test` (không cần JSDOM, không chạm side-effect của `test.js`) đối với mọi nhánh phòng thủ rỗng và điều hướng khôi phục Reading.
- **Target files & symbols:**
  - `apps/profile/tests/placement-test.test.mjs`
  - `apps/profile/public/kiem-tra-dau-vao/grading.js`
- **Steps:**
  1. Trong `apps/profile/tests/placement-test.test.mjs`, import các helper thuần sắp thêm từ `../public/kiem-tra-dau-vao/grading.js`:
     - `resolveReadingRenderState`
     - `resolveWritingPromptState`
     - `resolveSpeakingStepState`
     - `resolveSpeakingSubmitDecision`
     - `resolveSpeakingStatusDisplay`
     - `resolveRestoredAttemptStep`
  2. Viết test assert:
     - `resolveReadingRenderState({ passages: [] })` trả `{ hasPassages: false, emptyMessage: ... }` và với `passages` non-empty trả `{ hasPassages: true, ... }`.
     - `resolveWritingPromptState({ promptTitle: "", promptBody: "\n  " })` trả hướng dẫn dự phòng non-empty + `isFallback: true`; nếu `promptBody` có nội dung thì trả đúng dòng đã trim + `isFallback: false`.
     - `resolveSpeakingStepState({ tasks: [] })` trả `{ hasTasks: false, emptyMessage: ... }`.
     - `resolveSpeakingSubmitDecision({ hasSpeakingTasks: false, hasValidBlob: true, speakingMode: "upload" })` trả `{ finalMode: "none", needsSpeakingDecision: false }` (ưu tiên `!hasSpeakingTasks` TRƯỚC `hasValidBlob`!); khi `hasSpeakingTasks: true, hasValidBlob: false, speakingMode: "none"` trả `{ finalMode: "skipped", needsSpeakingDecision: true }`; khi `speakingMode: "skipped"` trả `{ finalMode: "skipped", needsSpeakingDecision: false }`.
     - `resolveSpeakingStatusDisplay("none")` trả nhãn không phải `"Đã bỏ qua phần Speaking"` (vd `"Không áp dụng (đề không có phần Speaking)"`), còn `"skipped"` giữ nguyên `"Đã bỏ qua phần Speaking"`.
     - `resolveRestoredAttemptStep("writing", snapshotWithReading, { reading: {} })` trả `{ step: "reading", redirectedToReading: true }`; nếu `answers.reading` đã có câu trả lời hoặc `step` là `"result"` / `"listening"` thì giữ nguyên `step`.
  3. Giữ nguyên bất biến cấm chuỗi `/30\s*câu/i` trong toàn bộ file dưới `apps/profile/public/` (và tránh viết chuỗi đó ở bất kỳ đâu dưới `public/`).
- **Success criteria:** Test mới fail vì `grading.js` chưa export các helper này.
- **Verify:** `pnpm --filter profile test` exits non-zero với lỗi thiếu export từ `grading.js` (Red state).

### Task 2.2 — Cài đặt pure helpers vào `grading.js` và nối vào `test.js` (Green)

- **Goal:** Triển khai logic phòng thủ thực thi được trong `grading.js` và nối vào DOM/event handlers trong `test.js`.
- **Target files & symbols:**
  - `apps/profile/public/kiem-tra-dau-vao/grading.js`
  - `apps/profile/public/kiem-tra-dau-vao/test.js` (`init`, `renderIntroStep`, `renderReadingStep`, `renderWritingStep`, `handleRequestSubmit`, `renderSpeakingStep` [lines 2259–2900], `renderResultStep`)
- **Steps:**
  1. Export 6 pure helper functions trong `apps/profile/public/kiem-tra-dau-vao/grading.js` đúng đặc tả Task 2.1.
  2. Trong `apps/profile/public/kiem-tra-dau-vao/test.js`:
     - Import 6 helper từ `./grading.js` ở đầu file (`lines 1–6`).
     - Trong `init()` (`lines 3403–3406`): sau `state = loadAttemptState(snapshot.version)`, gọi `const restored = resolveRestoredAttemptStep(state.step, snapshot, state.answers);`; nếu `restored.redirectedToReading` thì đặt `state.step = restored.step`, gắn biến cờ `readingBackfillNotice = true`, gọi `saveAttemptState(snapshot.version, state)`.
     - Trong `renderIntroStep()` (`lines 982, 1002–1006`): nếu `speakingCount === 0`, hiển thị `1 bài viết (${writing.minWords}–${writing.maxWords} từ).` thay vì `0 câu hỏi Speaking ghi âm/ghi hình...`.
     - Trong `renderReadingStep()` (`lines 1828–1931`): nếu `readingBackfillNotice` đang bật thì hiện banner thông báo phần Đọc hiểu vừa được cập nhật bổ sung; gọi `resolveReadingRenderState(reading)`, nếu `!hasPassages` thì append `section.card` (`id: "readingEmptyNotice"`) chứa `div.provisional-notice-box`.
     - Trong `renderWritingStep()` (`lines 1933–2057`): dùng `resolveWritingPromptState(writing)` để luôn render các dòng hướng dẫn (hoặc fallback khi rỗng) trước `.writing-range-hint`.
     - Trong `renderSpeakingStep()` (`lines 2259–2900`, `recorderCard` append ở `line 2787`): dùng `resolveSpeakingStepState(speaking)`. Khi `!hasTasks`: điều chỉnh câu mô tả trên `introCard` không yêu cầu camera/micro, render `section.card.speaking-tasks-card` (`id: "speakingEmptyNotice"`) với `div.provisional-notice-box`, và **chỉ tạo + append `recorderCard` (`line 2787`) khi `hasTasks === true`** (giữ nguyên `#submitErrorBanner`, `#unansweredConfirmBox` và `#submitTestBtn` bên dưới!).
     - Trong `handleRequestSubmit()` (`lines 2234–2241`): thay bằng `const decision = resolveSpeakingSubmitDecision({ hasSpeakingTasks: resolveSpeakingStepState(snapshot.speaking).hasTasks, hasValidBlob, speakingMode: state.speakingMode });` rồi dùng `decision.finalMode` và `decision.needsSpeakingDecision`.
     - Trong `renderResultStep()` (`lines 2982–2990`): gọi `resolveSpeakingStatusDisplay(speakingStatus)` để xử lý đủ 4 trạng thái `uploaded`, `pending_upload`, `none`, `skipped` (và kiểm tra `resolvedSpeaking.label` + `badgeClass`).
  3. Kiểm tra lại tuyệt đối không chứa `/30\s*câu/i` trong `apps/profile/public/`.
- **Success criteria:** `pnpm --filter profile test` và `pnpm --filter profile build` pass 100%.
- **Verify:** `pnpm --filter profile test && pnpm --filter profile build` exits `0`.

### Task 2.3 — E2E regression test cô lập trên snapshot `v1` & chụp POT 3 viewport

- **Goal:** Chứng minh end-to-end trên trình duyệt thật với D1 `v1` snapshot (giữ nguyên tính an toàn dưới `--fully-parallel` và retries của CI) và thu thập 3 ảnh POT ở `1440×900`, `768×1024`, `375×812`.
- **Target files & symbols:**
  - `apps/e2e/specs/profile-placement-test.spec.ts`
  - `plans/reports/<ISSUE_NUMBER>-entry-test-reading-*.png` (chỉ tạo khi truyền `CAPTURE_POT_ISSUE=<ISSUE_NUMBER>`)
- **Steps:**
  1. Trong `apps/e2e/specs/profile-placement-test.spec.ts`:
     - Chuyển `test.describe("profile placement test 5 kỹ năng (/kiem-tra-dau-vao/ -> /leads)", ...)` (`line 257`) thành `test.describe.serial(...)` để tương thích cờ `--fully-parallel` trên CI (`.github/workflows/e2e.yml:29`).
     - Sửa `openDb()` / helper DB để thực thi `await client.execute("PRAGMA busy_timeout = 5000;");` đúng chuẩn bất đồng bộ (không bỏ qua Promise).
     - Cuối block `test.describe.serial`, thêm test case: `"snapshot v1 cũ tự backfill 6 bài đọc Reading (15 câu), Writing và 8 câu Speaking trên 3 viewport"`:
       - Gọi `await clearRateLimits();` đầu test (tránh HTTP `429` từ `LEAD_IP_MAX = 3`).
       - Đọc hàng `placement_test` hiện tại của `LEAD_ORG_ID` (`draft, published, revision, published_revision, published_version, published_at`), lưu tạm.
       - Bọc toàn bộ phần test trong `try { ... } finally { await restoreRow(savedRow); }` để dù test pass hay fail/retry đều khôi phục nguyên trạng bản 5 kỹ năng cho các test khác.
       - Ghi JSON `published` dạng `version: 1` (15 câu `vocab-grammar` + 5 clip / 15 câu `listening` = `30` câu khách quan `v1` trước nâng cấp) vào SQLite cho `LEAD_ORG_ID`.
       - Mở `${PROFILE_ORIGIN}/kiem-tra-dau-vao/`, bấm `#startTestBtn`, điền lead gate hợp lệ (`uniquePhone()`), vào Step `1. Listening`, kiểm `.progress-counter` chứa `"Đã trả lời 0/45 câu khách quan"`!
       - Bấm sang Step `3. Reading`, kiểm `.progress-counter` vẫn là `"0/45 câu khách quan"`, tất cả `6` thẻ `.reading-passage-card` (`CITY SWIMMING POOL` đến `Working from home`) và `15` fieldset câu hỏi hiển thị rõ; tick chọn 1 đáp án Reading và kiểm `.progress-counter` tăng lên `"Đã trả lời 1/45 câu khách quan"`.
       - Quét 4 kích thước `{ width: 1440, height: 900 }`, `{ width: 768, height: 1024 }`, `{ width: 375, height: 812 }`, `{ width: 320, height: 568 }` kiểm `scrollWidth <= clientWidth` = `false` overflow; khi `process.env.CAPTURE_POT_ISSUE` được truyền, chụp `plans/reports/${process.env.CAPTURE_POT_ISSUE}-entry-test-reading-${vp.label}.png` cho 3 viewport chuẩn (`1440x900`, `768x1024`, `375x812`), và chụp khi có ít nhất 1 passage + câu hỏi Reading đang hiển thị trong khung hình.
       - Bấm sang Step `4. Writing` kiểm tiêu đề `"Email to a friend"`; bấm sang Step `5. Speaking` kiểm `"Danh sách 8 câu hỏi Speaking"`.
  2. Chạy targeted E2E spec (với `CAPTURE_POT_ISSUE=<ISSUE_NUMBER>` lấy từ issue đã tạo ở Step 2 trước khi chạy Phase 1):
     ```bash
     CAPTURE_POT_ISSUE=<ISSUE_NUMBER> E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/profile-placement-test.spec.ts
     ```
  3. Dùng `read_file` xem trực tiếp cả 3 file PNG trong `plans/reports/<ISSUE_NUMBER>-entry-test-reading-*.png` để xác nhận nội dung Reading hiển thị rõ nét, không lỗi chữ hay cắt khung.
  4. Chạy thêm 1 lượt không có `CAPTURE_POT_ISSUE` (nếu cần) hoặc kiểm `git status` chắc chắn spec không ghi file thừa vào `plans/reports/` ngoài 3 file POT + 721 có sẵn.
- **Success criteria:** Targeted E2E spec pass 100%, 3 ảnh POT Reading rõ nét tại 3 viewport, 0 horizontal overflow (kể cả 320px).
- **Verify:** `CAPTURE_POT_ISSUE=<ISSUE_NUMBER> E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/profile-placement-test.spec.ts` exits `0`.

### Task 2.4 — Chạy toàn bộ Quality Gates tại local

- **Goal:** Xác nhận format/lint, typecheck và toàn bộ unit/integration test của monorepo đều xanh trước khi Review & Ship Beta.
- **Target files & symbols:** Toàn workspace
- **Steps:**
  1. Kiểm tra `node -v` là `v24.x`.
  2. Chạy `pnpm check:fix && pnpm check`.
  3. Chạy `pnpm check-types`.
  4. Chạy `pnpm test`.
- **Success criteria:** Tất cả các lệnh đều exit `0`, không có cảnh báo hay lỗi bỏ sót.
- **Verify:** `pnpm check && pnpm check-types && pnpm test` exits `0`, sau đó chạy `ak plan phase close teacher-os/261115-0320 2 --no-interactive --json`.

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
