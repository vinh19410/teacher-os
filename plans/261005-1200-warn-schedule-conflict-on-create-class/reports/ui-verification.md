# UI verification — schedule-conflict warning (REVIEW.md / AGENTS.md rule)

Run post-merge trên PR #316 (head 4b0ec63) theo quy ước mới trong AGENTS.md
("Verify UI ở 3 viewport + keyboard focus theo REVIEW.md; PR đụng hình ảnh
kèm screenshot").

- Viewports 1440×900 / 768×1024 / 375×812 + reflow 320px: warning box
  (`data-testid="schedule-conflict-warning"`) hiển thị đầy đủ;
  `document.scrollWidth - innerWidth ≤ 0` ở mọi viewport (không tràn ngang,
  không chữ cắt — assert trong spec chạy Chromium thật, screenshots kèm theo).
- Keyboard: Tab đi qua các control của modal, `:focus-visible` hiển thị ring
  (`focus-visible:shadow-[var(--focus-ring)]` theo DESIGN.md); chip là
  `<button>` native nên Enter/Space toggle mặc định.
- Tokens: `border-warn bg-warn-soft text-warn` là token chuẩn trong
  `globals.css`; radius `rounded-sm` trùng scale với Input cùng form
  (`controlClasses` field.tsx).
- Screenshots: warning-1440x900.png, warning-768x1024.png, warning-375x812.png,
  warning-320reflow.png, warning-keyboard-focus.png.
