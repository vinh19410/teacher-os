---
date: 2026-10-09
issue: 351
pr: 355
type: ship
tags: [quiz, ui, design-system, verdict, e2e]
---

# Ship #351 — Highlight verdict đúng/sai ở màn soi bài (PR #355)

## Kết quả

- PR #355 squash `1fb47c1` vào `develop` 2026-10-09, kèm merge `origin/develop` @ `7fe4c51`
  (PR #353) trước push — không xung đột mã nguồn.
- Gates: `pnpm check` ✅, `check-types` ✅, student 262/262, api 73/73, web 1389/1389,
  e2e `student-quiz-take-review` 11/11. Screenshot 8 ảnh trong
  `docs/screenshots/351-quiz-verdict/` (3 viewport × 2 theme + teacher preview 2 theme).

## Cái lòi ra trong review

1. **Icon navigator vô hình (Important, vòng 2):** icon góc trên nút nền đặc kế thừa
   `currentColor` = `--verdict-on`, mà `--verdict-on` == `--bg` → contrast 1.00:1 ở CẢ HAI
   theme. Ảnh screenshot đầu không phát hiện được vì icon chỉ 10px. Fix bằng
   `VERDICT_BADGE_CLASSES` — stroke icon = màu verdict trên chấm `--bg`.
   **Bài học: khi thêm icon trên nền đặc, luôn tự hỏi stroke kế thừa màu gì — đừng tin
   mắt trên ảnh thu nhỏ.**
2. **Viền currentColor ngầm (Important, vòng 2):** Tailwind v4 preflight đặt
   `border-color: currentColor`; hàng "không nổi bật" không set màu viền sẽ có viền xám
   đậm hơn hairline hệ. Hàng trung tính phải set `border-transparent` tường minh.
3. **Review vòng 1 bắt dead-code outline:** nhánh ternary lồng làm câu current ở review
   mất outline cam — lồng ternary cho class composition dễ chết nhánh; tách ra áp ngoài
   nhánh với comment ràng buộc.
4. **Strict-mode Playwright:** `[data-question="0"]` khớp cả fieldset lẫn nút navigator —
   assert attribute mới phải scope `fieldset[data-question="..."]`.
5. **E2E stack wipe DB mỗi lần boot** (`apps/e2e/src/boot.ts`): screenshot session cần
   giữ data → guard `E2E_KEEP_DB=1` tạm thời rồi revert; mail-log cũng bị xoá lúc boot
   (`rmSync` đầu file) — lấy email student từ `local.db` thay vì mail-log.

## Quy tắc đã khoá

- Truncate (ellipsis) phải nằm trên text node, không nằm trên flex container — flex item
  ẩn danh chỉ `overflow: hidden` không có "…".
- Key "Đáp án:" luôn `text-verdict-correct` ở mọi surface soi bài (detail + compact list) —
  một ngôn ngữ cho một datum.
- Verdict pair là ngoại lệ màu duy nhất của design system; token `--verdict-*` chỉ màn
  chấm/soi bài, luôn kèm icon ✓/✗.
