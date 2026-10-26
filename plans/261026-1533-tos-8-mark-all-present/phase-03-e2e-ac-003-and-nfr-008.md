---
phase: 3
title: "E2E AC-003, đo 5 ca ≤ 2 phút, 3 viewport"
status: pending
priority: P2
effort: "2.5h"
dependencies: [2, "TOS-7 phase 5"]
---

# Phase 3: Kiểm chứng end-to-end

> **Cập nhật 2026-10-26 (red-team #7, #10):** timing assert chỉ chốt tổng ≤ 120s một lần (proxy NFR-008); NFR-001 là p95 tải/lọc ở quy mô 50 lớp/1000 HV — ngoài scope e2e này, không assert wall-clock từng bước. `TODAY` tính trong thân test (không để const module scope qua nửa đêm). Mỗi bước bàn phím chờ `toBeFocused()` trước khi Enter.

## Goal

Chứng minh AC-003 chạy thật trên trình duyệt và luồng thao tác nhanh đạt NFR-008 (≥ 5 lớp trong ≤ 2 phút).

## Files to Create / Modify

- Modify: `apps/e2e/specs/daily-attendance.spec.ts` (TOS-7 Phase 5 tạo). Thêm `describe("AC-003 mark all present")`, `TODAY` gọi `vietnamTodayISO()` trong thân test.
- Dùng lại `apps/e2e/specs/helpers-dated-class.ts` để tạo lớp có ca hôm nay; seed một học viên tên "Trần Hoàng Nam" cho kịch bản 1.

## Kịch bản

1. **AC-003 chính:**
   - Lớp có ca hôm nay với 4 học viên, trong đó có "Trần Hoàng Nam". Mở `/attendance?date={hôm nay}`, mở ca.
   - Bấm "Đánh dấu tất cả Có mặt" → 4 người đều "Có mặt".
   - Chỉnh Nam sang "Vắng có phép", bấm "Lưu điểm danh ca học". Toast thành công xuất hiện (assert chức năng), URL không đổi.
   - Tải lại: Nam là "Vắng có phép", 3 người còn lại "Có mặt". Kiểm thêm qua API: Nam `attendance = excused`, `status = absent`; còn lại `present` / `completed`.
2. **Không ghi đè lựa chọn có sẵn:** chọn "Đi muộn" cho 1 người trước, bấm điền nhanh → người đó vẫn "Đi muộn".
3. **Hộp xác nhận khi lưu thiếu:** để trống 2 người, bấm lưu → modal "Còn 2 học viên".
   - "Quay lại chỉnh": không có request PUT trong 1 giây, dòng thiếu có viền cảnh báo.
   - Bấm lưu lần nữa → "Gán Có mặt và lưu": PUT gửi đủ sĩ số, 2 người đó là "Có mặt".
4. **Ca đã recorded còn dòng "Chưa rõ":** nút điền nhanh disabled, bấm lưu đi đường TOS-7 (không modal bulk). **Deviation (2026-10-26):** không dựng được state này qua public API (server PUT chặn incomplete-roster; "Chưa rõ" chỉ đến từ data legacy import) — hành vi đã cover bằng unit test row component ("ca recorded … chặn lưu") và test disabled recorded.
5. **NFR-008 — 5 lớp ≤ 2 phút:**
   - Tạo 5 lớp có ca hôm nay, mỗi lớp 3–5 học viên. Mở `/attendance?date={hôm nay}&status=pending`.
   - Mốc `t0` khi trang tải xong. Lặp 5 lần: lần đầu click nút điền nhanh; các lần sau ca kế tiếp tự mở với focus ở **picker đầu tiên** — chờ `expect(picker).toBeFocused()`, rồi Shift+Tab tới nút điền nhanh + Enter (hoặc click nút nếu focus lệch); chỉnh 1 học viên sang "Vắng không phép"; lưu; chờ toast và ca kế tiếp tự mở (assert chức năng, không assert thời gian từng bước).
   - `t1` khi thông báo "Đã điểm danh xong mọi ca trong ngày" xuất hiện. Assert `t1 - t0 ≤ 120000` ms một lần duy nhất (proxy NFR-008; chấp nhận retry của Playwright, ghi chú flake-tolerance).
   - Mở `/dashboard`: thẻ "Ca học hôm nay chưa điểm danh" giảm đúng 5 so với trước (tính lại `TODAY` ngay trước assert).

## Kiểm thủ công theo `REVIEW.md`

- 3 viewport 1440×900, 768×1024, 375×812: nút điền nhanh không tràn dòng; ở 375px nút điền nhanh và nút lưu xếp chồng full-width, ô bấm ≥ 44px. Chụp screenshot ca đang mở + modal xác nhận cho PR.
- Bàn phím: hoàn tất 2 ca liên tiếp chỉ bằng phím, focus ring rõ ở **picker đầu tiên** của ca tự mở.
- `pnpm design:compare` cho route `/attendance`.

## Verification

- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 pnpm --filter e2e e2e -- daily-attendance`
- Trước khi merge vào `develop`: chạy full Playwright suite (theo quy ước repo).
- `pnpm check`, `pnpm check-types`, `pnpm --filter web test`.
