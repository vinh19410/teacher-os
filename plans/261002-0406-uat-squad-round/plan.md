---
title: "UAT round — TeacherOS Squad"
description: "Điều phối UAT trên staging/prod: QE kiểm thử, BA trả lời concern, Tech Lead chỉ tạo GitHub issue (không implement)."
status: in-progress
priority: P1
effort: medium
branch: develop
tags: [uat, qa, coordination]
created: 2026-10-02
---

# UAT round — TeacherOS Squad

## Status

In progress. Kickoff 2026-10-02. QE assigned. BA/Tech Lead chờ findings.

## Outcome

Có evidence UAT cho Teacher OS sau release v0.0.12 (forgot-password #292, verify-email #297) cộng luồng lõi M1–M2. Mỗi finding được phân loại CONCERN hoặc BUG. BUG thành GitHub issue, không có code fix trong vòng này.

## Constraints

- QE chạy kiểm thử; không implement.
- Concern về yêu cầu/UX → Q&A BA.
- Bug đã tái hiện → Tech Lead tạo GitHub issue trên `vinh19410/teacher-os`. Tech Lead không implement.
- Không ghi secret, cookie, token, PII, D1 id vào report/issue.
- Staging là mục tiêu CRUD rehearsal. Student portal staging DNS không resolve (`student.staging.teacheros.io.vn`) — đã xác nhận 2026-10-02.

## Non-goals

- Sửa bug, merge PR, deploy.
- Load test, security audit đầy đủ, pilot data production của lớp thật.

## Phases

| # | Phase | Owner | Status |
|---|-------|-------|--------|
| 1 | [QE execute UAT](./phase-01-qe-execute-uat.md) | Quantity Engineer | in-progress |
| 2 | [BA Q&A concerns](./phase-02-ba-qa-concerns.md) | Business Analyst | pending (depends on QE concerns) |
| 3 | [Tech Lead GitHub issues](./phase-03-tl-github-issues.md) | Tech Lead | pending (depends on QE bugs) |

## Dependencies

- Staging API `/readyz` 200 `{"ok":true}` (verified 2026-10-02).
- Staging web `https://app.staging.teacheros.io.vn/` 200.
- Staging auto-deploy off; QE phải xác nhận feature #292/#297 có trên môi trường trước khi tick pass.
- Prod student portal `https://student.teacheros.io.vn/` 200; staging student DNS missing.

## Acceptance criteria

- [ ] QE report có pass/fail từng case, evidence path, GO/NO-GO.
- [ ] Mọi CONCERN đã Q&A với BA hoặc ghi unanswered.
- [ ] Mọi BUG confirmed có GitHub issue URL; 0 issue đi kèm implementation.
- [ ] PM report `plans/reports/pm-YYMMDD-HHMM-uat-*.md` ghi progress/blockers/next actions.

## Environment snapshot (2026-10-02)

| Surface | URL | Probe |
|---------|-----|-------|
| Staging API | `https://api.staging.teacheros.io.vn/readyz` | 200 `{"ok":true}` `cache-control: no-store` |
| Staging web | `https://app.staging.teacheros.io.vn/` | 200 |
| Staging landing | `https://staging.teacheros.io.vn/` | 200 |
| Staging student | `https://student.staging.teacheros.io.vn/` | DNS NXDOMAIN — blocker |
| Prod API | `https://api.teacheros.io.vn/readyz` | 200 `{"ok":true}` |
| Prod web | `https://app.teacheros.io.vn/` | 200 |
| Prod student | `https://student.teacheros.io.vn/` | 200 |
