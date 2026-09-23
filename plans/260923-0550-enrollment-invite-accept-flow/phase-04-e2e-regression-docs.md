---
phase: 4
title: "Phase 4: E2E, regression & docs"
status: pending
priority: P2
effort: "4h"
dependencies: [2, 3]
---

# Phase 4: E2E, regression & docs

## Context Links

- [plan.md](./plan.md) · [Phase 2](./phase-02-server-invited-and-accept.md) · [Phase 3](./phase-03-web-roster-status-ui.md)
- E2E: `apps/e2e/specs/` — 12 spec tham chiếu enroll (grep `enroll|Thêm học viên`): enroll-existing-student, class-roster-tuition-debt, class-operations, create-invoice, session-occurrence, projected-sessions, schedule-session-modal, student-package-validation, student-package-without-class, class-assign, student-row-detail, global-search
- Helpers: `apps/e2e/specs/helpers-dated-class.ts:19-42` (pattern gọi API kèm cookie+Origin), `specs/origins.ts`
- Runbook: `docs/production-release-runbook.md:199-200` (forward-only migrations)

## Overview

Cập nhật E2E cho vòng đời mới trên TỨC 12 spec liên quan (red-team #7), thêm helper chung `acceptEnrollment`, chạy regression đầy đủ, và cập nhật docs: PDR, CHANGELOG, runbook (rollback + cảnh báo vận hành) và ghi chú seam cho project portal.

## Key Insights

- Red-team #7: phase cũ chỉ liệt kê 3 spec — thực tế 12 spec phụ thuộc hành vi "enroll là có package/lessons". Tệ nhất là `create-invoice.spec.ts` sẽ VẪN XANH trên đúng bug "lập hóa đơn cho invited" nếu chỉ chạy cho xanh mà không đổi setup — phải sửa có chủ đích.
- **Quyết định projection semantics (red-team #7)**: trong khi mọi enrollment của lớp là invited, projection "Dự kiến" GIỮ NGUYÊN (không flip thành buổi thật) — flip xảy ra khi có enrollment active (sau accept/kích hoạt). Đây là hành vi chủ đích của D2; `projected-sessions.spec.ts` được viết lại để assert: enroll trong trang không còn flip ngay → projection vẫn hiện → sau accept (helper) → flip thành buổi thật.
- Accept qua e2e cần cookie session + Origin header — pattern đã có ở `helpers-dated-class.ts:19-42` + `specs/origins.ts`; đóng gói thành helper dùng chung, không mỗi spec tự chế.
- Regression gate cuối là `pnpm test` ở root (turbo + ci-workflow + topology-drift), không phải vitest riêng lẻ.

## Requirements

- [ ] Helper chung `acceptEnrollment(page/request, enrollmentId)` trong `apps/e2e/specs/helpers` (auth + Origin)
- [ ] 12/12 spec liên quan cập nhật và xanh; không spec nào còn phụ thuộc hành vi cũ "enroll là active"
- [ ] `projected-sessions.spec.ts` assert semantics mới: projection giữ đến khi accept
- [ ] `create-invoice.spec.ts` setup accept TRƯỚC khi lập hóa đơn (tránh bảo vệ bug đã bị chặn)
- [ ] `pnpm test` (root) + `pnpm e2e` + `pnpm check-types` + `pnpm check` xanh
- [ ] Docs: PDR (vòng đời enrollment), CHANGELOG (mục mới + cảnh báo vận hành), runbook (rollback note + SQL escape), ghi chú ràng buộc portal

## Architecture

Không có kiến trúc mới — phase verify + tài liệu. Luồng e2e mục tiêu:

```
[UI] + Thêm học viên (2 tab) → submit
  → badge "Đã mời", KPI không đổi, KHÔNG có buổi học thật (projection giữ "Dự kiến")
[UI/API] Kích hoạt (roster button) hoặc POST accept (helper)
  → badge "Đang học", KPI +1, package + buổi thật xuất hiện, projection flip
[UI] Hủy lời mời → row biến mất, picker học viên cho mời lại người đó được
[Flow] Hóa đơn chỉ lập được cho học viên đang học (picker ẩn invited, server 409)
```

## Related Code Files

- Create: helper `acceptEnrollment` (trong `apps/e2e/specs/helpers*.ts` hiện có hoặc file mới)
- Modify (12): `enroll-existing-student.spec.ts`, `class-roster-tuition-debt.spec.ts`, `class-operations.spec.ts`, `create-invoice.spec.ts`, `session-occurrence.spec.ts`, `projected-sessions.spec.ts`, `schedule-session-modal.spec.ts`, `student-package-validation.spec.ts`, `student-package-without-class.spec.ts`, `class-assign.spec.ts`, `student-row-detail.spec.ts`, `global-search.spec.ts`
- Modify: `docs/project-overview-pdr.md`, `CHANGELOG.md`, `docs/production-release-runbook.md`

## Implementation Steps

1. Grep lại `apps/e2e/specs` cho `enroll|Thêm học viên|studentIds` → đối chiếu danh sách 12 spec trên; nếu có spec mới nằm ngoài → đưa vào luôn.
2. Viết helper `acceptEnrollment` (dùng pattern API kèm cookie+Origin của helpers-dated-class.ts).
3. Với mỗi spec cần học viên "đang học" trong setup: enroll + `acceptEnrollment`; với spec test vòng đời (enroll-existing-student, projected-sessions, class-roster-tuition-debt, create-invoice): assert trạng thái invited TRƯỚC rồi accept/kích hoạt sau.
4. `projected-sessions.spec.ts`: viết lại theo semantics mới (xem Key Insights) — không "sửa cho xanh" bằng cách xóa assertion.
5. `create-invoice.spec.ts`: setup phải accept trước khi mở picker; thêm 1 case assert picker không còn hiện enrollment invited.
6. Case mới: hủy lời mời từ roster → row mất → mời lại cùng học viên thành công (không 409).
7. Regression: `pnpm test` (root), `pnpm e2e`, `pnpm check-types`, `pnpm check`.
8. Docs:
   - `docs/project-overview-pdr.md`: mục enrollment — vòng đời invited→active, package/lessons sinh khi accept, guards invoice/assignments.
   - `CHANGELOG.md`: entry mới theo format hiện có, kèm cảnh báo vận hành: "Enrollment mới ở trạng thái Đã mời — chưa có buổi học/học phí cho đến khi được kích hoạt (nút Kích hoạt trên roster hoặc student portal sau này)".
   - `docs/production-release-runbook.md`: rollback note — invited rows sống qua rollback worker vô hại về schema (column default) nhưng code cũ coi mọi enrollment là đang học; nếu cần hoàn tác invite về dữ liệu cũ, dùng SQL thủ công (liệt kê câu UPDATE mẫu); không có auto-migration ngược.
   - Ghi chú seam portal (nếu docs có mục kiến trúc; chi tiết ràng buộc đã trong plan.md): portal cần đường auth riêng (org-isolation blocker `app.ts:66-76`) + trusted origins + ownership check.

## Todo

- [ ] Grep liệt kê lại spec liên quan (đối chiếu 12)
- [ ] Helper `acceptEnrollment`
- [ ] 12 spec cập nhật theo vòng đời mới (đúng semantics, không xóa assertion)
- [ ] Case hủy lời mời + mời lại
- [ ] `pnpm test` + `pnpm e2e` + `check-types` + `check` xanh
- [ ] PDR + CHANGELOG + runbook cập nhật

## Success Criteria

- Toàn bộ gate lệnh ở bước 7 xanh trên máy local.
- Không còn test nào phụ thuộc hành vi cũ "enroll là active"; projected-sessions assert đúng semantics mới.
- Docs phản ánh vòng đời mới + cảnh báo vận hành + rollback note.

## Risk Assessment

- E2E flaky do phụ thuộc thời gian lịch học — giữ nguyên chiến lược hiện có của specs.
- Sót spec phụ thuộc hành vi cũ → bước 1 là bắt buộc, output là danh sách đối chiếu ghi vào PR.
- Cửa sổ vận hành giữa merge và portal ra mắt đã được đóng bằng nút Kích hoạt (D4) — docs vẫn phải cảnh báo rõ để trung tâm biết bấm Kích hoạt.

## Security Considerations

- Không đổi auth; e2e dùng đúng fixture session hiện có.
- Runbook không chứa secret; câu SQL mẫu chỉ là template.

## Next Steps

- Merge theo quy trình repo (PR vào main). Project student portal lấy contract accept API + "Portal integration constraints" (plan.md) làm đầu vào.
