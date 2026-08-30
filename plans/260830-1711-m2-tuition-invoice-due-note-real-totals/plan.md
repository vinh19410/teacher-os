---
title: "M2: Invoice due/note trên web + Totals tuition từ invoice thật"
description: "Issues #135 + #62 — map due/note từ kernel vào web Invoice, hiển thị ngày đến hạn trên bảng Hóa đơn, thay KPI hardcode của /tuition bằng số tính từ invoice/gói thật."
status: completed
priority: P1
effort: "4h"
tags: [m2, tuition, invoice, web]
created: 2026-08-30
issues: [135, 62]
---

# M2: Invoice due/note trên web + Totals tuition từ invoice thật

## Overview

Kernel đã trả `due` (ISO yyyy-mm-dd) và `note` trên `KernelInvoiceRow` (từ API #60) và modal tạo hóa đơn (#61, PR #136) đã gửi đủ 2 field này — nhưng web `Invoice` type và `mapInvoices` chưa map, nên invoice mới tạo hiện cột Ngày/Loại thiếu thông tin đến hạn. Đồng thời trang `/tuition` đang hardcode toàn bộ KPI ("Doanh thu tháng 8 · 21.000.000đ", "21.0tr", "1.9tr", "2 gói sắp hết") — số không đổi kể cả khi account rỗng (QC re-test #62). Plan này map `due`/`note` vào lớp web, hiển thị ngày đến hạn trên bảng Hóa đơn, và tính KPI đã thu/còn nợ/gói sắp hết từ dữ liệu kernel thật.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Web `Invoice` + `mapInvoices` mang `due`/`note`, có unit test mapping (issue #135) | P1 |
| 2 | Bảng Hóa đơn hiển thị ngày đến hạn (dd/mm) cho unpaid/overdue + tooltip note (issue #135) | P1 |
| 3 | KPI /tuition (đã thu, còn nợ, gói sắp hết, lead) tính từ invoice/gói thật, = 0 khi rỗng (issue #62) | P1 |

## Phases

| Phase | Name | Status |
|-------|------|--------|
| [Phase 1: Invoice due/note mapping + types](./phase-01-start.md) | Invoice due/note mapping + types | Pending |
| [Phase 2: Tuition real totals + due column + note tooltip](./phase-02-tuition-real-totals-and-due-ui.md) | Tuition real totals + due column + note tooltip | Pending |

## Acceptance Criteria (từ issues)

- [ ] Invoice tạo từ modal #61 hiển thị đúng ngày đến hạn đã nhập, còn đúng sau reload (#135)
- [ ] Unit test mapping `mapInvoices` có case `due`/`note` (#135)
- [ ] Bảng Hóa đơn hiển thị ngày đến hạn dạng dd/mm cho unpaid/overdue (#135)
- [ ] Totals tuition (đã thu/chưa thu) tính từ invoice thật (#62)
- [ ] Số KPI khớp sau mark-paid (khi snapshot đã refetch) và sau reload (#62)
- [ ] Account không có invoice → KPI = 0 (QC re-test #62)

## Scope Boundary

- Không đổi API/server/DB — kernel wire contract đã đủ (`due`, `note` trên `KernelInvoiceRow`).
- Không đổi AddInvoiceModal (#61 đã merge, gửi đủ due/note).
- Không đổi component `Tag` — tooltip note bọc bằng `<span title>` phía route.
- Không đổi Dashboard/student detail — họ dùng chung `mapInvoices` nên tự hưởng thêm field, không bắt buộc render thêm.
- Không đụng tab "Gói học đang hoạt động" ngoài label ngưỡng KPI (đã đọc từ `data.students` thật).
- Mở rộng `create-invoice.spec.ts` hiện có: scope lại 2 assertion `getByText("400.000đ")` cũ vào bảng (tránh strict-mode trùng KPI mới) + thêm assert due/reload/KPI mark-paid.

## Non-negotiable Constraints

- `due` trên wire là ISO yyyy-mm-dd; format dd/mm là concern của web (docblock contract #60). Không đổi format wire.
- `formatDue` cấm parse qua `new Date()` — slice chuỗi ISO (repo từng dính UTC-drift, `week-grid.ts` có guard docblock).
- Zero mock/fake number còn lại trong `/tuition` — mọi số trên page phải derive từ store data, kể cả label "T8".
- Theo biome/turbo/vitest conventions của repo; `check-types` (không phải `build`) là gate typecheck; test chạy xanh trước khi ship.

## Risk Assessment

| Risk | Signal | Response |
|------|--------|----------|
| Invoice seed/legacy trong DB có `due` rỗng | formatDue nhận "" | Regex guard `^\d{4}-\d{2}-\d{2}$` + tái dùng `formatDayMonth` (week-grid), trả "—" (đã có test case) |
| StatCard compact format lệch với kỳ vọng số lớn | test format thất bại / số hiển thị lạ | Helper riêng + test bảng giá trị biên (0, <1tr, hàng chục tr) |
| Thêm field required vào `Invoice` vỡ type nơi khác | `check-types` fail | Red-team đã quét lại: fixture `apps/web/test/fixtures/mock-data.ts` có 3 literal (đưa vào Phase 1), reducer chỉ spread — gate `check-types` toàn workspace sau phase 1 |
| KPI "Gói sắp hết" mâu thuẫn badge cùng trang | QC đối chiếu KPI vs bảng | Đặt ngưỡng KPI = ≤4 (tổng thể dòng có badge "Sắp hết"), test pin boundary 4/5 |
| KPI stale trên nhánh `committed` (POST ok, refetch fail) | toast "đã lưu nhưng chưa tải lại" | Hành vi có chủ đích — toast đã báo; AC diễn giải "khi snapshot đã reload" |
| e2e strict-mode chết vì trùng text "400.000đ" (KPI mới vs cell bảng) | `getByText` strict violation | Scope assertion cũ vào `invoiceTable(page)`; một format KPI duy nhất (full `fmtVND`) |

## Red Team Review

### Session — 2026-08-30
**Reviewers:** Security Adversary (Fact Checker) + Assumption Destroyer (Scope Auditor), spawn song song qua delegate agent
**Findings:** 8 unique sau dedupe (8 accepted, 0 rejected)
**Severity breakdown:** 0 Critical, 2 High, 6 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Fixture `test/fixtures/mock-data.ts` có 3 Invoice literal — claim "không literal" sai, vỡ type dây chuyền + test `toEqual` hiện có fail khi GREEN | High | Accept | Phase 1 (files + steps 1/3) |
| 2 | Gate typecheck sai lệnh: `build --filter=web` là vite build không typecheck | Medium | Accept | Phase 1 (step 4, success criteria) |
| 3 | Ngưỡng KPI "Gói sắp hết" ≤2 mâu thuẫn badge "Sắp hết" ≤4 cùng nhãn trong bảng | High | Accept | Phase 2 (requirements, test boundary) |
| 4 | Cơ chế refresh gán sai cho `useDirectKernelAction` — thật ra là command bus refetch; nhánh `committed` KPI stale | Medium | Accept | Phase 2 (architecture, success criteria) |
| 5 | Label "Đã thu T8 (VND)" hardcode tháng sống sót trong khi totals là all-time | Medium | Accept | Phase 2 (requirements, step 3) |
| 6 | `formatDue` spec mời gọi `new Date()` → UTC-drift; tái dùng `formatDayMonth` + regex guard | Medium | Accept | Phase 2 (constraints, step 1/2) |
| 7 | Component `Tag` không nhận `title` — tooltip phải bọc `<span title>` | Medium | Accept | Phase 2 (requirements, step 3) |
| 8 | AC "đúng sau reload" không có test — bỏ sót e2e `create-invoice.spec.ts` hiện có cho đúng bảng này | Medium | Accept | Phase 2 (files, step 4, scope boundary) |

### Whole-Plan Consistency Sweep

- Decision deltas: (a) mọi nhắc "typecheck" đổi thành `check-types`; (b) ngưỡng gói sắp hết thống nhất ≤4 ở requirements + test + risk; (c) `formatDue` = `formatDayMonth` + regex, cấm `new Date` ở constraints lẫn phase; (d) tooltip qua `<span>` — scope boundary ghi rõ không sửa `Tag`; (e) e2e vào files + steps + scope boundary; (f) claim "không literal" trong risk đã thay bằng kết luận red-team.
- Đã rà `plan.md` + cả 2 phase file: không còn term cũ ("build --filter=web", "≤2 khớp badge", "Tag title", "không literal") sót lại; không có draft/contract trùng lặp mâu thuẫn.
- Kết luận: 0 unresolved contradictions — plan sẵn sàng cho `/ak:cook`.

### Advisory round — kongming GO (2026-08-30)

**Verdict:** GO. 8 findings đối chiếu lại với code — đều đứng vững (kèm file:line). Bổ sung 4 item, đã áp:

| # | Bổ sung | Applied To |
|---|---------|------------|
| 9 | (High) e2e strict-mode: `getByText("400.000đ")` cũ sẽ trùng KPI mới — scope vào `invoiceTable(page)` | Phase 2 (files, step 4), scope boundary, risk |
| 10 | (Med) Một format KPI duy nhất: full `fmtVND`, bỏ helper compact — QC đối chiếu số tuyệt đối, tránh "21.0tr" vs "21.000.000đ" lệch nhau | Phase 2 (requirements, steps 1/3) |
| 11 | (Med) e2e cover AC #62: create → KPI tăng → mark-paid → KPI đổi → reload vẫn đúng | Phase 2 (step 4, success criteria) |
| 12 | (Med) e2e fill due tường minh (không dùng default "hôm nay" — race nửa đêm/TZ runner UTC) | Phase 2 (step 4) |

Ghi nhận: lead đã nằm trong scope từ đầu (step 3); không scope-creep sang Dashboard/student-detail; không forced-refetch nhánh `committed`. Sweep lại sau khi áp: `fmtVndCompact` đã removed khỏi mọi file plan; ngưỡng ≤4 và format `fmtVND` thống nhất. 0 unresolved contradictions.
