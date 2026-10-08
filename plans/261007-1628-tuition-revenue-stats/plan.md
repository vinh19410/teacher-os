---
title: "Menu Học phí → Doanh thu: thống kê doanh thu theo năm/quý/tháng có chart"
description: "Đổi tên menu/trang /tuition thành 'Doanh thu' và thêm biểu đồ doanh thu (đã thu + vệt nền phát hành) theo tháng/quý/năm, xếp theo kỳ phát hành hóa đơn, vẽ bằng recharts."
status: completed
priority: P2
effort: "7.5h"
issue: 343
branch: develop
tags: [feature, frontend, backend, api]
blockedBy: []
blocks: []
created: 2026-10-07
---

# Menu Học phí → Doanh thu: thống kê doanh thu theo năm/quý/tháng có chart

## Overview

Menu "Học phí" (`/tuition`) đổi tên thành **"Doanh thu"** (sidebar, topbar, PageHead) và nhận thêm
một section biểu đồ cột doanh thu: giáo viên chọn kỳ xem **Tháng (12 kỳ gần nhất) / Quý (8 kỳ gần
nhất) / Năm (tối đa 5 năm gần nhất)** — kỳ chọn sống trong URL search param. Mỗi cột gồm
**"Đã thu"** (accent) + **vệt nền "Phát hành"** (tổng hóa đơn cùng kỳ). Doanh thu xếp theo
**kỳ phát hành hóa đơn** (`invoice.createdAt`, ISO string từ snapshot) theo múi giờ
**Asia/Ho_Chi_Minh**; tiền đã thu mỗi hóa đơn đi theo đúng rule của `tuitionTotals`:
`status = "paid"` → tính **full `amount`** (mark-paid thủ công giữ `paidAmount` = 0), còn lại →
`min(paidAmount, amount)`. Chart vẽ bằng **recharts 3** (hỗ trợ chính thức React 19).

## Quyết định đã chốt với user (2026-10-07)

1. **Căn cứ doanh thu:** theo kỳ phát hành hóa đơn — không dùng ngày giao dịch ngân hàng
   (cash-basis cần endpoint mới + xử lý tiền mặt riêng → không chọn).
2. **Biểu đồ:** cột Đã thu + vệt nền Phát hành (bullet-style, 2 màu token có sẵn).
3. **Thư viện:** recharts (user chọn, thay cho đề xuất CSS thuần) — tắt animation mặc định để
   đúng DESIGN.md ("không entrance choreography").

## Scope Challenge (Step 0 — HOLD SCOPE)

- **Existing:** trang `/tuition` + kernel snapshot (`GET /api/kernel`) đã chứa invoices đầy đủ
  `amount/paidAmount/status/due`; KPI thuần client-side tại `apps/web/src/lib/tuition-from-kernel.ts`;
  pattern `validateSearch` non-throw tại `apps/web/src/routes/_auth/schedule.tsx:32-33`.
- **Requested:** đổi tên + thống kê doanh thu năm/quý/tháng + chart — deliver đủ, không cắt.
- **Complexity:** ~17 files (2 rename-only, 8 data/lib gồm interface `Invoice` + 5 file fixture test,
  1 component mới, 2 e2e specs sửa + 1 spec mới, 1 package.json), 3 phases.
- **Mode:** HOLD SCOPE — không fork giảm/mở rộng (không `--yagni`).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Menu/topbar/heading `/tuition` hiện "Doanh thu"; các chỗ "Học phí" khác nghĩa (class fee, tab học viên) giữ nguyên | P1 |
| 2 | Biểu đồ doanh thu theo tháng/quý/năm, toggle qua URL search param, cột Đã thu + vệt nền Phát hành | P1 |
| 3 | Không thêm API endpoint mới — derive client-side từ kernel snapshot; snapshot bổ sung `createdAt` cho invoice | P2 |

## Non-goals

- Cash-basis theo ledger `payment_transaction` (đề xuất follow-up riêng nếu cần).
- Đổi tab "Học phí" trong hồ sơ học viên, label "Học phí" nghĩa class fee (modal, roster, schema).
- Filter theo lớp/học sinh trên biểu đồ.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Nền dữ liệu doanh thu (contract + snapshot + bucketing)](./phase-01-start.md) | Done |
| 2 | [UI Doanh thu: recharts + section biểu đồ + đổi tên](./phase-02-ui-doanh-thu.md) | Done |
| 3 | [E2E + gate local + screenshot 3 viewport](./phase-03-e2e-va-gate.md) | Done |

## Success Criteria

- [x] Sidebar/topbar/PageHead của `/tuition` hiện "Doanh thu"; `grep -r '"Học phí"' apps/web/src` chỉ còn các chỗ nghĩa class fee / tab học viên / fixture.
- [x] `/tuition?ky=quarter` và `/tuition?ky=year` đổi tập cột tương ứng; default `?ky=month` (12 kỳ).
- [x] Cột Đã thu theo đúng rule `tuitionTotals` từng hóa đơn (paid → full `amount`, còn lại →
      `min(paidAmount, amount)`) xếp theo `createdAt` múi giờ Asia/Ho_Chi_Minh; vệt nền = Σ `amount`.
- [x] `pnpm check`, `pnpm check-types`, `pnpm --filter web test`, `pnpm --filter server test` xanh.
- [x] e2e: 2 specs vỡ selector đã sửa (`create-invoice`, `student-package-validation`) + spec mới
      `tuition-revenue-chart.spec.ts` pass qua gate. Selector "Học phí" trong
      `tuition-bank-transfer.spec.ts:240,245` thuộc app student — KHÔNG đổi.
      `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e`.
- [x] Screenshot 3 viewport (1440×900, 768×1024, 375×812) lưu `screenshots/`, keyboard focus OK theo REVIEW.md.

## Dependencies

- Không chặn plan nào; không bị chặn. Độc lập với các plan #331/#336/#340 đã ship.

## Red Team Review

### Session — 2026-10-08
**Reviewers:** Failure Mode Analyst (Fact Checker), Assumption Destroyer (Contract Verifier), Security Adversary — stall 600s ×2 (quirk đã biết), lens tự cover bởi adjudicator: không có endpoint/auth mới, snapshot org-scoped qua `kernelCtx`, recharts là dep công khai được lockfile pin, label/tooltip render qua React (escape sẵn) — không phát hiện vector mới.
**Findings:** 10 sau dedupe (8 accepted, 2 duplicate merged) — 3 Critical, 1 High, 6 Medium.

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Công thức "Đã thu" sai với `tuitionTotals`: invoice mark-paid (`status="paid"`, `paidAmount=0`) phải tính **full `amount`** — `min(paidAmount, amount)` cho ra 0đ trên flow "Đã nhận" phổ biến nhất | Critical | Accept | plan.md Overview, Phase 1 |
| 2 | Serialize `createdAt`: cột drizzle `timestamp_ms` → JS `Date` → `c.json` ra ISO string; `Number(iso)` = NaN → 0 → mọi invoice biến mất khỏi chart. Wire convention repo là ISO string tường minh | Critical | Accept | Phase 1 steps 1-3 |
| 3 | Danh sách e2e vỡ sai: `tuition-bank-transfer.spec.ts:240,245` render bởi apps/student (spec goto STUDENT_ORIGIN tại :236) — chỉ 2 specs web vỡ | Critical | Accept | plan.md, Phase 3 |
| 4 | Seed e2e qua `POST /invoices` không đặt được `createdAt` (schema `.strict()`, DB default = now) → dùng pattern `seedInvoice` direct-SQL, backdate `created_at` | High | Accept | Phase 3 |
| 5 | Blast radius type: `Invoice` (mock-data.ts) cần field `createdAt` required → 5 file fixture test (~49 literal) phải cập nhật | Medium | Accept | Phase 1 |
| 6 | `role="img"` bọc container chứa toggle button focusable = vi phạm ARIA → `role="img"` chỉ trên khối chart; toggle `role="group"` + `aria-pressed` theo DESIGN.md:29-31 | Medium | Accept | Phase 2 |
| 7 | Bucket "local time" trái tiền lệ UTC-drift của repo (`todayISOVietnam`, week-grid.ts:27-34) → bucket theo Asia/Ho_Chi_Minh | Medium | Accept | Phase 1, plan.md |
| 8 | Cửa sổ "Năm" không cap → 1 row cũ kéo nở hàng chục cột ở 375px → cap 5 năm gần nhất | Medium | Accept | Phase 1, plan.md |
| 9 | Drop invoice thiếu `createdAt` một cách im lặng với chỉ số tài chính → đếm dropped, surf qua aria-label + console.warn khi >0 | Medium | Accept | Phase 1, Phase 2 |
| 10 | Wording test "unpaid chỉ vào phát hành" mâu thuẫn clamp partial → viết lại: unpaid có partial → collected = `min(paidAmount, amount)` | Medium | Accept | Phase 1 |

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-start.md, phase-02-ui-doanh-thu.md, phase-03-e2e-va-gate.md (sau khi áp findings).
- Decision deltas checked: 6 (công thức revenue; serialize ISO; 2-vs-3 e2e specs; seed direct-SQL; VN timezone; cap 5 năm; toggle selection đen đặc; role="img" scope).
- Reconciled stale references: 8 (đã sửa đồng bộ "3 specs"→"2 specs", "local time"→Asia/Ho_Chi_Minh, công thức min()→rule tuitionTotals, Number()→Date.parse(ISO), cửa sổ năm, toggle accent→đen đặc, role="img", seed API→direct-SQL).
- Unresolved contradictions: 0.

## Validation Log

### Verification Results
- **Tier:** Standard (3 phases → Fact Checker + Contract Verifier, 10 claims/phase).
- **Claims checked:** 30 (10/phase từ 2 reviewer fact-check ledger).
- **Verified:** 25 | **Failed:** 4 | **Unverified:** 1.
- **Failures** (đã xử lý qua findings accept ở trên):
  1. [Fact Checker] "min(paidAmount, amount) là pattern của tuitionTotals" — sai ngữ nghĩa nhánh paid (`tuition-from-kernel.ts:24-36`) → Finding 1.
  2. [Fact Checker] seed 2 invoice khác tháng qua API kernel — `invoiceCreateSchema` strict không nhận `createdAt` (`contracts.ts:1133-1141`) → Finding 4.
  3. [Fact Checker] `tuition-bank-transfer.spec.ts:240,245` vỡ vì rename web — thực tế thuộc apps/student (`:236` goto STUDENT_ORIGIN) → Finding 3.
  4. [Contract Verifier] `createdAt` serialize — drizzle `timestamp_ms` trả JS `Date`, wire ra ISO string → Finding 2.
- **Unverified:** hỗ trợ React 19 của recharts 3 theo registry — đã xác minh độc lập qua web search trước red-team (recharts 3 peer range chính thức gồm React 16–19).
- **Phỏng vấn user (2026-10-07):** 3 quyết định đã chốt — căn cứ kỳ phát hành hóa đơn; cột Đã thu + vệt nền Phát hành; dùng recharts. Ghi nhận trong section "Quyết định đã chốt".
- **Recommendation:** proceed — toàn bộ failed claims đã được sửa vào plan, không còn mâu thuẫn.
