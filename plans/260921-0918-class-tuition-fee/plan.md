---
title: "Học phí lớp theo học viên: thiết lập khi tạo lớp, sửa được sau khi tạo"
description: "Thêm học phí optional (VND/học viên/toàn khóa) vào flow tạo lớp, kèm endpoint + modal sửa học phí sau khi tạo."
status: pending
priority: P2
effort: 7h
issue: 227
branch: vinh19410/feat/class-tuition-fee
tags: [feature, database, backend, frontend]
blockedBy: []
blocks: []
created: 2026-09-21
---

# Học phí lớp theo học viên

## Overview

Khi tạo lớp, giáo viên/admin có thể nhập **học phí của lớp tính cho mỗi học viên** (không phải tổng cả lớp) — trường **optional**, để trống = chưa thiết lập. Sau khi tạo, học phí **sửa được** (tăng/giảm/xóa) từ trang chi tiết lớp. Hiện `class` chưa có cột học phí nào và server **không có endpoint sửa lớp** (`docs` + `contracts.ts:71` xác nhận), nên feature gồm: cột mới + migration, mở rộng `classCreateSchema`, endpoint subresource mới `POST /classes/:id/tuition-fee` (theo pattern `POST /classes/:id/notes`), field trong AddClassModal, và modal sửa học phí ở trang chi tiết lớp.

Quy ước tiền: số nguyên VND, `min(1)`, client chặn `/^\d{1,12}$/` — khớp `invoiceCreateSchema.amount` và pattern `add-invoice-modal.tsx`. `null` = chưa thiết lập.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Tạo lớp: field "Học phí / học viên (VND)" optional, validate như input tiền hiện có | P1 |
| 2 | Persist cột `class.tuition_fee` (nullable) + lan truyền qua contract → server → snapshot → web mapper | P1 |
| 3 | Sửa/xóa học phí sau khi tạo qua endpoint org-scoped + modal ở trang chi tiết lớp | P1 |
| 4 | Tests phủ 3 tầng (server, web unit, e2e); toàn bộ gate xanh | P1 |

## Phạm vi

**Trong scope:** cột + migration, `classCreateSchema.tuitionFee`, schema update fee mới, route POST tạo lớp, route subresource sửa fee, snapshot/mapper/types web, AddClassModal, hiển thị + modal sửa ở `$classId`, tests.

**Out of scope:** endpoint sửa lớp tổng quát (PATCH mọi field — chỉ fee được yêu cầu sửa), default `amount` hóa đơn từ học phí lớp, tính "còn thiếu" theo học phí (roster vẫn tính theo invoice như plan #216), hiện học phí ở card danh sách lớp, session fee/theo buổi.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Contract & DB migration](./phase-01-start.md) | Pending |
| 2 | [Server endpoints](./phase-02-server-endpoints.md) | Pending |
| 3 | [Web UI: tạo lớp + sửa học phí](./phase-03-web-ui.md) | Pending |
| 4 | [E2E & validation sweep](./phase-04-e2e-validation.md) | Pending |

## Success Criteria

- [ ] Tạo lớp có nhập học phí → snapshot trả `tuitionFee` đúng; bỏ trống → `null`
- [ ] Sửa học phí (set giá trị mới / xóa về `—`) từ trang chi tiết lớp, không cần F5 (bus refetch)
- [ ] Endpoint fee org-scoped: lớp của org khác → 404; `amount` ≤ 0 → 400
- [ ] `pnpm check`, `pnpm check-types`, `pnpm --filter web test`, `pnpm --filter server test`, `pnpm --filter e2e e2e specs/class-tuition-fee.spec.ts` — exit 0

## Dependencies

- Không phụ thuộc plan nào (rà `plans/`: plan #216 về roster đã completed, chỉ đọc invoice — không đụng file của plan này; các plan khác không đổi `class`/`contracts.ts`).
- Tuân thủ docs/code-standards.md: contract đổi → server + web đổi cùng nhau; "persist-vs-derive carve-out" → fee editable phải là cột thật trên row `class`.

## Validation Log

### Verification Results (2026-09-21, autonomous)

- Claims checked: 15 | Verified: 15 | Failed: 0 | Unverified: 0
- Tier: Standard (4 phases → Fact Checker + Contract Verifier)
- Đối chiếu grep/read trực tiếp: `POST /classes` = kernel.ts:781 ✓; `POST /classes/:id/notes` = :981 ✓; `loadSnapshot` = snapshot.ts:114 ✓; `add-class` case = repos/kernel.ts:65 ✓; `update-class-notes` = data-actions.ts:218 ✓; `AMOUNT_RE /^\d{1,12}$/` = add-invoice-modal.tsx:12 ✓; `ClassGroup` = mock-data.ts:145 ✓; `fmtVND` = :240 ✓; `mapClasses` = classes.ts:24 ✓; migrations mới nhất `0019` ✓; carve-out tồn tại tại docs/code-standards.md:26 ✓; e2e specs + helpers tồn tại ✓; commit drift 6a3507c tồn tại ✓; payload shape action notes `{classId, notes}` khớp payload design `{classId, tuitionFee}` ✓.
- Không có claim FAILED → plan đủ điều kiện implement.

### Whole-Plan Consistency Sweep (2026-09-21)

- Tên thống nhất toàn plan: cột `tuition_fee` (SQL) / `tuitionFee` (TS) / `classTuitionFeeUpdateSchema` / action `update-class-tuition-fee` / route `POST /classes/:id/tuition-fee` — không xung đột cách gọi.
- Effort tổng 7h = 1h + 2h + 3h + 1h (4 phase) ✓; links phase trong plan.md khớp file thật ✓; `ak plan validate` exit 0 ✓.
- Out-of-scope nêu rõ ở plan.md và lặp ở phase-04 Next Steps — không phase nào lách phạm vi.
- Kết luận: không còn mâu thuẫn chưa xử lý; recommend proceed to cook.
