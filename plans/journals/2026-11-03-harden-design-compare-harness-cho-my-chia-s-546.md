---
title: "Harden design-compare harness cho máy chia sẻ (#546)"
date: 2026-11-03
summary: "Sửa 5 root cause: signup flag, port hijack + fingerprint, compose stale, blank-PNG pixel check, process-group cleanup."
---

# Harden design-compare harness cho máy chia sẻ (#546)

## What happened
`design:compare` fail lặp trên workstation nhiều agent session (4 run liên tiếp, 4 nguyên nhân khác nhau — issue #546). ak-debug xác thực 5 root cause: thiếu `VITE_TEACHER_SIGNUP_ENABLED` trong capture.mjs; `fetch-design.sh` tin nhầm HTTP 200 lạ trên port design; compose skip vô điều kiện khi ảnh tham chiếu đã commit; `shoot()` không kiểm tra pixel → ảnh trắng 100% được tính "0 lỗi"; `spawnSync` block event loop + cleanup không leo thang SIGKILL → orphan api/web/student/design-v2.

## Decision
Tách `scripts/design-compare/harness-lib.mjs` (thuần, 23 test) + cứng hoá `fetch-design.sh` (port check trước git, DESIGN_NO_REUSE=1 → exit 3, identity check trước khi kill) + rewrite lifecycle `capture.mjs` (shutdown idempotent một promise, chromium handleSIG*=false, backstop 'exit' sync-only có /proc identity check). Kongming GO 3 checkpoint (post-investigation, post-plan-gates, pre-ship). Red-team 2 reviewer: 15 findings (6 Critical) — chấp nhận toàn bộ.

## Next steps
- PR beta → develop; merge xong theo dõi CI develop 1 lượt (test tích hợp dùng process group thật + git — nếu CI đỏ do môi trường thì nới timeout/env, không revert).
- Blank-shot rate ~1 ảnh/run trên máy đang tải → fail-loud + caller chạy lại (nhất quán #402).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
