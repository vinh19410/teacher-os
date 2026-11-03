# Phase 01 — Chevron cho Select ở primitive và dọn call site

## Context

Xem [plan.md](plan.md). Đọc `DESIGN.md` và `REVIEW.md` trước khi sửa.

## Files

- Sửa: `packages/ui/src/components/web-kit/field.tsx` (`Select`)
- Sửa: `packages/ui/src/styles/globals.css` (class `select-chevron`, biến light/dark)
- Sửa: `apps/web/src/routes/_auth/leads/index.tsx` (dùng `Select`); `apps/web/src/components/modals/invoice-payment-modal.tsx` (giữ `<select>` thô + class chung `select-chevron pr-9` — chuyển sang `Select` sẽ vỡ control compact vì caller `px-2` xoá `pr-9` qua twMerge và `inputCls` kéo `h-9 w-full`); thêm cả 3 select thô placement-test (`bands-editor.tsx`, `clip-card.tsx`, `question-card.tsx`) chuyển sang `Select`
- Sửa: `apps/student/src/components/practice/practice-filters.tsx` (bỏ `ChevronDown` overlay, dùng class chung)
- Test: `apps/web/src/components/ui/field.test.tsx` (mở rộng)

## Steps

1. Quan sát lỗi bằng boot e2e (port 8100/8101…) ở `/leads` và một modal có `Select`; ghi lại padding hiện tại.
2. Thêm `.select-chevron` trong `globals.css`: `appearance: none` (kèm `-webkit-appearance` cho Safari cũ), `background-repeat: no-repeat`, `background-position: right 0.75rem center`, `background-size: 1rem`, `background-image` SVG chevron-down nhúng cứng màu (biến CSS không vào được `url()`); override trong `.dark .select-chevron`; fallback `appearance: auto` khi `forced-colors: active` để giữ affordance dropdown. Padding phải do `pr-9` ở Select primitive đảm nhiệm, không nằm trong class.
3. `Select` thêm class `select-chevron` vào `cn(inputCls, ...)`.
4. Chuyển `#lead-status` và 3 select placement-test sang `Select`; invoice-payment giữ `<select>` thô với class chung; bỏ overlay ở student.
5. Test: `Select` có class `select-chevron` và vẫn nhận `className`, `defaultValue`, `disabled`.
6. Verify 3 viewport (1440×900, 768×1024, 375×812), light/dark, keyboard focus; kiểm `option` dài và `min-w` hẹp. Chạy `pnpm design:compare` và đính screenshot vào PR.

## Validation

- `pnpm exec biome check .`
- `pnpm check-types`
- `pnpm --filter web test`, `pnpm --filter student test`, `pnpm --filter @teacher-os/ui test` nếu có
- E2E: `pnpm --filter e2e e2e` (spec dùng select theo label/role không bị ảnh hưởng vì vẫn là `<select>`)

## Risk / Rollback

- Rủi ro: `background-image` không dùng được `currentColor`, nên phải có biến theo theme. Safari từng bỏ qua `appearance: none` thiếu tiền tố: kiểm `-webkit-appearance` nếu Tailwind không tự thêm.
- Rollback: revert một commit.
