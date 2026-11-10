---
phase: 2
title: "Gates + follow-up issues + projection"
status: pending
priority: P2
effort: "0.5h"
dependencies: [1]
---

# Phase 2: Gates + follow-up issues + projection

## Goal

Gates repo xanh trên toàn worktree, 2 follow-up issue đã tạo đúng quy ước repo (label `ai-handle`, quan hệ blocked-by), issue #659 được cập nhật trạng thái pipeline.

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

## Files to Create / Modify

- Không sửa file source. Chỉ tạo GitHub issues + comment issue #659.

## Tasks & Steps

### Task 2.1 — Gates repo

- Goal: quality gate local pass trên toàn worktree (gate chính theo AGENTS.md).
- Steps:
  1. `pnpm check` — **read-only** (`"check": "biome check ."`, `package.json:23`); KHÔNG mong đợi nó sửa file. Exit non-zero → đọc report; nếu lỗi format ở 2 file Phase 1 thì chạy `pnpm exec biome check --write apps/server/src/routes/enrollment-activation.ts apps/server/src/routes/holidays.test.ts` rồi commit; lỗi ở file khác → dừng, báo kongming.
  2. `pnpm check-types`.
  3. `pnpm --filter server test` (full server suite).
- Success criteria: cả 3 lệnh exit 0.
- Verify: 3 lệnh trên exit 0; output `Test Files`/`Tests` của server suite không có failed.

### Task 2.2 — Tạo 2 follow-up issues (non-goals của PR này)

- Goal: không để các gap đã biết thất lạc ngoài issue.
- Steps:
  1. Issue A — lỗ hổng tồn dư (domain #645/#658): tiêu đề "Lớp manual: re-activation sau xóa enrollment và attach vào ngày đã shift vẫn tạo lesson_material mồ côi". Body nêu: carve-out `class_session` của `isHolidayBucket` (`materials.ts:397`) cho attach vào ngày all-holiday khi có buổi manual; re-activation (non-I6) không move material theo chủ ý #658; gợi ý hướng (UI cảnh báo ngày đã shift). Gắn label `ai-handle`. Nếu PR #659 CHƯA merge lúc tạo: `--blocked-by <số issue 659>`; nếu đã merge: không gắn blocked-by. KHÔNG gắn blocked-by #645/#658 (đã merge).
  2. Issue B — legacy data: tiêu đề "Audit lesson_material mồ côi từ activation trước fix #659". Body kèm query báo cáo (red-team: KHÔNG filter `NOT EXISTS class_session` — quyết định không move `class_session` nghĩa là buổi gốc LUÔN còn `class_session`, filter đó tự loại đúng population cần audit; cột `has_class_session` để người review tự phân loại):

```sql
SELECT lm.class_id, lm.date, lm.material_id,
  EXISTS (SELECT 1 FROM class_session cs
          WHERE cs.class_id = lm.class_id AND cs.date = lm.date) AS has_class_session
FROM lesson_material lm
JOIN holiday_session_shift s
  ON s.class_id = lm.class_id AND s.original_date = lm.date;
```

  Gắn label `ai-handle`.
  3. Ghi số 2 issue vào comment issue #659 (Task 2.3).
- Success criteria: 2 issue tồn tại, label `ai-handle` hiển thị, quan hệ phụ thuộc đúng như trên.
- Verify: `gh issue view <số-A> --json labels` chứa `ai-handle`; tương tự issue B.

### Task 2.3 — Cập nhật issue #659 (projection pipeline)

- Goal: issue #659 phản ánh branch, route, plan link, ship mode, AC, pipeline state.
- Steps:
  1. Comment trên issue #659 (theo template GitHub Issue Body của vibe): branch `fix/holiday-shift-activation-materials-659`, route `bugfix` qua `/ak-fix`, plan link `plans/261110-0819-659-activation-holiday-shift-materials/plan.md`, ship mode `beta`, AC checklist (5 test + gates), pipeline state checklist, link 2 follow-up issue.
  2. Ghi linkage vào plan index: `ak plan update 261110-0819 --issue 659` (chạy trong worktree).
- Success criteria: comment hiển thị trên #659 với đầy đủ metadata; `ak plan search --issue 659` tìm thấy plan này.
- Verify: `gh issue view 659 --json comments --jq '.comments | length'` tăng thêm 1; `ak plan search --issue 659` exit 0 có kết quả.

## Verification

- `pnpm check` → exit 0.
- `pnpm check-types` → exit 0.
- `pnpm --filter server test` → exit 0.
- `gh issue view <A> --json labels` và `<B>` → chứa `ai-handle`.
- `ak plan search --issue 659` → thấy plan `261110-0819-659-activation-holiday-shift-materials`.
