---
title: "Plan Doanh thu (issue 343): red-team bắt 3 Critical — công thức revenue, serialize createdAt, e2e selector sai app"
date: 2026-10-08
summary: "ak:plan cho /tuition → Doanh thu + chart doanh thu recharts; 2/3 reviewer quay lại, security stall 600s x2 (tự cover); 10 findings accept hết; issue #343"
---

# Plan Doanh thu (issue 343): red-team bắt 3 Critical — công thức revenue, serialize createdAt, e2e selector sai app

## What happened

Chạy `ak:plan --github` cho feature đổi tên menu "Học phí" (/tuition) thành "Doanh thu" + thống kê doanh thu năm/quý/tháng có chart. Plan tại `plans/261007-1628-tuition-revenue-stats/`, issue #343, label "ready to review".

Quy trình: scout (Explore agent) → phỏng vấn user 3 quyết định (căn cứ kỳ phát hành hóa đơn; cột Đã thu + vệt nền Phát hành; **recharts** thay vì đề xuất CSS thuần) → soạn plan 3 phase qua `ak plan create/add-phase` → red-team 3 reviewer (code-reviewer agents) → adjudicate → validation log → issue.

Red-team bắt 3 Critical mà scout/plan đầu tiên sai:
1. **Công thức revenue sai ngữ nghĩa `tuitionTotals`** — invoice mark-paid (`status="paid"`, `paidAmount=0`) phải tính FULL amount (comment trong `tuition-from-kernel.ts:24-36` nói rõ), không phải `min(paidAmount, amount)` cho mọi invoice. Dùng sai thì KPI "Đã thu" và cột chart lệch nhau ngay trên cùng màn hình với flow "Đã nhận".
2. **Serialize `createdAt`** — cột drizzle `integer(..., { mode: "timestamp_ms" })` map sang JS `Date`, `c.json` ra ISO string; plan cũ chỉ định `Number(row.createdAt) || 0` → NaN → 0 → mọi invoice biến mất khỏi chart âm thầm. Fix: contract ISO string + `.toISOString()` tường minh (precedent snapshot.ts:441/454/542) + `Date.parse` phía web.
3. **Danh sách e2e vỡ sai** — scout claim 3 specs vỡ, thật ra chỉ 2: `tuition-bank-transfer.spec.ts:240,245` render bởi apps/student (spec goto STUDENT_ORIGIN tại :236), không phải web /tuition. Làm theo plan cũ sẽ vỡ spec đang pass.

Còn 1 High (seed e2e không backdate được createdAt qua API — schema strict; dùng direct-SQL `seedInvoice`) + 6 Medium (blast radius interface Invoice ~49 literal fixture ở 5 file; role="img" bọc toggle; bucket Asia/Ho_Chi_Minh theo tiền lệ `todayISOVietnam`; cap cửa sổ năm 5; surf dropped count; wording test). 10/10 findings accept, consistency sweep 0 mâu thuẫn.

## Decision

- Doanh thu xếp theo **kỳ phát hành hóa đơn** (không phải cash-basis ledger) — chọn của user; khớp mental model "học phí tháng 9".
- Chart: recharts 3 (user chọn, hỗ trợ chính thức React 19), tắt animation theo DESIGN.md; toggle kỳ Tháng/Quý/Năm qua search param `ky`, selection đen đặc `border-fg bg-fg text-bg` (DESIGN.md cấm accent nền chip).
- Không thêm endpoint — derive client-side từ kernel snapshot.

## Next steps

- `/ak:cook plans/261007-1628-tuition-revenue-stats/plan.md` để thực hiện (Phase 1: nền dữ liệu; Phase 2: UI; Phase 3: e2e + gate + screenshot 3 viewport).
- Deploy web + server cùng release train (snapshot cũ thiếu `createdAt` → bucket rỗng, đã có cơ chế đếm dropped).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
