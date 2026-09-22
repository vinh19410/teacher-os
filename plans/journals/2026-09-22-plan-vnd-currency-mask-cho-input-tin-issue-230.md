---
title: "Plan: VND currency mask cho input tiền (issue #230)"
date: 2026-09-22
summary: "Lập plan 260922-0312-vnd-currency-input: CurrencyInput + format-currency.ts cho 5 vị trí input tiền, mask giữ rule >12 chữ số ở submit, 2 case e2e âm đổi hành vi"
---

# Plan: VND currency mask cho input tiền (issue #230)

## What happened

Tạo plan `plans/260922-0312-vnd-currency-input/` (issue #230, nhãn `ready to review`) cho yêu cầu: mọi input tiền/phí hiển thị phân cách hàng nghìn `1,000,000` ngay lúc gõ.

Khảo sát thấy 5 vị trí input tiền: 4 modal copy cùng regex `AMOUNT_RE /^\d{1,12}$/` (`add-invoice-modal.tsx:12`, `add-class-modal.tsx:33`, `edit-class-fee-modal.tsx:9`) + field settings `defaultUnitPrice` là text tự do lưu chuỗi `"400.000đ"` thẳng DB (`packages/db/src/schema/settings.ts:9`).

## Decision

- 1 util `apps/web/src/lib/format-currency.ts` (`formatVndInput` — strip non-digits + nhóm dấu phẩy; `parseVndAmount` — parse ngược, >12 chữ số → null) + 1 component `components/ui/currency-input.tsx` (`type="text"` + `inputMode="numeric"`).
- Mask **không cap độ dài**: case >12 chữ số vẫn lỗi ở submit → giữ nguyên thông báo lỗi cũ, e2e case `1234567890123` không phải sửa.
- Nhập số âm không còn khả thi ở UI (mask strip `-`): 2 case e2e (`create-invoice.spec.ts:189`, `student-package-validation.spec.ts:77`) đổi thành assert chuỗi rỗng + lỗi bắt-buộc; server `.int().min(1)` là rào cuối.
- Settings vẫn persist string qua contract `z.string().min(1)` — không đổi API/DB.
- Dấu phân cách phẩy (`1,000,000`) theo yêu cầu user; display `fmtVND` vi-VN (`1.000.000đ`) giữ nguyên — chấp nhận song song, follow-up nếu muốn thống nhất.
- Dùng separator phẩy thay vì `toLocaleString("vi-VN")` (dấu chấm) để khớp đúng ví dụ người dùng đưa và tránh phụ thuộc locale runtime.

## Next steps

- `/ak:cook plans/260922-0312-vnd-currency-input/plan.md` — 3 phases: nền tảng util+component (1.5h) → áp dụng 5 vị trí (2h) → e2e + gates (1.5h).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
