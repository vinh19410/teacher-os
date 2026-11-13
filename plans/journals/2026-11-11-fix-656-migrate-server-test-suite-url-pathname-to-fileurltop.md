---
title: "Fix #656: Migrate server test suite URL pathname to fileURLToPath"
date: 2026-11-11
summary: Chuyển 91 điểm URL(import.meta.url).pathname ở 88 file test của apps/server sang fileURLToPath(...href) kèm AST guard test và xác minh 107/107 file xanh trên đường dẫn tiếng Việt
---

# Fix #656: Migrate server test suite URL pathname to fileURLToPath

## What happened
- Thực thi Phase 1 (TDD Red): tạo `apps/server/src/non-ascii-path-guard.test.ts` kết hợp kiểm thử runtime `migrate()` của Drizzle trên đường dẫn tiếng Việt tạm thời trong `os.tmpdir()` và bộ quét AST `ts.createSourceFile` trên toàn bộ `202` file `.ts` của `apps/server/src`. Sau khi bỏ từ khóa `export` khỏi hàm helper nội bộ để tuân thủ `lint/suspicious/noExportsInTest`, bài kiểm quét tĩnh xác lập trạng thái TDD Red bắt chính xác `OFFENDING_COUNT=88`.
- Thực thi Phase 2 (TDD Green): dùng AST codemod (`xd://ast_edit`) và `edit` chuyển toàn bộ `91` vị trí lấy `.pathname` trên `new URL(..., import.meta.url)` ở `88` file `.test.ts` sang `fileURLToPath(new URL(..., import.meta.url).href)` từ `node:url`.
- Khi chạy `pnpm check-types` (`tsc -b`), phát hiện xung đột kiểu giữa global `URL` của `@cloudflare/workers-types` và `import("node:url").URL` (`TS2345` trên `searchParams.entries()`). Đã áp đúng tiền lệ có sẵn trong repo (`packages/infra/src/flat-migrations.test.ts:13`, `packages/api/src/srs/*.test.ts`): truyền chuỗi `.href` vào `fileURLToPath(new URL(..., import.meta.url).href)` — vừa thỏa mãn `tsc -b` trên cả 12 package, vừa giải mã percent-encoding chính xác trên mọi đường dẫn tiếng Việt.

## Decision
- Đặt `CI=1` khi chạy toàn bộ `107` file test của `apps/server` trong bản sao workspace tiếng Việt tạm thời để `vitest.config.ts` giới hạn `maxWorkers: 2`, tránh tranh chấp CPU trên máy chia sẻ 4 core.
- Giữ nguyên tuyệt đối `leadGateUrl.href` (`lead-catalog-drift.test.ts:85-89`), HTTP URL `.pathname` (`bank-hub-client.test.ts:487,533,569`), và toàn bộ `95` file code runtime / migration.

## Next steps
- Hoàn tất `/ak-code-review --pending --advice`, ship PR beta vào `develop` qua `/ak-ship beta --advice`, chạy `/ak-review-pr --fix --reply --advice`, merge khi CI xanh và đăng POT lên issue `#656`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
