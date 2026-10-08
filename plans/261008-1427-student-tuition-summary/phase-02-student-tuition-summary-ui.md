---
phase: 2
title: "UI tổng hợp học phí trong tab Học phí"
status: pending
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: UI tổng hợp học phí trong tab Học phí

## Goal

Tab **Học phí** của hồ sơ học viên hiện 3 thẻ Tổng học phí / Đã đóng / Còn
lại và bảng theo lớp phía trên bảng hóa đơn hiện có.

## Files to Create / Modify

- Create: `apps/web/src/components/tuition/student-tuition-summary.tsx` — component nhận `StudentTuitionSummary`, render thẻ + bảng theo lớp + ghi chú.
- Create: `apps/web/src/components/tuition/student-tuition-summary.test.tsx` — component test.
- Modify: `apps/web/src/routes/_auth/students/$studentId.tsx` — gọi `studentTuitionSummary(studentId, data.classes, data.enrollments, data.invoices)` và render component trong `tab === "tuition"`, trên Card hóa đơn.
- Modify: `CHANGELOG.md` — mục `## 2026-10-08` → `### Fixed`.

Đọc `DESIGN.md` trước khi code: dùng token có sẵn, không hard-code màu/cỡ chữ lệch scale.

## Bố cục

```
┌ Tổng học phí (VND) ┐ ┌ Đã đóng (VND) ┐ ┌ Còn lại (VND) ┐   ← StatCard, grid-cols-3 max-app:grid-cols-1
│ 10.000.000đ        │ │ 2.000.000đ    │ │ 8.000.000đ    │      Còn lại > 0 → chữ text-danger (tiền lệ /tuition)
└────────────────────┘ └───────────────┘ └───────────────┘
Ngoài ra đã thu 500.000đ từ hóa đơn không gắn lớp.          ← chỉ khi unlinkedPaid > 0, text-muted-fg text-sm

┌ Card white p-0 ─ DataTable ──────────────────────────────────────────┐
│ LỚP                    HỌC PHÍ       ĐÃ ĐÓNG      CÒN LẠI           │
│ [TEST] Foundation 2    10.000.000đ   2.000.000đ   8.000.000đ        │
│ IELTS 6.5              Chưa thiết lập 0đ          —                 │
│ Writing Pro (Đã mời)   6.000.000đ    0đ           Chưa kích hoạt — chưa tính │
└──────────────────────────────────────────────────────────────────────┘

┌ Card white p-0 ─ bảng hóa đơn hiện có (giữ nguyên) ┐
```

Quy tắc hiển thị:

- Tiền dùng `fmtVND`, `font-mono` như bảng hóa đơn.
- Tên lớp là `Link` tới `/classes/$classId` (cùng style link ở tab Hồ sơ).
- Lớp `invited`: kèm `Badge variant="warn"` "Đã mời" như tab Hồ sơ; ô Còn lại "Chưa kích hoạt — chưa tính".
- Lớp `fee === null`: ô Học phí "Chưa thiết lập" (`text-muted-fg`), ô Còn lại "—".
- `remaining === 0 && overpaid === 0` trên lớp counted: ô Còn lại `Badge success` "Đã đóng đủ".
- `overpaid > 0`: ô Còn lại "Dư {fmtVND(overpaid)}".
- `countedClasses === 0`: 3 thẻ hiện "—"; dưới thẻ hiện "Chưa lớp nào được thiết lập học phí. Thiết lập ở trang lớp." Nếu học viên không có lớp nào thì bỏ bảng theo lớp, hiện "Chưa tham gia lớp học nào."
- Bảng theo lớp không có `onClick` dòng (link lớp đã là điểm vào).
- Không đổi tab, route, hay hành vi bảng hóa đơn.

## Tasks & Steps

1. [ ] Tạo `student-tuition-summary.tsx` dùng `StatCard`, `Card`, `DataTable`, `Badge` sẵn có.
2. [ ] Nối vào `$studentId.tsx`; giữ Card hóa đơn bên dưới, cách nhau `mb-5`/`gap-5` theo nhịp trang.
3. [ ] Component test với `@testing-library/react`; mock `Link` của `@tanstack/react-router` theo mẫu `apps/web/src/components/sign-in-form.test.tsx:17`:
   - Một lớp 10.000.000đ / đã đóng 2.000.000đ → thấy "10.000.000đ", "2.000.000đ", "8.000.000đ".
   - Lớp invited hiện "Chưa kích hoạt — chưa tính"; lớp chưa thiết lập hiện "Chưa thiết lập".
   - `unlinkedPaid > 0` hiện ghi chú; `= 0` không hiện.
   - `countedClasses === 0` → 3 thẻ "—" và dòng hướng dẫn.
4. [ ] CHANGELOG: `- Hồ sơ học viên, tab "Học phí": thêm Tổng học phí / Đã đóng / Còn lại tính theo học phí các lớp đang học (cộng dồn nhiều lớp) và bảng theo lớp; trước đó chỉ liệt kê hóa đơn nên không biết học viên còn phải đóng bao nhiêu (#347)`.
5. [ ] Chạy test hẹp, lint, type.

## Verification

```bash
pnpm --filter web exec vitest run src/components/tuition/student-tuition-summary.test.tsx
pnpm check
pnpm check-types
pnpm --filter web test
```

Pass khi tất cả exit 0.
