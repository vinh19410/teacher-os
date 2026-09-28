---
title: Ship v0.0.7 — promote develop → main (official PR)
date: 2026-09-28
summary: "Promote develop→main v0.0.7 qua PR: ~94 commits (+11,810/−294) gom 4 theme (student portal #245–#263, merge /assignments/bank #267, reading 14 IELTS types #269, authoring UX #271 + migration 0028), test 1,493 GREEN forced, e2e 102 passed/1 skip, review bắt 1 Critical CSRF /invitations/* fix trước merge + 4 informational defer, biome vét 4 lỗi e2e spec CI chưa từng chạy"
---

# Ship v0.0.7 — promote develop → main (official PR)

## What happened
- Ship official 2026-09-28 (mode: official): promote `develop` → `main` qua PR theo convention promotion của repo (precedents #149/#158/#196/#226/#244), release v0.0.6 → v0.0.7 (bump commit `84c9648` trên develop, root package.json thôi theo convention). Delta ~94 commits, +11,810/−294 dòng, gom 4 theme kể từ promotion #244 (2026-09-22): (1) student portal app + self-provisioning + email verification + multi-org/roles (#245–#263); (2) gộp `/assignments/bank` vào `/assignments` — bank page biến mất, `/assignments` giờ list prompts (#267); (3) reading catalog 14 IELTS question types + intro/diagram images (#269); (4) authoring UX 4 họ input dùng chung — answer-key grid, structured option bank (cột mới `assignment_prompt.option_bank`, migration 0028), cloze click-to-blank + table-grid editors, image pins tọa độ % (#271, plan `260925-0724` completed 4/4).
- Evidence (mirror `ci.yml`): `pnpm install --frozen-lockfile` ok. Biome check ban đầu vét 4 lỗi format/import-order trong `apps/e2e/specs/assignment-prompt-*.spec.ts` → `biome check --write` (3 file), repo-wide sạch (còn 1 info deprecation biome.json recommended→preset, non-blocking). `pnpm test --force` (uncached) 1,493 passed / 0 failed (server 364, web 990, auth 59, student 47, infra 17, landing 5, ci-workflow 3, topology-drift 8). `check-types` + `build` (4 apps) ok. E2E Playwright self-contained boot (api + web + student webServers, libsql local file, override ports 8100/8101/8103 vì dev workerd vẫn ngồi 8000/8001/8003): 102 passed / 1 intentional skip (Google OAuth round-trip cần creds thật) / 0 failed. Caveat: Node local v26.9.0 vs CI node 24.
- Review promotion-gate 2 lượt trên `origin/main...HEAD`: 1 Critical fix trước merge + 4 informational defer. Secrets scan toàn delta: clean (dummy values trong test fixtures; `.mail-preview/` và e2e mail log đã gitignore).
- Docs pass (official mode): 5 file, +11 dòng — README.md (self-signup #257 thay teacher-added email), `docs/system-architecture.md` + `docs/codebase-summary.md` (student portal `apps/student` + bridge `routes/student.ts`), `docs/project-overview-pdr.md` (2 accept endpoint thật admin/portal), `docs/production-release-runbook.md` (origin `student.<domain>` + binding `STUDENT_ORIGINS`, staging QC URL, email verification portal URL).
- PR: chore(release): v0.0.7 — student portal, assignments bank merge, 14 reading types, authoring UX families (develop → main), merge qua `--merge` reviewed-merge flow.

## Decision
- Critical duy nhất, fix NGAY trước merge: `POST /api/student/invitations/:id/accept` và `/reject` KHÔNG có middleware CSRF Origin/content-type, trong khi contract của chính router yêu cầu (cookie SameSite=None → check Origin tường minh) và `/onboarding` + `/enrollments/*` đều có đủ. Fix: thêm `router.use("/invitations/*", ...)` mirror `/enrollments/*` (`apps/server/src/routes/student.ts`), sửa 3 test cũ gửi Origin+Content-Type, thêm test CSRF guard (403 origin lạ / 415 text/plain với session hợp lệ). Re-run sau fix: biome sạch, server 365/365 (từ 364, +1 test mới), 3 e2e spec vừa format 23/23. Commit: fix(server): enforce CSRF origin guard on student invitation accept/reject.
- 4 informational, defer sau merge (nợ có ghi chép): (1) `RESEND_API_KEY` trong `packages/infra/alchemy.run.ts` chưa dùng `Config.redacted` (plaintext trong local .alchemy state — đã gitignore); (2) invitation accept chưa atomic — update status trước insert row học viên, unique-index race có thể đốt luôn invitation (gợi ý try/catch idempotent-ok hoặc `db.batch`); (3) N+1 next-lesson queries ở student `/overview` (bounded theo số lớp, chấp nhận được); (4) thiếu CSRF test cho `/invitations/*` — xử lý luôn cùng Critical.
- 5 file dirty local (tweaks script dev:bare ở package.json root/landing/student + `packages/infra/alchemy.run.ts`, 1 edit status plan.md cũ) → git-stash, LOẠI khỏi ship vì là việc local không liên quan; restore sau khi push.
- Bỏ merge `origin/main` vào develop: main chỉ thừa đúng promotion merge commit #226/#244, zero content delta — cùng lý do PR #244. CHANGELOG.md đã đầy đủ trên develop (format date-based, đủ 4 theme, có note deploy-order migration 0028) → không sửa. Ship không có plan bảo kê (release promotion): mọi plan trong range đã completed trên develop.

## Vướng mắc & bài học
- Cú sốc thầm lặng của đợt này: 4 lỗi biome nằm trong e2e spec mà CI CHƯA TỪNG chạy — `ci.yml` chỉ lint/test trên PR vào main, nên code tồn tại qua cả plan #271 trên develop mà chưa gặp linter lần nào. "CI xanh" trên develop là lời hứa rỗng với những file đó. Bài học: promotion convention nghĩa là develop KHÔNG có gate, mọi thứ dồn vào 1 PR promotion — đừng gọi develop "đã verify" khi nó chỉ "chưa được chạm vào".
- Critical CSRF cùng họ bệnh với phase-1 #271 ("xanh nhầm nhánh"): suite 364 test xanh trong khi 2 endpoint đổi trạng thái chạy không Origin guard — và 3 test cũ phải sửa request để VƯỢT guard mới, tức là chúng pass cả trước lẫn sau khi có guard. Test đang xác nhận hành vi, không xác nhận an toàn.
- Phần êm: pipeline suôn sẻ — stash dirty files giữ lịch sử sạch, CHANGELOG sẵn, docs pass nhẹ 11 dòng. Ship không phải xong — chỉ là chuyển nợ có ghi chép, và lần này nợ có cả atomicity invitation nằm trong đó.

## Next steps
- Merge PR promotion bằng `--merge` reviewed-merge flow; theo dõi CI trên `main`; nhớ migration 0028 có deploy-order note trong CHANGELOG.
- Follow-up informational: (1) `Config.redacted` cho `RESEND_API_KEY` — owner: infra; (2) atomic invitation accept (`db.batch` hoặc try/catch idempotent-ok) — owner: server; (3) N+1 `/overview` — backlog.
- Human sign-off còn nợ: rollback runbook migrations 0026–0028 + dòng sign-off v0.0.7 trong `docs/production-release-runbook.md`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
