---
phase: 3
title: "Verify UI 3 viewport + design:compare + e2e"
status: pending
priority: P1
effort: "1h"
dependencies: [2]
---

# Phase 3 — Verify

## Goal

Chứng minh bằng ảnh và đo DOM rằng mọi modal có form không còn dính field, không vỡ layout khác.

## Steps

1. Chạy dev stack (port 8000/8001/8003 — reuse nếu đang chạy, không spawn trùng).
2. Mở lần lượt 13 modal có form ở 1440×900, 768×1024, 375×812; chụp trước/sau
   (trước = `git stash` hoặc develop), lưu vào `plans/reports/`.
3. Đo khoảng cách bằng `getBoundingClientRect` trong modal "Tạo syllabus mới": khoảng giữa đáy field N và
   đỉnh label field N+1 = 16px; label → control = 8px; khoảng field cuối → footer border = 16px khi không lỗi.
4. Trigger lỗi (submit tên rỗng) → khối lỗi hiện, cách field trên 16px, không khoảng trống kép.
5. Keyboard: Tab qua toàn bộ field trong modal, focus ring không bị cắt; Escape đóng.
6. Chạy local gate và e2e full suite (theo memory: full e2e trước khi squash-merge vào develop).

## Validation

```bash
pnpm check && pnpm check-types && pnpm --filter web test
E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e
pnpm design:compare
```

## Done khi

Acceptance criteria trong `plan.md` đều tick; PR kèm screenshot trước/sau modal "Tạo syllabus mới" ở 3 viewport.
