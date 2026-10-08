---
title: "Hồ sơ học viên: thống kê đúng tổng học phí / đã đóng / còn lại theo lớp"
description: "Tab Học phí trong hồ sơ học viên thêm phần tổng hợp Tổng học phí, Đã đóng, Còn lại tính từ học phí của mọi lớp đang học (cộng dồn khi học từ 2 lớp) trừ số tiền đã thu trên hóa đơn của từng lớp."
status: pending
priority: P2
effort: 5h
issue: 347
branch: develop
tags: [feature, frontend]
blockedBy: []
blocks: []
created: 2026-10-08
---

# Thống kê học phí chính xác ở hồ sơ học viên

## Overview

Tab **Học phí** trong `/students/$studentId` hiện chỉ liệt kê hóa đơn
(`apps/web/src/routes/_auth/students/$studentId.tsx:282`). Không có chỗ nào
cho biết học viên phải đóng tổng bao nhiêu, đã đóng bao nhiêu, còn lại bao
nhiêu. Ví dụ thật trên dữ liệu local: **Student Test 1** học lớp
**[TEST] Foundation 2** (học phí 10.000.000đ / học viên), có một hóa đơn
2.000.000đ đã thu. Màn hình chỉ hiện dòng 2.000.000đ "Đã thu", trông như đã
đóng đủ. Kết quả đúng phải là: Tổng 10.000.000đ, Đã đóng 2.000.000đ, Còn lại
8.000.000đ.

Đã kiểm tra trong DB local: hóa đơn `…6235a7fd` có `enrollment_id` trỏ đúng
enrollment của lớp Foundation 2, nên dữ liệu đủ để tính theo lớp.

Plan chỉ đổi client. Không đổi server, DB hay contract API: `class.tuitionFee`
(học phí mỗi học viên cho cả khóa, `packages/db/src/schema/class.ts:29`),
`enrollment.status`, `invoice.enrollmentId`, `amount`, `paidAmount`, `status`
đều đã có trên kernel snapshot.

## Quy tắc tính (đã chốt với user 2026-10-08)

| Khái niệm | Quy tắc |
|---|---|
| Lớp được tính | Enrollment `status === "active"` **và** lớp có `tuitionFee !== null` |
| Lớp "Đã mời" (`invited`) | Không tính vào tổng; vẫn hiện trong bảng theo lớp với ghi chú "Chưa kích hoạt — chưa tính" |
| Lớp chưa thiết lập học phí | Không tính vào tổng; hiện "Chưa thiết lập" |
| Đã đóng của một lớp | Σ tiền đã thu trên hóa đơn có `eid` = enrollment của lớp đó. Tiền đã thu của một hóa đơn theo rule `tuitionTotals`: `status = "paid"` → đủ `amount` (mark-paid thủ công giữ `paidAmount` 0), còn lại → `min(paidAmount, amount)` |
| Còn lại của một lớp | `max(0, tuitionFee − đã đóng)`; đóng dư thì Còn lại = 0 và ô hiện "Dư Xđ" |
| Tổng học phí | Σ `tuitionFee` các lớp được tính (học 2 lớp thì cộng cả 2) |
| Đã đóng (tổng) | Σ đã đóng của các lớp được tính |
| Còn lại (tổng) | Σ còn lại của các lớp được tính |
| Hóa đơn không gắn lớp hiện tại | `eid` rỗng (legacy) hoặc trỏ enrollment đã xóa: không tính vào 3 con số; nếu có tiền đã thu thì hiện ghi chú "Ngoài ra đã thu Xđ từ hóa đơn không gắn lớp" |
| Không lớp nào được tính | 3 thẻ hiện "—", kèm dòng hướng dẫn thiết lập học phí ở trang lớp |

## Phases

| # | Phase | Status | Effort | Phụ thuộc |
|---|-------|--------|--------|-----------|
| 1 | [Helper `studentTuitionSummary` + unit test](./phase-01-student-tuition-summary-helper.md) | Pending | 1.5h | — |
| 2 | [UI tổng hợp học phí trong tab Học phí](./phase-02-student-tuition-summary-ui.md) | Pending | 2h | 1 |
| 3 | [E2E 2 lớp + gate local + screenshot](./phase-03-e2e-and-gates.md) | Pending | 1.5h | 2 |

## Non-goals

- Đổi cột "Học phí" ở tab Học viên của trang lớp (roster, #322/#340) — vẫn tính theo hóa đơn.
- Đổi KPI ở trang Doanh thu `/tuition`.
- Tự động lập hóa đơn theo học phí lớp, nhắc nợ, hoặc lưu "tổng học phí" xuống server.
- Thêm cột Lớp vào bảng hóa đơn hiện có.
- App học viên (`apps/student`).

## Success Criteria

- [ ] Student Test 1 (Foundation 2, 10.000.000đ, đã thu 2.000.000đ) hiện Tổng 10.000.000đ / Đã đóng 2.000.000đ / Còn lại 8.000.000đ.
- [ ] Học viên đang học 2 lớp có học phí: Tổng = tổng học phí 2 lớp; bảng theo lớp hiện đúng từng lớp.
- [ ] Thu một phần qua chuyển khoản (ledger `paidAmount`) và mark-paid thủ công đều được tính đúng.
- [ ] Lớp "Đã mời" và lớp chưa thiết lập học phí không cộng vào tổng, có nhãn giải thích.
- [ ] Hóa đơn không gắn lớp không làm lệch 3 con số; ghi chú hiện khi có tiền đã thu.
- [ ] Bảng hóa đơn bên dưới giữ nguyên hành vi (click dòng mở `/tuition/$invoiceId`).
- [ ] `pnpm check`, `pnpm check-types`, `pnpm --filter web test`, `pnpm --filter e2e e2e` (spec mới) xanh.
- [ ] Screenshot tab Học phí ở 1440×900, 768×1024, 375×812 đính kèm PR (theo `REVIEW.md`).

## Rủi ro

- Học viên rời lớp rồi enroll lại: hóa đơn cũ trỏ enrollment đã xóa sẽ rơi vào nhóm "không gắn lớp" (cùng edge đã chấp nhận ở `rosterDebtByStudent`). Ghi chú riêng giúp giáo viên vẫn thấy số tiền đó.
- Đóng dư một lớp không bù sang lớp khác; đúng với mô hình học phí theo từng lớp.

## Link

- Issue: https://github.com/vinh19410/teacher-os/issues/347
- Liên quan: #227 (học phí lớp theo học viên), #322, #340, #345
