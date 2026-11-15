---
title: "fix(placement-test): backfill reading, writing, and speaking on legacy v1 snapshots"
description: "Khắc phục lỗi phần Reading (cùng Writing và Speaking kế tiếp) bị trống trên /kiem-tra-dau-vao/ khi D1 placement_test.published đang lưu snapshot v1 cũ, kết hợp defense-in-depth trên apps/profile và E2E 3 viewport."
status: completed
priority: P1
effort: "2h"
tags: ["placement-test", "bugfix", "profile", "api", "tdd"]
created: 2026-11-15
---

# fix(placement-test): backfill reading, writing, and speaking on legacy v1 snapshots

<!-- Updated: Red Team Session 1 - adjudicated 8 deduplicated findings from Security Adversary & Assumption Destroyer, reconciled Phase 1 & Phase 2 -->

## Overview

- **Triệu chứng trên Staging (`profile.staging.teacheros.io.vn/kiem-tra-dau-vao/`):** Khi học viên làm tới tab `3. Reading`, thanh tiến độ hiển thị `Đã trả lời 30/30 câu khách quan`, khối giới thiệu `Phần 3 / 5 · Đọc hiểu` hiển thị bình thường nhưng ngay bên dưới chỉ có nút điều hướng (`← Quay lại Grammar & Vocabulary`, `Tiếp tục: Writing →`) — hoàn toàn không có bài đọc hay câu hỏi nào.
- **Nguyên nhân gốc đã chứng minh (mã nguồn + `GET https://api.staging.teacheros.io.vn/public/placement-test`):**
  1. D1 `placement_test.published` trên Staging và Production vẫn đang lưu bản snapshot `version: 1` (gồm 2 phần: 15 câu `vocab-grammar` + 5 đoạn `listening` / 15 câu, tổng 30 câu).
  2. Trong `packages/api/src/placement-test-contracts.ts`, cả `normalizePublishedPlacementSnapshot` (`lines 1221–1340`) lẫn `upgradeLegacyPlacementContent` (`lines 1137–1214`) nâng cấp dữ liệu `v1 -> v2` bằng cách gán stub rỗng (`reading.passages: []`, `writing.promptTitle/promptBody: ""`, `speaking.tasks: []`).
  3. Trên `apps/profile/public/kiem-tra-dau-vao/test.js`, các hàm `renderReadingStep`, `renderWritingStep`, `renderSpeakingStep`, `handleRequestSubmit`, `renderResultStep` và `init` chưa có fallback phòng thủ khi các phần này rỗng hoặc khi `localStorage` được khôi phục sang bản đã backfill.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Backfill canonical 3 kỹ năng thuần văn bản (`reading`, `writing`, `speaking`) trong `packages/api` cho snapshot/draft `v1` và fallback phòng thủ `v2`, tôn trọng trần 100 câu, không đụng D1/R2 hay làm mất đáp án Listening/G&V | P1 |
| 2 | Bổ sung defense-in-depth UI + pure helpers trong `apps/profile/public/kiem-tra-dau-vao/grading.js` + `test.js` khi dữ liệu rỗng hoặc học viên tải lại trang giữa chừng | P1 |
| 3 | Kiểm chứng TDD (unit + server route + profile pure/static + E2E `.serial` cô lập trên 3 viewport `1440x900`, `768x1024`, `375x812`) và release `--beta` lên `develop` | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Backfill canonical 3 kỹ năng trong @teacher-os/api & apps/server](./phase-01-start.md) | Done |
| 2 | [Phase 2: Defense-in-depth trên apps/profile, E2E 3 viewport & Full Gates](./phase-02-profile-defensive-rendering-and-e2e.md) | Done |

## Advisor Scope Lock

### Root Cause Confirmed
- Dữ liệu `placement_test.published` trên D1 (staging & production) đang là bản legacy `v1` (2 phần: Grammar & Vocabulary + Listening, `version: 1`).
- `normalizePublishedPlacementSnapshot` (`packages/api/src/placement-test-contracts.ts:1221-1340`) và `upgradeLegacyPlacementContent` (`packages/api/src/placement-test-contracts.ts:1137-1214`) nâng cấp cấu trúc `v1 -> v2` (5 kỹ năng) nhưng gán rỗng cứng cho 3 kỹ năng mới (`reading.passages: []`, `writing.promptTitle/promptBody: ""`, `speaking.tasks: []`), trong khi `apps/profile/public/kiem-tra-dau-vao/test.js` chưa có fallback hiển thị/nộp bài khi các phần này rỗng.

### In-Scope (Locked)
1. **`@teacher-os/api` Canonical 3-Skill Backfill (`packages/api/src/placement-test-defaults.ts` & `placement-test-contracts.ts`):**
   - Định nghĩa bộ mặc định chuẩn qua factory trả bản sao sâu mới (thuần text/JSON, không phụ thuộc R2 audio) cho `reading` (6 passages `ra..rf`, 15 câu `r-a1..r-f6`), `writing` (`Email to a friend`, 50–80 từ) và `speaking` (8 tasks `s-01..s-08`), khớp tuyệt đối với `apps/web/public/placement-seed/questions.json` (có unit test chống lệch seed).
   - `buildUpgradedLegacyBands`: chuẩn hoá `course` lạ về `"comm-1"` trước khi tính `courseLabel`/`displayCourse` để đồng bộ với `LEAD_COURSE_LABELS`, và tránh `curr.min <= prev.max` nếu làm tròn chạm 100 trước band cuối.
   - `normalizePublishedPlacementSnapshot`:
     - Nhánh legacy `v1`: điền đầy đủ `reading`, `writing`, `speaking` mặc định (tôn trọng ngân sách `PLACEMENT_MAX_QUESTIONS = 100`, chống trùng mọi `questionId`/`passageId` trong 64 ký tự `PLACEMENT_ID_REGEX`), giữ nguyên `version: v1.data.version` để bảo toàn đáp án `listening`/`vocabGrammar` trong `localStorage` (`msmy_placement_attempt_v2`).
     - Nhánh `v2`: backfill phòng thủ đối xứng ngân sách 100 câu khi `reading.passages.length === 0`, giữ trọn cặp mặc định cho `writing` nếu `promptBody` rỗng (hoặc `"Bài viết ngắn"` nếu chỉ thiếu `promptTitle`) kèm kẹp `maxWords = Math.max(minWords, maxWords)`, và backfill `speaking.tasks` khi rỗng.
   - `upgradeLegacyPlacementContent`:
     - Chỉ backfill 3 kỹ năng mặc định cho nhánh legacy `v1` (tôn trọng trần `PLACEMENT_MAX_QUESTIONS = 100`, chống va chạm ID; nháp `v1` hợp lệ với `< 100` câu, `<= 20` clips, `<= 8` bands và ID chuẩn `PLACEMENT_ID_REGEX` kèm audio hợp lệ sẽ pass `validatePlacementForPublish` trả `[]`).
     - Giữ nguyên nhánh `v2` (`placementContentSchema`) để không tự bơm lại dữ liệu mặc định khi giáo viên đang chủ động xoá/sửa nháp `v2`.
   - `buildPlacementZaloText`: bổ sung nhãn `"không có bài nói"` khi `speakingStatus === "none"`.
2. **Client Defense-in-Depth (`apps/profile/public/kiem-tra-dau-vao/grading.js` & `test.js`):**
   - Tách 6 pure decision helpers sang ES module `grading.js` để `apps/profile/tests/placement-test.test.mjs` kiểm chứng trực tiếp bằng `node --test` không cần JSDOM.
   - `test.js`: chuyển hướng học viên về bước `"reading"` kèm thông báo nếu khôi phục `localStorage` ở `"writing"`/`"speaking"` với `reading` rỗng đáp án trên đề đã backfill; hiển thị `#readingEmptyNotice`, hướng dẫn Writing dự phòng, `#speakingEmptyNotice` (ẩn `#speakingRecorderCard` ở `line 2787`), ưu tiên `!hasSpeakingTasks ? "none"` trong `handleRequestSubmit()`, và hiển thị nhãn `speakingStatus === "none"` chính xác trong `renderResultStep()`.
   - Tuân thủ bất biến của `apps/profile/tests/placement-test.test.mjs`: tuyệt đối không để chuỗi `/30\s*câu/i` xuất hiện bất kỳ đâu dưới `apps/profile/public/`.
3. **Tests & Verification Gates:**
   - Cập nhật 2 test hiện hữu đang assert `reading.total === 0` trên v1 (`packages/api/src/placement-test-contracts.test.ts:454`, `apps/server/src/routes/public-placement-test.test.ts:687-698`), mở rộng `apps/server/src/routes/placement-test.test.ts`, bổ sung test seed-sync/deep-clone/collision/cap-100/v2-fallback/band-overlap, test pure helpers của `grading.js` trong `apps/profile/tests/placement-test.test.mjs`, và E2E `test.describe.serial` với `try/finally` khôi phục row D1 + `clearRateLimits()` trên `apps/e2e/specs/profile-placement-test.spec.ts` kèm screenshot 3 viewport (chỉ ghi `plans/reports/` khi bật `CAPTURE_POT_ISSUE=<ISSUE_NUMBER>`).

### Explicit Non-Goals
- Không thay đổi D1 schema/migrations hay chạy script ghi đè dữ liệu D1/R2 trực tiếp.
- Không thay đổi nội dung câu hỏi/audio Listening & Grammar-Vocabulary đã phát hành của tổ chức.
- Không sửa `apps/server/src/routes/leads.ts` (`sub.snapshotJson` của các bài đã nộp trước đó giữ nguyên trạng thái đóng băng lịch sử lúc nộp).
- Không thay đổi hành vi lưu nháp `v2` của giáo viên trên `/placement-test`.

## Success Criteria

- [x] `pnpm --filter @teacher-os/api test` pass 100% (bao gồm seed-sync drift check, deep-clone isolation, ID collision `<= 64` chars, `PLACEMENT_MAX_QUESTIONS = 100` cap đối xứng, `buildUpgradedLegacyBands` course/overlap, `v1` & `v2` backfill, và `buildPlacementZaloText` với `speakingStatus: "none"`).
- [x] `pnpm --filter server test src/routes/public-placement-test.test.ts src/routes/placement-test.test.ts src/routes/leads-placement-submission.test.ts` pass 100%.
- [x] `pnpm --filter profile test && pnpm --filter profile build` pass 100% (kiểm trực tiếp các helper của `grading.js` và bất biến không chứa `30 câu` dưới `apps/profile/public/`).
- [x] `CAPTURE_POT_ISSUE=724 E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/profile-placement-test.spec.ts` pass 100%, xác nhận `/kiem-tra-dau-vao/` hiển thị đủ 6 bài đọc (`15` câu, tổng `45 câu khách quan`), Writing và 8 câu Speaking trên snapshot `v1` ở 3 viewport (`1440×900`, `768×1024`, `375×812`) + `320×568` không tràn ngang.
- [x] `pnpm exec biome check .`, `pnpm check-types`, `pnpm test` đều exit `0`.

## Validation Log

### Verification Results (Session — 2026-11-15)
- **Tier:** Light (2 phases; Fact Checker + caller inventory spot-checked across touched packages)
- **Claims checked:** 12
- **Verified:** 12 | **Failed:** 0 | **Unverified:** 0
  - `VERIFIED`: `packages/api/src/placement-test-contracts.ts` (`upgradeLegacyPlacementContent:1137`, `normalizePublishedPlacementSnapshot:1221`, `buildUpgradedLegacyBands:1078`, `buildPlacementZaloText:1804`, `PLACEMENT_MAX_QUESTIONS=100:28`, `PLACEMENT_ID_REGEX:18`).
  - `VERIFIED`: Callers of `normalizePublishedPlacementSnapshot` / `upgradeLegacyPlacementContent` via `git grep`: only `apps/server/src/routes/placement-test.ts:50`, `apps/server/src/routes/public-placement-test.ts:109`, and `packages/api/src/placement-test-contracts.test.ts`; `apps/server/src/routes/leads.ts:42,502` uses `JSON.parse(sub.snapshotJson)` directly.
  - `VERIFIED`: `apps/profile/public/kiem-tra-dau-vao/test.js` imports `./grading.js:1-6`, `renderIntroStep:979`, `renderReadingStep:1828`, `renderWritingStep:1933`, `handleRequestSubmit:2213`, `renderSpeakingStep:2259-2900` (`recorderCard` appended at `2787`), `renderResultStep:2902` (`speakingStatus:2982-2990`), `init:3390-3419`.
  - `VERIFIED`: `apps/profile/package.json` has no DOM library (`node --test tests/*.test.mjs`); `apps/profile/tests/placement-test.test.mjs:37,40-54,251-261` enforces no `/30\s*câu/i` inside `apps/profile/public/`.
  - `VERIFIED`: `.github/workflows/e2e.yml:27-30,46` uses `--fully-parallel`, `packages/db/src/schema/placement-test.ts:14` defines `orgId` as PK, `apps/server/src/routes/public-leads.ts:27-29` enforces `LEAD_IP_MAX = 3`.
- **Gate Disposition:** `Failed: 0` (autonomous `/ak-vibe --ship --beta --advice` mode; all technical findings resolved deterministically without interactive ambiguity).

## Red Team Review

### Session — 2026-11-15
**Reviewers:** `Security Adversary` (fact-checked) + `Assumption Destroyer` (fact-checked) (`code-reviewer` subagents)
**Findings (deduplicated across 14 raw items):** 8 unique findings (2 Critical, 4 High, 2 Medium) — **all 8 Accepted** and folded directly into `phase-01-start.md` and `phase-02-profile-defensive-rendering-and-e2e.md`

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `apps/profile` thiếu JSDOM & `test.js` auto-run không có export — đổi sang export pure helpers trong ES module `grading.js` để `node --test` kiểm chứng trực tiếp | Critical | Accept | `phase-02-profile-defensive-rendering-and-e2e.md` (Tasks 2.1, 2.2), `plan.md` |
| 2 | Test E2E `v1` sửa row singleton `placement_test` dưới `--fully-parallel`, thiếu `await` cho PRAGMA và thiếu `clearRateLimits()` — chuyển `test.describe.serial`, bọc `try/finally` khôi phục row, gọi `await clearRateLimits()`, chốt fixture `30 -> 45 câu` | Critical | Accept | `phase-02-profile-defensive-rendering-and-e2e.md` (Task 2.3), `plan.md` |
| 3 | Học viên reload `localStorage` giữ `step: "writing"/"speaking"` khi server backfill 15 câu Reading — tự chuyển hướng sang `"reading"` khi `answers.reading` rỗng trên đề có Reading | High | Accept (partial — redirect on reload; keep `placementPublicSubmitSchema.strict()` unchanged) | `phase-02-profile-defensive-rendering-and-e2e.md` (Tasks 2.1, 2.2) |
| 4 | `upgradeLegacyPlacementContent` lệch `displayCourse`, chồng lấn `bands` ở mốc 100, và bất đối xứng trần `100` câu với `normalizePublishedPlacementSnapshot` — đồng bộ ngân sách 100 câu cả hai hàm, chuẩn hoá `course` trước `displayCourse`, giữ monotonicity trong `buildUpgradedLegacyBands` | High | Accept | `phase-01-start.md` (Tasks 1.1, 1.3), `plan.md` |
| 5 | `normalizePublishedPlacementSnapshot` nhánh `v2` ghép nhầm `promptTitle` tuỳ biến với `promptBody` mặc định & bỏ sót `minWords > maxWords` — lấy trọn cặp mặc định khi `promptBody` rỗng, `"Bài viết ngắn"` khi chỉ thiếu `promptTitle`, và kẹp `maxWords = Math.max(minWords, maxWords)` | High | Accept | `phase-01-start.md` (Tasks 1.1, 1.3), `plan.md` |
| 6 | Thứ tự ưu tiên `speakingFinalMode` & xử lý `speakingStatus === "none"` trong `renderResultStep` + `buildPlacementZaloText` — kiểm tra `!hasSpeakingTasks` trước `hasValidBlob` và xử lý `"none"` đồng bộ | High | Accept (scoped to `test.js`, `grading.js`, `placement-test-contracts.ts`) | `phase-01-start.md` (Task 1.3), `phase-02-profile-defensive-rendering-and-e2e.md` (Tasks 2.1, 2.2) |
| 7 | `dedupeReadingPassages` thiếu thu thập `usedPassageIds`, thiếu vòng lặp cập nhật Set và cắt độ dài `<= 64` ký tự `PLACEMENT_ID_REGEX` — thêm `allocateUniquePlacementId` + thu thập đủ `usedPassageIds` | Medium | Accept | `phase-01-start.md` (Tasks 1.2, 1.3) |
| 8 | Sửa số dòng (`238–295`, `2259–2900`, `2787`) và khóa ghi ảnh POT trong `plans/reports/` sau biến môi trường `CAPTURE_POT_ISSUE` để không làm bẩn repo trên CI | Medium | Accept | `phase-01-start.md` (Task 1.1), `phase-02-profile-defensive-rendering-and-e2e.md` (Tasks 2.2, 2.3) |

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-profile-defensive-rendering-and-e2e.md`
- Decision deltas checked: 8
- Reconciled stale references: 8 (pure exports moved to `grading.js`, `v2` Writing pair fallback rule aligned, `100`-question cap mirrored between draft & snapshot, `speakingMode: "none"` handled consistently across `grading.js`/`test.js`/`buildPlacementZaloText`, E2E `.serial` + `try/finally` + `CAPTURE_POT_ISSUE` reconciled)
- Unresolved contradictions: 0

<!-- slug: fix-placement-reading-empty -->
