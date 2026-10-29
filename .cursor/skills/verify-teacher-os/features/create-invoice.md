# Create an invoice

Create invoice lets a teacher open Doanh thu, create a tuition invoice for an active enrollment, see it in the invoice table with KPIs, and optionally mark it paid.

## Sub-features

- `invoice-open` opens `/tuition` and the create-invoice dialog.
- `invoice-save` persists amount, due date, and note for the selected enrollment.
- `invoice-mark-paid` flips the row to paid and updates KPI cards.
- `invoice-persist` keeps the paid row and KPIs after reload.

## How to get to it (user POV)

- Choose sidebar `Doanh thu`, then the create-invoice control (`data-testid="create-invoice"`).
- From an unpaid row, choose `Đã nhận` to mark paid.

## Driving it with verify-teacher-os

Preconditions:

- Stack is healthy.
- Teacher has an **active** enrollment (complete [enroll-activate-student](./enroll-activate-student.md)). Invited-only students must not appear in the invoice picker.

- **Open Doanh thu.** Click sidebar text `Doanh thu` (exact). URL is `/tuition`.
- **Open dialog.** Click `[data-testid="create-invoice"]`. Dialog heading `Tạo hóa đơn` is visible.
- **Fill.** Confirm label `Học viên *` contains the student name. Fill `Số tiền (VND) *` with `400000`. Fill `Ngày đến hạn *` with a VN-relative future ISO date (e.g. today+30). Optionally fill `Ghi chú`.
- **Save.** Click dialog button `Tạo hóa đơn`. Dialog hides. Inside `[data-testid="tuition-invoices-section"]`, text `400.000đ` and status `Chưa thu` appear. KPI `Còn phải thu (VND)` shows `400.000đ`; `Đã thu (VND)` stays `0đ`.
- **Mark paid (optional for full proof).** On that row click `Đã nhận`. KPIs flip: Đã thu `400.000đ`, Còn phải thu `0đ`.
- **Proof.** Reload `/tuition`. Capture `evidence/create-invoice/` screenshot + ARIA. Paid row shows `Đã thu`; KPI numbers match. Amount assertions must stay scoped to the invoices section or KPI testids — `400.000đ` appears in multiple places.

## Gotchas

- Sidebar label is `Doanh thu`, not `Học phí`.
- Empty amount shows `Vui lòng nhập số tiền.` and must not create a row (zero POSTs to `/api/invoices`).
- Amount mask strips invalid characters; do not assert raw typed strings after fill.
- Overdue derivation uses `due` — pick a future due date so status stays `Chưa thu` instead of `Quá hạn`.
- Finance nav is hidden when `canAccessFinance` is false; bootstrap teacher membership should allow it — if the sidebar link is missing, fail with that precondition.
