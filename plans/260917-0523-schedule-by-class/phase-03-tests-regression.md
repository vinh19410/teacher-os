---
title: "Phase 3: Cập nhật e2e + regression"
status: pending
priority: P1
effort: 2h
dependencies: [1, 2]
---

# Phase 3: Cập nhật e2e + regression

## Context Links

- `apps/e2e/specs/class-operations.spec.ts` (đang định vị block theo `STUDENT_NAME`)
- `apps/e2e/specs/projected-sessions.spec.ts` (QC #121 — chỉ assert projected, kỳ vọng giữ nguyên)
- `apps/e2e/specs/session-occurrence.spec.ts` (chạy ở tab lớp — không đổi, chỉ chạy regression)

## Overview

- **Priority**: P1
- **Status**: pending
- Cập nhật các assertion e2e phụ thuộc identity "block = học viên" sang "block = buổi lớp", rồi chạy toàn bộ regression unit + e2e.

## Key Insights

- Chỉ `class-operations.spec.ts` thao tác block thật trên `/schedule` theo tên học viên (dòng 88, 103) — đây là điểm cần sửa; flow check-in chuyển sang mở modal rồi bấm Điểm danh ở hàng học viên.
- `projected-sessions.spec.ts` đã locate theo `CLASS_NAME` và không assert block thật sau enroll → kỳ vọng pass không sửa; nếu fail thì là regress thật của Phase 2.

## Requirements

- [x] `class-operations.spec.ts`: locate block bằng `CLASS_NAME`; flow check-in mới: click block → modal → scope hàng theo tên học viên → bấm "Điểm danh" → toast "Đã điểm danh." → badge/trạng thái cập nhật
- [x] Không nới lỏng assertion: vẫn xác minh đúng 1 block/slot cho lớp 1 enrollment, không double-count
- [x] Toàn bộ unit tests web pass; e2e specs liên quan `/schedule` pass

## Implementation Steps

1. Sửa `apps/e2e/specs/class-operations.spec.ts`: thay locator `button.lesson-block` hasText `STUDENT_NAME` bằng `CLASS_NAME`; thêm bước mở modal và điểm danh trong hàng học viên (selector scope `getByRole("group", ...)` hoặc filter theo text như Phase 2 đã aria-label).
2. Rà thêm mọi spec dùng `gotoWeek`/`lesson-block` (hiện chỉ `projected-sessions`, `class-operations`) — sửa nốt nếu có assertion tên học viên bị sót.
3. Chạy regression:
   - `pnpm --filter web test` (vitest toàn web)
   - `pnpm --filter e2e e2e -- projected-sessions class-operations session-occurrence` (playwright, filter spec)
   - `pnpm test` (turbo root) trước khi kết thúc
4. Smoke thủ công `/schedule` với dữ liệu dev: block theo lớp, modal per-student, tuần trước/sau, header "N buổi" đúng.

## Todo List

- [x] Cập nhật `class-operations.spec.ts` sang identity lớp + flow modal
- [x] Rà và dọn các assertion tên-học-viên còn sót trên `/schedule`
- [x] `pnpm --filter web test` pass
- [x] e2e `projected-sessions` + `class-operations` + `session-occurrence` pass
- [x] `pnpm test` (root) pass

## Success Criteria

- Definition of done: 3 lệnh test trên đều xanh; `/schedule` không còn hiển thị tên học viên trên block lưới tuần.

## Risk Assessment

- **e2e flaky do modal focus/timing** → dùng `expect(...).toBeVisible()` chuẩn Playwright đã có trong helper; không thêm sleep.
- **KPI/other pages vẫn dùng tên học viên hợp lệ** → chỉ đổi spec chạm `/schedule`; không đụng spec trang khác.

## Security Considerations

- Không đổi; e2e dùng signup UI + session cookie như hiện trạng.

## Next Steps

- Tạo PR `feat/schedule-by-class` → `develop`; kế tiếp plan nếu cần nhóm block theo lớp ở trang khác (out of scope).
