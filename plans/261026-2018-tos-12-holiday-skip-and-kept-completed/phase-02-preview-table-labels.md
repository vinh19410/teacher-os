---
phase: 2
title: "Nhãn (*) và Giữ nguyên — Đã diễn ra trên Bảng xem trước"
status: pending
priority: P1
effort: "2h"
dependencies: ["phase-01"]
---

# Phase 2: Nhãn trên Bảng xem trước

Đọc `DESIGN.md`; token ở `packages/ui/src/styles/globals.css`.

## Files to Modify

- `apps/web/src/components/schedule/holiday-preview-table.tsx`
  - Shift có `skippedHolidays` → cột Kết quả "→ Dời +1 buổi sang T3, 29/12/2026*"; dưới bảng một khối ghi chú (info) mỗi dòng một câu theo D3.
  - `keptCompleted` → cột Trạng thái "Đã điểm danh", cột Kết quả `Badge` "(!) Giữ nguyên — Đã diễn ra" (D4); dòng không được đếm vào tiêu đề "N buổi sẽ được xử lý".
  - Dạng thẻ dọc ở 375px giữ nguyên hai nhãn.
- `apps/web/src/components/schedule/holiday-modal.test.tsx` — thêm case render.

## Tasks & Steps

1. Test đỏ: preview mock có 1 shift nhảy + 1 `keptCompleted` → thấy `*`, ghi chú chứa tên kỳ nghỉ, nhãn "Giữ nguyên — Đã diễn ra", tiêu đề đếm 1 buổi.
2. Sửa component cho xanh.
3. Tự kiểm 3 viewport (1440×900, 768×1024, 375×812) + focus theo `REVIEW.md`; `pnpm design:compare`.

## Verification

- `pnpm --filter web test -- holiday-modal`
- `pnpm check`, `pnpm check-types`, `pnpm design:compare`
