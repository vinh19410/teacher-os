---
phase: 3
title: "E2E AC-003, đo 5 ca ≤ 2 phút, 3 viewport"
status: pending
priority: P2
effort: "2.5h"
dependencies: [2, "TOS-7 phase 5"]
---

# Phase 3: Kiểm chứng end-to-end

## Goal

Chứng minh AC-003 chạy thật trên trình duyệt và luồng thao tác nhanh đạt NFR-008 (≥ 5 lớp trong ≤ 2 phút).

## Files to Create / Modify

- Modify: `apps/e2e/specs/daily-attendance.spec.ts` (TOS-7 Phase 5 tạo). Thêm `describe("AC-003 mark all present")`.
- Dùng lại `apps/e2e/specs/helpers-dated-class.ts` để tạo lớp có ca hôm nay; seed một học viên tên "Trần Hoàng Nam" cho kịch bản 1.

## Kịch bản

1. **AC-003 chính:**
   - Lớp có ca hôm nay với 4 học viên, trong đó có "Trần Hoàng Nam". Mở `/attendance?date={hôm nay}`, mở ca.
   - Bấm "Đánh dấu tất cả Có mặt" → 4 người đều "Có mặt".
   - Chỉnh Nam sang "Vắng có phép", bấm "Lưu điểm danh ca học". Toast thành công trong ≤ 2000ms, URL không đổi.
   - Tải lại: Nam là "Vắng có phép", 3 người còn lại "Có mặt". Kiểm thêm qua API: Nam `attendance = excused`, `status = absent`; còn lại `present` / `completed`.
2. **Không ghi đè lựa chọn có sẵn:** chọn "Đi muộn" cho 1 người trước, bấm điền nhanh → người đó vẫn "Đi muộn".
3. **Hộp xác nhận khi lưu thiếu:** để trống 2 người, bấm lưu → modal "Còn 2 học viên".
   - "Quay lại chỉnh": không có request PUT trong 1 giây, dòng thiếu có viền cảnh báo.
   - Bấm lưu lần nữa → "Gán Có mặt và lưu": PUT gửi đủ sĩ số, 2 người đó là "Có mặt".
4. **NFR-008 — 5 lớp ≤ 2 phút:**
   - Tạo 5 lớp có ca hôm nay, mỗi lớp 3–5 học viên. Mở `/attendance?date={hôm nay}&status=pending`.
   - Mốc `t0` khi trang tải xong. Lặp 5 lần: dùng bàn phím (Enter trên nút điền nhanh đang có focus) → chỉnh 1 học viên sang "Vắng không phép" → lưu → chờ toast và ca kế tiếp tự mở.
   - `t1` khi thông báo "Đã điểm danh xong mọi ca trong ngày" xuất hiện. Assert `t1 - t0 ≤ 120000` ms và mỗi lần lưu ≤ 2000 ms.
   - Mở `/dashboard`: thẻ "Ca học hôm nay chưa điểm danh" giảm đúng 5 so với trước.

## Kiểm thủ công theo `REVIEW.md`

- 3 viewport 1440×900, 768×1024, 375×812: nút điền nhanh không tràn dòng; ở 375px nút điền nhanh và nút lưu xếp chồng full-width, ô bấm ≥ 44px. Chụp screenshot ca đang mở + modal xác nhận cho PR.
- Bàn phím: hoàn tất 2 ca liên tiếp chỉ bằng phím, focus ring rõ ở nút điền nhanh sau khi tự chuyển ca.
- `pnpm design:compare` cho route `/attendance`.

## Verification

- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 pnpm --filter e2e e2e -- daily-attendance`
- Trước khi merge vào `develop`: chạy full Playwright suite (theo quy ước repo).
- `pnpm check`, `pnpm check-types`, `pnpm --filter web test`.
