---
title: "Cook chấm bài Writing/Speaking #319 — 5 phase xanh toàn gate"
date: 2026-10-05
summary: "Triển khai plan 261005-1234 qua /ak:cook --tdd --auto trong worktree feat/grade-writing-speaking-submissions: Phase 1 ielts-band + contracts + migration 0033; Phase 2 /api/grading (GET/media/POST grade) + snapshot attemptId/gradedAt/band + summary grade; Phase 3 trang /grading/$attemptId + nút Chấm bài ở tab Bài tập; Phase 4 AttemptGradeCard màn kết quả học viên; Phase 5 e2e teacher-grade-submission (2 passed) + docs/runbook/CHANGELOG. Gate cuối: check exit 0, check-types 0, api 32 / server 522 / web 1242 / student 237 pass, e2e 4 spec 17 pass. Ngoại lệ: sha gate 1/3 (assignments/index.tsx reformat bởi biome — drift sẵn develop run #318, kongming GO exclude khỏi commit); lệnh e2e phải bỏ -- để filter positional; orphan servers run cũ chiếm 8100-8103 đã kill."
---

# Cook chấm bài Writing/Speaking #319 — 5 phase xanh toàn gate

Triển khai plan 261005-1234 qua /ak:cook --tdd --auto trong worktree feat/grade-writing-speaking-submissions: Phase 1 ielts-band + contracts + migration 0033; Phase 2 /api/grading (GET/media/POST grade) + snapshot attemptId/gradedAt/band + summary grade; Phase 3 trang /grading/$attemptId + nút Chấm bài ở tab Bài tập; Phase 4 AttemptGradeCard màn kết quả học viên; Phase 5 e2e teacher-grade-submission (2 passed) + docs/runbook/CHANGELOG. Gate cuối: check exit 0, check-types 0, api 32 / server 522 / web 1242 / student 237 pass, e2e 4 spec 17 pass. Ngoại lệ: sha gate 1/3 (assignments/index.tsx reformat bởi biome — drift sẵn develop run #318, kongming GO exclude khỏi commit); lệnh e2e phải bỏ -- để filter positional; orphan servers run cũ chiếm 8100-8103 đã kill.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
