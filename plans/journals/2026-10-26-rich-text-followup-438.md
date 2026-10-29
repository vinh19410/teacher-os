---
title: "Follow-up rich text #438: Base UI toolbar a11y, link popover, H4, cascade layer"
date: 2026-10-26
---

# Follow-up rich text #438: Base UI toolbar a11y, link popover, H4, cascade layer

Feature: xử lý 7 hạng mục follow-up sau PR #437 (Tiptap full-option editor):
1. **A11y focus ring + roving tabindex**: chuyển `RichTextToolbar` sang `@base-ui/react/toolbar` (`Toolbar.Root`/`Toolbar.Button`, `focusableWhenDisabled={false}` cho Undo/Redo, bổ sung handler `Home`/`End`), thêm `focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none` tường minh trên mọi nút và đổi wrapper từ `focus-within:ring-*` sang `has-[.ProseMirror:focus]:*` để khi focus nằm ở toolbar thì viền khung editor không sáng đè lên ring của nút.
2. **Popover chọn link thay `window.prompt`**: dùng `@base-ui/react/popover` controlled (`open={linkOpen}`, `onOpenChange` kiểm `details.reason === "trigger-press"` để gỡ link ngay khi đang active mà không mở popover), `modal={true}` kèm `Popover.Close` ("Hủy") để bật focus trap, chặn phím điều hướng caret thoát lên `Toolbar.Root`, không dùng `<form>` trong portal tránh bubble submit ra form trang, `finalFocus` trả về `editor.view.dom` khi đóng do Apply để giữ stored mark, và allowlist scheme authoring-side (`http:`, `https:`, `mailto:`, `#…`, `/…` không bắt đầu bằng `//` hay `/\`).
3. **H4**: mở `StarterKit.configure({ heading: { levels: [2, 3, 4] } })`, thêm nút "Đề mục cấp 4" (tổng 16 nút) và `[&_h4]:font-semibold` trong `RICH_TEXT_CONTENT_CLASSES`.
4. **Cascade `@layer components`**: bọc `.ProseMirror` + placeholder trong `packages/ui/src/styles/globals.css` vào `@layer components` để các utility `[&_.ProseMirror]:min-h-*` ở 11 callsite thắng được `min-height: 5rem` (70px @ 14px root).

Bài học kỹ thuật:
1. **Focus deferral của TipTap + macOS Chromium `End` key**: Khi thêm `onMouseDown={(e) => e.preventDefault()}` trên `Toolbar.Button` để giữ focus trong `.ProseMirror` (tránh TipTap hoãn `view.focus()` sang `requestAnimationFrame`), vùng chọn `ControlOrMeta+a` được giữ nguyên sau khi bấm H2 (chuẩn UX editor). Trên macOS Chromium (`darwin`), phím `End` trong `contenteditable` chỉ cuộn viewport chứ không thu gọn vùng chọn; spec cũ ở #436 chỉ vô tình pass vì nút `<button>` trần làm `.ProseMirror` bị blur lúc thay node `<p>` → `<h2>`. Đổi thao tác bàn phím trong spec sang `ArrowRight` (chuẩn cross-platform để collapse selection về cạnh phải) giữ nguyên 100% assertions.
2. **Base UI Popover `modal={true}` + React portal**: Focus trap của Base UI Popover chỉ bật khi có `<Popover.Close>` bên trong `<Popover.Popup>`, và chế độ `outsidePressEvent: 'intentional'` đòi chuỗi click đầy đủ (`pointerDown → mouseDown → pointerUp → mouseUp → click`) khi test trong jsdom.

Verification: unit web 1450/1450 (22/22 `rich-text-editor.test.tsx`), admin 180/180, `pnpm check` 0 errors, `pnpm run check-types` 8/8, e2e `rich-text-content.spec.ts` 7/7 pass (khóa computed `minHeight`: `77px` cho `min-h-22`, `147px` cho `min-h-42`, `56px` cho `min-h-16`), `design:compare` canary exit 0, 20 screenshots trong `plans/261026-0752-rich-text-followup-438/screenshots/`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
