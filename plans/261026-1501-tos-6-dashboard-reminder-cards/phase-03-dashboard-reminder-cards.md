---
phase: 3
title: "Khu vực Việc cần làm hôm nay trên dashboard"
status: completed
priority: P1
effort: "5h"
dependencies: [1, 2]
---

# Phase 3: 3 thẻ nhắc việc trên `/dashboard`

## Goal

Dashboard hiển thị khu vực "Việc cần làm hôm nay" ngay dưới `PageHead`, trên hàng KPI. Khu vực có 3 thẻ lấy số liệu từ `GET /api/dashboard/reminders`. Mỗi thẻ có nút điều hướng 1 chạm. Thẻ học phí chỉ render khi response có block `tuition`.

## Files to Create / Modify

- Create: `apps/web/src/lib/repos/dashboard-reminders.ts`. `queryOptions` với key `["kernel", "dashboard", "reminders"]`. **Chú ý:** refresh sau action kernel không tự phủ key này — mọi refresh chạy `exact: true` trên `kernelQueryKey = ["kernel"]` (data-provider.tsx:107, grading/$attemptId.tsx:79-84). Dashboard phải nối reminders vào vòng đời kernel snapshot: đọc `dataUpdatedAt` của kernel query (observer thêm trên cùng cache entry, `kernelQueryOptions` — shared entry theo kernel.ts:595-601) và đưa vào query key của reminders (`[...remindersKey, kernelDataUpdatedAt]`) hoặc invalidate tường minh khi `dataUpdatedAt` đổi. Fetch theo mẫu `repos/grading.ts` (`credentials: "include"`, `HttpError`), parse bằng `dashboardRemindersResponseSchema`.
- Create: `apps/web/src/components/dashboard/reminder-cards.tsx`. Component chỉ nhận data, không tự fetch, để test dễ.
- Create: `apps/web/src/components/dashboard/reminder-cards.test.tsx`.
- Modify: `apps/web/src/routes/_auth/dashboard.tsx`. Gắn `useQuery` và render section. Cập nhật `dashboard.test.tsx`.

## Hành vi UI

| Thẻ | Nội dung | Nút |
|---|---|---|
| Ca học hôm nay chưa điểm danh | Số ca + tối đa 3 dòng "Tên lớp (HH:mm – HH:mm)" | `Mở Điểm danh ngày →`. `Link` tới `/attendance` với `search={{ date: data.date, status: "pending" }}` |
| Bài tập quá hạn chấm > 24h | Số bài + dòng "N Writing · M Speaking" | `Mở Không gian chấm →`. `/grading?status=awaiting` |
| Học phí đến hạn / quá hạn thu | Số học viên + tổng tiền (`fmtVND`) | `Mở Sổ học phí →`. `/tuition` |

- Bấm vào thẻ "Ca học hôm nay chưa điểm danh" có cùng đích với nút. Toàn thẻ là vùng bấm theo mẫu link-card; trong thẻ chỉ có 1 điểm focus.
- **Zero inbox:** số đếm bằng 0 thì thẻ đổi sang tông trung tính và hiện nhãn "Đã hoàn tất hôm nay". Nút vẫn dẫn đúng đích.
- **Loading:** skeleton cùng kích thước để không nhảy layout. **Lỗi:** dòng thông báo ngắn kèm nút "Thử lại", các phần còn lại của dashboard vẫn hiển thị.
- Nút **"Làm mới dữ liệu"** (ghost) gọi `refetch()`.
- Tiêu đề section: "Việc cần làm hôm nay (Thứ Hai, 26/10/2026)", định dạng `vi-VN`.
- Layout: lưới 3 cột khi ≥ `lg`, 1 cột ở 375px. Dùng token trong `packages/ui/src/styles/globals.css` và component `Card` / `Badge` / `Button` sẵn có.

## Tasks & Steps

1. Test đỏ cho `ReminderCards`:
   - Render đủ 3 thẻ.
   - `href` của thẻ điểm danh có `date` và `status=pending`.
   - Thiếu `tuition` thì không render thẻ học phí và không có chữ "Học phí" trong DOM.
   - Đếm bằng 0 thì hiện nhãn zero inbox.
2. Viết repo + component, gắn vào dashboard.
3. Cập nhật `dashboard.test.tsx` để mock fetch reminders, giữ các assert hiện có. Thêm 1 test chứng minh bộ đếm làm mới sau 1 kernel action: thay đổi `dataUpdatedAt` của entry `["kernel"]` trong cache → reminders query refetch (assert fetch được gọi lần 2).
4. Tự kiểm bàn phím: Tab đi qua 3 thẻ theo đúng thứ tự, focus ring hiển thị.

## Verification

- `pnpm --filter web test -- reminder-cards dashboard`
- `pnpm check-types`
- `pnpm check`
