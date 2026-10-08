---
title: "Hồ sơ học viên: thống kê đúng tổng học phí / đã đóng / còn lại theo lớp"
description: "Tab Học phí trong hồ sơ học viên thêm phần tổng hợp Tổng học phí, Đã đóng, Còn lại tính từ học phí của mọi lớp đang học (cộng dồn khi học từ 2 lớp) trừ số tiền đã thu trên hóa đơn của từng lớp."
status: completed
priority: P2
effort: 5h
issue: 347
branch: feat/student-tuition-summary
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
(học phí mỗi học viên cho cả khóa, `packages/db/src/schema/class.ts:32`),
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
| Hóa đơn không gắn lớp hiện tại | `eid` rỗng (legacy, nguồn thật duy nhất — server chặn xóa enrollment active nên dangling enrollment không thể sinh ra từ writer hiện hành; bucket này là defensive parity với `rosterDebtByStudent`): không tính vào 3 con số; nếu có tiền đã thu thì hiện ghi chú "Ngoài ra đã thu Xđ từ hóa đơn không gắn lớp" |
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

- [x] Student Test 1 (Foundation 2, 10.000.000đ, đã thu 2.000.000đ) hiện Tổng 10.000.000đ / Đã đóng 2.000.000đ / Còn lại 8.000.000đ.
- [x] Học viên đang học 2 lớp có học phí: Tổng = tổng học phí 2 lớp; bảng theo lớp hiện đúng từng lớp.
- [x] Thu một phần qua chuyển khoản (ledger `paidAmount`) và mark-paid thủ công đều được tính đúng.
- [x] Lớp "Đã mời" và lớp chưa thiết lập học phí không cộng vào tổng, có nhãn giải thích.
- [x] Hóa đơn không gắn lớp không làm lệch 3 con số; ghi chú hiện khi có tiền đã thu.
- [x] Bảng hóa đơn bên dưới giữ nguyên hành vi (click dòng mở `/tuition/$invoiceId`).
- [x] `pnpm check`, `pnpm check-types`, `pnpm --filter web test`, `pnpm --filter e2e e2e` (full suite — gate local theo AGENTS.md) xanh.
- [x] Screenshot tab Học phí ở 1440×900, 768×1024, 375×812 đính kèm PR (theo `REVIEW.md`).

## Rủi ro

- Hóa đơn `eid: ""` legacy là nguồn unlinked thật duy nhất: server chặn xóa enrollment
  active (`kernel.ts:592` trả 409) và chặn tạo hóa đơn trên enrollment chưa active
  (`kernel.ts:1406-1408`), nên "hóa đơn trỏ enrollment đã xóa" là nhánh chết với writer
  hiện hành — bucket giữ nguyên như defensive parity với `rosterDebtByStudent`.
  Hóa đơn unlinked còn nợ (chưa thu) không vào "Còn lại" — đã chốt với user 2026-10-08;
  ghi chú chỉ phủ tiền đã thu. Follow-up tiềm năng: thêm `unlinkedOutstanding`.
- Đóng dư một lớp không bù sang lớp khác; đúng với mô hình học phí theo từng lớp.

## Link

- Issue: https://github.com/vinh19410/teacher-os/issues/347
- Liên quan: #227 (học phí lớp theo học viên), #322, #340, #345

## Red Team Review

### Session — 2026-10-08
**Findings:** 13 thô → 10 sau dedupe (8 accepted, 2 rejected/partial)
**Severity breakdown:** 0 Critical, 3 High, 7 Medium
**Reviewers:** Security Adversary (Fact Checker), Assumption Destroyer (Contract Verifier), Failure Mode Analyst (Fact Checker + Flow Tracer)

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | E2E: picker hóa đơn mặc định `activeEnrollments[0]`, không bảo đảm là lớp A — phải chọn option tường minh theo label "học viên · lớp" | High | Accept | Phase 3 |
| 2 | E2E: assert tiền dính Playwright strict-mode double-match ("2.000.000đ" ≥ 3 lần trên màn) — phải scope theo thẻ KPI/dòng bảng, cho phép tiền lệ `kpiCard()` | High | Accept | Phase 3 |
| 3 | Screenshot "Student Test 1" không tồn tại trong DB e2e (boot wipe `local.db`) — chụp trong context e2e ở 3 viewport, tự chứa | High | Accept | Phase 3 |
| 4 | Gate e2e thu hẹp từ full suite xuống 3 spec, lệch AGENTS.md — chạy full suite | Medium | Accept | Phase 3, plan.md Success Criteria |
| 5 | Test component cần `// @vitest-environment jsdom` (vitest web default node); template đúng là `verify-email-view.test.tsx` không phải `sign-in-form.test.tsx` | Medium | Accept | Phase 2 |
| 6 | CHANGELOG phải vào `### Added` (tính năng mới) không phải `### Fixed` | Medium | Accept | Phase 2 |
| 7 | Lớp active `fee=null` đã thu tiền: row hiện "0đ" mất số thật — hiển thị `paid` thật trên row (tổng vẫn không cộng, theo quy tắc đã chốt) | Medium | Accept | Phase 2 |
| 8 | Status enrollment lạ (≠ active/invited) fall-through render như dòng counted — quy tắc hiển thị như invited ("Chưa kích hoạt — chưa tính") + unit test `status: "pending"` | Medium | Accept | Phase 1, 2 |
| 9 | `invoiceReceived` chỉ thay 1/4 bản copy rule tài chính — dùng luôn cho `tuitionTotals` và `$invoiceId.tsx` (an toàn: test cũ + e2e invoice-detail là safety net) | Medium | Accept | Phase 1 |
| 10 | Citation lệch line (`class.ts:29`→32, template test sai) + premise "enrollment đã xóa" là nhánh chết — sửa doc | Medium | Accept | plan.md, Phase 2 |
| 11 | Hóa đơn unlinked còn nợ biến mất khỏi summary | Medium | Reject | — (đã chốt với user 2026-10-08: ghi chú chỉ phủ tiền đã thu; ghi follow-up) |
| 12 | E2E leg "thu một phần qua ledger" thiếu trong spec mới | Medium | Partial accept — full-suite gate đã chạy `tuition-bank-transfer.spec.ts` (cùng mapping `paidAmount` thật end-to-end) + unit test phủ helper; không thêm leg mới vào spec (đầy đủ nhưng nặng) | Phase 3 |

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01, phase-02, phase-03 sau khi apply findings.
- Decision deltas: invoiceReceived dùng ở cả tuitionTotals + $invoiceId.tsx; gate e2e full suite; screenshot từ context e2e; CHANGELOG `### Added`; hiển thị paid thật cho row fee-null; status lạ hiển thị như invited.
- Reconciled stale references: phase-01 bỏ ghi chú "giữ nguyên"; phase-03 verification đồng bộ Success Criteria plan.md; phase-02 citation đổi template.
- Unresolved contradictions: 0.
