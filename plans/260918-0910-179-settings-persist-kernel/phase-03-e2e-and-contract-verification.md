---
title: "Phase 3: Contract Tests & E2E Verification"
description: "Chạy toàn bộ test suites của server và web, kiểm tra chất lượng mã nguồn (biome, check-types), kiểm tra bảo mật và không hồi quy."
status: completed
---

# Phase 3: Contract Tests & E2E Verification

## 1. Scope of Verification

- Kiểm tra tính toàn vẹn của database migrations:
  - `pnpm --filter @teacher-os/db run db:generate` sinh đúng file migration.
  - In-memory SQLite migration trong `apps/server/src/kernel.test.ts` áp dụng thành công.
- Server test suite:
  - Tất cả integration test cho `/api/kernel/settings` pass.
  - Toàn bộ 224+ tests hiện có của server pass 100%.
- Web test suite:
  - Unit tests của `apps/web` (bao gồm `settings.test.tsx`) pass 100%.
- Biome & Typescript:
  - `pnpm check` exit 0 (không có lint / formatting error).
  - `pnpm check-types` sạch toàn bộ monorepo.
- Verification gates:
  - Xác nhận dữ liệu được lưu thật, reload trang giữ nguyên giá trị, không có fake UI.
