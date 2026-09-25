---
title: bo khung phai trang tao bai tap assignments/new
date: 2026-09-25
summary: Remove right column (bank card + student preview) from /assignments/new; form now full-width
---

# bo khung phai trang tao bai tap assignments/new

## What happened
Yêu cầu: bỏ khung bên phải (viền đỏ trong screenshot) trên trang "Thêm đề vào ngân hàng" (`/assignments/new`).

Khung bị xóa bao gồm:
- Card "Ngân hàng" (mô tả "Đề này chỉ được thêm vào ngân hàng bài tập", danh sách "Đề {skill} đã có", dòng "n/n đáp án đã khóa").
- Panel `StudentPreviewPaper` ("Xem trước phía học viên").

## Key changes
- `apps/web/src/routes/_auth/assignments/new.tsx`: xóa cột phải của grid `lg:grid-cols-[1.45fr_0.9fr]`, bỏ wrapper grid — `<form>` giờ chiếm toàn bộ chiều rộng. Dọn `prompts` useMemo, import `Card`, `StudentPreviewPaper`, `useMemo`. `useData`/`skillOf`/`countAnswers` vẫn giữ vì còn dùng ở `handleReconcile`, `handleFieldChange`, `actionCopyFor`, `canSave`.
- `apps/web/src/routes/_auth/assignments/new.test.tsx`: bỏ 2 assertion trỏ vào nội dung khung đã xóa ("Xem trước phía học viên", "Đề Writing đã có"), thêm assertion phủ định bảo vệ việc xóa.

## Verification
- vitest web: 77 files / 728 tests pass (gồm 8 test của new.test.tsx).
- check-types web: pass.
- biome check: pass.
- Step 3.S simplify gate: skipped — dưới ngưỡng (loc=57, files=2).
- E2E `apps/e2e/specs/assignment-bank.spec.ts`: không bị ảnh hưởng — phần seed trên /assignments/new chỉ dùng form fields còn nguyên; "Xem trước phía học viên" ở spec thuộc preview-aside của trang /assignments (component khác).

## Decision
- Nút "Xem trước" trên form vẫn giữ nguyên (navigate sang /assignments/preview dùng draft) — user chỉ yêu cầu bỏ khung preview bên phải, không phải bỏ tính năng preview.
- Không commit (chưa được authorize).

## Next steps
- Review UI trực tiếp trên dev server nếu cần xác nhận thị giác.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
