---
title: "Ship #647: CSP media inline + trần 95 MiB + E2E upload/học sinh qua ?org="
date: 2026-11-11
summary: "PR #674 merged vào develop (528a07b4), CI + Deploy Staging xanh, POT đã đăng"
---

# Ship #647: CSP media inline + trần 95 MiB + E2E upload/học sinh qua ?org=

## What happened
- `ak-vibe --ship --beta --advice` cho issue #647 hoàn tất: PR #674 merge squash vào `develop` (merge commit `528a07b4`), CI + Deploy Staging trên merge commit đều `success`.
- 4 advisory checkpoint kongming chạy OK (post-investigate, post-plan, Verify-fail Phase 1, gate Phase 1); checkpoint post-PR gate **fallback** qua model session vì host hết quota Opus 5.5 — verdict `APPROVE` đã đăng lên PR.
- Verify-fail duy nhất: `Referrer-Policy: no-referrer` bị `secureHeaders` của Hono ghi đè — theo counsel kongming fix 1 dòng trong vòng override `app.ts:333-342` thay vì đổi global policy.

## Decision
- CSP tách theo `disposition` có chuẩn hoá MIME; trần media hạ 95 MiB (dưới 100 MB SI Cloudflare Free/Pro edge) thay vì chỉ ghi chú kiểm tay.
- E2E mới cố ý để negative control: học viên đa-org không `?org=` → 404 (chứng minh `rows[0]` fallback), chống test giả dương.

## Next steps
- Kiểm tay staging Safari/Firefox «Phát»/«Mở» + tua Range 206 + upload ~96 MB (khoảng mù Playwright Chromium) — đã liệt kê trong POT trên #647.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
