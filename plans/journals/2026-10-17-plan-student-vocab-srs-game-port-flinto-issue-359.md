---
title: "Plan Student Vocab SRS Game (port Flinto) — issue #359"
date: 2026-10-17
summary: "ak:plan --github hard mode: port SRS/vocab game Flinto thành 6-phase plan; red-team 4 personas bắt 15 findings (1 Critical IDOR); issue #359 label ai-handle"
---

# Plan Student Vocab SRS Game (port Flinto) — issue #359

## What happened
- Nhận handoff từ repo Flinto (`plans/handoffs/game-review-logic-teacher-os-20261018-0225.md`, dev @ b9ec13c): tổng hợp logic game + SRS (5 level, [1,3,7,14,30], 5 minigames, Learn/Review) để port sang teacher-os. Verify "Current state" của handoff khớp repo Flinto (chỉ khác biệt: chính handoff file untracked).
- Chạy `ak:plan --github` hard mode: scout teacher-os bằng Explore agent (stack: Hono + drizzle D1 + React 19 student; vocabulary/SRS hoàn toàn mới — chỉ false positives), đọc song song `docs/srs-spec.md` Flinto 400 dòng.
- Scaffold plan `plans/261017-1950-student-vocab-srs-game/` qua ak CLI (6 phases, 64 tasks) + scout report `reports/scout-report.md`.

## Decision
- Engine pure TS tại `packages/api/src/srs/` + conformance vectors copy byte-identical từ Flinto (bỏ section legacy); test chống vectors là hợp đồng port.
- Server-authoritative persistence (db.batch atomic + idempotent clientLogId chống TOCTOU bằng ON CONFLICT → replay 200), client chạy session runtime; honor-policy không chấm lại (precedent audio P1).
- 4 bảng riêng vocab_deck/word/card/log (KHÔNG tái dùng syllabus_lesson); lazy provision base `vocab_deck.createdAt` (không Date.now() per-request — race đảo thứ tự vĩnh viễn); xoá deck bằng db.batch không dựa FK cascade (PRAGMA theo-connection).
- Giữ nguyên hằng số Flinto; v1 chỉ per-deck session uncapped (§87) — global capped 20 + user setting out of scope; audio listeningChoice giữ (HOLD) nhưng eligibility gate tự degrade an toàn.

## Red-team (4 personas, Full tier)
- 22 findings thô → 15 accepted (1 Critical: session-data thiếu enrollment check → IDOR chéo org; High: RT#1 mount auth trong studentRoutes, CSRF writeGuard thiếu, due metrics thiếu filter state='review', TOCTOU idempotency, FK cascade, provision race, POST fail path). ~70 claims verify: 64 verified, 2 failed đã sửa (gate `pnpm --filter e2e e2e`, 48 specs), citations drift đã sửa (kernel mount thật :2099-2105, routes/assignments/ là directory).
- Whole-plan consistency sweep sau áp: 0 contradictions.

## Next steps
- Issue #359 (labels ai-handle + ready to review) chờ card kéo sang Ready trên board Teacher OS thì agent nhận việc; cook bằng `/ak:cook plans/261017-1950-student-vocab-srs-game/plan.md`.
- Lưu ý phối hợp migration numbering với plan P1 #358 (cùng định chiếm 0036 — ai cook trước lấy số trước, journal tự xếp).
- Task hydration skipped: không có live task-management surface trong session — plan files là nguồn tiến độ.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
