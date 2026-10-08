---
title: "Ship #347 thống kê học phí theo lớp ở hồ sơ học viên"
date: 2026-10-08
summary: "PR #348 squash 670310e vào develop 2026-10-08. Tab Học phí của /students/$id thêm 3 thẻ Tổng/Đã đóng/Còn lại + bảng theo lớp: helper studentTuitionSummary (counted = active && fee≠null, remaining clamp, đóng dư Dư Xđ) và invoiceReceived tách single-source rule tiền đã thu (dedup tuitionTotals + revenueByPeriod + $invoiceId). Red-team 3 reviewer 10 findings (nặng nhất: picker hóa đơn mặc định activeEnrollments[0] phải selectOption tường minh, assert tiền scope theo thẻ/cell chống strict-mode, full-suite e2e gate, jsdom docblock cho component test) áp vào plan trước cook. Review sau cook bắt 1 Important (mock Link không pin params.classId) + 4 Minor, fix 3. e2e combo 1 học viên × 2 lớp lần đầu trong suite — 2 test mới pass, full suite 152 xanh."
---

# Ship #347 thống kê học phí theo lớp ở hồ sơ học viên

PR #348 squash 670310e vào develop 2026-10-08. Tab Học phí của `/students/$id`
thêm 3 thẻ Tổng/Đã đóng/Còn lại + bảng theo lớp: helper `studentTuitionSummary`
(counted = active && fee≠null, remaining clamp, đóng dư "Dư Xđ") và
`invoiceReceived` tách single-source rule tiền đã thu (dedup `tuitionTotals` +
`revenueByPeriod` + `$invoiceId`). Red-team 3 reviewer 10 findings (nặng nhất:
picker hóa đơn mặc định `activeEnrollments[0]` phải selectOption tường minh,
assert tiền scope theo thẻ/cell chống strict-mode, full-suite e2e gate, jsdom
docblock cho component test) áp vào plan trước cook. Review sau cook bắt 1
Important (mock Link không pin `params.classId`) + 4 Minor, fix 3. e2e combo
1 học viên × 2 lớp lần đầu trong suite — 2 test mới pass, full suite 152 xanh.

Lesson kỹ thuật: JSX inline `.map((row) => ({ cells: [<div/>...] }))` trong JSX
attr làm oxc parse fail khó hiểu ("expected `>` found `<`" at thẻ NGOÀI) — tách
hàm module-level trả cells (pattern `assignmentRowCells` trong `$studentId.tsx`)
parse sạch; cùng họ lỗi với việc thay `/>` self-closing bằng `</DataTable>`.
ak plan store: sau `reindex --apply`, id đổi thành `teacher-os/<slug>` có prefix
— close/update phải dùng id prefix, id trần báo "plan not found".

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
