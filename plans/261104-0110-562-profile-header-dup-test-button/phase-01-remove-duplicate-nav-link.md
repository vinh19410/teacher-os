# Phase 01 — Xoá mục thừa trong nav-links

## Context

Xem [plan.md](plan.md).

## Goal

Đảm bảo `<header class="site-header">` của trang chủ `apps/profile` (`apps/profile/public/index.html`) chỉ còn đúng 1 liên kết trỏ tới `kiem-tra-dau-vao/` (nút CTA `.btn-gold` trong `.nav-actions`), loại bỏ mục trùng lặp trong `<ul class="nav-links">`, kèm regression test TDD bảo vệ hành vi này và kiểm chứng thị giác 3 viewport.

## Files to Create or Modify

- Sửa: `apps/profile/tests/index.test.mjs` (thêm regression test kiểm tra cấu trúc `<header class="site-header">`, chuẩn hoá URL đích `/kiem-tra-dau-vao` và bảo toàn 8 CTA ngoài header)
- Sửa: `apps/profile/public/index.html` (xoá đúng mục `<li><a href="kiem-tra-dau-vao/">Làm Test Miễn Phí</a></li>` bên trong `<header class="site-header">` → `<ul class="nav-links">`, dòng ~1850 trên HEAD hiện tại)
- Không sửa: `apps/profile/dist`, `apps/profile/public/kiem-tra-dau-vao/*`, các CTA ngoài header (hero, section `#lam-test-mien-phi`, các thẻ khóa học, floating CTA), khối `<style>` CSS của `.site-header` / `.nav-links` / `.nav-actions`, và không tạo bất kỳ file tạm/ảnh chụp nào bên trong cây thư mục worktree (do `biome.json` đặt `useIgnoreFile: false`, `ignoreUnknown: false`).

## Tasks & Steps

<!-- Updated: Validation Session 1 - upgraded to --advice --tdd handover contract with Failure Protocol -->
<!-- Updated: Red Team Session 1 - applied RT-1..RT-5 hardening -->

### Task 1.1 — Viết regression test TDD (Red phase) cho header & bảo toàn CTA ngoài header
- **Goal:** Thêm bài kiểm thử chứng minh `<header class="site-header">` hiện đang chứa 2 liên kết dẫn tới `/kiem-tra-dau-vao` (trạng thái lỗi trước khi sửa), đồng thời khoá tính toàn vẹn thẻ đóng/mở trong header và 8 CTA ngoài header.
- **Target files and symbols:** `apps/profile/tests/index.test.mjs` (sử dụng biến `html` ở dòng 8; thêm `test("site-header has a single kiem-tra-dau-vao entry point in .nav-actions (#562)", ...)` ở cuối file).
- **Steps:**
  1. Mở `apps/profile/tests/index.test.mjs`.
  2. Thêm bài test mới thực hiện trên bản sao `html` đã loại bỏ HTML comments (`html.replace(/<!--[\s\S]*?-->/g, "")`):
     - Trích xuất khối `<header\b[^>]*\bclass="[^"]*\bsite-header\b[^"]*"[^>]*>([\s\S]*?)<\/header>`.
     - Kiểm tra cân bằng số lượng thẻ mở và đóng trong `<header>` cho `nav`, `ul`, `li`, `div`, `a` (vì `biome.json` exclude `apps/profile/public/index.html`).
     - Duyệt mọi thẻ `<a\b([^>]*)>([\s\S]*?)<\/a>` trong `<header>`, phân tích `href` (cả nháy kép, nháy đơn hoặc không nháy) qua `new URL(rawHref, "https://msmy.io.vn/")` để lọc các liên kết có `pathname.replace(/\/+$/, "") === "/kiem-tra-dau-vao"`.
     - Khẳng định trong toàn bộ `<header>` chỉ có đúng `1` liên kết dẫn tới `/kiem-tra-dau-vao`, thẻ `<a>` đó có class `btn-gold` và text chứa `Làm Test Miễn Phí`, nằm sau điểm mở của khối `class="...nav-actions..."`.
     - Trích xuất `<ul\b[^>]*\bclass="[^"]*\bnav-links\b[^"]*"[^>]*>([\s\S]*?)<\/ul>` trong `<header>`, khẳng định không có liên kết nào dẫn tới `/kiem-tra-dau-vao` và vẫn còn đủ 3 anchor `#bo-ho-so-pdf`, `#ho-so-giang-vien`, `#lo-trinh-khoa-hoc`.
     - Trên phần HTML ngoài `<header>`, khẳng định vẫn còn đúng `8` liên kết dẫn tới `/kiem-tra-dau-vao` (trong đó `.floating-cta-btns` vẫn giữ nút `kiem-tra-dau-vao/`).
- **Success criteria:** Bài test `#562` chạy và FAIL đúng ở assertion số lượng liên kết trong `<header>` (`2 !== 1`), mọi bài test hiện có khác trong `apps/profile` đều PASS.
- **Verify:** Chạy `pnpm --filter profile test` — lệnh PHẢI thoát mã khác `0`, in `fail 1`, và tên bài test fail là `site-header has a single kiem-tra-dau-vao entry point in .nav-actions (#562)`.

### Task 1.2 — Xoá mục thừa trong `.nav-links` và chạy lại test (Green phase)
- **Goal:** Xoá mục `<li><a href="kiem-tra-dau-vao/">Làm Test Miễn Phí</a></li>` khỏi `<ul class="nav-links">` trong `<header class="site-header">` để toàn bộ suite test chuyển sang xanh.
- **Target files and symbols:** `apps/profile/public/index.html` (khối `<header class="site-header">` → `<nav aria-label="Điều hướng chính">` → `<ul class="nav-links">`, dòng ~1850 trên HEAD hiện tại).
- **Steps:**
  1. Trong `apps/profile/public/index.html`, định vị `<header class="site-header">` → `<ul class="nav-links">` và xoá đúng 1 dòng `<li><a href="kiem-tra-dau-vao/">Làm Test Miễn Phí</a></li>`.
  2. Giữ nguyên 3 mục `<li>` còn lại trong `<ul class="nav-links">` (`#bo-ho-so-pdf`, `#ho-so-giang-vien`, `#lo-trinh-khoa-hoc`) và bảo toàn nguyên vẹn mọi phần tử hiện có trong `<div class="nav-actions">` (bao gồm nút `.btn-gold` `📝 Làm Test Miễn Phí`, nút `#dang-ky-tu-van`, và `#studentPortalLink` nếu rebase sau `#560`).
- **Success criteria:** `<header class="site-header">` chỉ còn đúng 1 liên kết dẫn tới `/kiem-tra-dau-vao`, 8 CTA ngoài header giữ nguyên, toàn bộ suite test `apps/profile` đều PASS.
- **Verify:** Chạy `pnpm --filter profile test` thoát mã `0`, in `fail 0` và số lượng `pass` `>= 20` (bao gồm bài test `#562` PASS).

### Task 1.3 — Kiểm tra Biome format/lint và kiểm chứng trình duyệt ở 4 mốc viewport + focus bàn phím
- **Goal:** Đảm bảo file test đạt chuẩn Biome của repo và giao diện `<header class="site-header">` hiển thị lành lặn, không tràn/chồng lấn, kích hoạt được `:focus-visible` bằng phím `Tab` trên các viewport chuẩn.
- **Target files and symbols:** `apps/profile/tests/index.test.mjs` (lint/format qua Biome), `apps/profile/public/index.html` (phục vụ qua `createProfileServer` từ `apps/profile/serve.mjs`).
- **Steps:**
  1. Chạy `pnpm exec biome check apps/profile/tests/index.test.mjs` (nếu cần format chỉ chạy `pnpm exec biome check --write apps/profile/tests/index.test.mjs`, tuyệt đối không chạy `pnpm check:fix` toàn cục), sau đó chạy `pnpm exec biome check .` trên toàn worktree.
  2. Trong một tiến trình kiểm chứng duy nhất (không dùng CLI `PORT=0 node apps/profile/serve.mjs` vì `PORT || 8005` rơi về `8005` và bind `0.0.0.0`), import `createProfileServer` từ `apps/profile/serve.mjs`, gọi `server.listen(0, "127.0.0.1")` để lấy cổng ephemeral `port = server.address().port`, và đóng `server` trong khối `finally`.
  3. Mở trình duyệt Chromium thật tới `http://127.0.0.1:${port}/` và kiểm tra ở 4 kích thước viewport: `1440×900`, `768×1024`, `375×812`, và `320×812` (`REVIEW.md` reflow):
     - Đo `document.documentElement.scrollWidth <= document.documentElement.clientWidth` VÀ kiểm tra `getBoundingClientRect()` của `.nav-bar` cùng mọi phần tử hiển thị trong `.site-header` nằm trọn trong `[0, clientWidth]` (`rect.left >= 0 && rect.right <= clientWidth`), các nút trong `.nav-actions` không chồng lấn nhau.
     - Khẳng định trong `.site-header` chỉ có `1` liên kết tới `kiem-tra-dau-vao/`, nút `.btn-gold` hiển thị (`width > 0 && height > 0`), `.nav-links` hiện 3 mục ở `1440×900` và `display: none` ở `≤768px`.
     - Nhấn phím `Tab` lặp lại (tối đa 10 bước sau khi reset focus đầu trang) cho tới khi `document.activeElement` là `.nav-actions a[href="kiem-tra-dau-vao/"]`, xác nhận `:focus-visible` khớp (`el.matches(":focus-visible") === true`) và `getComputedStyle(el).outlineWidth === "3px"`.
     - Chụp ảnh màn hình 3 viewport chuẩn lưu vào `/tmp/profile-562-verify/` (ngoài cây worktree để không đụng `biome check .`) và kiểm tra không có `pageerror` hay lỗi tài nguyên cùng origin `127.0.0.1`.
  4. Đảm bảo `test ! -e apps/profile/dist` và `git status --short` chỉ chứa các file thuộc phạm vi kế hoạch (`apps/profile/public/index.html`, `apps/profile/tests/index.test.mjs`, `plans/261104-0110-562-profile-header-dup-test-button/*`).
- **Success criteria:** `pnpm exec biome check .` thoát `0`, `pnpm --filter profile test` thoát `0`, kiểm chứng trình duyệt trên cả 4 viewport đạt toàn bộ điều kiện hình học/DOM/focus, không có file rác trong worktree.
- **Verify:** Kịch bản trình duyệt trả về tất cả 4 viewport có `docOverflow: false`, `headerClipped: false`, `buttonsOverlap: false`, `headerTestLinksCount: 1`, `goldCtaVisible: true`, `focusVisibleMatched: true`, `focusOutlineWidth: "3px"`, `pageErrors: 0`; tiếp theo `pnpm exec biome check . && pnpm --filter profile test && test ! -e apps/profile/dist` thoát mã `0`.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.

## Risk / Rollback

- Rủi ro rất thấp: chỉ xoá một `<li>` tĩnh trong `apps/profile/public/index.html` và thêm 1 unit test trong `apps/profile/tests/index.test.mjs`.
- Lưu ý xung đột: #560 cũng sửa `.nav-actions` gần vùng này; giữ diff HTML đúng 1 dòng xoá để rebase sạch.
- Rollback: `git revert <commit>`.
