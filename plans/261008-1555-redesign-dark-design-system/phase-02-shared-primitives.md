---
phase: 2
title: "Primitive dùng chung + minh họa SVG"
status: pending
priority: P1
effort: "5h"
dependencies: [1]
---

# Phase 2: Primitive dùng chung + minh họa SVG

## Goal

Đưa các primitive UI về đúng ngôn ngữ design (design `src/lib/ui.tsx` làm
tham chiếu) **mà không đổi API props đang dùng** — mọi trang tự đổi theo. Chỉ thêm prop tùy
chọn khi design cần (kicker/action cho PageHead, `hot` cho StatCard).

## Files to Create / Modify

Web (`apps/web/src/components/ui/`):
- Modify: `button.tsx` — `primary`: `bg-fg text-bg hover:bg-hot hover:text-accent-on`;
  `secondary`: `neu-sm text-fg`; `ghost`: chữ `fg`, hover cam; `danger`: viền + chữ
  `destructive`, hover nền `destructive/10`. Radius `rounded-lg` (8px) thay `rounded-full`.
  Giữ `size`, `ref`, `type`, `disabled`.
- Modify: `card.tsx` — `Card` cả 2 variant → `neu` (`white` = `bg-bg` + viền để phân tầng trên
  nền raise); `StatCard` thêm prop tùy chọn `sub?: string`, `hot?: boolean`; nhãn mono
  uppercase `tracking-[0.18em] text-meta` ở trên, số `font-display font-extrabold
  text-[clamp(1.75rem,2.6vw,3rem)]`; `hot` = nền `fg`, số cam. **Giữ thứ tự DOM** số/nhãn hiện
  tại hoặc kiểm unit test `student-tuition-summary.test.tsx` & e2e không phụ thuộc thứ tự.
- Modify: `page-head.tsx` — thêm `kicker?: ReactNode`, `action?: ReactNode`; kicker mono 11px
  uppercase `tracking-[0.2em] text-hot`; tiêu đề `font-display font-extrabold
  text-[clamp(40px,6vw,72px)] leading-[0.95] tracking-[-0.045em]`; `lead` giữ dưới tiêu đề;
  `action` căn đáy bên phải, wrap trên mobile. `h1` giữ nguyên (e2e dùng heading name).
- Modify: `tabs.tsx` — segmented: container `neu-in rounded-lg p-1.5 inline-flex`, tab active
  `neu-sm text-hot` (nền raise), inactive `text-muted-fg hover:text-fg`. Giữ
  `role="tablist"/"tab"`, `aria-selected`, keyboard hiện có (`tabs.test.tsx`).
- Modify: `badge.tsx` — mono 10px uppercase `tracking-widest rounded-full px-2.5 py-1`;
  `success` → `bg-chip text-fg`, `accent` → `border border-fg text-fg`, `warn` →
  `border border-dashed border-meta text-meta`, `danger` → `bg-hot text-accent-on font-bold`,
  `muted` → `neu-in text-fg`. Bỏ `dot` hay giữ? Giữ prop, chấm dùng `bg-current`.
- Modify: `tag.tsx` — `neu-in` mono uppercase như design `Tag`; thêm `hot?: boolean`.
- Modify: `section-label.tsx` — `tracking-[0.18em]`, giữ `text-meta`.
- Modify: `field.tsx` — label mono 11px uppercase `tracking-[0.18em] text-meta`; input/select/
  textarea `neu-in rounded-md px-4 py-2.5 border border-line-strong focus-visible:ring-2
  ring-hot/40`. Giữ cơ chế `aria-invalid`/error id (`field.test.tsx`); lỗi chữ
  `text-danger` (= cam).
- Modify: `modal.tsx` — overlay `bg-black/60 backdrop-blur-sm` (design dùng `bg-hot/80` — quá
  gắt, lệch có chủ đích, ghi vào DESIGN.md); panel `neu rounded-md`; tiêu đề `font-display
  font-extrabold text-xl`; nút đóng `✕` mono hover cam. Giữ focus trap/Esc/aria.
- Modify: `data-table.tsx` — wrapper `neu rounded-md px-5 py-2 overflow-x-auto`; `th` mono 11px
  uppercase `tracking-[0.15em] font-normal text-meta`; hàng `border-t border-line`, hover chữ
  cam (chỉ khi hàng clickable).
- Modify: `chip-filter.tsx`, `chip-multi.tsx` — chip `neu-sm rounded-md` (design dùng nút
  `rounded-md` liền nhau cho skill); selected `neu-in text-hot font-medium`. Giữ
  `role="group"`, `aria-pressed`, badge đếm `aria-hidden`.
- Modify: `progress.tsx` — track `bg-surface`, fill `bg-hot`.
- Modify: `avatar.tsx` — fallback `neu-sm text-hot font-medium`.
- Modify: `currency-input.tsx`, `rich-text-editor.tsx` — chỉ đổi class input theo `field.tsx`.

`packages/ui/src/components/` (shadcn + dùng chung web/student):
- Modify: `button.tsx`, `input.tsx`, `textarea.tsx`, `checkbox.tsx`, `card.tsx`, `dropdown-menu.tsx`,
  `tooltip.tsx`, `skeleton.tsx`, `empty.tsx`, `input-group.tsx` — rà class: thay radius lớn,
  `bg-white`, `ring` xanh; dựa vào token đã đổi ở phase 1; checkbox checked = `bg-hot`.
- Create: `packages/ui/src/components/illustrations.tsx` — port `TeacherDesk`, `MorningSpot`,
  `StudentSpot` từ design `src/lib/art.tsx`, stroke/fill qua `var(--fg)`, `var(--chip)`,
  `var(--surface-warm)`; bỏ `<text fontFamily="Shantell Sans">` (font không có) → dùng
  `var(--font-display)`; `aria-label` tiếng Việt; `aria-hidden` khi trang trí thuần.

## Tasks & Steps

1. Đọc `DESIGN.md` hiện tại + design `src/lib/ui.tsx` (clone ở
   `/tmp/teacheros-design-src/repo`, hoặc `gh repo clone vinh19410/teacheros-design`).
2. Sửa từng primitive theo danh sách; mỗi file chạy test đi kèm ngay (`pnpm --filter web
   vitest run src/components/ui/<file>`).
3. Grep tất cả nơi dùng `<Button variant="danger"` và link "Xóa"/"Hủy" dạng text để chắc chúng
   dùng `destructive` (đỏ), còn trạng thái lỗi/quá hạn dùng `danger` (cam). Danh sách nơi
   sửa ghi vào phase 7 nếu nằm trong file của phase 4/5/6.
4. Port minh họa, render thử trong 2 theme.

## Verification

- `pnpm --filter web test` (avatar, chip-multi, currency-input, data-table, field, tabs,
  payment-qr-panel, rich-text-*), `pnpm --filter student test`, `pnpm check-types`.
- Không đổi accessible name: `grep -rn "getByRole\|getByLabel" apps/e2e/specs` cho các
  primitive đã đổi cấu trúc (Tabs, ChipFilter, Modal) và chạy spec liên quan:
  `pnpm --filter e2e e2e specs/assignment-bank.spec.ts specs/class-operations.spec.ts` (port override).

## Rollback

Revert commit phase 2; token phase 1 vẫn cho UI cũ đổi màu hợp lệ.
