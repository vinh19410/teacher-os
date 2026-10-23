---
phase: 5
title: "E2E, verify 3 viewport, docs"
status: pending
priority: P1
effort: "0.5d"
dependencies: [4]
---

# Phase 5: E2E, verify 3 viewport, docs

## Overview

Cập nhật e2e admin theo cây điều hướng, thêm e2e luồng nhóm trên layout mới (thay #420 Task 5.1), verify 3 viewport + bàn phím, cập nhật runbook và `DESIGN.md`.

## Context

- `apps/e2e/specs/admin-library-reading.spec.ts`, `admin-library-listening.spec.ts`: helper `openEmptySlot` đang dùng `getByRole("tab", { name })` (:26/:27) và nút "Lưu part".
- Plan #420 phase 5 Task 5.1–5.5 (e2e 2 nhóm, hồi quy, viewport, runbook `0044`, gate).
- Port e2e local theo `AGENTS.md`: `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104`.

## Related code files

- Modify: `apps/e2e/specs/admin-library-reading.spec.ts`, `apps/e2e/specs/admin-library-listening.spec.ts`
- Modify: `docs/production-release-runbook.md` (theo #420 Task 5.4)
- Modify: `DESIGN.md` (mục "Lệch có chủ đích")

## Implementation steps

### Task 5.1 — Đổi helper chọn part
1. `openEmptySlot(page, name)`: bấm `page.getByRole("navigation", { name: "Mục lục đề" }).getByRole("button", { name, exact: true })` rồi "Thêm nội dung". Ở viewport hẹp, mở cây trước nếu đang thu gọn.
2. Các chỗ `getByRole("tab", { name: "Section 1" })` đổi tương tự. Field nội dung nằm ở tab "Nội dung" (mặc định), câu hỏi ở tab "Câu hỏi" — thêm bước bấm tab khi spec nhập câu.
3. Test cũ phải pass, không xóa assertion nghiệp vụ.

### Task 5.2 — E2E soạn part 2 nhóm trên layout mới
Thực hiện #420 Task 5.1 (kể cả bước 4b ClozeEditor giữ giải thích) với selector mới, bổ sung:
1. Sau khi tải lại: cây có "Nhóm câu 1", "Nhóm câu 2", "Câu 1"…"Câu 5".
2. Bấm "Câu 4" trên cây → hàng câu 4 mở (thấy ô "Giải thích câu 4" có giá trị) và nằm trong viewport.
3. Sửa tiêu đề Passage 1 (chưa lưu) → bấm "Passage 2" trên cây → bấm lại "Passage 1": tiêu đề sửa vẫn còn, cây có chấm "chưa lưu".
4. Bấm "Kiểm tra đáp án": panel hiện "5 câu · 0 câu thiếu đáp án".

### Task 5.3 — Hồi quy e2e admin
```bash
E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 pnpm --filter e2e e2e specs/admin-library-reading.spec.ts specs/admin-library-listening.spec.ts specs/admin-auth.spec.ts
```
Pass khi exit 0 và không có `failed`. Lỗi `[dev-watchdog] hạ tầng dev server bất ổn…` là lỗi hạ tầng, chạy lại.

### Task 5.4 — Verify 3 viewport + bàn phím
1. Trang có part 2 nhóm ở 1440×900, 768×1024, 375×812; chụp vào `plans/261023-0713-quiz-builder-page-refactor/screens/{1440,768,375}.png`.
2. `document.documentElement.scrollWidth <= window.innerWidth` ở cả 3.
3. Tab đi qua: thanh hành động → cây → thẻ Part → tab → thẻ Nhóm → hàng câu; focus ring thấy được; Enter trên "Câu n" mở đúng hàng; phím mũi tên đổi tab trong `CardTabs`.

### Task 5.5 — Docs
1. Runbook: thực hiện #420 Task 5.4 (mục migration `0044`, deploy skew, render contract `RichTextBody`).
2. `DESIGN.md`, mục "Lệch có chủ đích": thêm mục "Trang soạn đề admin (Quiz Builder)" — bố cục theo Selfomy nhưng phân cấp bằng thụt lề + kiểu badge, không dùng màu tím/xanh dương/xanh lá; tab có badge đếm `aria-hidden`; chip trạng thái câu dùng `--success`/`--warn`.

### Task 5.6 — Gate cuối
`pnpm check && pnpm check-types && pnpm test` exit 0 và Task 5.3 pass trên cùng nhánh. Theo memory dự án: chạy full Playwright trước khi squash-merge vào `develop`.

## Todo

- [ ] Task 5.1 helper chọn part
- [ ] Task 5.2 e2e 2 nhóm + điều hướng cây + giữ nháp + panel đáp án
- [ ] Task 5.3 hồi quy e2e
- [ ] Task 5.4 3 viewport + bàn phím
- [ ] Task 5.5 runbook + DESIGN.md
- [ ] Task 5.6 gate

## Success criteria

Mọi acceptance criteria trong `plan.md` được kiểm bởi một test hoặc một bước verify ở phase này.
