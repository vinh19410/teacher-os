# DESIGN.md — Hệ thống thiết kế teacher-os

> Nguồn chân lý: `packages/ui/src/styles/globals.css` (tokens), `apps/web/src/components/ui/*` (components).
  Đọc file này trước khi làm UI; đổi token ở globals.css chứ không hard-code giá trị lệch scale.

## Bản chất thương hiệu (một dòng)

"Teacher-first workspace" — một ngày dạy học yên tĩnh trong một nơi: tĩnh, chắc, Apple-like,
một accent xanh duy nhất cho hành động.

## Tokens

- **Màu:** `--bg #ffffff`, `--surface #f5f5f7`, `--surface-warm #fbfbfd`, `--fg #1d1d1f`,
  `--fg-2 #424245`, `--meta #86868b`, `--line`/`--line-soft`, `--accent #0071e3`
  (hover `#0077ed`, active `#0066cc`). Accent dùng cho: hành động chính, selection, focus, state.
- **Type:** display font cho tiêu đề (font-display), body sans, **font-mono cho meta/kicker/đếm số**
  (kicker viết HOA: `XEM TRƯỚC PHÍA HỌC VIÊN`). Meta text luôn `text-meta text-xs`.
- **Radius:** pill (`rounded-full`) cho chip; `rounded-md` input; `rounded-lg` card; `rounded-xl` list row.
- **Focus ring:** `focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none`
  (ring accent 4px, 65% trong suốt) — mọi control tương tác.
- **Motion:** 150ms cho state change (hover/selection), ease `cubic-bezier(0.28,0,0.22,1)`;
  chỉ animate color/border/transform; không entrance choreography.

## Quy tắc component

- **Selection = đen đặc:** chip đang chọn `border-fg bg-fg text-bg` (không dùng accent) —
  accent dành cho CTA/hành động, selection dùng mực đen.
- **Card:** `Card variant="white"` cho panel chức năng, `variant="default"` (surface-warm) cho nhóm.
- **Chip lọc (`ChipFilter`):** pill 1 dòng label + badge đếm `font-mono text-[10px]` (`aria-hidden`
  để accessible name chỉ là label); chip 0 kết quả vẫn full contrast (chỉ badge "0" báo trước
  ngõ cụt), vẫn bấm được; nhóm chip liên quan phải có `role="group"` + `aria-label`.
- **Bộ lọc hai cấp (skill → part):** khi "Tất cả", nhóm part theo skill với nhãn mono uppercase
  (`WRITING`, `READING`…); khi chọn 1 skill chỉ hiện part của skill đó. Filter sống trong URL.
- **List row:** `min-h-[72px]`, chọn = `border-fg ring-1 ring-fg`, meta phải `font-mono text-xs`.

## Voice

- Tiếng Việt, gọi thẳng danh từ nghiệp vụ IELTS (Kỹ năng, Phần thi, Band, Cue card).
- Nhãn nút = động từ + danh từ ("Tạo bài tập", "Xóa bộ lọc"). Số liệu = số thật, đếm được.
- Empty state nói thứ gì thuộc về đó + hành động đầu tiên.

## Don't

- Không thêm màu thứ hai cho selection/emphasis; không dùng accent làm nền chip.
- Không render bức tường chip phẳng trộn nhiều taxonomy — luôn nhóm có nhãn.
- Không điều hướng URL trên mỗi phím gõ (debounce ~300ms rồi mới đẩy query lên URL).
- Không badge đếm trong accessible name (vỡ voice control + e2e `name` exact).
