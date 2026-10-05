---
title: "Ship release v0.0.13 — quiz intro sections, TFNG, Writing, Speaking, class detail"
date: 2026-10-05
summary: "Promotion develop → main gộp #301/#303/#304/#305/#307; gate full trong worktree sạch, review 0 critical, bổ sung runbook cho migration 0031."
---

# Ship release v0.0.13

## What happened
Promotion `develop` → `main` (0.0.12 → 0.0.13) gộp 5 mảng đã ship beta: intro quiz tách theo cụm Questions X–Y (#301), suy luận T/F/NG + navigator full-width (#303), ô nhập Writing (#304), nộp bài Speaking upload media lên R2 (#305), card lớp hiện giáo viên + trang chi tiết lớp (#307).

Gates chạy trong worktree detached sạch tại `8683772` (working tree chính có WIP test không liên quan, không đụng tới): `pnpm check` PASS, `pnpm check-types --force` 7/7, `pnpm test --force` 1994 test PASS, e2e 126 passed / 1 skipped. Web test cần `VITE_SERVER_URL=http://localhost:8000` (file `.env` bị gitignore nên worktree sạch thiếu).

Review 2 pass: 0 critical, 10 informational. Fix trong ship: runbook + CHANGELOG chưa nhắc migration 0031 → thêm vào bước backup D1 và bảng rollback-safety (đổi thành 0026–0032).

## Decision
- Bump patch theo convention release của repo.
- Không merge `origin/main` vào develop: commit main-only đều là promotion merge commit thuần, zero content delta (precedent #294/#300).
- Thiếu test IDOR cho GET/DELETE media (code đúng, đã verify `ownedAttempt`) để follow-up, không mở rộng scope release.

## Next steps
- Trước deploy prod: bật R2, token có quyền "Workers R2 Storage: Edit", diễn tập staging, backup D1 trước 0031 + 0032.
- Follow-up: test IDOR GET/DELETE media; job đối chiếu object R2 mồ côi.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
