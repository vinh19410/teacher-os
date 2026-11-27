---
phase: 5
title: "Code Review, Docs Sync, Ship Beta PR, POT & CI Convergence"
status: pending
priority: P1
effort: "1.5h"
dependencies: [4]
---

# Phase 5: Code Review, Docs Sync, Ship Beta PR, POT & CI Convergence

## Goal

Hoàn tất review độc lập (local + PR), đồng bộ `DESIGN.md` & journal, mở PR nhắm `develop` (beta), chạy cổng review bắt buộc của `kongming` sau khi CI PR xanh, đăng comment POT có ảnh SHA permalink lên issue, gắn nhãn `ready to ship beta`, merge vào `develop` và theo dõi CI/deploy staging tới khi xanh.

## Files to Create / Modify

- Modify: `DESIGN.md`
- Modify: `CHANGELOG.md`
- Create: `plans/reports/journal-*.md`
- Modify: `plans/261127-1759-redesign-teacher-assignments/*.md` (`status: completed`)

## Tasks & Steps

### Task 5.1 — Local Code Review (`code-reviewer` + `kongming` Checkpoint #4) & Test Audit
- **Goal:** Rà soát diff độc lập, xử lý hết lỗi Critical/Important và kiểm chứng chất lượng bộ test.
- **Target files and symbols:** Toàn bộ diff đang chờ commit.
- **Steps:**
  1. Spawn subagent `code-reviewer` (fresh context) kiểm tra toàn bộ thay đổi; sửa mọi lỗi Critical/Important nếu có và chạy lại các gate ảnh hưởng.
  2. Kiểm tra tất cả test mới/sửa đảm bảo test hành vi thật (không có pass-only test).
  3. Spawn `kongming` (**Checkpoint #4: post-code-review**) báo cáo verdict, severity counts và sửa lỗi (nếu có).
- **Success criteria:** 0 lỗi Critical/Important còn mở và `kongming` GO.
- **Verify:** `pnpm check && pnpm check-types` exits 0 sau mọi chỉnh sửa review.

### Task 5.2 — Cập nhật `DESIGN.md`, `CHANGELOG.md`, Journal & Ship Beta PR (`develop`)
- **Goal:** Đồng bộ tài liệu thiết kế, đóng gói plan, commit đúng conventional commits (không nhắc AI) và mở PR nhắm `develop`.
- **Target files and symbols:** `DESIGN.md`, `CHANGELOG.md`, `plans/reports/journal-*.md`, `plans/261127-1759-redesign-teacher-assignments/plan.md`.
- **Steps:**
  1. Cập nhật `DESIGN.md` bổ sung mục thiết kế mới `/teacher/assignments` + các điểm lệch có chủ đích so với `open-design/assignments.html` (`AppShell`, `SKILLS` thật, không bịa duration audio, không Undo giả sau xóa nháp, `Band` tách khỏi `PromptStudentPaper` theo #847, `aria-hidden` count badges, dùng `<Modal>` cho `DatePickerInput`).
  2. Chạy `pnpm check && pnpm check-types` sau khi sửa tài liệu.
  3. Fetch + merge `origin/develop`; cập nhật `CHANGELOG.md`, viết journal tại `plans/reports/`, chạy `ak plan update --status completed`.
  4. Commit gọn (conventional commit, không AI references), bao gồm `open-design/assignments.html` và ảnh POT trong `plans/reports/`.
  5. Push nhánh lên `origin`, tạo PR nhắm `develop` (`Closes #<ISSUE_NUM>`, `Closes #979`, `Related #983`), link PR bằng `ak plan update --linked-pr <PR_NUM>`.
- **Success criteria:** PR được tạo trên `develop` kèm đầy đủ bằng chứng kiểm thử và ảnh POT dùng SHA permalink.
- **Verify:** `gh pr view <PR_NUM> --json number,url,baseRefName,headRefName` exits 0 và `baseRefName === "develop"`.

### Task 5.3 — Review PR, Mandatory Post-PR `kongming` Gate, POT Comment & Merge vào `develop`
- **Goal:** PR CI xanh, hoàn tất review/fix/reply + cổng `kongming` sau PR, có POT trên issue, gắn `ready to ship beta`, merge và xác nhận CI `develop` xanh.
- **Target files and symbols:** GitHub PR `#<PR_NUM>`, GitHub Issue `#<ISSUE_NUM>`.
- **Steps:**
  1. Chờ toàn bộ checks trên PR kết thúc và xanh (`gh pr checks <PR_NUM> --watch`). Nếu lỗi có thể sửa trong repo, tạo fix trên nhánh và push lại.
  2. Thực hiện PR review + fix + reply; sau khi review hội tụ và CI xanh, spawn `kongming` (**Mandatory Post-PR Review Gate**) và đăng đánh giá của `kongming` lên cả PR `#<PR_NUM>` và issue `#<ISSUE_NUM>`.
  3. Đăng comment POT lên `#<ISSUE_NUM>` (`gh issue comment --body-file ...`) kèm ảnh permalink theo `<COMMIT_SHA>`, các gate đã chạy và mở lại kiểm tra link bằng `gh api repos/vinh19410/teacher-os/issues/<ISSUE_NUM>/comments`.
  4. Gắn label `ready to ship beta` cho cả `#<ISSUE_NUM>` và `#<PR_NUM>`, gỡ `in progress` và `ready to cook` khỏi `#<ISSUE_NUM>`.
  5. Merge PR vào `develop` (`gh pr merge <PR_NUM> --merge`), chạy `ak plan close`, và theo dõi workflow CI/staging trên `develop` tới khi xanh (`gh run list --branch develop` / `gh run view`).
- **Success criteria:** PR đã merge vào `develop`, CI/deploy trên `develop` xanh (hoặc ghi nhận rõ blocker ngoài hệ thống nếu thiếu secret/service), POT + label hoàn chỉnh.
- **Verify:** `gh pr view <PR_NUM> --json state,mergedAt` có `state === "MERGED"` và `gh run list --branch develop --commit <MERGE_SHA> --json status,conclusion` đạt `completed`/`success`.

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
