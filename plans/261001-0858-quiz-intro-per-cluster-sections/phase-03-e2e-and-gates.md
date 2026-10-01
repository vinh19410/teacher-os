---
phase: 3
title: "E2E đề intro chia cụm + gate cuối + changelog"
status: completed
priority: P1
effort: "1.5h"
dependencies: [2]
---

# Phase 3: E2E đề intro chia cụm + gate cuối + changelog

## Goal
Chứng minh trên trình duyệt thật rằng một đề có intro dán 2 khối "Questions …" (không khai type từng câu) hiển thị mỗi instruction ngay trên đúng nhóm câu, ở cả take lẫn review. Các test #286 không bị hồi quy.

## Bối cảnh
- Spec: `apps/e2e/specs/student-quiz-take-review.spec.ts`. Fixture prompts được seed trong `beforeAll`, có các đề `titleMixed` (`:212`), `titleLegacy` (`:252`), `titleSplit`. Id lấy qua `fixture.assignmentIds[i]` (`:295`–`297`).
- Mở đề bằng `openPaper(page, title)`, đăng nhập bằng `signIn(page)`.
- Port e2e: `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103` (AGENTS.md).

## Files to Create / Modify
- Modify: `apps/e2e/specs/student-quiz-take-review.spec.ts`
- Modify: `CHANGELOG.md` (mục `## 2026-10-01` → `### Changed`)

## Tasks

### Task 3.1: Thêm fixture đề intro chia cụm
- Target: mảng prompts trong `beforeAll` của spec. Thêm phần tử CUỐI mảng, để không làm lệch index `assignmentIds[0..2]` đang dùng.
- Steps:
  1. Thêm `const titleIntroSections = "Đề intro chia cụm: Văn Miếu";` cạnh các hằng title (`:50`–`52`).
  2. Prompt: `skill: "reading"`, `part: "p1"`, `type: "note"`, `note: "Đề intro chia cụm."`, `passage: "<p>Văn Miếu được xây năm 1070. Đây là trường đại học đầu tiên của Việt Nam.</p>"`, `intro: "<p>Đọc kỹ đoạn văn.</p><p>Questions 1–2</p><p>Write TRUE or FALSE for each statement.</p><p>Questions 3–4 · Flow-chart completion — Write ONE WORD ONLY from the passage for each answer.</p>"`, 4 câu KHÔNG có field `type`, stem có `____`, `opts: null`, `alts: ""`, answer bất kỳ không rỗng.
  3. Nếu spec có assert đếm tổng số đề trên overview/list (tìm bằng `grep -n "toHaveCount" apps/e2e/specs/student-quiz-take-review.spec.ts`), cập nhật số đếm +1 và ghi lại dòng đã đổi.
- Verify: no verification needed (Task 3.2 chạy spec này).

### Task 3.2: Test take + review
- Steps: thêm `test("intro pasted with Questions markers renders each instruction above its own question range", …)`:
  1. `signIn` → `openPaper(page, titleIntroSections)`.
  2. `const s1 = page.locator('section[aria-label="Questions 1–2"]')`, `const s2 = page.locator('section[aria-label="Questions 3–4"]')`, cả hai `toBeVisible()`.
  3. `await expect(s1.getByText("Write TRUE or FALSE for each statement.")).toBeVisible()`. `await expect(s2.getByText("Write ONE WORD ONLY from the passage for each answer.", { exact: false })).toBeVisible()`.
  4. `await expect(s1.locator("[data-question]")).toHaveCount(2)`, `await expect(s2.locator("[data-question]")).toHaveCount(2)`.
  5. `await expect(page.getByText("Đọc kỹ đoạn văn.")).toHaveCount(1)`.
  6. Navigator có tab `Questions 1–2` và `Questions 3–4`: `page.getByRole("tab", { name: "Questions 3–4" })` visible.
  7. Điền 4 ô (`page.getByLabel("Điền đáp án câu N")`), chờ `save-state` `saved`, bấm `Nộp bài`, vào "Xem giải thích chi tiết", rồi assert lại `section[aria-label="Questions 1–2"]` và `section[aria-label="Questions 3–4"]` visible.
- Success criteria: test mới pass, 3 test #286 cũ (mixed-type, split-pane, single-type legacy) vẫn pass.
- Verify: `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e -- student-quiz-take-review` exits 0 và output có `passed`, không có `failed`.

### Task 3.3: Changelog
- Steps: dưới `## 2026-10-01` thêm `### Changed` (nếu chưa có, đặt sau `### Added`) với dòng: `- Trang làm bài/soi bài: intro có các khối "Questions X–Y …" được tách và hiển thị instruction ngay trên đúng nhóm câu đó (kể cả đề cũ không khai dạng từng câu); intro không có marker giữ hiển thị như cũ`.
- Verify: `grep -n "Questions X–Y" CHANGELOG.md` in ra ≥ 1 dòng.

### Task 3.4: Gate cuối
- Verify, chạy tuần tự, lệnh nào cũng phải exit 0:
  1. `pnpm check`
  2. `pnpm check-types`
  3. `pnpm --filter student test`
  4. `pnpm --filter web test`
  5. `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e -- student-quiz-take-review`

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
