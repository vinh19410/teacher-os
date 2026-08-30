---
title: "M2: Wire AddInvoiceModal thật — bỏ no-op — issue #61"
description: "Nối AddInvoiceModal vào POST /api/invoices qua command bus (action add-invoice); hydrate enrollments vào kernel slice cho picker; validation inline amount/due/enrollment; bỏ fake fields Loại/Phương thức; test TDD (unit + contract + e2e)."
status: completed
priority: P1
effort: "0.5d"
tags: [m2, invoice, web, modal, tanstack-query]
created: 2026-08-29
---

# M2: Wire AddInvoiceModal thật — bỏ no-op — issue #61

## Overview

Modal **AddInvoiceModal** (`apps/web/src/components/modals/add-invoice-modal.tsx`) hiện là no-op: submit chỉ `onClose()`, không persist. API tạo invoice **`POST /api/invoices`** (issue #60, đã merge) nhận `{ enrollmentId, amount, due, note }` (zod `.strict()`). Plan này nối modal vào API qua đúng pipeline kernel write của web (`KernelAction` → `kernelCommand()` → command bus → refetch `['kernel']`), thêm validation inline hiển thị lỗi rõ ràng, và đảm bảo invoice mới xuất hiện trong bảng Học phí.

## Scope boundary (issue #61)

- **Trong scope:** hydrate `enrollments` vào kernel slice; action `add-invoice` + mapping `kernelCommand()`; rewrite modal (picker enrollment, amount, due, note); bỏ fake fields Loại/Phương thức (không thuộc contract tạo mới — server default `method:"—"`, `type:""`, `date:""`); validation client-side (amount nguyên dương, due là ngày thật, enrollment bắt buộc) + lỗi field inline; cập nhật contract test; e2e evidence.
- **Ngoài scope:** totals/statcards tuition (#62), E2E money loop #63 (mark-paid loop), hiển thị `due`/`note` mới trên bảng (cột Ngày/Loại của invoice mới sẽ rỗng cho đến khi mark-paid — chấp nhận, không phải bug), server-side changes (API đã xong ở #60), chống double-click thêm mới (bus đã share pending + `saving` guard sẵn có).

## Quyết định thiết kế (đã chốt từ scout + code)

| Quyết định | Lựa chọn | Lý do |
|---|---|---|
| Nguồn `enrollmentId` | Hydrate `enrollments` vào `KernelSlice` (`Pick<MockData,...> & { enrollments: KernelEnrollmentRow[] }`), modal join tên qua `data.students`/`data.classes` đã có | MockData không có enrollments; đọc raw snapshot từ query cache (`getQueryData`) phá pattern "mọi modal lấy data qua `useData()`" và có thể undefined. Mapper thuần `repos/enrollments.ts` đúng convention "repos own mapping". `KernelSlice` vẫn assignable sang `MockData` (Pick đủ 9 field) nên 26 file dùng `useData()` không vỡ |
| Picker | 1 Select duy nhất "Học viên — Lớp", mỗi option = 1 enrollment (`studentName · className`) | API bắt buộc enrollmentId; 1 student có thể có nhiều enrollment (nhiều lớp) nên picker theo student là mơ hồ. `KernelEnrollmentRow` = `{id, classId, studentId, createdAt}` |
| Fake fields Loại/Phương thức | Xóa khỏi modal | Contract tạo mới `.strict()` không nhận `type`/`method`/`date`; giữ lại = fake chrome (repo có precedent "remove fake chrome"). Server default `method:"—"`, `type:""`, `date:""` |
| Validation chỗ nào | Client chặn trước (field errors tiếng Việt): amount nguyên dương + cap `^\d{1,12}$` (chống SQLite integer overflow → 500 → outcome-unknown sai sự thật), due là ngày thật (helper mới), note ≤ 500 ký tự. Server 404 "enrollment not found" (enrollment lạ/đã xóa — không validate trước được client-side) và 400 "invalid body" (due roundtrip) chỉ rơi vào form-level error chung của hook — hành vi chấp nhận | `amount: z.number().int().min(1)`, `due` regex + roundtrip, `note: z.string().trim().max(500)` — các case phổ biến chặn được client-side; 404/400 của server là biên còn lại, không map field được |
| Action name | `{ type: "add-invoice"; payload: { enrollmentId, amount, due, note? } }` → `POST /api/invoices` | Mirror `add-student`/`enroll-student`; `note` optional vì contract `.default("")` |
| Due input | `<Input type="date">` prefill hôm nay; validate bằng **helper mới `isRealDateInputValue`** export từ `date-input.ts` (roundtrip check của `parseDateInput` — chống 2026-02-30). CẤM dùng `isFutureDateInputValue` cho due (future-only, sẽ chặn luôn due = hôm nay) | `date-input.ts` hiện chỉ export 3 hàm (formatDateInputValue/getTomorrowDateInputValue/isFutureDateInputValue); `parseDateInput` private. Due hôm nay/quá khứ là hợp lệ nghiệp vụ (overdue) — khác với start-date của add-class |
| New row hiển thị | Không đổi bảng/mapping invoice | Invoice mới có status `unpaid` → Badge "Chưa thu" + nút "Đã nhận" hoạt động; row xuất hiện đủ để QC. `due`/`note` chưa hiển thị trên UI (web `Invoice` type + `mapInvoices` không map) — chấp nhận: server #60 đã test roundtrip due, hiển thị due là follow-up riêng |

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Modal tạo invoice thật qua command bus; invoice mới hiện trong bảng sau khi snapshot refresh | P1 |
| 2 | Validation inline rõ ràng: amount trống/≤0/thập phân, due trống/không hợp lệ, thiếu enrollment | P1 |
| 3 | Bỏ no-op + fake chrome; contract test phản ánh đúng modal là kernel write modal | P1 |

## Phases

| Phase | Name | Status |
|-------|------|--------|
| [Phase 1](./phase-01-data-layer.md) | Data layer: hydrate enrollments + action add-invoice | Pending |
| [Phase 2](./phase-02-modal-wiring.md) | Wire AddInvoiceModal + validation + contract tests | Pending |
| [Phase 3](./phase-03-e2e-evidence.md) | E2E evidence + full gates | Pending |

## Success Criteria

- [ ] Chọn enrollment, nhập amount hợp lệ, chọn due → POST `/api/invoices` 201; bảng Học phí hiện row mới (status "Chưa thu", đúng số tiền) ngay sau khi bus refresh; reload trang vẫn còn.
- [ ] Amount trống / `-5000` / thập phân / vượt cap 12 chữ số → field error đỏ dưới input, KHÔNG gọi API.
- [ ] Due trống hoặc ngày không tồn tại (`2026-02-30`) → field error; due = hôm nay HỢP LỆ; enrollment chưa chọn → không submit được.
- [ ] Note > 500 ký tự → field error dưới Textarea.
- [ ] Modal lifecycle đúng chuẩn write modal: mở lại (reopen) = state sạch (reset-on-open `useEffect` — field values, field errors, notice/submitBlocked); đang `saving` không đóng được modal qua Escape/overlay/X; nút submit `disabled={saving || submitBlocked}`; reconcile thành công (committed/unknown) → resetFields + onClose (không cho resubmit tạo trùng).
- [ ] Modal không còn fields Loại/Phương thức; submit path dùng `useKernelFormSubmit` + `KernelSubmitNotice` (committed/unknown/reconcile).
- [ ] Contract test `kernel-runtime.contract.test.ts`: test "close-only" của AddInvoiceModal được thay bằng assert modal dispatch `add-invoice`; modal nằm trong `KERNEL_WRITE_MODALS`; `emptyKernelData` keys gồm `enrollments`.
- [ ] Unit test mapping `kernelCommand("add-invoice")` → `/api/invoices` + body đúng; `mapKernelSnapshot` map enrollments.
- [ ] E2E spec tạo invoice: happy path (row hiện, reload còn) + validation (empty/negative amount → lỗi, không có row).
- [ ] `pnpm check` (biome), `pnpm check-types`, `pnpm test` xanh toàn workspace.

## Risk Assessment

- **Contract test cấm viết đang tồn tại** — `kernel-runtime.contract.test.ts` ~366-374 assert modal KHÔNG dispatch. Signal: test này đỏ ngay khi wire. Response pre-decided: sửa test cùng commit (đó chính là acceptance criterion, không phải regression).
- **`emptyKernelData` keys test** — thêm `enrollments` làm đỏ test keys ở ~485-497. Response: cập nhật expected list trong cùng PR.
- **Shared asserts của `KERNEL_WRITE_MODALS` đòi pattern cứng** — `async function submit`, `const result = await run(`, `onClose={saving ? () => undefined : onClose}`, `disabled={saving || submitBlocked` (kernel-runtime.contract.test.ts:105-115, :131-134). Modal phải được viết theo đúng các pattern này từ đầu (xem Phase 2), không "viết xong rồi sửa".
- **Server errors không map field được** — enrollment lạ/đã xóa → **404 "enrollment not found"** (kernel.ts:1188-1198); due fail roundtrip → 400. Cả hai rơi vào form-level error chung của hook — hành vi chấp nhận, không xử lý thêm.
- **`due`/`note` chưa hiển thị trên web UI** — `mapInvoices` (repos/invoices.ts:17-27) và `Invoice` type (mock-data.ts:49-57) không có 2 field này; khoảng trống chấp nhận có chủ đích (server #60 đã test roundtrip due; hiển thị là follow-up).
- **Giả định setup e2e** — server `POST /students` với `classId` ĐÃ tạo enrollment cùng batch (kernel.ts:411-417), nên add-student-with-class là đường ngắn hợp lệ; chọn flow enroll-existing-student (#122) trong e2e vì khớp spec pattern có sẵn, không phải vì add-student thiếu enrollment.

## Red Team Review

3 hostile reviewers (Security Adversary, Assumption Destroyer, Failure Mode Analyst) — 15 findings sau dedupe, tất cả đều có evidence file:line. Adjudication tự động (chế độ --ship tự trị):

| # | Finding (deduped) | Severity | Disposition |
|---|---|---|---|
| 1 | Thiếu reset-on-open — notice/submitBlocked/field errors sống sót qua reopen, submit bị khóa vĩnh viễn sau outcome-unknown | High | **Accept** — thêm `useEffect` reset-on-open vào Phase 2 + contract test assert + success criterion |
| 2 | Helper "ngày thật" không tồn tại ở dạng export; `isFutureDateInputValue` sẽ chặn chính due = hôm nay (prefill) | High | **Accept** — Phase 2 export `isRealDateInputValue` từ `date-input.ts`; cấm `isFutureDateInputValue` cho due |
| 3 | "Đóng modal (onClose) giữ nguyên" vi phạm assert chung `onClose={saving ? () => undefined : onClose}` → duplicate invoice khi đóng giữa POST (non-idempotent) | High | **Accept** — Phase 2 liệt kê tường minh 4 shared asserts (async submit, await run, saving-gate onClose, disabled submit) |
| 4 | `onReconcile={reconcile}` bare — reconcile thành công không đóng modal → resubmit tạo trùng | High | **Accept** — Phase 2 chỉ định `reconcileAndFinish` (pattern add-student-modal:138-143) |
| 5 | E2E assert `400,000đ` sai — `fmtVND` render `400.000đ` (vi-VN) | Medium | **Accept** — sửa Phase 3 thành `400.000đ` |
| 6 | Validation thiếu note ≤500 và cap upper-bound amount (SQLite integer overflow → 500 → outcome-unknown sai sự thật) | Medium | **Accept** — thêm cả 2 rule vào Phase 2; chốt note contract ở Phase 1 (`note` luôn mang trong body) |
| 7 | Plan ghi sai server errors: enrollment lạ → 404, không phải 400 | Medium | **Accept** — sửa plan.md + phase risk |
| 8 | Risk "add-student không tạo enrollment" sai sự thật — server tạo enrollment cùng batch (kernel.ts:411-417) | Medium | **Accept** — sửa risk; giữ flow #122 vì khớp pattern spec có sẵn |
| 9 | `due` không được verify qua bất kỳ tầng test UI nào (mapInvoices không map) | Medium | **Partial accept** — ghi nhận là khoảng trống có chủ đích trong Risk Assessment (server #60 test roundtrip; hiển thị due là follow-up), không mở rộng scope |
| 10 | E2E: assert "không row mới" không assertable thuần UI; 3 case nên độc lập; setup helpers.ts không có class/enroll helper | Medium | **Accept** — Phase 3: 3 test độc lập, scope assert trong card "Hóa đơn", đếm POST qua `page.on("request")`, ghi nhận setup inline |

Files modified by red-team: `plan.md`, `phase-01-data-layer.md`, `phase-02-modal-wiring.md`, `phase-03-e2e-evidence.md`.

### Whole-Plan Consistency Sweep

Đã re-read toàn bộ 4 plan files sau khi áp findings. Kiểm tra: các mệnh đề "server 400 chung chung" cũ đã được thay hết bằng phân loại 404/400 đúng; helper `isRealDateInputValue` xuất hiện nhất quán ở plan.md (Due input, AC) + phase-02; `note` contract chốt một hiện trạng (`note: payload.note ?? ""`, luôn mang body) ở cả phase-01 step 1 lẫn step 6; định dạng tiền chỉ còn `400.000đ`; lifecycle asserts (reset-on-open, saving-gate, reconcile-finish) nhất quán giữa plan.md AC và phase-02 step 1-2. Không còn mâu thuẫn chưa giải quyết.
