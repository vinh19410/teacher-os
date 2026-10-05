---
title: "Tab Học viên (chi tiết lớp) hiển thị trạng thái học phí"
description: "Cột Học phí ở tab Học viên đổi sang badge trạng thái (Đã thu / Chưa thu / Quá hạn / Chưa lập phiếu) kèm số tiền còn nợ; Quá hạn suy ra từ ngày đến hạn bằng helper dùng chung cho cả trang Học phí và hồ sơ học viên."
status: pending
priority: P2
effort: 4h
issue: 322
branch: feat/class-roster-tuition-status
tags: [feature, frontend]
blockedBy: []
blocks: []
created: 2026-10-05
---

# Tab Học viên hiển thị trạng thái học phí

## Overview

Trang chi tiết lớp (`/classes/$classId`), tab **Học viên**, đã có cột "Học phí"
từ #216 nhưng chỉ hiện số tiền đỏ / "Đã đủ" / "—", không cho biết học viên
đang **chưa thu**, **quá hạn** hay **chưa được lập phiếu**. Plan này đổi ô đó
thành badge trạng thái (cùng nhãn và màu với trang Học phí) kèm số tiền còn nợ.

Phát hiện khi scout: server chỉ ghi `status = "unpaid" | "paid"` cho hóa đơn,
không có chỗ nào chuyển sang `"overdue"` (`grep` toàn bộ `apps/server/src`,
`packages/api/src`). Vì vậy nhãn "Quá hạn" ở `/tuition` và hồ sơ học viên chưa
từng hiện với dữ liệu thật. Plan thêm một pure helper suy ra trạng thái hiển
thị từ `due` và dùng chung cho 3 màn hình để không lệch nhãn.

Không đổi server, DB hay contract API — dữ liệu (`invoice.status`, `due`,
`enrollmentId`) đã có trên kernel snapshot.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Tab Học viên: badge trạng thái học phí theo lớp + số tiền còn nợ | P1 |
| 2 | "Quá hạn" = hóa đơn chưa thu có hạn trước hôm nay (giờ VN), suy ra ở client | P1 |
| 3 | Học viên đang học chưa có hóa đơn nào của lớp → badge "Chưa lập phiếu" | P2 |
| 4 | `/tuition` và hồ sơ học viên dùng cùng helper + nhãn, không lệch với roster | P2 |

## Phases

| # | Phase | Status | Effort |
|---|-------|--------|--------|
| 1 | [Helper trạng thái hóa đơn + nhãn dùng chung](./phase-01-invoice-status-helper.md) | Pending | 1.5h |
| 2 | [UI tab Học viên, Học phí, hồ sơ học viên + e2e](./phase-02-roster-tuition-status-ui.md) | Pending | 2.5h |

Phase 2 phụ thuộc phase 1.

## Thiết kế trạng thái

| Trạng thái roster | Điều kiện (chỉ hóa đơn có `enrollmentId` thuộc lớp này) | Hiển thị |
|---|---|---|
| Học viên được mời | enrollment `invited` | `—` (giữ nguyên) |
| Chưa lập phiếu | đang học, 0 hóa đơn | `Badge muted` "Chưa lập phiếu" |
| Quá hạn | ≥1 hóa đơn chưa thu có `due < hôm nay` (hoặc status lưu sẵn `overdue`) | `Badge danger dot` "Quá hạn" + số tiền nợ đỏ đậm |
| Chưa thu | còn hóa đơn chưa thu, không cái nào quá hạn | `Badge warn dot` "Chưa thu" + số tiền nợ |
| Đã thu | có hóa đơn, tất cả đã thu | `Badge success dot` "Đã thu" |

Số tiền nợ = tổng `amount` của mọi hóa đơn chưa thu của lớp (giữ nguyên quy
tắc #216). "Đã đủ" đổi thành "Đã thu" để thống nhất từ vựng với `/tuition`.

## Non-goals

- Server tự chuyển `unpaid → overdue` (cron/job) — đã chọn suy ra ở client.
- "Thu một phần" (paid_amount) — thuộc plan SePay Bank Hub (#320).
- Chip lọc theo trạng thái học phí, KPI học phí mới trên trang lớp.
- Cột hạn đóng / tooltip chi tiết hóa đơn trong roster.

## Success Criteria

- [ ] Roster: học viên đang học chưa có hóa đơn hiện "Chưa lập phiếu"; được mời vẫn "—".
- [ ] Hóa đơn hạn tương lai → "Chưa thu" + "400.000đ"; hạn hôm qua → "Quá hạn" + số tiền đỏ.
- [ ] Thu hết → "Đã thu", còn nguyên sau reload.
- [ ] `/tuition` và tab Học phí của hồ sơ học viên hiện "Quá hạn" cho cùng hóa đơn quá hạn.
- [ ] Hạn đúng hôm nay vẫn là "Chưa thu"; hạn rỗng/legacy là "Chưa thu".
- [ ] `pnpm check`, `pnpm check-types`, `pnpm --filter web test`, `pnpm --filter e2e e2e` (2 spec học phí) xanh.
- [ ] Screenshot roster ở 1440×900, 768×1024, 375×812 đính kèm PR (theo `REVIEW.md`).

## Risks

| Risk | Mitigation |
|---|---|
| E2E dùng hạn cố định `2026-12-25` sẽ tự thành "Quá hạn" sau ngày đó | Đổi sang ngày tương đối (hôm nay + 30 ngày) ở cả 2 spec |
| Tab mở qua nửa đêm không tự chuyển sang "Quá hạn" | Chấp nhận: `todayISOVietnam()` tính lại khi data đổi/reload; ghi chú trong code |
| Lệch múi giờ khi so ngày | So chuỗi ISO với `todayISOVietnam()`, không parse `Date` (tiền lệ bug UTC drift ở `week-grid`) |

## Validation Log

### Session 1 — 2026-10-05 (trước khi viết phase)

| Câu hỏi | Quyết định |
|---|---|
| Ô Học phí hiển thị gì? | Badge trạng thái + số tiền còn nợ |
| "Quá hạn" xác định thế nào? | Suy ra ở client: chưa thu và `due < hôm nay (VN)` |
| Đang học nhưng chưa có hóa đơn? | Badge "Chưa lập phiếu" |
| Áp dụng cho `/tuition`? | Có, dùng chung helper (mở rộng thêm hồ sơ học viên vì nó có bản sao nhãn thứ ba — cùng lý do chống lệch) |

### Verification Results

- Claims checked: 15
- Verified: 14 | Failed: 1 (đã sửa) | Unverified: 0
- Failure đã sửa: `pnpm --filter web test -- <file>` bỏ qua bộ lọc (chạy cả 113 file) → đổi sang `pnpm --filter web exec vitest run <pattern>` (đã chạy thử, lọc đúng).
- Tier: Light (2 phase)
- Đã kiểm: `rosterDebtByStudent` (`apps/web/src/lib/tuition-from-kernel.ts:53`), cột Học phí (`class-roster-tab.tsx:96-125`), gọi helper ở `$classId.tsx:134-137`, `INV_LABEL` ở `tuition.tsx:27-31` + badge `:207-219`, `INV_STATUS_LABEL`/`INV_VARIANT` ở `students/$studentId.tsx:63-72` + `:296`, `todayISOVietnam` (`week-grid.ts:29`), Badge variants `accent|success|warn|danger|muted` (`badge.tsx:4`), không có writer `"overdue"` phía server, `AddInvoiceModal` chấp nhận hạn quá khứ (`add-invoice-modal.tsx:84`), hạn cố định trong `create-invoice.spec.ts:130` và `class-roster-tuition-debt.spec.ts`.

## Red Team Review

Tự rà inline 4 lens (Assumption, Failure mode, Scope, Security):

| # | Sev | Finding | Disposition |
|---|---|---|---|
| 1 | Medium | E2E hạn cố định thành time bomb khi helper suy ra Quá hạn | Accept — ngày tương đối ở phase 2 |
| 2 | Low | Status legacy lạ (coerced) không phải paid | Accept — coi là chưa thu, cùng convention `tuitionTotals` |
| 3 | Low | Security: chỉ đọc dữ liệu org đã có trên snapshot, không endpoint mới | Không cần thay đổi |

### Whole-Plan Consistency Sweep

- Nhãn "Đã thu" (không còn "Đã đủ") thống nhất ở plan, phase 1, phase 2 và e2e.
- Chữ ký `rosterDebtByStudent(classId, enrollments, invoices, todayISO)` khớp giữa phase 1 và phase 2.
- Không còn mâu thuẫn chưa giải quyết.

<!-- slug: class-roster-tuition-status -->
