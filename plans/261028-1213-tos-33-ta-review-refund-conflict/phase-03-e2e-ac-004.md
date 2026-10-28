---
phase: 3
title: "E2E AC-004"
status: completed
effort: 0.5d
---

# Phase 3 — E2E AC-004

## Files

- Tạo `apps/e2e/specs/ai-grading-ac-004.spec.ts`; seed thêm user vai trò `ta` trong org.
- `apps/e2e/src/boot.ts`: `fakeAiGrader` luôn lỗi khi bài chứa token `ai-fail` (để chạy nhánh E-004 qua stack thật).

## Steps

1. TA đăng nhập, mở bài `ai_drafted`, sửa điểm, "Lưu bản nháp" → badge "Đang rà soát"; nút "Chốt trả bài" disabled.
2. Học viên nộp bài chứa `ai-fail` → [7] hiện E-004 + "Thử chấm lại AI"; số dư ví không đổi.
3. Hai context trình duyệt (TA + GV) cùng mở 1 bài; TA lưu trước, GV lưu sau → GV thấy cảnh báo E-011; bấm tải lại thấy bản của TA.

## Verify

- `pnpm --filter e2e e2e -- ai-grading-ac-004` với port 8100/8101/8103/8104.
