---
title: "Plan vocab hub độc lập lớp học (issue #363)"
date: 2026-10-19
summary: "ak-plan hard mode: 7 phases, red-team 4 reviewer 19 findings accept (2 Critical), issue #363"
---

# Plan vocab hub độc lập lớp học (issue #363)

## What happened
- Brainstorm chốt hướng A (deck org-scoped + bảng suggestion) cho yêu cầu tách vocab khỏi lớp học + gợi ý optional + theo dõi tiến độ.
- ak-plan hard mode: scout codebase (schema vocab.ts, snapshot.ts, kernel.ts, contracts.ts, e2e specs) → 7 phases qua ak CLI.
- Red-team 4 reviewer song song (Security/Failure/Assumption/Scope + verification roles): 19 findings, tất cả accept và áp vào plan.

## Decision
- `vocab_deck.class_id` nullable qua migration recreate (SQLite) — audit theo precedent 0011 + rehearse staging.
- `vocab_suggestion`: UNIQUE(student, deck) thường + upsert flip status (bỏ partial unique index RT-F19); teacherId FK user theo pattern membership.ts.
- Access predicate "enrolled OR accepted-suggestion" phải phủ ĐỦ 5 call sites (overview, loadOwnedSessionCard → answer+learn-commit, audio, ensureDeckCards, loadPool) — RT-F1 Critical.
- Contracts compat bằng zod `.catch()` (RT-F4 Critical): `.strict()` KHÔNG additive, an toàn thật do release train.
- Snapshot chỉ chứa suggestion pending, field optional (RT-F8/F9) — tránh workspace trắng khi deploy skew.
- Progress per-student, group ngày bằng JS vietnamTodayISO (RT-F10: SQL date() trên epoch-ms trả NULL).
- POST suggestion mới bắt buộc cặp requireStudent + vocabWriteGuard (RT CSRF).
- Cắt per-deck progress endpoint (RT-F18 dead code).

## Next steps
- Kéo issue #363 sang Ready trên board Teacher OS khi muốn agent nhận việc (ai-handle flow).
- Cook: /ak:cook plans/261019-0323-vocab-independent-hub/plan.md

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
