---
title: ship-beta-681-media-upload-magic-bytes
date: 2026-11-11
summary: "Ship beta #681: khóa 3 lớp extension↔MIME↔magic-byte 64B trên 5 upload surfaces; server 1421✓ api 430✓ E2E âm 5/5✓."
---

# ship-beta-681-media-upload-magic-bytes

## What happened
Ship beta PR cho issue #681 (branch chore/681-media-upload-magic-bytes): module media-magic.ts mới, peeked.abort(), CAS Vocab, bounded-read exam-import, 3 client uploader đồng bộ, E2E âm mới 5/5 pass, docs + changelog.

## Decision
Local 2-stage review (spec + security) xử lý 9/11 findings trong PR; 2 rejected có chủ ý (pre-peek body.cancel trên path cũ — ngoài scope; SPA-cache vocab — ghi chú deploy trong PR body).

## Next steps
PR review (ak-review-pr --fix --reply), label ready to ship beta, merge develop, watch CI.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
