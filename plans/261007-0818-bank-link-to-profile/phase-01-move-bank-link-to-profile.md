---
title: "Phase 1: Dời BankLinkPanel vào /profile, gỡ route /payments"
status: done
effort: "1h"
dependencies: []
---

# Phase 1: Dời BankLinkPanel vào /profile, gỡ route /payments

## Overview

**Priority:** P2 · **Status:** todo

Render `<BankLinkPanel />` vào stack Card của `/profile`, xoá route `/payments`, gỡ mục sidebar "Nhận học phí", và cập nhật routes-matcher + các test/unit tham chiếu route cũ. Panel và toàn bộ hạ tầng dưới nó (API, repos, modal, CSP) giữ nguyên.

## Context Links

- Plan gốc tính năng: `plans/261005-0754-sepay-bank-hub-tuition-qr/`
- Precedent gỡ route + matcher assert: issue #321, plan `261005-1523-remove-settings-route` (pin 2 tầng: matcher test + `worker.test.ts`)
- Trang đích: [profile.tsx](../../apps/web/src/routes/_auth/profile.tsx) · Trang nguồn: [payments.tsx](../../apps/web/src/routes/_auth/payments.tsx)
- UI tokens/pattern card: `DESIGN.md` (repo root) — đọc trước khi thêm card/lead theo quy ước AGENTS.md

## Key Insights

- `payments.tsx` chỉ wrap `BankLinkPanel` bằng `PageHead` — panel đã tự chứa `Card variant="white"` + `SectionLabel "Nhận học phí qua chuyển khoản"` nên drop-in khớp pattern `/profile`.
- `/profile` có `validateSearch` đọc `?error=` (lỗi OAuth better-auth) + effect navigate replace (profile.tsx L24-53) — **không đụng**: modal bank dùng postMessage, không thêm search param.
- `routeTree.gen.ts` là file generated (gitignored): KHÔNG sửa tay — Vite plugin của TanStack Router regen khi chạy `vite build` (nằm trong `pnpm --filter web check-types`) hoặc dev server.
- `validStaticRoutes` fixture trong `routes-matcher.test.ts` hiện **không** liệt kê `/payments` (drift guard chỉ check chiều routeTree → matcher) → chỉ cần thêm assert phủ định.

## Requirements

- [x] `/profile` render đủ 4 card: Thông tin cá nhân → Ảnh đại diện → Google → Nhận học phí qua chuyển khoản.
- [x] Không còn route `/payments` (file xoá, routeTree regen không còn entry, verify grep = 0).
- [x] Sidebar không còn mục "Nhận học phí".
- [x] `isValidAppRoute("/payments")` trả `false` có test bảo vệ ở matcher test VÀ worker test.
- [x] Không có tham chiếu code còn sót tới web route `/payments` (ngoài doc/history).

## Implementation Steps

1. **`apps/web/src/routes/_auth/profile.tsx`** — dời panel vào trang:
   - Import `BankLinkPanel` từ `@/components/payments/bank-link-panel`.
   - Thêm `<BankLinkPanel />` vào stack sau `<GoogleLinkCard />` (khối `flex flex-col gap-5`, hiện L69-73).
   - Cập nhật `PageHead` lead: `"Tên hiển thị, ảnh đại diện và liên kết Google."` → liệt kê thêm tài khoản ngân hàng **kèm ý QR tự đối soát** (red-team AD-5: giữ dòng giải thích duy nhất của tính năng cho mọi trạng thái panel), ví dụ: `"Tên hiển thị, ảnh đại diện, liên kết Google và tài khoản ngân hàng nhận học phí qua mã QR tự đối soát."`
2. **Xoá `apps/web/src/routes/_auth/payments.tsx`** (`git rm`). Không sửa `routeTree.gen.ts` tay.
3. **`apps/web/src/components/layout/sidebar.tsx`** — gỡ block nav item `to: "/payments"` (L89-103, gồm SVG icon).
4. **`apps/web/src/routes-matcher.ts`** — gỡ dòng `"/payments": true,` (L15) khỏi `VALID_EXACT_ROUTES`.
5. **`apps/web/src/routes-matcher.test.ts`** — trong test `"rejects random unknown paths"` (L94-101), thêm theo precedent `/settings`:
   ```ts
   // Route /payments đã gỡ — panel bank link dời về /profile.
   expect(isValidAppRoute("/payments")).toBe(false);
   ```
6. **`apps/web/src/worker.test.ts`** — pin tầng worker (precedent #321 đã ship pin cả 2 tầng, khối `/settings` tại L100-103): thêm `"/payments"` vào list unknown-paths cùng comment tương tự. (red-team SA-1)
7. **`apps/web/src/lib/profile.contract.test.ts`** — thêm pin wiring panel (file này parse source `profile.tsx`, precedent #321 từng sửa): assert source chứa `<BankLinkPanel />` và vị trí sau `<GoogleLinkCard />` (index of match lớn hơn). (red-team SA-3)
8. **`apps/web/src/components/payments/bank-link-panel.tsx`** — sửa doc comment L17-22: "Trang 'Nhận học phí' (`/payments`)" → mô tả mới nói panel nằm ở trang Hồ sơ (`/profile`). Không đổi logic.
9. **`apps/web/src/security-headers.test.ts`** — L110: URL mẫu `https://app.teacheros.io.vn/payments` → `https://app.teacheros.io.vn/profile` (assert CSP không phụ thuộc route, chỉ để hết reference route chết).
10. **Regen routeTree + typecheck + verify tường minh (red-team AD-2):** `pnpm --filter web check-types` (vite build regen `routeTree.gen.ts` rồi `tsc --noEmit`), sau đó `grep -c payments apps/web/src/routeTree.gen.ts` phải = 0. **Thứ tự gate bắt buộc: check-types TRƯỚC `pnpm --filter web test`** — drift guard trong `routes-matcher.test.ts` return sớm khi `routeTree.gen.ts` vắng mặt, và vitest không regen file này (chỉ `vite.config.ts` có plugin tanStackRouter).

## Todo

- [x] profile.tsx: import + render BankLinkPanel, cập nhật lead (kèm ý QR tự đối soát)
- [x] Xoá routes/_auth/payments.tsx
- [x] sidebar.tsx: gỡ nav item "Nhận học phí"
- [x] routes-matcher.ts: gỡ entry "/payments"
- [x] routes-matcher.test.ts: assert /payments invalid
- [x] worker.test.ts: pin "/payments" unknown-paths
- [x] profile.contract.test.ts: pin BankLinkPanel sau GoogleLinkCard
- [x] bank-link-panel.tsx: cập nhật doc comment
- [x] security-headers.test.ts: đổi URL mẫu
- [x] `pnpm --filter web check-types` pass (routeTree regen sạch) + `grep -c payments routeTree.gen.ts` = 0
- [x] `pnpm --filter web test` pass (chạy SAU check-types)

## Success Criteria

- `pnpm --filter web check-types` + `pnpm --filter web test` pass (theo thứ tự đó); `routeTree.gen.ts` regen xong, `grep -c payments` = 0.
- `grep -rn '"/payments"' apps/web/src` chỉ còn (nếu có) comment history — không còn code dùng.
- Build dev không lỗi: `/profile` render 4 card đúng thứ tự.

## Risk Assessment

- Quên regen `routeTree.gen.ts` → typecheck fail ngay (`createFileRoute("/_auth/payments")` không còn) — tự phát hiện, không rò ra production.
- Test `profile.spec.ts` e2e chạy sau Phase 1 (trước khi e2e spec #320 đổi URL) vẫn pass vì không assert panel bank; assert lead trang không tồn tại.
- Pre-flight trước merge: `gh secret list` các environment — nếu thấy BANKHUB/SEPAY secret set ở production, dừng hỏi user (xem plan.md Risk).

## Security Considerations

- Không đổi auth guards: `/profile` vẫn nằm trong `_auth` layout guard (`beforeLoad` check session, redirect `/login?returnUrl=`).
- **Panel là kernel API call đầu tiên của `/profile` (red-team SA-4)**: kích hoạt `queryCache.onError` toàn cục — 401 → `reauth()`, 403 `STUDENT_ON_TEACHER_APP` → `markRoleBlocked()` (one-way). Trước đây trang chỉ dùng better-auth nên không có nhánh này. Hướng thay đổi an toàn hơn (fail-loud sớm); không nới role gate server để "sửa" 403 của panel.
- **Trạng thái panel là org-scoped (red-team AD-3)**: đọc/ghi theo `orgId` (bảng `org_bank_link`, server comment "one active account per org" tại `bank-link.ts:171-172`), không phải "của chính user". Hiện org = 1 teacher nên tương đương user; nếu multi-member org xuất hiện sau, cần quyết định quyền unlink/reactivate riêng.

## Next Steps

- Phase 2: e2e goto `/profile`, docs, gate cuối.
