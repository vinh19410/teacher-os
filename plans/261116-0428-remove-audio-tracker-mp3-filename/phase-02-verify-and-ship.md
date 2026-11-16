---
phase: 2
title: "Phase 2: E2E Verification, Review & Beta Ship"
status: pending
priority: P1
effort: "40m"
dependencies: [1]
---

# Phase 2: E2E Verification, Review & Beta Ship

## Goal
Cập nhật kiểm chứng E2E trong `apps/e2e/specs/study-pack.spec.ts` (teacher `"Làm thử"`, student `take` + `review`, responsive 3 viewport × 2 theme + reflow `320×568`, chụp 7 ảnh POT `#732`), khôi phục 17 ảnh lịch sử, chạy đủ local quality gates, thực hiện review độc lập + giám sát `kongming`, cập nhật `CHANGELOG.md` / journal, mở PR vào `develop`, squash-merge, chờ CI + Deploy Staging xanh, và đăng nhận xét `kongming` + POT lên PR/Issue `#732`.

## Files to Create / Modify
- Modify: `apps/e2e/specs/study-pack.spec.ts`
- Modify: `CHANGELOG.md`
- Create: `plans/journals/<date>-remove-audio-tracker-mp3-filename-732.md`
- Create: `plans/reports/732-quiz-audio-take-{desktop-1440x900,tablet-768x1024,mobile-375x812}-{light,dark}.png`
- Create: `plans/reports/732-quiz-audio-review-desktop-1440x900-light.png`

## Tasks & Steps

### Task 2.1 — Cập nhật `apps/e2e/specs/study-pack.spec.ts` & Chụp 7 ảnh POT `#732`
- **Goal:** Xác nhận trên trình duyệt thật không còn hiển thị `education.mp3` hay `🔊` ở tab `"Làm thử"` của giáo viên, màn `take` và màn `review` của học viên, kiểm tra responsive + dark/light + `320×568`, và chụp đủ 7 ảnh POT khi `CAPTURE_POT_ISSUE=732`.
- **Target files and symbols:** `apps/e2e/specs/study-pack.spec.ts` (dòng `515–524` và `608–658`).
- **Steps:**
  1. Ở tab `"Làm thử"` phía giáo viên (dòng `~518`, sau `await expect(page).toHaveURL(/tab=sim/);`): đợi `const simAudio = page.getByTestId("quiz-audio-player"); await expect(simAudio).toBeVisible(); await expect(simAudio).toHaveAttribute("aria-label", "Bài nghe"); await expect(simAudio).toHaveAttribute("src", /^blob:/);` rồi assert `await expect(page.getByText("education.mp3")).toHaveCount(0);` và `await expect(page.getByText(/🔊/)).toHaveCount(0);`.
  2. Ở màn `take` của `studentPage` (ngay **sau** dòng `618` nơi chụp `702-student-listening-take-1440x900.png`):
     - Assert `await expect(takeAudio).toHaveAttribute("aria-label", "Bài nghe");`, `await expect(studentPage.getByText("education.mp3")).toHaveCount(0);`, `await expect(studentPage.getByText(/🔊/)).toHaveCount(0);`.
     - Trong khối `try { ... } finally { await studentPage.evaluate(() => document.documentElement.classList.remove("dark")); await studentPage.setViewportSize({ width: 1440, height: 900 }); }`: lặp qua 3 viewport (`desktop-1440x900` 1440×900, `tablet-768x1024` 768×1024, `mobile-375x812` 375×812) × 2 theme (`light`, `dark`), assert `takeAudio` `toBeVisible()` và `scrollWidth <= innerWidth`; nếu `process.env.CAPTURE_POT_ISSUE` có giá trị, lưu `../../plans/reports/${potIssue}-quiz-audio-take-${vp.key}-${theme}.png`; sau đó kiểm tra reflow `320×568` không tràn ngang.
  3. Ở màn `review` của `studentPage` (sau dòng `646`): assert `await expect(reviewAudio).toHaveAttribute("aria-label", "Bài nghe");`, `await expect(studentPage.getByText("education.mp3")).toHaveCount(0);`, `await expect(studentPage.getByText(/🔊/)).toHaveCount(0);`. Nếu `potIssue` có giá trị, chụp thêm `../../plans/reports/${potIssue}-quiz-audio-review-desktop-1440x900-light.png` (dòng `652` vẫn chạy ở `1440×900` như cũ).
  4. Kiểm tra cổng `8100..8105` trống, chạy spec lẻ với `CAPTURE_POT_ISSUE=732`, sau đó khôi phục đủ cả **17 ảnh tracked lịch sử**:
     ```bash
     git checkout -- plans/reports/702-*.png plans/reports/720-*.png plans/261101-1357-533-study-pack-scheduled-release/screenshots/
     ```
     Kiểm tra `git status -s` chỉ giữ thay đổi thuộc task này và dùng `read_file` mở kiểm tra trực quan ít nhất 2 ảnh chụp mới (`732-quiz-audio-take-desktop-1440x900-light.png` và `732-quiz-audio-take-mobile-375x812-dark.png` hoặc `review`).
- **Success criteria:** Spec `apps/e2e/specs/study-pack.spec.ts` pass `2 passed`, đủ 7 ảnh `plans/reports/732-quiz-audio-*.png` tồn tại sắc nét không có `.mp3` hay `🔊`, và 17 ảnh lịch sử được khôi phục nguyên trạng.
- **Verify:** `CAPTURE_POT_ISSUE=732 E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/study-pack.spec.ts && ls -1 plans/reports/732-quiz-audio-*.png | wc -l` exits `0` (`2 passed` và in ra `7`).

### Task 2.2 — Chạy toàn bộ Local Quality Gates (không chạy `design:compare` vì `s-quiz-listening` redirect 409 / không seed audio)
- **Goal:** Xác minh toàn bộ lint, format, typecheck, unit/integration tests đều xanh sạch; giải phóng sạch port `8100..8105`.
- **Target files and symbols:** Toàn repo.
- **Steps:**
  1. Chạy `pnpm check:fix` và `pnpm exec biome check .`.
  2. Chạy `pnpm check-types`.
  3. Chạy `pnpm test`.
  4. Kiểm tra `ss -ltnp | grep -E ':(8100|8101|8103|8104|8105)\b' || true` không còn tiến trình giữ cổng.
- **Success criteria:** `biome check`, `check-types`, `pnpm test` (workspace + 5 script tests) đều đạt exit code `0`.
- **Verify:** `pnpm exec biome check . && pnpm check-types && pnpm test` exits `0`.

### Task 2.3 — Local Review, Changelog/Journal, PR Beta, Merge & Convergence
- **Goal:** Hoàn tất kiểm duyệt cô lập + giám sát `kongming`, mở PR vào `develop`, review PR, squash-merge, theo dõi `CI` + `Deploy Staging` xanh, đóng plan, đăng nhận xét hậu kiểm của `kongming` và comment POT lên Issue `#732`.
- **Target files and symbols:** `CHANGELOG.md`, `plans/journals/...`, `plans/261116-0428-remove-audio-tracker-mp3-filename/*`, GitHub Issue `#732` & PR.
- **Steps:**
  1. Gọi song song `code-reviewer` cho diff `origin/develop...HEAD` và `kongming` (`Model: "pro"`, `Role: "Advisory Supervisor (Post-Implementation & Pre-Ship)"`). Sửa triệt để mọi finding `Critical`/`Important` nếu có và chạy lại các gate bị ảnh hưởng.
  2. Chạy `git fetch origin develop && git merge origin/develop --no-edit`; cập nhật `CHANGELOG.md` (dưới `## 2026-11-16` → `### Changed`), tạo technical journal qua `ak journal create`, đánh dấu hoàn tất checkbox 2 phase (`ak plan check`) và cập nhật `ak plan update teacher-os/261116-0428 --status completed`.
  3. Chạy `pnpm check:fix && pnpm exec biome check .`, kiểm tra `git status` chỉ chứa các file của task (`quiz-paper.tsx`, `quiz-paper.test.tsx`, `study-pack-item-viewer.test.tsx`, `study-pack.spec.ts`, `CHANGELOG.md`, plan dir, journal mới, 7 ảnh `732-quiz-audio-*.png`), commit conventional commit và `git push -u origin "vinh19410/xóa-mp3-file-name"`.
  4. Soạn `scratch/pr-body.md` bằng tiếng Việt với đủ 9 tiêu đề (gồm `Closes #732`, nhúng 7 ảnh POT theo `<BRANCH_HEAD_SHA>`, nêu rõ lý do kỹ thuật không chạy `design:compare` trên `s-quiz-listening`), kiểm tra bằng `node ~/.gemini/config/ak-runtime/hooks/lib/pr-body-contract.cjs --file ...`, tạo PR bằng `gh pr create --base develop --head "vinh19410/xóa-mp3-file-name"`, và gắn `--linked-pr` bằng `ak plan update teacher-os/261116-0428 --linked-pr <PR_NUM>`.
  5. Chạy PR review (`code-reviewer` + `kongming` PR Review & Pre-Merge checkpoints), đăng review lên PR (`gh pr review --approve`, fallback `--comment` khi HTTP 422 tự review PR của chính mình), gắn nhãn `ready to ship beta` cho PR & Issue `#732` (gỡ `in progress`), chờ PR checks xanh và squash-merge PR vào `develop`.
  6. Theo dõi workflow `CI` và `Deploy Staging` của `<MERGE_COMMIT_SHA>` trên `develop` tới `success`; chạy smoke check `curl -fsSL https://api.staging.teacheros.io.vn/readyz` và `curl -fsSI https://student.staging.teacheros.io.vn`; đóng plan index bằng `ak plan close teacher-os/261116-0428`; gọi `kongming` hậu kiểm cuối cùng và đăng bình luận tiếng Việt lên **cả PR `<PR_NUM>` lẫn Issue `#732`**; kiểm tra 7 ảnh tồn tại ở `<MERGE_COMMIT_SHA>`, đăng comment POT đầy đủ lên Issue `#732`, gắn nhãn `shipped`, kiểm tra lại bằng `gh issue view 732 --comments`.
- **Success criteria:** PR đã `MERGED` vào `develop`, `CI` & `Deploy Staging` kết thúc `success`, PR và Issue `#732` có đánh giá `kongming`, Issue `#732` có đầy đủ POT và nhãn `shipped`.
- **Verify:** `gh pr view <PR_NUM> --json state,mergeCommit` báo `"state":"MERGED"` và `gh run list --branch develop --commit <MERGE_COMMIT_SHA>` báo tất cả run liên quan đạt `success`.

## Todo
- [x] Task 2.1: Cập nhật `apps/e2e/specs/study-pack.spec.ts`, chạy E2E lẻ `CAPTURE_POT_ISSUE=732`, khôi phục 17 ảnh lịch sử và kiểm tra 7 ảnh POT mới.
- [x] Task 2.2: Chạy `pnpm exec biome check .`, `pnpm check-types`, và `pnpm test` pass.
- [x] Task 2.3: Thực hiện review cô lập + Kongming, changelog/journal, mở PR `beta`, review/merge vào `develop`, chờ CI + Deploy Staging xanh, đăng Kongming & POT lên Issue `#732`.

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
