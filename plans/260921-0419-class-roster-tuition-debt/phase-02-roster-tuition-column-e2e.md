---
title: "Phase 2: Cột \"Học phí\" trong tab Học viên + e2e"
status: completed
phase: 2
priority: P2
effort: "2.5h"
dependencies: [1]
---

# Phase 2: Cột "Học phí" trong tab Học viên + e2e

## Overview

Render cột "Học phí" trong bảng roster của trang chi tiết lớp: số tiền đỏ khi còn nợ, "Đã đủ" khi hóa đơn lớp đã thu đủ, "—" khi chưa có hóa đơn nào cho lớp. Kèm e2e spec chạy đủ vòng đời: chưa có hóa đơn → tạo hóa đơn (nợ đỏ) → mark-paid (Đã đủ).

## Context Links

- Roster tab: `apps/web/src/routes/_auth/classes/$classId.tsx:240-274` — `DataTable` headers hiện tại `["Học viên", "Mục tiêu", "Còn lại", "Trạng thái"]`, `tab` mặc định `"roster"`
- Helper từ Phase 1: `rosterDebtByStudent` (`apps/web/src/lib/tuition-from-kernel.ts`)
- Format tiền: `fmtVND` (`apps/web/src/lib/mock-data.ts:222-224`) — `fmtVND(400000)` = `"400.000đ"`
- Class màu precedent: `apps/web/src/routes/_auth/tuition.tsx:106` dùng `font-mono font-semibold text-danger` cho tiền chưa thu
- E2E pattern tạo invoice: `apps/e2e/specs/create-invoice.spec.ts` — setup org + enrollment, modal "Tạo hóa đơn" ở `/tuition`, mark-paid bằng nút "Đã nhận"
- E2e boot: `playwright.config.ts` tự chạy `boot:api` + vite :8001, workers 1, timezone Asia/Ho_Chi_Minh

## Requirements

- [ ] Headers roster thành `["Học viên", "Mục tiêu", "Còn lại", "Học phí", "Trạng thái"]`
- [ ] Cell Học phí theo `rosterDebtByStudent`: `outstanding > 0` → tiền đỏ; `invoiceCount > 0 && outstanding === 0` → "Đã đủ"; không có trong map → "—"
- [ ] Nợ hiển thị đúng định dạng `fmtVND`, scoping theo lớp (invoice lớp khác không hiện)
- [ ] Không đổi StatCard row (đang full 6 ô `grid-cols-6`) — không thêm KPI mới
- [ ] E2e spec mới `apps/e2e/specs/class-roster-tuition-debt.spec.ts` phủ đủ 3 trạng thái
- [ ] `pnpm --filter web check-types`, `pnpm --filter web test`, `pnpm --filter e2e e2e specs/class-roster-tuition-debt.spec.ts` xanh

## Implementation Steps

1. `apps/web/src/routes/_auth/classes/$classId.tsx` — thêm imports (`fmtVND` từ `@/lib/mock-data` — file đã import `CLASS_TYPE_LABELS, classMeta` từ đó, thêm `fmtVND` vào; `rosterDebtByStudent` từ `@/lib/tuition-from-kernel`).

2. Cùng file, sau `const classAssignments = useMemo(...)` (dòng ~138), thêm:

```tsx
const rosterDebt = useMemo(
	() => rosterDebtByStudent(classId, data.enrollments, data.invoices),
	[classId, data.enrollments, data.invoices],
);
```

3. Đổi block `tab === "roster"` (dòng 240-274): headers thêm `"Học phí"` giữa `"Còn lại"` và `"Trạng thái"`; thêm cell trước cell Trạng thái:

```tsx
headers={["Học viên", "Mục tiêu", "Còn lại", "Học phí", "Trạng thái"]}
```

```tsx
// trong cells, trước Badge Trạng thái:
(() => {
	const d = rosterDebt.get(s.id);
	if (!d || d.invoiceCount === 0) {
		return (
			<span key="fee" className="font-mono text-meta text-xs">
				—
			</span>
		);
	}
	if (d.outstanding > 0) {
		return (
			<span key="fee" className="font-mono font-semibold text-danger">
				{fmtVND(d.outstanding)}
			</span>
		);
	}
	return (
		<span key="fee" className="font-mono text-meta text-xs">
			Đã đủ
		</span>
	);
})(),
```

4. Tạo `apps/e2e/specs/class-roster-tuition-debt.spec.ts` — theo pattern `create-invoice.spec.ts`:

   - Const riêng để không đụng spec khác: `STUDENT_NAME = "QC Roster E2E"`, `CLASS_NAME = "E2E Roster Nợ học phí"`.
   - `setupOrgWithEnrollment(page)`: copy pattern từ `create-invoice.spec.ts:22-75` — `signUpViaUi` → tạo học viên ở `/students` → tạo lớp T2+T4 ở `/classes` → enroll qua "+ Thêm học viên" của class detail.
   - Helper `rosterRow(page)`: locator `tbody tr` filter `hasText: STUDENT_NAME` trong Card roster.
   - Test chính "class detail → cột Học phí phản ánh vòng đời nợ của lớp":
     1. Setup; vào class detail (roster là tab mặc định) → `rosterRow` visible, cell học phí là "—".
     2. Sang "Học phí" (nav `/tuition`) → "+ Tạo hóa đơn": amount `400000`, due `2026-12-25`, submit (picker mặc định enrollment duy nhất của org — đã có label học viên).
     3. Về "Lớp học" → vào lớp → roster row hiện `"400.000đ"` (danger). Assert `page.locator("span.text-danger", { hasText: "400.000đ" })` scoped trong roster Card.
     4. Sang `/tuition` → row hóa đơn "Đã nhận" → về class detail → cell thành "Đã đủ".
     5. `page.reload()` → vẫn "Đã đủ" (snapshot refetch).
   - Test phụ "invoice của lớp khác không lẫn vào": tạo lớp thứ 2 không enrollment/hóa đơn — không bắt buộc; thay bằng: sau bước mark-paid, tạo hóa đơn thứ 2 cho cùng enrollment rồi assert số tiền cộng dồn `800.000đ` (hai invoice 400.000đ unpaid → outstanding 800.000đ), xong mark-paid cả hai → "Đã đủ". Cách này phủ nhánh cộng dồn của helper trong UI.

5. Chạy lần lượt:

```bash
pnpm --filter web check-types
pnpm --filter web test
pnpm --filter e2e e2e specs/class-roster-tuition-debt.spec.ts
```

## Todo

- [ ] Thêm `rosterDebt` useMemo + cột "Học phí" trong roster tab
- [ ] Viết e2e spec `class-roster-tuition-debt.spec.ts`
- [ ] Chạy 3 lệnh kiểm chứng

## Success Criteria

- Mở class detail của lớp có học viên nợ: cột Học phí hiện tiền đỏ `fmtVND`; thu đủ xong refetch tự flip thành "Đã đủ" không cần F5 (command bus refetch snapshot sau mark-paid).
- Học viên của lớp khác nợ thì lớp này KHÔNG hiện nợ (scoping theo enrollmentId).
- 3 lệnh kiểm chứng exit 0.

## Risk Assessment

- **Playwright strict mode**: chuỗi `"400.000đ"` có thể xuất hiện ở nhiều nơi trên trang (StatCard? — roster tab không render StatCard tiền; nhưng header trang có `classMeta`). Luôn scope locator vào Card roster / `tbody tr` theo pattern `create-invoice.spec.ts` (dùng `filter({ hasText })` trên row).
- **`data.enrollments` undefined trên store cũ?** `DataShape.enrollments` là `KernelEnrollmentRow[]` bắt buộc (`mock-data.ts:204-205`) — không có rủi ro optional.
- **Flaky do refetch sau mark-paid**: command bus luôn refetch snapshot sau write (đã có precedent KPI flip trong `create-invoice.spec.ts:169-172`) — dùng `expect(...).toHaveText` với auto-retry mặc định.

## Security Considerations

- Không có endpoint mới, không đổi server. Giá trị tiền render từ dữ liệu org đã auth — không lộ dữ liệu liên org.
