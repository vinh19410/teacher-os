# Phase 01 — Sửa UserFooter, test, verify UI

## Context

Xem [plan.md](plan.md). Lỗi nằm ở `packages/ui/src/components/app-shell/user-footer.tsx` (wrapper block chứa `{control}{user.trailing}`).

## Files

- Sửa: `packages/ui/src/components/app-shell/user-footer.tsx`
- Thêm test: `packages/ui/src/components/app-shell/user-footer.test.tsx` (hoặc mở rộng `apps/web/src/components/layout/app-shell.test.tsx` nếu `packages/ui` chưa có môi trường DOM cho component — kiểm tra `vitest.config` trước)
- Không sửa: `apps/web/src/components/layout/app-shell.tsx` (nút trailing đã `size-8 shrink-0`)

## Steps

1. Đọc `DESIGN.md` mục sidebar và `REVIEW.md`.
2. Trong `UserFooter`, đổi wrapper thành `className={cn("relative flex items-center gap-1", collapsed && "lg:flex-col")}`.
3. Thêm `min-w-0 flex-1` vào `rowClass` của `control` (ở rail `lg:flex-none` hoặc `lg:w-full` tuỳ kết quả quan sát để avatar không bị kéo giãn).
4. Giữ `{user.trailing}` ngay sau `control`; menu popover giữ `absolute`.
5. Viết test: có `trailing` thì nút và link hồ sơ có chung parent flex; không có `trailing` thì không thêm node thừa.
6. Chạy app (e2e boot theo AGENTS.md, port 8100/8101…), chụp 3 viewport (1440×900, 768×1024, 375×812) ở trạng thái mở rộng, thu gọn và drawer; kiểm tên dài truncate, focus bàn phím vào nút đăng xuất.
7. `pnpm design:compare` vì PR đụng hình ảnh; đính screenshot vào PR.

## Validation

- `pnpm exec biome check .`
- `pnpm check-types`
- `pnpm --filter @teacher-os/ui test` và `pnpm --filter web test`
- E2E: spec dùng `Đăng xuất`/`sidebar-user-email` (`apps/e2e/specs/account-role-separation.spec.ts`), rồi full e2e theo quy ước trước khi merge vào develop.

## Risk / Rollback

Rủi ro thấp, chỉ đổi class Tailwind. Rail 64px là điểm dễ lệch nhất — verify bằng mắt. Rollback bằng revert một commit.
