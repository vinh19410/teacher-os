---
phase: 1
title: "Phase 1: Backfill canonical 3 kỹ năng trong @teacher-os/api & apps/server"
status: todo
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Backfill canonical 3 kỹ năng trong `@teacher-os/api` & `apps/server`

<!-- Updated: Red Team Session 1 - fixed line refs, buildUpgradedLegacyBands, symmetric 100-cap, Writing pair rule, iterative ID dedupe, and Zalo 'none' status -->

## Goal

Đảm bảo cả `normalizePublishedPlacementSnapshot` (dùng bởi `GET /public/placement-test` và `POST /public/placement-test/submissions`) lẫn `upgradeLegacyPlacementContent` (dùng bởi `GET /api/placement-test`) tự động điền đầy đủ 3 phần `reading` (tối đa 6 bài đọc / 15 câu trong giới hạn `PLACEMENT_MAX_QUESTIONS = 100`), `writing` (`Email to a friend`), và `speaking` (8 câu) từ bộ chuẩn thuần text/JSON khi dữ liệu D1 ở định dạng `v1` cũ hoặc thiếu nội dung phòng thủ ở `v2`, đồng thời bảo toàn Listening & Grammar-Vocabulary hiện có, chuẩn hoá `band` không chồng lấn, chống trùng mọi ID trong 64 ký tự và giữ nguyên `leads.ts`.

## Files to Create / Modify

- Create: `packages/api/src/placement-test-defaults.ts`
- Modify: `packages/api/src/placement-test-contracts.ts` (`buildUpgradedLegacyBands`, `upgradeLegacyPlacementContent`, `normalizePublishedPlacementSnapshot`, `buildPlacementZaloText`)
- Modify: `packages/api/src/placement-test-contracts.test.ts`
- Modify: `apps/server/src/routes/public-placement-test.test.ts`
- Modify: `apps/server/src/routes/placement-test.test.ts`

## Todo

- [ ] Task 1.1 — Viết TDD Red tests cho backfill `v1 -> v2`, seed-sync, deep-clone, collision & cap 100
- [ ] Task 1.2 — Tạo module dữ liệu chuẩn `packages/api/src/placement-test-defaults.ts`
- [ ] Task 1.3 — Cập nhật `buildUpgradedLegacyBands`, `upgradeLegacyPlacementContent`, `normalizePublishedPlacementSnapshot` & `buildPlacementZaloText` (Green)

## Tasks & Steps

### Task 1.1 — Viết TDD Red tests cho backfill `v1 -> v2`, seed-sync, deep-clone, collision & cap 100

- **Goal:** Xác lập bộ kiểm thử thất bại (Red) trước khi sửa logic hợp đồng và route.
- **Target files & symbols:**
  - `packages/api/src/placement-test-contracts.test.ts` (`lines 238–295` và `lines 372–459`)
  - `apps/server/src/routes/public-placement-test.test.ts` (`lines 587–699`)
  - `apps/server/src/routes/placement-test.test.ts` (`lines 682–750`)
- **Steps:**
  1. Trong `packages/api/src/placement-test-contracts.test.ts`:
     - Cập nhật test `normalizePublishedPlacementSnapshot` (`lines 372–459`): khẳng định `normalized.version === 3` (giữ nguyên version v1), `normalized.parts[2]` (`reading`) có `6` passages / `15` câu, `parts[3]` (`writing`) có `promptTitle: "Email to a friend"` và `promptBody` không rỗng, `parts[4]` (`speaking`) có `8` tasks; kiểm tra `gradePlacementObjective` với `reading: {}` cho `reading: { correct: 0, total: 15, pct: 0 }`, và khi điền đủ 15 đáp án đúng cho `reading` thì cho `reading: { correct: 15, total: 15, pct: 100 }`, `averagePct: 100`, `provisionalBand.cefr: "B1"`.
     - Cập nhật test `upgradeLegacyPlacementContent` (`lines 238–295`): khẳng định nháp `v1` nâng cấp lên có đủ 6 passages Reading, Writing prompt, 8 tasks Speaking, và vượt qua `placementContentSchema.safeParse`; bổ sung assertion cho nháp `v1` có `audioId` hợp lệ, `< 100` câu khách quan, `<= 20` clips, `<= 8` bands và ID khớp `PLACEMENT_ID_REGEX` sẽ trả `[]` từ `validatePlacementForPublish(...)`, kể cả khi có `course` lạ không kèm `courseLabel` (cả `course` và `displayCourse` đều chuẩn hoá về `"comm-1"` / `"Giao tiếp 1"`) hoặc band trung gian làm tròn chạm `100` (không chồng lấn `min <= prev.max`).
     - Bổ sung các test mới:
       - **Seed-sync test:** dùng `node:fs` + `fileURLToPath(new URL("../../../apps/web/public/placement-seed/questions.json", import.meta.url))` trong file test đối chiếu 3 phần `parts[2]`, `parts[3]`, `parts[4]` khớp tuyệt đối với `createDefaultPlacementReadingPart()`, `createDefaultPlacementWritingPart()`, `createDefaultPlacementSpeakingPart()`.
       - **Deep-clone isolation:** sửa trực tiếp object trả về lần 1 không làm bẩn lần gọi thứ 2.
       - **ID-collision guard:** khi nháp/published `v1` tự đặt sẵn đồng thời `"r-a1"` và `"r-a1-d1"` hoặc ID dài 64 ký tự trong `vocab-grammar`/`listening`, helper cấp phát ID duy nhất khớp `PLACEMENT_ID_REGEX` (`<= 64` ký tự), không trùng lặp sau `validatePlacementForPublish`.
       - **Cap 100 câu đối xứng giữa draft và published:** khi cả `upgradeLegacyPlacementContent` và `normalizePublishedPlacementSnapshot` nhận đề `v1` (hoặc `v2` rỗng Reading) có sẵn `95` câu khách quan, chỉ backfill tối đa `5` câu Reading sao cho tổng `<= PLACEMENT_MAX_QUESTIONS` (`100`) và `placementContentSchema.safeParse` pass.
       - **Giữ nguyên nháp `v2`:** `upgradeLegacyPlacementContent` trên nháp `v2` có `reading.passages: []` vẫn giữ `[]`.
       - **Phòng thủ snapshot `v2` rỗng trong `normalizePublishedPlacementSnapshot`:**
         - Reading rỗng (`passages: []`) -> backfill 6 passages (tối đa `remainingBudget`).
         - Writing: nếu `promptBody` rỗng (dù có `promptTitle` tuỳ biến) -> backfill trọn cặp `defaultWriting.promptTitle` + `defaultWriting.promptBody` để tránh đề bài mâu thuẫn; nếu `promptBody` có nội dung nhưng `promptTitle` rỗng -> giữ `promptBody` và đặt `promptTitle: "Bài viết ngắn"`; nếu `minWords > maxWords` -> kẹp `maxWords = minWords`.
         - Speaking rỗng (`tasks: []`) -> backfill 8 tasks mặc định.
       - **`buildPlacementZaloText` với `speakingStatus: "none"`:** in `"Speaking: không có bài nói"` thay vì `"chưa chấm"`.
  2. Trong `apps/server/src/routes/public-placement-test.test.ts` (`lines 587–699`):
     - Khẳng định `GET /public/placement-test` trả `served.parts[2].passages` dài `6` (15 câu), `served.parts[3].promptBody.length > 0`, `served.parts[4].tasks` dài `8`.
     - Lấy toàn bộ đáp án đúng Reading từ `served.parts[2].passages` gửi lên `POST /public/placement-test/submissions` và khẳng định `objective.reading` là `{ correct: 15, total: 15, pct: 100 }`, `averagePct === 100`, `provisionalBand.cefr === "B1"`.
  3. Trong `apps/server/src/routes/placement-test.test.ts` (`lines 682–750`):
     - Khẳng định `GET /api/placement-test` trên draft `v1` trả `body.draft?.parts[2].passages` dài `6`, `promptTitle === "Email to a friend"`, và `tasks` dài `8`.
- **Success criteria:** Các assertion mới/cập nhật phản ánh đúng hợp đồng backfill 3 kỹ năng và thất bại khi chưa sửa `packages/api`.
- **Verify:** `pnpm --filter @teacher-os/api test && pnpm --filter server test src/routes/public-placement-test.test.ts src/routes/placement-test.test.ts` exits non-zero với lỗi assertion thiếu file/dữ liệu backfill (passing tại thời điểm này là sai quy trình Red).

### Task 1.2 — Tạo module dữ liệu chuẩn `packages/api/src/placement-test-defaults.ts`

- **Goal:** Cung cấp bộ dữ liệu mặc định 3 kỹ năng thuần text/JSON kèm factory clone sâu, bộ cấp phát ID không va chạm <= 64 ký tự và giới hạn ngân sách câu hỏi.
- **Target files & symbols:**
  - `packages/api/src/placement-test-defaults.ts` (`createDefaultPlacementReadingPart`, `createDefaultPlacementWritingPart`, `createDefaultPlacementSpeakingPart`, `allocateUniquePlacementId`, `dedupeReadingPassages`)
- **Steps:**
  1. Tạo `packages/api/src/placement-test-defaults.ts` chỉ import type từ `./placement-test-contracts` (tuyệt đối không import runtime từ `apps/web`).
  2. Định nghĩa nội dung 3 phần `reading` (`ra..rf`, `r-a1..r-f6`), `writing` (`Email to a friend`, 50–80 từ) và `speaking` (`s-01..s-08`) trùng khớp 100% với `apps/web/public/placement-seed/questions.json`.
  3. Export 3 factory functions luôn trả bản clone sâu (`passages.map(...)`, `questions.map(...)`, `options: [...q.options]`, `tasks.map(...)`).
  4. Export `allocateUniquePlacementId(rawId: string, usedIds: Set<string>, tag = "d"): string`: nếu `rawId` không nằm trong `usedIds` (và dài `<= 64`), `usedIds.add(rawId)` và trả về `rawId`; nếu trùng, lặp `i = 1, 2, ...` tạo `suffix = `-${tag}${i}``, cắt prefix còn `Math.max(1, 64 - suffix.length)` ký tự để `${prefix}${suffix}` khớp `/^[a-zA-Z0-9_-]{1,64}$/` và chưa tồn tại trong `usedIds`, sau đó `usedIds.add(candidate)` rồi trả về.
  5. Export `dedupeReadingPassages(passages, usedQuestionIds, usedPassageIds, maxQuestions?)`: duyệt từng passage, dừng khi hết `maxQuestions` (nếu có); chỉ giữ passage có `>= 1` câu sau khi cắt theo ngân sách; cấp phát ID passage/question qua `allocateUniquePlacementId` và trả bản clone sâu.
- **Success criteria:** File biên dịch sạch với `tsc -b`, không có phụ thuộc runtime chéo workspace.
- **Verify:** No verification needed yet (Task 1.3 wires and executes the full suite).

### Task 1.3 — Cập nhật `buildUpgradedLegacyBands`, `upgradeLegacyPlacementContent`, `normalizePublishedPlacementSnapshot` & `buildPlacementZaloText` (Green)

- **Goal:** Hoàn tất logic backfill trong `@teacher-os/api` và đạt trạng thái Green toàn bộ test `@teacher-os/api` và `apps/server`.
- **Target files & symbols:**
  - `packages/api/src/placement-test-contracts.ts` (`buildUpgradedLegacyBands`, `upgradeLegacyPlacementContent`, `normalizePublishedPlacementSnapshot`, `buildPlacementZaloText`)
- **Steps:**
  1. Trong `buildUpgradedLegacyBands(rawBands, oldTotal)` (`lines 1078–1131`):
     - Chuẩn hoá `normalizedCourse = LEAD_COURSE_SET.has(b.course) ? (b.course as LeadCourse) : ("comm-1" as LeadCourse)` TRƯỚC khi tính `courseLabel` & `displayCourse` (`b.courseLabel?.trim() || LEAD_COURSE_LABELS[normalizedCourse]`), để `course` và `displayCourse` luôn đồng bộ hợp lệ.
     - Trong vòng cân chỉnh biên `0..100` (`lines 1118–1128`): kẹp mỗi mốc sao cho `prev.max` không chạm `100` trước band cuối (khi `rawBands.length <= 101`, đảm bảo mọi band `0 < prev.max < curr.min <= curr.max <= 100` không chồng lấn).
  2. Tạo helper nội bộ `collectObjectiveIds(listeningClips, vgQuestions, readingPassages)` thu thập đồng bộ cả `usedQuestionIds` lẫn `usedPassageIds` và tổng số câu khách quan hiện có `existingObjectiveCount`, tính `remainingBudget = Math.max(0, PLACEMENT_MAX_QUESTIONS - existingObjectiveCount)`.
  3. Trong `upgradeLegacyPlacementContent(raw)` (`lines 1137–1214`):
     - Giữ nguyên early-return cho `v2` (`placementContentSchema.safeParse(raw)`).
     - Nhánh `v1`: dùng `buildUpgradedLegacyBands` đã chuẩn hoá, tính `remainingBudget`, điền `reading` qua `dedupeReadingPassages(createDefaultPlacementReadingPart().passages, usedQuestionIds, usedPassageIds, remainingBudget)`, `writing` qua `createDefaultPlacementWritingPart()`, `speaking` qua `createDefaultPlacementSpeakingPart()`.
  4. Trong `normalizePublishedPlacementSnapshot(raw)` (`lines 1221–1340`):
     - Nhánh `v2`: dùng `collectObjectiveIds` và `remainingBudget`. Nếu `reading.passages.length === 0`, backfill qua `dedupeReadingPassages(createDefaultPlacementReadingPart().passages, usedQuestionIds, usedPassageIds, remainingBudget)`. Với `writing`: kẹp `minWords = writing.minWords; maxWords = Math.max(minWords, writing.maxWords)`; nếu `writing.promptBody.trim().length === 0`, lấy trọn cặp `promptTitle` + `promptBody` từ `createDefaultPlacementWritingPart()`, còn nếu `promptBody` có chữ mà `promptTitle.trim().length === 0` thì dùng `"Bài viết ngắn"`. Nếu `speaking.tasks.length === 0`, lấy `createDefaultPlacementSpeakingPart().tasks`.
     - Nhánh `v1`: tính `remainingBudget`, điền `reading` qua `dedupeReadingPassages(..., remainingBudget)`, `writing` qua `createDefaultPlacementWritingPart()`, `speaking` qua `createDefaultPlacementSpeakingPart()`, và giữ nguyên `version: v1.data.version`.
  5. Trong `buildPlacementZaloText` (`lines 1821–1826`): thêm nhánh `params.speakingStatus === "none" ? "không có bài nói"` trước fallback `"chưa chấm"`.
  6. Giữ nguyên `apps/server/src/routes/leads.ts` (`JSON.parse(sub.snapshotJson)` không thay đổi).
- **Success criteria:** Toàn bộ test của `@teacher-os/api` và các route placement/leads của `apps/server` đều pass; `tsc -b` không lỗi.
- **Verify:** `pnpm --filter @teacher-os/api check-types && pnpm --filter @teacher-os/api test && pnpm --filter server test src/routes/public-placement-test.test.ts src/routes/placement-test.test.ts src/routes/leads-placement-submission.test.ts` exits `0`.

## Verification

- `pnpm --filter @teacher-os/api check-types && pnpm --filter @teacher-os/api test` exits `0`.
- `pnpm --filter server check-types && pnpm --filter server test src/routes/public-placement-test.test.ts src/routes/placement-test.test.ts src/routes/leads-placement-submission.test.ts` exits `0`.
- `ak plan phase close teacher-os/261115-0320 1 --no-interactive --json` exits `0`.

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
