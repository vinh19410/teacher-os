---
phase: 2
title: "Nhãn (*) và Giữ nguyên — Đã diễn ra trên Bảng xem trước"
status: completed
priority: P1
effort: "2h"
dependencies: ["phase-01"]
---

# Phase 2: Nhãn trên Bảng xem trước

> **Red-team adjustments (kongming, 2026-10-26):** giữ nguyên câu chữ
> "→ Dời sang … · giờ" và chỉ thêm `*` ngay sau ngày bù (I1 — không vỡ spec
> TOS-11); bỏ marker `(*)` cũ ở cột Trạng thái, khối ghi chú render chung
> dưới bảng cho cả 2 layout (M2); ghi chú mỗi dòng kèm tên lớp và gom các
> ngày liền kề theo kỳ nghỉ (I3); tiêu đề "N buổi sẽ được xử lý" chỉ đếm
> shift và luôn hiện khi bảng có dòng — thay cảnh báo "Không có buổi học
> nào" gây hiểu nhầm khi chỉ có kept/unsupported (M1, lệch có chủ đích so
> với wireframe "(03 buổi)" theo D4); Badge `variant="muted"` giữ theo D4
> (M3 — muted là alias v1 còn được dùng, VersionBadge đi trước).

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
