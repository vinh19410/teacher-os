# Journal: Tự cuộn tab đang chọn vào vùng nhìn ngang trên Tabs mobile (#920)

- **Date:** 2026-11-25
- **Issue:** #920
- **Branch:** `vinh19410/feat-ui-auto-scroll-active-tab-into-view-in-hori` (target: `develop`)

## Bối cảnh
Trên viewport hẹp (`375×812` / `320px`), khi thanh `Tabs` có 4–6 mục tràn ngang (`overflow-x-auto`) ở `apps/web` và `apps/student`, mở trực tiếp URL chứa `?tab=` nằm ở nửa phải (ví dụ `/teacher/classes/$classId?tab=notes`) hoặc co giãn viewport khiến tab active bị cắt hoặc nằm khuất ngoài khung nhìn cho tới khi người dùng tự vuốt ngang.

## Thay đổi & Quyết định kỹ thuật
- **Horizontal-only container scroll thay cho `scrollIntoView`:** Bổ sung hook dùng chung `packages/ui/src/hooks/use-scroll-active-tab.ts` (`computeActiveTabScrollLeft`, `createTabsSignature`, `prefersReducedMotion`, `useScrollActiveTab`). Trên `apps/student` (`class-detail-view.tsx`), `<Tabs>` nằm dưới fold (`tabTop ≈ 1096px` trên viewport `812px`), nên cuộn duy nhất `role="tablist"` bằng `tablist.scrollTo({ left, behavior })` (fallback `scrollLeft` trong `try/catch`) giúp giữ nguyên `window.scrollY === 0` thay vì nhảy cuộn dọc cả trang.
- **Bảo toàn hợp đồng DOM/SSR:** Dùng `useIsomorphicLayoutEffect` để tránh nháy 1 frame trên client mà vẫn sạch cảnh báo SSR trong vitest `node` (`apps/web/src/components/ui/tabs.test.tsx`); nối ref trực tiếp lên `<div role="tablist">` và `<button role="tab">` ở cả `apps/web/src/components/ui/tabs.tsx` và `apps/student/src/components/ui/tabs.tsx`, không thêm wrapper để giữ nguyên selector `[&>button]:` (`vocab-library-dialog.tsx`).
- **Xử lý edge cases thực tế:** Dùng `createTabsSignature` (`JSON.stringify([id, label])`) để parent re-render với mảng inline `tabs={[...]}` không phá thao tác vuốt tay nhưng nhãn động (`placement-test`) vẫn tự căn lại; gộp `ResizeObserver` qua `requestAnimationFrame` với cờ `rafScheduled` chống kẹt khi rAF đồng bộ; căn lại sau `document.fonts.ready` nếu người dùng chưa chạm tablist; tách `pointerdown` chuột trên button con và kiểm tra đích `scrollLeft` trong `scrollend` (phát hiện từ local code review thực nghiệm trên Chromium) để hủy animation `"smooth"` giữa chừng chính xác.

## Xác minh
- Unit/component tests: `packages/ui/src/hooks/use-scroll-active-tab.test.tsx` (32/32), `apps/web/src/components/ui/tabs.test.tsx` + `tabs-scroll.test.tsx` (6/6), `apps/student/test/class-primitives.test.tsx` (7/7).
- Full gates trên revision cuối: `pnpm exec biome check .` (0 errors, `--diagnostic-level=info` trên 6 file chạm = 0 diagnostics), `VITE_SERVER_URL=http://localhost:8000 pnpm check-types` (14/14), `VITE_SERVER_URL=http://localhost:8000 pnpm build` (15/15), `CI=1 VITE_SERVER_URL=http://localhost:8000 pnpm test` (toàn bộ 15 packages + 5 script tests pass).
- Visual/responsive Chromium trên unified `apps/lms` (`8100`/`8101` loopback): pass `1440×900`, `768×1024`, `375×812`, `320×812` (light/dark, keyboard `Tab`/`Enter`/`Space`, `windowScrollY === 0`, `pageOverflow === 0`) kèm 8 ảnh POT trong `plans/reports/920-tabs-*.png`.
