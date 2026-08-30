---
phase: 2
title: "Tuition real totals + due column + note tooltip"
status: completed
priority: P1
effort: "3h"
dependencies: [1]
---

# Phase 2: Tuition real totals + due column + note tooltip

## Overview

Thay toàn bộ số hardcode trên `/tuition` bằng giá trị tính từ store (invoice thật + gói học thật), và render ngày đến hạn/note trên bảng Hóa đơn. Đóng nửa UI của #135 và trọn vẹn #62.

## Requirements

- Functional: KPI đã thu = tổng `amount` invoice `paid`; còn nợ = tổng `amount` invoice `unpaid`+`overdue`; gói sắp hết = số học viên `pkg.remaining <= 4` — tổng thể các dòng mà bảng gói đang gắn nhãn "Sắp hết" (badge danger ≤2 và badge warn ≤4 cùng chữ, red-team finding #C); lead = `Đã thu ${fmtVND(collected)}`.
- Functional: KPI số tiền hiển thị dạng **full `fmtVND`** ("21.000.000đ") — QC đối chiếu số tuyệt đối; một format duy nhất cho lead + StatCard (advisory round: bỏ helper compact, tránh hai kiểu "21.0tr" vs "21.000.000đ" lệch nhau).
- Functional: cột "Đến hạn" hiển thị `due` dạng dd/mm cho unpaid/overdue, "—" cho paid hoặc due rỗng/không chuẩn; note hiện dạng tooltip qua `<span title>` bọc tag Loại (component `Tag` chỉ nhận `children` — red-team finding #D).
- Non-functional: account rỗng → cả 3 KPI = `0đ`/`0`, không crash, không số fake còn sót (kể cả chữ "T8" trong label "Đã thu T8 (VND)" — đổi thành "Đã thu (VND)", red-team finding #E).

## Architecture

Helper thuần `apps/web/src/lib/tuition-from-kernel.ts` (pattern như `dashboard-from-kernel.ts`): nhận `Invoice[]`/`Student[]` từ store, trả totals + count + `formatDue`; số tiền format bằng `fmtVND` có sẵn trong mock-data; route `/tuition` chỉ consume.

Cơ chế cập nhật sau mark-paid (red-team finding #B): người refresh store là **command bus** — `createKernelCommandBus` tự `deps.refetch()` sau mỗi POST thành công rồi mới trả `refreshed`; `useDirectKernelAction`/`reportDirectOutcome` không tự gọi `refresh` (reconcile "none"). Hệ quả: KPI khớp ngay khi snapshot đã refetch thành công. Nhánh `committed` (POST 2xx nhưng refetch GET fail 2 lần) cố ý giữ KPI stale — toast "Đã lưu nhưng chưa tải lại được dữ liệu" đã trung thực; chấp nhận, không thêm logic riêng. Reload trang luôn khớp vì snapshot là nguồn chân lý.

## Related Code Files

- Create: `apps/web/src/lib/tuition-from-kernel.ts` (`tuitionTotals`, `packagesEndingSoon`, `formatDue`)
- Create: `apps/web/src/lib/tuition-from-kernel.test.ts`
- Modify: `apps/web/src/routes/_auth/tuition.tsx` (lead + 3 StatCard + label "Đã thu (VND)" + cột Đến hạn + span title note)
- Modify: `apps/e2e/specs/create-invoice.spec.ts` (scope lại 2 assertion `getByText("400.000đ")` cũ vào `invoiceTable(page)` — KPI mới render cùng chuỗi, strict mode sẽ chết; mở rộng: fill due tường minh, assert ô dd/mm, assert KPI đổi sau create → mark-paid → reload)

## Implementation Steps (TDD)

1. RED: viết `tuition-from-kernel.test.ts` —
   - `tuitionTotals`: rỗng → `{collected: 0, outstanding: 0}`; mix paid/unpaid/overdue cộng đúng, không double-count.
   - `packagesEndingSoon`: remaining 4 đếm, 5 không đếm; rỗng → 0.
   - `formatDue`: "2026-09-15" → "15/09"; "" → "—"; chuỗi không khớp `^\d{4}-\d{2}-\d{2}$` → "—". Cấm `new Date()` — slice chuỗi (repo từng dính UTC-drift vì Date-parse; `week-grid.ts` có docblock cảnh báo).
2. GREEN: implement helper — `formatDue` tái dùng `formatDayMonth` có sẵn trong `apps/web/src/lib/week-grid.ts` (dd/MM slice từ ISO, deterministic) + regex guard.
3. RED→GREEN UI: sửa `tuition.tsx` —
   - `PageHead lead` = `Đã thu ${fmtVND(collected)}` (bỏ "Doanh thu tháng 8 · 21.000.000đ" hardcode).
   - 3 `StatCard`: `fmtVND(collected)`/`fmtVND(outstanding)`/`packagesEndingSoon`, giữ class màu; label đầu đổi thành "Đã thu (VND)".
   - Bảng Hóa đơn: thêm header "Đến hạn" sau "Ngày", cell `formatDue(i.due)` cho unpaid/overdue, "—" cho paid; bọc Tag Loại trong `<span title={i.note || undefined}>` khi có note.
4. Mở rộng `apps/e2e/specs/create-invoice.spec.ts`:
   - Scope 2 assertion `getByText("400.000đ")` hiện có (dòng ~122/132) vào scope `invoiceTable(page)` — sau khi KPI render `fmtVND`, cùng chuỗi xuất hiện 2 nơi, Playwright strict mode sẽ fail (advisory round).
   - Fill ngày đến hạn tường minh (vd `2026-12-25`, KHÔNG dựa default "hôm nay" của modal — tránh race nửa đêm/lệch TZ runner UTC), assert dòng mới có ô `25/12`, reload vẫn đúng → chặn AC #135.
   - Assert KPI Còn nợ chứa `fmtVND` số tiền sau create → bấm "Đã nhận" → assert Đã thu/Còn nợ đổi đúng chiều → reload → vẫn đúng → chặn AC #62 bằng e2e thật (advisory round).
5. Gate: `pnpm turbo run check-types` + vitest web + biome toàn workspace; chạy e2e local (`pnpm --filter e2e e2e` hoặc tương đương e2e.yml) trước khi mở PR; CI e2e chạy trên cả PR lẫn push develop.

## Todo

- [x] Test RED helper: totals/ending/formatDue
- [x] GREEN helper (formatDue = formatDayMonth + regex guard)
- [x] UI: lead + StatCards fmtVND + label "Đã thu (VND)"
- [x] UI: cột Đến hạn + span title note
- [x] e2e: scope assertion cũ + due tường minh + mark-paid/reload KPI
- [x] check-types + vitest + biome xanh; e2e local xanh

## Success Criteria

- [x] `/tuition` không còn số/chữ-kỳ hardcode; rỗng → 0đ (QC re-test #62)
- [x] Sau mark-paid (khi snapshot đã refetch) KPI đổi ngay; sau reload vẫn khớp (#62, có e2e chứng minh); nhánh committed-stale đã ghi nhận là hành vi có chủ đích
- [x] KPI "Gói sắp hết" khớp số dòng có badge "Sắp hết" trong bảng gói cùng trang
- [x] Invoice unpaid/overdue hiện ngày đến hạn dd/mm đã nhập từ modal, đúng qua reload (#135, e2e)
- [x] Note hiện tooltip trên tag Loại (#135)
- [x] Spec e2e #61 cũ vẫn xanh (assertion đã scope đúng)

## Risk Assessment

Helper format: một format duy nhất `fmtVND` — nếu sản phẩm muốn kiểu khác chỉ đổi nơi render. Cột mới làm bảng rộng trên mobile → DataTable đã handle scroll ngang ở các bảng 7 cột khác, theo pattern chung. e2e strict-mode trùng text → assertion cũ scope vào bảng, KPI assertion scope vào vùng KPI; helper test chặn format sai. KPI stale nhánh `committed` → có chủ đích, toast đã báo.
