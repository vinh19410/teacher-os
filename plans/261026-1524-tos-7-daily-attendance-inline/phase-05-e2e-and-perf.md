---
phase: 5
title: "E2E AC-002, 3 viewport, design compare, đo 2 giây"
status: pending
priority: P1
effort: "3h"
dependencies: [3, 4]
---

# Phase 5: Kiểm chứng end-to-end

## Goal

Chứng minh AC-002 chạy thật trên trình duyệt: lọc theo ngày trên URL, điểm danh inline 4 trạng thái, lưu ≤ 2 giây không chuyển trang, bộ đếm dashboard giảm 1.

## Files to Create / Modify

- Create: `apps/e2e/specs/daily-attendance.spec.ts`.
- Dùng lại helper lớp có ngày `apps/e2e/specs/helpers-dated-class.ts` để tạo lớp có buổi hôm nay với 3–4 học viên. Nếu helper chưa hỗ trợ "buổi hôm nay", thêm tham số thay vì viết helper mới.

## Kịch bản

1. **AC-002 chính:**
   - Tạo lớp có ca hôm nay. Mở `/dashboard`, ghi lại số trên thẻ "Ca học hôm nay chưa điểm danh" (N).
   - Mở `/attendance?date={hôm nay}`. Ca hiện với nhãn "Chưa điểm danh".
   - Mở ca, chọn lần lượt Có mặt / Vắng có phép / Vắng không phép / Đi muộn cho 4 học viên, nhập ghi chú cho 1 người.
   - Bấm "Lưu điểm danh ca học". Đo từ lúc bấm đến khi toast hiện: ≤ 2000ms (`expect.poll` với mốc `performance.now()`), `page.url()` không đổi.
   - Ca đổi nhãn "Đã điểm danh". Tải lại trang: trạng thái và ghi chú vẫn đúng.
   - Quay lại `/dashboard`: thẻ hiện N − 1.
2. **Thiếu trạng thái:** để trống 1 học viên, bấm lưu → thông báo thiếu, không có request PUT (`page.waitForRequest` không xảy ra trong 1 giây).
3. **Buổi đã huỷ không hiện:** huỷ buổi hôm nay của một lớp khác qua API có sẵn → lớp đó không có trên `/attendance`.
4. **Lọc chip:** `?status=pending` chỉ hiện ca chưa điểm danh; `?status=completed` chỉ hiện ca đã lưu.
5. **Tải danh sách ≤ 2 giây:** đo `GET /api/attendance/daily` qua `page.waitForResponse` với seed e2e.

## Kiểm thủ công theo `REVIEW.md`

- 3 viewport 1440×900, 768×1024, 375×812. Chụp screenshot ca đang mở ở mỗi viewport cho PR.
- Ở 375px picker là lưới 2×2, không cuộn ngang.
- Bàn phím: hoàn tất điểm danh một ca chỉ bằng phím.
- `pnpm design:compare` cho route `/attendance`.

## Verification

- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 pnpm --filter e2e e2e -- daily-attendance`
- Trước khi merge vào `develop`: chạy full Playwright suite (theo quy ước repo).
- `pnpm check`, `pnpm check-types`, `pnpm --filter web test`, `pnpm --filter server test`.
