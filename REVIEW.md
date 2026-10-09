# REVIEW.md — Checklist UX/AX trước khi ship UI

Chạy cho mọi PR đụng UI. Ghi kèm screenshot cho thay đổi hình ảnh.

## Viewports

- [ ] 1440×900, 768×1024, 375×812 — không tràn ngang, không chữ bị cắt, không element chồng nhau.
- [ ] 320px reflow: không horizontal scroll.

## Theme (dark mặc định + light)

- [ ] Kiểm cả **dark và light** — screenshot 2 theme cho màn hình chính của PR.
- [ ] Toggle sáng/tối hoạt động; reload giữ lựa chọn (`localStorage.theme`); không nháy theme
      sai khi reload (script `/theme-init.js` chạy trước render).
- [ ] Focus ring cam thấy rõ ở cả hai theme; ranh giới input ≥ 3:1 (dùng `border-line-strong`).
- [ ] Không còn `bg-white`/hex cứng ngoài whitelist (nền trắng QR, SVG logo).
- [ ] Đỏ chỉ xuất hiện ở hành động phá hủy; trạng thái quá hạn/lỗi = cam.

## Bộ lọc / list page (quy ước chung)

- [ ] Chip lọc nhóm có nhãn khi taxonomy > 1 cấp (`aria-label` theo nhóm).
- [ ] Chip có badge đếm nếu giúp quyết định bấm; badge `aria-hidden`.
- [ ] Trạng thái lọc sống trong URL — reload/back/share giữ nguyên.
- [ ] Ô search debounce mới lên URL (không navigate mỗi phím gõ).
- [ ] Dưới `lg`: card bộ lọc gập được, badge số filter đang áp dụng.
- [ ] "Xóa bộ lọc" xuất hiện khi có filter; xóa xong input + URL sạch.

## Tương tác & a11y

- [ ] `focus-visible:shadow-[var(--focus-ring)]` trên mọi control; Tab đi qua được, Enter/Space hoạt động.
- [ ] `aria-pressed`/`aria-expanded` đúng trạng thái; nhóm có `role="group"` + label.
- [ ] Motion ≤ 300ms, chỉ transform/opacity/color; không chặn input.
- [ ] Số đếm/kết quả có `aria-live="polite"` (một vùng duy nhất, không trùng lặp).

## AX (public surfaces — landing app)

- [ ] `check-discovery-surfaces.mjs` exit 0 với `--site-origin` production.
- [ ] robots/sitemap/canonical/OG khớp route thật; markdown twin không drift.
- Web app (teacher) là private workspace: robots disallow-all là chủ đích, không tính lỗi.

## Gates

- [ ] `pnpm --filter web test`, `pnpm check`, `pnpm run check-types`.
- [ ] E2E liên quan (`pnpm --filter e2e e2e`, port 8100–8103).
