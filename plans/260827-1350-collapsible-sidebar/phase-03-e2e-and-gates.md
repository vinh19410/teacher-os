---
phase: 3
title: "E2E coverage + gates"
status: pending       # pending | in-progress | completed
priority: P1
effort: "~1-2h"
dependencies: [2]
---

# Phase 3: E2E coverage + gates

## Overview

Khoá hành vi collapse bằng Playwright e2e (toggle, persistence, mobile-drawer invariant) và chạy toàn bộ gates của repo. Phase này là đường phóng vệ chính chống lại risk specificity (D10) và regression specs cũ.

## Requirements

- Functional: e2e phủ 4 kịch bản then chốt (P3-i..iv bên dưới).
- Non-functional: toàn bộ CI gates xanh kể cả specs có sẵn không sửa; không thêm dependency e2e mới.

## Architecture

Spec mới `apps/e2e/specs/sidebar-collapse.spec.ts`, đặt theo pattern specs hiện có (login qua helper dùng chung nếu có — xem `apps/e2e/specs/profile.spec.ts` đang setup session thế nào). Playwright config mặc định viewport 1280×720 (desktop) và mỗi test context riêng nên localStorage sạch; config đã `serviceWorkers: "block"` với tiền lệ assert persistence bằng reload.

### Kịch bản bắt buộc

| # | Kịch bản | Assert chính |
|---|----------|--------------|
| i | Toggle rail trên desktop | Click nút toggle → track đổi (assert `boundingBox` sidebar width ~64 vs ~248 hoặc computed grid-template-columns); click lần nữa quay về 248 |
| ii | Persistence | Toggle collapsed → `page.reload()` → vẫn còn rail 64px; toggle mở → reload → 248px |
| iii | **Mobile drawer invariant** (kongming work checklist) | Seed localStorage bằng **`page.addInitScript`** (collapsed được đọc bằng useState lazy-init ngay render đầu — `page.evaluate` sau `goto` là QUÁ MUỘN và test sẽ xanh oan), viewport <921px (ví dụ 390×844) → mở drawer bằng hamburger → drawer full-label 280px: label nav text visible (`app:hidden`-collapse KHÔNG được ăn ở mobile) |
| iv | Điều hướng từ rail | Ở chế độ rail click icon "Học viên" → URL `/students`; testid `sidebar-user-email` còn trong DOM ở cả hai trạng thái. KHÔNG assert `sidebar-avatar`: nó nằm trên `<img>` chỉ render khi user có ảnh (`apps/web/src/components/ui/avatar.tsx:52-64`) — user tạo qua signup UI không có ảnh |

## Related Code Files

- Create: `apps/e2e/specs/sidebar-collapse.spec.ts`
- Modify (chỉ khi spec cũ assert visibility): `apps/e2e/specs/profile.spec.ts` — xem Risk bảng dưới

## Implementation Steps

1. Đọc pattern setup/login của `profile.spec.ts` + helper chung (nếu có), dựng skeleton spec theo đúng style.
2. Viết 4 test case theo bảng trên. Width assertion dùng boundingBox với tolerance ±2px, đừng assert pixel cứng tuyệt đối.
3. Chạy full suite local: `pnpm --filter e2e test` (hoặc lệnh playwright của repo) → đảm bảo `login.smoke.spec.ts` + `profile.spec.ts` pass nguyên trạng thái.
4. Chạy toàn bộ gates như CI: `biome check .` (read-only — CẢNH BÁO: script root `pnpm check` là `biome check --write .` auto-fix, không dùng làm gate), `pnpm check-types`, build, vitest, playwright (tựa các workflow `.github/workflows/*`). Fix mọi findings thuộc plan này.

## Success Criteria

- [ ] `sidebar-collapse.spec.ts` pass đủ 4 kịch bản (i–iv)
- [ ] Specs cũ pass không sửa logic nào
- [ ] Toàn bộ gates xanh tương đương CI: `biome check .` + `pnpm check-types` + build + vitest + playwright

## Risk Assessment

| Risk | Tín hiệu cảnh báo | Phản ứng định trước |
|------|-------------------|---------------------|
| Spec cũ `profile.spec.ts` fail vì name/email bị ẩn visual (visibility assert thay vì DOM presence) | Fail ở dòng assert email/name | Nếu spec dùng `toBeVisible()` → cập nhật spec ở PHASE NÀY để chấp nhận sr-only/hidden (thay đổi thẩm quyền nằm đây); ghi rõ trong commit message lý do |
| BoundingBox nhảy do scrollbar/transition chưa xong | Assert width sai lệch nhỏ | Chờ animation settle (`waitForTimeout(250)` sau click hoặc assert aria-label state) |
| Viewport mobile test dính breakpoint giữa (921px) | Test flaky | Dùng 390×844 cách xa mốc 921 |
