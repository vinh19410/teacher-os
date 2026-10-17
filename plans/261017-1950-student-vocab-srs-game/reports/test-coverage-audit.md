# Vocab SRS — Test Coverage Audit (Phase 5/6 requirement đối chiếu)

Scope: test hiện có vs Success Criteria `plan.md` + Requirements phase-01…06.

## Đã phủ (khớp trực tiếp criteria)

| Criterion (plan.md) | Test |
|---|---|
| Vector sections answers/typing/eligibility/hints/intervals/learnSteps/learnQueue/learnCommit | `packages/api/src/srs/scheduler.test.ts`, `quiz-rules.test.ts`, `format.test.ts`, `learn-session.test.ts` (it.each vectors) |
| `--check` exit 0 | `packages/api/package.json` script `verify:vectors` (chạy trong gate) |
| First-result idempotent + retry `clientLogId` Promise.all → 200 replay, 1 row | `apps/server/src/routes/vocab.test.ts` "concurrent idempotency (red-team F6)" |
| Enrollment 404 + không provision | `vocab.test.ts` "IDOR enrollment gate (red-team F1)" |
| Ownership 404 (student B card của student A) | `vocab.test.ts` "ownership gate" |
| Cross-session guard dueAt | `vocab.test.ts` (phần cuối test F6) |
| Batch atomic: fail insert log → card không update | `vocab.test.ts` "batch atomicity" |
| durationMs clamp 3_600_000 + learn-commit → state review/dueAt+1d | `vocab.test.ts` "learn-commit clamps..." |
| Due metrics chỉ state=review (3 card new → dueCount 0) | `vocab.test.ts` "overview due metrics (red-team F5)" |
| Streak yesterday-only=1 / yesterday+today=2 / đứt=0 + forecast loại overdue | `vocab.test.ts` "streak and forecast rules (red-team F12)" |
| Xoá deck 0 orphan + review_log sống sót + PRAGMA foreign_keys OFF | `apps/server/src/routes/vocab-teacher.test.ts` |
| Audio key server-sinh org-scoped + MIME 415 | `vocab-teacher.test.ts` |
| Snapshot vocabDecks có aggregate + KHÔNG vocabWords | `vocab-teacher.test.ts` |
| CSRF POST không Origin → 403; 401 khi chưa đăng nhập (RT#1) | `vocab.test.ts` 2 test đầu |
| Provision race 2 call đồng thời → dueAt nhất quán 1 mốc | `vocab.test.ts` "lazy provision race (red-team F8)" |
| Review requeue 4–5, evict 2 forgot, overlay streak 5, first-result-only | `packages/api/src/srs/review-session.test.ts` |
| UI: re-render không reset session (F14), POST fail chặn Continue + retry cùng clientLogId (F9), 404 dialog, NFC typing | `apps/student/src/components/vocab/vocab-session-view.test.tsx` |

## Gaps đã xử lý sau review (2026-10-18)

1. ✅ `vocab-teacher.test.ts` — word REMOVE (xoá từ → cards biến mất, 0 orphan) + org-scope read (GET words deck org khác → 404).
2. ✅ `vocab.test.ts` — overview positive states (learnedCount/matureCount/levelDistribution/nextDueAt/upcomingCount/forecast buckets).
3. ✅ `vocab.test.ts` — review answer trên card `state='new'` → 409 `VOCAB_CARD_NOT_DUE` (review I1).
4. ✅ `vocab-session-view.e2e-loop.test.tsx` (mới) — tái lập đúng vòng lặp e2e Learn 3 từ (intro + choice sai requeue + typing đúng theo hint) — bảo hộ chống regression UI kẹt prompt.
5. ❌ (chấp nhận) rng không có test riêng — được exercise gián tiếp qua session tests + determinism SeededRandom.
6. ❌ (chấp nhận) evict 2-forgot ở tầng e2e — đã phủ unit ReviewSession; e2e không time-travel.
7. ❌ (chấp nhận) ranh giới nửa đêm cho streak — cần time mock server-side; follow-up.

Kết luận: mọi Success Criteria của plan.md đều có test trực tiếp; 3 mục còn lại là nice-to-have có ghi chú follow-up.
