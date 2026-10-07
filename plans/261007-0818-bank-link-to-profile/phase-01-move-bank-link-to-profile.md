---
title: "Phase 1: Dời BankLinkPanel vào /profile, gỡ route /payments"
status: todo
effort: "1h"
dependencies: []
---

# Phase 1: Dời BankLinkPanel vào /profile, gỡ route /payments

## Overview

**Priority:** P2 · **Status:** todo

Render `<BankLinkPanel />` vào stack Card của `/profile`, xoá route `/payments`, gỡ mục sidebar "Nhận học phí", và cập nhật routes-matcher + các test/unit tham chiếu route cũ. Panel và toàn bộ hạ tầng dưới nó (API, repos, modal, CSP) giữ nguyên.

## Context Links

- Plan gốc tính năng: `plans/261005-0754-sepay-bank-hub-tuition-qr/`
- Precedent gỡ route + matcher assert: issue #321, plan `261005-1523-remove-settings-route`
- Trang đích: [profile.tsx](../../apps/web/src/routes/_auth/profile.tsx) · Trang nguồn: [payments.tsx](../../apps/web/src/routes/_auth/payments.tsx)

## Key Insights

- `payments.tsx` chỉ wrap `BankLinkPanel` bằng `PageHead` — panel đã tự chứa `Card variant="white"` + `SectionLabel "Nhận học phí qua chuyển khoản"` nên drop-in khớp pattern `/profile`.
- `/profile` có `validateSearch` đọc `?error=` (lỗi OAuth better-auth) + effect navigate replace (profile.tsx L24-53) — **không đụng**: modal bank dùng postMessage, không thêm search param.
- `routeTree.gen.ts` là file generated (gitignored): KHÔNG sửa tay — Vite plugin của TanStack Router regen khi chạy `vite build` (nằm trong `pnpm --filter web check-types`) hoặc dev server.
- `validStaticRoutes` fixture trong `routes-matcher.test.ts` hiện **không** liệt kê `/payments` (drift guard chỉ check chiều routeTree → matcher) → chỉ cần thêm assert phủ định.

## Requirements

- [ ] `/profile` render đủ 4 card: Thông tin cá nhân → Ảnh đại diện → Google → Nhận học phí qua chuyển khoản.
- [ ] Không còn route `/payments` (file xoá, routeTree regen không còn entry).
- [ ] Sidebar không còn mục "Nhận học phí".
- [ ] `isValidAppRoute("/payments")` trả `false` có test bảo vệ.
- [ ] Không có tham chiếu code còn sót tới web route `/payments` (ngoài doc/history).

## Implementation Steps

1. **`apps/web/src/routes/_auth/profile.tsx`** — dời panel vào trang:
   - Import `BankLinkPanel` từ `@/components/payments/bank-link-panel`.
   - Thêm `<BankLinkPanel />` vào stack sau `<GoogleLinkCard />` (khối `flex flex-col gap-5`, hiện L69-73).
   - Cập nhật `PageHead` lead: `"Tên hiển thị, ảnh đại diện và liên kết Google."` → `"Tên hiển thị, ảnh đại diện, liên kết Google và tài khoản ngân hàng nhận học phí."`
2. **Xoá `apps/web/src/routes/_auth/payments.tsx`** (`git rm`). Không sửa `routeTree.gen.ts` tay.
3. **`apps/web/src/components/layout/sidebar.tsx`** — gỡ block nav item `to: "/payments"` (L89-103, gồm SVG icon).
4. **`apps/web/src/routes-matcher.ts`** — gỡ dòng `"/payments": true,` (L15) khỏi `VALID_EXACT_ROUTES`.
5. **`apps/web/src/routes-matcher.test.ts`** — trong test `"rejects random unknown paths"` (L94-101), thêm theo precedent `/settings`:
   ```ts
   // Route /payments đã gỡ — panel bank link dời về /profile.
   expect(isValidAppRoute("/payments")).toBe(false);
   ```
6. **`apps/web/src/components/payments/bank-link-panel.tsx`** — sửa doc comment L17-22: "Trang 'Nhận học phí' (`/payments`)" → mô tả mới nói panel nằm ở trang Hồ sơ (`/profile`). Không đổi logic.
7. **`apps/web/src/security-headers.test.ts`** — L110: URL mẫu `https://app.teacheros.io.vn/payments` → `https://app.teacheros.io.vn/profile` (assert CSP không phụ thuộc route, chỉ để hết reference route chết).
8. **Regen routeTree + typecheck:** `pnpm --filter web check-types` (vite build regen `routeTree.gen.ts` rồi `tsc --noEmit`).

## Todo

- [ ] profile.tsx: import + render BankLinkPanel, cập nhật lead
- [ ] Xoá routes/_auth/payments.tsx
- [ ] sidebar.tsx: gỡ nav item "Nhận học phí"
- [ ] routes-matcher.ts: gỡ entry "/payments"
- [ ] routes-matcher.test.ts: assert /payments invalid
- [ ] bank-link-panel.tsx: cập nhật doc comment
- [ ] security-headers.test.ts: đổi URL mẫu
- [ ] `pnpm --filter web check-types` pass (routeTree regen sạch)
- [ ] `pnpm --filter web test` pass

## Success Criteria

- `pnpm --filter web check-types` + `pnpm --filter web test` pass; `routeTree.gen.ts` regen xong không còn `/payments`.
- `grep -rn '"/payments"' apps/web/src` chỉ còn (nếu có) comment history — không còn code dùng.
- Build dev không lỗi: `/profile` render 4 card đúng thứ tự.

## Risk Assessment

- Quên regen `routeTree.gen.ts` → typecheck fail ngay (`createFileRoute("/_auth/payments")` không còn) — tự phát hiện, không rò ra production.
- Test `profile.spec.ts` e2e chạy sau Phase 1 (trước khi e2e spec #320 đổi URL) vẫn pass vì không assert panel bank; assert lead trang không tồn tại.

## Security Considerations

- Không đổi auth: `/profile` vẫn nằm trong `_auth` layout guard (`beforeLoad` check session, redirect `/login?returnUrl=`).
- Panel chỉ hiển thị trạng thái tài khoản ngân hàng của chính user đăng nhập — không đổi.

## Next Steps

- Phase 2: e2e goto `/profile`, docs, gate cuối.
