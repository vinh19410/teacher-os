---
title: "Plan unblock production UAT operator inputs (#41 → #48)"
date: 2026-08-21
summary: "Fast-mode plan for blocker #41: resolve 5 operator inputs then re-run phase-06 UAT; #41 reopened, issue #48 ready to review"
---

# Plan unblock production UAT operator inputs (#41 → #48)

## What happened
- Phase-06 UAT của plan Production readiness NO-GO 2026-08-20 chỉ vì 5 operator inputs (blocker #41). Điều tra timeline: #41 bị GitHub auto-close khi merge PR #42 (merge 13:24:34Z, close 13:24:35Z) dù checklist chưa item nào xanh và PR note ghi "keep #41 open" → đã reopen kèm comment.
- Tạo plan `plans/260821-0935-unblock-production-uat-operator-inputs/` (2 phases, fast mode, kongming GO ×2): Phase 1 resolve 5 inputs với 4 USER-ACTION gates (domain, Google redirect, UAT account, Safari runner) + topology dry-run; Phase 2 re-run phase-06 Steps 1-9 **by reference** đến evidence GO/NO-GO (r2 file riêng, giữ nguyên NO-GO cũ).
- GitHub issue #48 tạo với label `ready to review`; cross-plan wiring: production-readiness `blockedBy` plan mới (bỏ ref stale tanstack-query đã xong).

## Decision
- `APP_DOMAIN` đặt inline trên lệnh deploy (`APP_DOMAIN=<domain> pnpm alchemy deploy --stage prod`) thay vì persist trong `packages/infra/.env` — nếu persist thì `pnpm dev` (alchemy dev) flip sang prod topology và kéo custom domain vào dev worker.
- Xóa `CORS_ORIGIN` dev khỏi `apps/server/.env` bắt buộc kèm code default: nhánh topology-unset của `packages/alchemy.run.ts` cần `Config.withDefault("http://localhost:8001")` vì `Config.string("CORS_ORIGIN")` hiện là required — không có default thì `pnpm dev` vỡ.
- Không sửa file phase-06 đã red-team (13 findings applied) — plan mới reference nguyên văn; evidence mới viết file r2 riêng.

## Next steps
- Operator review #48 rồi `/ak:cook /Users/vinhtran/Documents/project/personal/teacher-os/plans/260821-0935-unblock-production-uat-operator-inputs/plan.md` (user chọn kết thúc session).
- Cook Phase 1: agent làm cleanup PR + runner kit trước; 4 operator gates chờ user input; dry-run topology gate xanh mới sang Phase 2.
- Task hydration skipped (2 phases < 3-item rule); `.claude/scripts/set-active-plan.cjs` không tồn tại — chỉ set `ak plan use`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
