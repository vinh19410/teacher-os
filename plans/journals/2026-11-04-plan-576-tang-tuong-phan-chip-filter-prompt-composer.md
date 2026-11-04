# Journal: Plan fix tương phản ChipFilter trong prompt-composer (#576)

- **Ngày**: 2026-11-04
- **Branch**: `fix/576-prompt-composer-chip-contrast`
- **Issue**: #576
- **Plan**: `plans/261104-1200-576-prompt-composer-chip-contrast/plan.md`

## Ngữ cảnh & Vấn đề

Trên môi trường staging, phản hồi từ Cô Mỹ ghi nhận các nút đang chọn (kỹ năng, task, trạng thái, band) trong form tạo bài (`prompt-composer.tsx`) gần như không nổi bật, khiến giáo viên không nhận biết được lựa chọn đã áp dụng.
Truy vết mã nguồn: `packages/ui/src/components/web-kit/chip-filter.tsx` dùng `border-transparent bg-secondary text-secondary-foreground` khi `opt === value`. Với token neutral v2, `--secondary` (`oklch(0.97)`) trên nền trắng (`oklch(1)`) chỉ đạt tỷ lệ tương phản ~1.06:1 và mất viền.

## Quyết định kỹ thuật

1. Nâng cấp trạng thái chọn của `ChipFilter` lên `border-primary bg-primary text-primary-foreground` (>15:1 contrast), đồng bộ với `ChipMulti` (#518) và đúng quy chuẩn `DESIGN.md`.
2. Chuyển `bg-background` và `dark:bg-input/30` từ base class vào nhánh unselected để tránh xung đột `dark:bg-input/30` đè lên `bg-primary` ở dark theme.
3. Chỉnh badge đếm `counts`: khi chọn dùng `text-primary-foreground/80` (thay vì giữ `text-muted-foreground` bị tối màu trên nền ink), khi chưa chọn giữ `text-muted-foreground`.
4. Đồng bộ toggle kỳ doanh thu trong `revenue-chart.tsx`.
5. Viết unit tests TDD tại `apps/web/src/components/ui/chip-filter.test.tsx` và chụp ảnh kiểm chứng visual ở 3 viewport (`1440×900`, `768×1024`, `375×812`) cả light và dark.
