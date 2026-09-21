---
title: "Tab Học viên (lớp chi tiết): hiển thị học viên còn nợ học phí theo lớp"
description: "Thêm cột \"Học phí\" vào bảng roster của trang chi tiết lớp — tiền chưa thu (đỏ) tính theo enrollment của lớp đó, giúp giáo viên/admin nhìn ngay ai còn nợ."
status: completed
priority: P2
effort: 4h
branch: vinh19410/issue-216-class-roster-tuition-debt
tags: [frontend, feature]
created: 2026-09-21
issue: 216
---

# Tab Học viên (lớp chi tiết): hiển thị học viên còn nợ học phí theo lớp

## Bối cảnh & mục tiêu

Ở trang chi tiết lớp, tab "Học viên" hiện chỉ có Mục tiêu / Còn lại buổi / Trạng thái học — giáo viên/admin không biết ai trong lớp chưa trả tiền. Yêu cầu: nhìn vào roster là thấy học viên nào đang còn nợ học phí.

Dữ liệu đã đủ trên client: snapshot kernel có `invoices` (đã có `enrollmentId` trên wire) và `enrollments`; chỉ thiếu map `enrollmentId` xuống kiểu `Invoice` client và một pure helper tính nợ. Mode: auto-detect → fast, HOLD SCOPE — không thêm endpoint, không đổi server/DB.

Quyết định người dùng (validation interview 2026-09-21):

1. **Phạm vi nợ: theo lớp** — chỉ đếm invoice chưa trả có `enrollmentId` thuộc enrollment của lớp đang xem; nợ của lớp khác không lẫn vào.
2. **Hiển thị: cột trong bảng** — cột "Học phí" mới; không thêm chip lọc, không thêm KPI.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Cột "Học phí" trong roster: tiền đỏ khi còn nợ, "Đã đủ" khi thu đủ, "—" khi chưa có hóa đơn | P1 |
| 2 | Nợ scoping đúng theo enrollment của lớp (invoice lớp khác / legacy `eid:""` không tính) | P1 |
| 3 | Flip "Đã đủ" tự động sau mark-paid (refetch snapshot), không cần F5 | P2 |
| 4 | Unit tests + e2e phủ vòng đời nợ; toàn bộ test/typecheck hiện có xanh | P1 |

## Phạm vi

**Trong scope:**
- `apps/web/src/lib/mock-data.ts` — `Invoice` thêm field `eid`
- `apps/web/src/lib/repos/invoices.ts` — map `enrollmentId` → `eid`
- `apps/web/src/lib/tuition-from-kernel.ts` — helper `rosterDebtByStudent` (+ interface `RosterDebt`, `RosterEnrollmentRef`)
- `apps/web/src/routes/_auth/classes/$classId.tsx` — cột "Học phí" tab roster
- Tests: `repos/invoices.test.ts`, `tuition-from-kernel.test.ts`, e2e `class-roster-tuition-debt.spec.ts`

**Out of scope (không đụng):**
- Server (`apps/server`), `packages/api`, `packages/db` — snapshot đã có đủ field
- Chip lọc "Còn nợ", KPI/StatCard mới (người dùng chọn chỉ cột)
- Trang /students, /tuition, student detail (đã có logic nợ riêng theo student)
- Role gating (repo chưa có guard theo role; mọi thành viên org đều xem được như hiện trạng của trang lớp)

## Quyết định thiết kế

1. **Tính nợ client-side từ snapshot** thay vì endpoint per-class: mọi collection đã nằm trong `GET /api/kernel` store; repo không có pattern GET per-resource cho việc này. Zero thay đổi server.
2. **Theo enrollmentId, không theo studentId**: ngữ cảnh lớp cần đúng tiền của lớp; `invoiceCreateSchema` luôn bắt enrollment hợp lệ nên eid đáng tin với dữ liệu tạo từ API hiện tại. Legacy `eid:""` bị loại khỏi view lớp nhưng vẫn hiện ở trang Học phí (tính theo student) — không mất dữ liệu.
3. **Convention nợ = status ≠ "paid"** (unpaid + overdue + coerce legacy), khớp `tuitionTotals` (`tuition-from-kernel.ts:13-26`) — hai view không bao giờ mâu thuẫn nhau về định nghĩa "chưa thu".
4. **Ba trạng thái cell** ("tiền đỏ" / "Đã đủ" / "—") để phân biệt "chưa thu" với "chưa từng lập hóa đơn" — tránh hiểu nhầm học viên mới enroll là đã đóng đủ.
5. **Helper là pure function structural-typed** (`Pick<Invoice, ...>` + interface ref enrollment) — test được không cần fixture snapshot full, giữ module tuition thuần như hiện trạng.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Đưa enrollmentId lên Invoice client + helper tính nợ theo lớp](./phase-01-start.md) | Pending |
| 2 | [Cột "Học phí" trong tab Học viên + e2e](./phase-02-roster-tuition-column-e2e.md) | Pending |

## Success Criteria

- [ ] Lớp có học viên nợ: roster hiện số tiền đỏ `fmtVND` đúng tổng invoice chưa trả của enrollment lớp đó
- [ ] Mark-paid xong: cell tự flip "Đã đủ" sau refetch; reload vẫn "Đã đủ"
- [ ] Học viên nợ ở lớp khác không hiện nợ ở lớp này
- [ ] `pnpm --filter web check-types`, `pnpm --filter web test`, `pnpm --filter e2e e2e specs/class-roster-tuition-debt.spec.ts` — exit 0

## Dependencies

- Không phụ thuộc plan nào (đã rà `plans/` — không plan nào đang đổi `Invoice`/roster tab).
- Plan liên quan (tham khảo, không block): `260918-1200-fix-170-kpi-debt-chips` (hành vi KPI Còn nợ).

## Validation Log

### Validation Session 1 — 2026-09-21

**Interview (2 câu hỏi, trả lời trước khi draft):**
1. Phạm vi nợ → **Theo lớp** (enrollmentId của lớp đang xem).
2. Kiểu hiển thị → **Cột trong bảng** (không chip lọc, không KPI mới).

### Verification Results

- Claims checked: 13
- Verified: 13 | Failed: 0 | Unverified: 0
- Tier: Light (2 phases — Fact Checker)

Bằng chứng tiêu biểu (đọc/grep trực tiếp, không suy đoán):

| Claim | Bằng chứng |
|---|---|
| Wire row có `enrollmentId` | `packages/api/src/contracts.ts:577` |
| Snapshot select `enrollmentId` | `apps/server/src/routes/snapshot.ts:43` |
| `mapInvoices` đang bỏ field | `apps/web/src/lib/repos/invoices.ts:17-29` (đọc full) |
| Create API luôn bắt enrollment | `contracts.ts:428` (min 1) + `kernel.ts:1425-1436` validate tồn tại |
| `data.enrollments` có sẵn store | `apps/web/src/lib/mock-data.ts:204-205` |
| Roster tab 4 cột, default tab | `apps/web/src/routes/_auth/classes/$classId.tsx:109,240-274` (đọc full) |
| `fmtVND` vi-VN | `mock-data.ts:222-224` |
| Màu danger precedent | `tuition.tsx:106` |
| E2e self-boot | `apps/e2e/playwright.config.ts:33-39` (`boot:api` + web) |
| Luồng tạo hóa đơn e2e | `apps/e2e/specs/create-invoice.spec.ts` (đọc full flow) |
| Lệnh kiểm chứng | `apps/web/package.json` (`test`, `check-types`), `apps/e2e/package.json` (`e2e`) |

`ak plan validate` → `[OK]` exit 0; `ak plan parse` → 2 phases, 19 tasks.

### Whole-Plan Consistency Sweep

- Định nghĩa nợ (status ≠ "paid") nhất quán: plan.md Quyết định 3 ↔ phase-1 helper ↔ phase-2 cell states.
- 3 trạng thái cell ("tiền đỏ"/"Đã đủ"/"—") nhất quán: Goals 1 ↔ phase-2 Requirements.
- Effort 1.5h + 2.5h = 4h khớp frontmatter; commands 3 lệnh khớp giữa plan.md Success Criteria ↔ phase-2.
- Link 2 phase file đúng tên file thực tế; `dependencies: [1]` khớp thứ tự.
- Không còn mâu thuẫn nào sau khi sửa typo "现状" → "hiện trạng" (Quyết định 5).
