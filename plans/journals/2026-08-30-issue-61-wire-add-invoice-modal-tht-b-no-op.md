---
title: "Ship beta: wire AddInvoiceModal thật — issue #61"
date: 2026-08-30
summary: "ak:ship beta /ak:vibe --advice: nối AddInvoiceModal no-op vào POST /api/invoices qua command bus; hydrate enrollments vào kernel slice; validation inline amount/due/note; 377 unit + 3/3 e2e (real server) xanh; review 0 critical/0 important/3 minor (đã sửa); red-team plan 10 findings áp trước khi code"
---

# Ship beta: wire AddInvoiceModal thật — issue #61

Branch `feat/wire-add-invoice-modal` → `develop`, vibe pipeline `--ship --beta --advice`, ngày 2026-08-30. 13 paths: modal rewrite, action `add-invoice` + mapping, enrollments hydration, helper `isRealDateInputValue`, contract tests flip, e2e spec mới, plan dir.

## What happened

QC re-test 27/08 ghi P0: modal "Tạo hóa đơn" là **no-op trang trí** — submit chỉ `onClose()`, không persist, không lỗi, cả 3 case (rỗng/âm/hợp lệ) đều im lặng. API `POST /api/invoices` đã có từ #60 nhưng không ai gọi.

Lần này modal gọi thật qua đúng pipeline kernel write của repo:

- **Data layer:** `KernelAction` thêm `add-invoice`; `kernelCommand()` map sang body 4 field đúng contract `.strict()` (`note` luôn mang, default `""`); hydrate `enrollments` vào kernel slice qua mapper mới `repos/enrollments.ts` — picker cần `(classId, studentId)` pairs, thứ MockData chưa từng có.
- **Modal:** picker "Học viên · Lớp" (mỗi option = 1 enrollment), amount, due (prefill hôm nay), note; xóa fields Loại/Phương thức — contract không nhận, giữ lại là fake chrome. Lifecycle đúng chuẩn write modal: reset-on-open, `onClose={saving ? () => undefined : onClose}`, `disabled={saving || submitBlocked}`, `reconcileAndFinish` đóng modal sau reconcile thành công (POST non-idempotent — reconcile xong mà để modal mở là mời tạo trùng).
- **Validation client-side:** amount `^\d{1,12}$` (cap 12 chữ số chống SQLite integer overflow → 500 → outcome-unknown sai sự thật), due qua helper mới `isRealDateInputValue` (roundtrip calendar — `2026-02-30` fail, hôm nay/quá khứ pass, **không** dùng `isFutureDateInputValue` vì nó chặn chính prefill), note ≤ 500.

## Decision

Đáng nhớ nhất là **helper ngày không tồn tại ở dạng export** — red-team bắt được trước khi code. `date-input.ts` chỉ export 3 hàm, `parseDateInput` private; dùng `isFutureDateInputValue` cho due (pattern mà add-class dùng) sẽ chặn due = hôm nay → happy path chết ngay lập tức. Phải export helper mới, không phải "dùng helper có sẵn".

Thứ hai: **e2e bắt được bug thật mà unit test không bao giờ thấy** — 2 message amount bị gộp thành một lúc code, test "trống" fail vì DOM hiện message của case "sai format". TDD e2e trả giá trị đúng nghĩa: đỏ → sửa code (không sửa assertion) → xanh.

Và: **`data.enrollments[0]?.id ?? ""` là selection tùy ý** (snapshot không ORDER BY) — chấp nhận default-pick vì modal hiển thị label rõ ràng và user đổi được; điều thật quan trọng là enrollment lạ/đã xóa rơi vào 404 server → form-level error chung, không âm thầm tạo sai invoice.

## Evidence

- Web unit **377/377** (34 files) gồm 4 test mới (`kernelCommand` body mapping ×2, enrollments ride snapshot, `isRealDateInputValue` roundtrip cases); contract test flip xanh với shared asserts **không đụng**.
- E2e `create-invoice.spec.ts` **3/3** trên server thật: happy path (400.000đ + "Chưa thu", reload còn), rỗng và `-5000` → field error + **0 POST** (đếm qua `page.on("request")` observe-only, listener đăng ký trước action).
- `pnpm check` sạch (2 warning baseline pre-existing), `check-types` 6/6, root `pnpm test` xanh.
- Review local: **0 Critical / 0 Important / 3 Minor** — cả 3 đã sửa (message amount tách rõ "tối đa 12 chữ số", `type Request` import, comment biome-ignore nói đúng cơ chế) và chạy lại toàn bộ xanh sau đó.
- Red-team plan: 15 findings → 10 accepted (4 High: reset-on-open, helper export, saving-gate, bare reconcile) — tất cả áp vào plan TRƯỚC khi implementation.

## Next steps

- Merge PR → `develop`, canh CI e2e (khác môi trường local — nếu đỏ vì flake, re-run trước khi kết luận lỗi logic, per kongming counsel).
- Follow-up **#135**: hiển thị `due`/`note` trên bảng Hóa phí (khoảng trống có chủ đích, đã ghi trong risk assessment).
- Totals tuition là #62 — statcards vẫn hardcode "21.0tr", không đụng trong PR này.

Cảm nhận thật: issue bé (một modal no-op) mà plan đỏ 3 round mới đứng dậy được — phần giá trị nhất không phải code mà là danh sách "cái này sẽ vỡ ngay lần chạy đầu" được viết ra TRƯỚC khi code: helper ngày, reset-on-open, reconcile-close. Đúng 3 cái đó là 4 finding High của red-team, và không cái nào biến thành bug thật trong implementation. Chi phí 30 phút red-team đổi lấy 0 lần rewrite.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
