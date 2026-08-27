# Advisory — kongming checkpoint #2 (trước publish GitHub)

**Kết luận: Conditional GO.** Kiến trúc đúng, mọi claim load-bearing đã verify trực tiếp với code thật (grid line 68, aside line 213, breakpoint 921px, testids, vitest env node không jsdom, playwright config 1280×720 + serviceWorkers block). Toàn bộ phát hiện là sai sót văn bản/snippet; sửa xong 4 mục thì publish ngay.

## Fix bắt buộc đã áp dụng vào plan

| # | Phát hiện | Đã sửa ở |
|---|-----------|----------|
| F1 | Snippet minh hoạ phase-02 vi phạm chính invariant D10 (`sr-only`, `justify-center px-0`, footer-hidden viết không prefix `app:`) | phase-02 Architecture — toàn bộ prefix `app:` |
| F2 | Ambiguity "app:px-2 thay app:px-4": base `px-4` đang phục vụ mobile drawer, nâng lên desktop-only sẽ trụt padding drawer | phase-02 — ghi tường minh giữ `px-4` base, chỉ append `app:px-2` |
| F3 | E2E case iv assert `sidebar-avatar` sẽ đỏ ngay: testid nằm trên `<img>` chỉ render khi user có ảnh (`apps/web/src/components/ui/avatar.tsx:52-64`), user signup UI không có ảnh | phase-03 bảng kịch bản iv — bỏ assertion đó |
| F4 | Sai đường dẫn avatar (`packages/ui/...` → thật ra là `apps/web/src/components/ui/avatar.tsx`); gate "typecheck" → script thật `pnpm check-types`; root `pnpm check` = `biome check --write .` auto-fix | plan.md Related Code Files, phase-01 criteria, phase-03 steps |

## Risk bổ sung đã ghi nhận

1. `prefers-reduced-motion`: transition 220ms chưa tôn trọng reduced-motion → thêm `motion-reduce:transition-none` hoặc áp exit-criteria D8 bỏ transition.
2. Cơ chế seed localStorage cho e2e case iii: collapsed đọc bằng useState lazy-init ngay render đầu → phải seed bằng `page.addInitScript`, không phải `page.evaluate` sau `goto` (nếu sai thì test luôn xanh oan vì mặc định false).
3. Footer rail dọc trên màn thấp tăng chiều cao → scroll trong rail (degenerate case chấp nhận được, aside có sẵn `overflow-y-auto`).

## Xác nhận khác

- Claim D8 "Safari cũ snap với grid-template-columns transition" hợp lý theo caniuse nhưng chưa verify trên Safari thật trong phiên này — không chặn vì exit-criteria snap fallback đã định trước.
- Không cần quay lại checkpoint #2 sau khi áp fix — publish được phép ngay.
