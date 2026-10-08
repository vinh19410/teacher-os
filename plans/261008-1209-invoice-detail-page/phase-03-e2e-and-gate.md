---
phase: 3
title: "E2E + gate local + screenshot 3 viewport"
status: pending
priority: P2
effort: "2h"
dependencies: [1, 2]
---

# Phase 3: E2E + gate local + screenshot 3 viewport

## Goal

Khoá hành vi bằng e2e thật, chạy đủ gate local (PR vào `develop` không có CI), chụp screenshot 3
viewport cho PR.

## Files to Create / Modify

- Create: `apps/e2e/specs/invoice-detail.spec.ts`.
- Create: `plans/261008-1209-invoice-detail-page/screenshots/*.png`.

## Tasks & Steps

1. **Spec `invoice-detail.spec.ts`** — tái dùng pattern trong `tuition-bank-transfer.spec.ts`
   (`teacherSignIn`, `orgIdOfTeacher`, liên kết bank qua fake bank hub, `seedInvoice` direct-SQL
   `:36-63`, `simulateIpn` `:79-102` gửi giao dịch có memo của hóa đơn). `seedInvoice` hiện cứng
   `enrollment_id=''`, `note=''` — viết biến thể local trong spec (hoặc thêm tham số tuỳ chọn
   `enrollmentId`/`note`/`due`) lấy enrollment id thật của học viên trong lớp để kiểm tra link lớp:
   - Seed hóa đơn 500.000đ có ghi chú + enrollment thật; seed thêm 1 hóa đơn legacy (`enrollment_id=''`) để kiểm "Lớp —"; gửi IPN 200.000đ khớp memo hóa đơn đầu.
   - `/tuition` → click dòng (theo số tiền) → `expect(page).toHaveURL(/\/tuition\/[^/?]+$/)`.
   - Thấy: mã `INV-…`, ghi chú, "Thu một phần", "còn 300.000đ", tên học viên (link), tên lớp (link), QR/memo, một dòng lịch sử 200.000đ với nội dung CK.
   - Bấm "Đã nhận" → badge "Đã thu".
   - Quay lại `/tuition`: bấm nút "Thu học phí" trong một dòng khác → modal mở, URL vẫn `/tuition` (propagation bị chặn).
   - Focus một dòng bằng Tab, nhấn Enter → điều hướng detail.
   - Hồ sơ học viên tab "Học phí" → click dòng → detail.
   - `/tuition/khong-ton-tai` → "Không tìm thấy hóa đơn".
2. **Gate local** (thứ tự):
   ```bash
   pnpm check
   pnpm check-types
   pnpm --filter web test
   pnpm --filter server test
   E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e
   ```
   Spec cũ liên quan `/tuition` phải còn xanh: `tuition-bank-transfer`, `create-invoice`,
   `tuition-revenue-chart`, `student-package-validation`, `class-roster-tuition-debt`.
3. **Screenshot + keyboard** theo `REVIEW.md`: trang detail ở 1440×900, 768×1024, 375×812
   (lưu `screenshots/invoice-detail-{1440,768,375}.png`), kiểm tra focus ring trên dòng bảng,
   link học viên/lớp, các nút; không tràn ngang ở 375 (trừ bảng lịch sử cuộn trong khung).

## Verification

- Toàn bộ lệnh gate xanh; 3 screenshot có trong thư mục plan.

## Risks

- E2E bank flow cần fake bank hub — dùng đúng helper/boot của spec hiện có, không gọi SePay thật.
- Dev stack local chiếm 8000/8001/8003 — luôn dùng override port 81xx cho e2e.
