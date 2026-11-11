---
title: "Ship beta #676: validate material upload extensions and magic bytes"
date: 2026-11-11
summary: "Ship PR beta vào develop cho #676 kèm kế hoạch completed và follow-up #681."
---

# Ship beta #676: validate material upload extensions and magic bytes

## What happened
- Ship nhánh `chore/676-upload-extension-magic-bytes` về `develop` (`beta`) cho issue #676 sau khi pass toàn bộ gate local, E2E preview và sửa đủ 3/3 góp ý Minor của `LocalCodeReviewer`.

## Decision
- Giữ `docs/` là no-op có chủ đích theo tư vấn của Kongming vì `peek-stream.ts` mới có 1 caller tại `materials.ts` (sẽ mở rộng pointer dùng chung ở #681).

## Next steps
- Chạy `/ak-review-pr --fix --reply --advice`, gắn nhãn `ready to ship beta`, đăng báo cáo hậu kiểm Kongming & POT lên PR / issue #676, merge vào `develop` và canh CI xanh.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
