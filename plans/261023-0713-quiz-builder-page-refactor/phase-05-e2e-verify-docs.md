---
phase: 5
title: "E2E, verify 3 viewport, docs"
status: completed
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
2. Các chỗ `getByRole("tab", { name: "Section 1" })` đổi tương tự. Field nội dung nằm ở tab "Nội dung" (mặc định), câu hỏi + Select "Dạng bài" cấp part (khi không nhóm) ở tab "Câu hỏi" — thêm bước bấm tab khi spec nhập câu.
3. **Tab scoping bắt buộc** (red-team A7 — "Câu hỏi" trùng accessible name ở 3 cấp): viết helper `partTab(page, "Câu hỏi"|"Nội dung")` scope trong thẻ Part, và `groupTab(page, slot, gi, tab)` scope bằng wrapper id `group-${slot}-${gi}`; mọi `getByRole("tab")` trong spec phải đi qua helper, không tự chế selector.
4. **Hàng câu thu gọn** (red-team F6/A3): `fillQuestionRow` thêm bước mở hàng trước khi fill — nếu hàng chưa mở, bấm `CardControls` aria-label `Mở câu {n}` (aria-label của hàng = "Câu {number}"). Part không nhóm (editor phẳng) không đổi — hàng luôn mở như cũ.
5. Nút "Lưu part" dời lên thanh toolbar trang: đổi `page.getByRole("button", { name: "Lưu part" })` (đang ở :55 reading / :51 listening) trỏ vào toolbar `role="toolbar"`.
6. Test cũ phải pass, không xóa assertion nghiệp vụ.

### Task 5.2 — E2E soạn part 2 nhóm trên layout mới
Thực hiện #420 Task 5.1 (kể cả bước 4b ClozeEditor giữ giải thích) với selector mới, bổ sung:
1. Sau khi tải lại: cây có "Nhóm câu 1", "Nhóm câu 2", "Câu 1"…"Câu 5" (đánh số fold).
2. Bấm "Câu 4" trên cây → hàng câu 4 mở (thấy ô "Giải thích câu 4" có giá trị) và nằm trong viewport.
3. Sửa tiêu đề Passage 1 (chưa lưu) → bấm "Passage 2" trên cây → bấm lại "Passage 1": tiêu đề sửa vẫn còn, cây có chấm "chưa lưu".
4. (red-team F2 — khóa stale-closure save; advisory 2026-10-23: sửa câu SẴN CÓ để tổng số câu giữ nguyên 5 — không thêm câu, vỡ kỳ vọng "5 câu"/"Câu 6" ở bước 5–6) Sửa đáp án của 1 câu sẵn có trong nhóm 1 → bấm "Lưu part" trên toolbar → reload → đáp án mới tồn tại trên server.
5. (red-team F9 — phủ nhánh thiếu đáp án) Xóa đáp án của 1 câu (chưa lưu) → bấm "Kiểm tra đáp án": panel hiện "…· 1 câu thiếu đáp án", dòng câu đó có nhãn "Thiếu đáp án"; bấm số câu đó → nhảy đúng hàng (đi qua `onJump`). Điền lại đáp án, lưu, mở panel: "5 câu · 0 câu thiếu đáp án".
6. (kongming GO-checkpoint — khóa fold xuyên suốt UI) Seed thêm nội dung cho Passage 2 (ít nhất 1 câu): cây hiện "Câu 6" cho câu đầu p2; nhãn hàng trong `AnswerKeyGrid` của p2 là "Câu 6" (không phải "Câu 14"); panel "Kiểm tra đáp án" liệt kê "Câu 6" dưới Passage 2. Ba chỗ phải khớp nhau — nếu page quên truyền `qStart` prop (fallback tĩnh 14), bước này bắt được.

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
3. (red-team S3) `docs/system-architecture.md:54` — cập nhật danh sách "the 7 authoring HTML fields": thêm `questions[].explanation` và `groups[].instruction`, giữ nguyên mệnh lệnh single-sink (`RichTextBody`/DOMPurify là sink `dangerouslySetInnerHTML` duy nhất — never add another).

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
