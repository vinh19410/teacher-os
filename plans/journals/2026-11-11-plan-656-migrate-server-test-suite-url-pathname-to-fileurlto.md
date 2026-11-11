---
title: "Plan #656: Migrate server test suite URL pathname to fileURLToPath"
date: 2026-11-11
summary: Chốt kế hoạch TDD --advice chuyển 91 điểm URL(import.meta.url).pathname ở 88 file test của apps/server sang fileURLToPath kèm AST guard test
---

# Plan #656: Migrate server test suite URL pathname to fileURLToPath

# Plan #656: Migrate server test suite URL pathname to fileURLToPath

## What happened
- Điều tra `ak-debug` trên thư mục tiếng Việt thật xác nhận `new URL(..., import.meta.url).pathname` trả chuỗi percent-encoded (`Pick-t%C3%A0i-li%E1%BB%87u...`) làm `drizzle-orm/libsql/migrator` và `node:fs` thất bại toàn bộ trên `88` file `.test.ts` (`91` vị trí `.pathname`) trong `apps/server/src`.
- Red-team 2 reviewer độc lập (`Security Adversary` + `Assumption Destroyer`, Light tier Fact Checker, 36 claims) phát hiện 8 điểm gãy và đã áp trọn vẹn: dùng TypeScript AST `ts.createSourceFile` cho `non-ascii-path-guard.test.ts` (tránh tự bắt string fixture và lỗi xóa comment trên URL), `mktemp -d` + `trap` + `pnpm install --offline --frozen-lockfile` + `VITEST_SKIP_SLOW=0` cho lượt chạy workspace tiếng Việt thật, giới hạn `biome check --write` đúng 89 file allowlist, và dùng parser Git NUL-delimited (`-z -uall`, không `.trim()`).

## Decision
- Khóa phạm vi đúng `test(server):` và ràng buộc `"Không đổi code/migration nào khác"` của `#656`: thêm `1` guard test AST + runtime (`apps/server/src/non-ascii-path-guard.test.ts`), chuyển `88` file `.test.ts` (`91` vị trí) của `apps/server/src` sang `fileURLToPath` từ `node:url`, giữ nguyên `leadGateUrl.href` và HTTP URL `.pathname`, cập nhật `CHANGELOG.md`.

## Next steps
- Commit & push plan + journal (`ak-git cp`), đồng bộ tracking comment + nhãn trên issue `#656`, sau đó thực thi `/ak-fix --auto plans/261111-0520-656-migrations-dir-non-ascii-path/plan.md --advice`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
