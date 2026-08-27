---
phase: 3
title: "Syllabus editor UI — nút Xóa và mũi tên"
status: pending
priority: P1
effort: "4-6h"
dependencies: [2]
---

# Phase 3: Syllabus editor UI — nút Xóa và mũi tên

## Overview

Trang soạn thảo `/syllabus/$syllabusId` (`apps/web/src/routes/_auth/syllabus/$syllabusId.tsx`) thêm vào header mỗi module và hàng mỗi buổi học: nút Xóa (kèm confirm modal), nút mũi tên ↑/↓ đổi vị trí. UX dùng nút, KHÔNG drag-and-drop (quyết định D2).

## Requirements

- Functional: xóa module xác nhận kèm cảnh báo số buổi học bên trong sẽ mất; xóa lesson xác nhận đơn giản; mũi tên đổi thứ tự instant sau refetch snapshot; đầu/cuối danh sách disabled mũi tên tương ứng.
- Non-functional: **mọi** nút ↑↓/Xóa `disabled={busy || isPending(key) || edge}` (không chỉ `isPending`); style text-button giống nút "Sửa" (`$syllabusId.tsx:179/:214`); layout không vỡ ở breakpoint 920px và mobile 360px.
- Một `useDirectKernelAction` trên trang syllabus; không `dispatch` trực tiếp (click thứ hai sẽ nín lặng vì `run` `if (pendingKey) return` — `use-direct-kernel-action.ts:17`).

## Architecture

Client giữ thứ tự từ snapshot (server sort `(position, createdAt)` — FE không có field `position`, `contracts.ts` KernelSyllabusModuleRow không emit).

- Click ↑/↓ tại index i: hoán đổi item với i±1 trong mảng local, build mảng ids theo thứ tự mới, `run(key, reorder-*, ...)`.
- Nút Xóa mở confirm Modal (pattern `curriculum-management-section.tsx:251-287`) rồi `run` `delete-module`/`delete-lesson`.
- Toast qua `reportDirectOutcome`. 409 set-mismatch dùng toast Phase 2, không câu duplicate-guard.

Confirm xóa module:
- Template (`classId == null`): "Đây là giáo trình mẫu của tổ chức. Xóa module này sẽ xóa cả N buổi học trên template (lớp đã import không bị ảnh hưởng). Không thể hoàn tác."
- Class-copy: "Xóa module này sẽ xóa cả N buổi học bên trong, kèm tiến độ đã điểm danh. Hành động này không thể hoàn tác." (cùng mức cảnh báo "Gỡ giáo trình" `:256-260`)

## Related Code Files

- Modify: `apps/web/src/routes/_auth/syllabus/$syllabusId.tsx` — nút/hàng actions, state modal confirm
- Create (tuỳ): `apps/web/src/components/modals/confirm-delete-modal.tsx` — nếu extract confirm dùng chung cho Phase 4
- Reuse: `apps/web/src/lib/use-direct-kernel-action.ts`, `apps/web/src/lib/kernel-outcome.ts`

## Implementation Steps

1. Hàm helper thuần `moveItem<T>(list, index, dir): T[]` + tests unit (vitest web).
2. Header module: ↑ ↓ (disabled khi i=0 / i=last **hoặc** `busy`) và "Xóa".
3. Hàng lesson: 3 nút tương tự.
4. Confirm modal: một instance, state target; dispatch đúng action khi xác nhận; copy theo template vs class-copy.
5. `disabled={busy || isPending(key) || edge}`; chặn double-click qua `run()`.
6. Smoke thủ công desktop + 360px.

## Success Criteria

- [x] Đổi thứ tự module A↔B phản ánh đúng sau refetch
- [x] Đổi thứ tự lesson trong module đúng scope (module khác không bị ảnh hưởng)
- [x] Xóa module biến mất khỏi cây cùng lessons; tổng số buổi ở header cập nhật
- [x] Layout 360px không vỡ
- [x] Trong lúc 1 POST in-flight, mọi nút ↑↓/Xóa disabled (`busy`)

## Risk Assessment

- Click liên tiếp mũi tên → 2 POST khác payload xếp hàng. Mitigation: `busy` global gate, không chỉ per-key.
- Thứ tự hiển thị lệch server nếu FE cache mảng → LUÔN render từ snapshot, không state cục bộ cho order.
<!-- Updated: Validation Session 1 / Red Team Session 2 -->
