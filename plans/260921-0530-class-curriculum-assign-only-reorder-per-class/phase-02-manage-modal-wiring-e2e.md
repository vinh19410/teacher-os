---
phase: 2
title: "Modal Quản lý buổi theo lớp + wiring + e2e"
status: todo
priority: P1
effort: "4h"
dependencies: ["phase-01-start.md"]
---

# Phase 2: Modal Quản lý buổi theo lớp + wiring + e2e

## Overview

Dời toàn bộ năng lực sắp xếp + chỉnh sửa buổi của bản sao lớp (cây module/buổi đã bỏ ở Phase 1) vào modal "Quản lý buổi" mở từ tab Buổi học của trang lớp. Đổi thứ tự buổi tại đây phản ánh ngay chủ đề các dòng bảng "Lịch học & Tiến độ buổi học" (buổi N ↔ bài N — `class-sessions.ts:470-495`).

## Context

- Nguồn tái sử dụng (dời từ Phase 1): khối cây + 4 modal trong `curriculum-management-section.tsx` cũ (git history trước Phase 1), `useSyllabusMutations` (`apps/web/src/components/syllabus/syllabus-mutations.tsx:74-190` — hook dùng chung với trang template, giữ nguyên)
- API không đổi: `reorder-modules` / `reorder-lessons` / `delete-module` / `delete-lesson` / `add-module` / `edit-module` / `add-lesson` / `edit-lesson` mapping tại `apps/web/src/lib/repos/kernel.ts:226-234` — mọi action vốn thao tác trên bản sao của lớp
- Caller: `apps/web/src/routes/_auth/classes/$classId.tsx` — tab `sessions` (276-307), header "Lịch học & Tiến độ buổi học" (289-291)
- E2E cần sửa: `apps/e2e/specs/syllabus-test-session-mark.spec.ts:163-185` (đang click "Mở rộng (" rồi "Sửa" trên cây cũ)

## Files to Create / Modify

- Create: `apps/web/src/components/class-detail/class-sessions-manage-modal.tsx` — modal Quản lý buổi
- Modify: `apps/web/src/routes/_auth/classes/$classId.tsx` — state + nút "Sắp xếp buổi" + render modal
- Modify: `apps/web/src/lib/class-detail-sessions-tab.contract.test.ts` — thêm pin modal
- Modify: `apps/e2e/specs/syllabus-test-session-mark.spec.ts` — thay flow "Mở rộng" bằng modal
- Create: `apps/e2e/specs/class-sessions-manage-modal.spec.ts` — e2e sắp xếp buổi theo lớp

## Implementation Steps

1. **Component `ClassSessionsManageModal`** — props `{ open, onClose, cls, syllabus, run, isPending, busy }`:
   - Chỉ render nội dung khi `syllabus?.classId === cls.id` (bản sao hợp lệ của lớp).
   - Dùng `useSyllabusMutations({ syllabus, isClassCopy: true, run, busy })` cho `moveModule`/`moveLesson`/delete (kèm confirm modal có sẵn trong hook).
   - Thân modal: header "Quản lý buổi của lớp" + dòng chú thích "Thứ tự buổi quyết định chủ đề hiển thị trên lịch lớp"; footer nút "+ Thêm module" (AddModuleModal); danh sách module — mỗi module: title + "Sửa" (EditModuleModal) + `SyllabusMutationButtons` (↑/↓/Xóa) + cuộn được; mỗi buổi: dot + title + `LessonStatusBadge` + "Sửa" (EditLessonModal `showStatus`) + `SyllabusMutationButtons` (↑/↓ trong module) + "+ Thêm buổi học" (AddLessonModal `showStatus`) cuối mỗi module.
   - **Không** hiển thị tổng-kết tiến độ (%, `x/y buổi` tổng); `LessonStatusBadge` từng buổi được giữ vì phục vụ đặt trạng thái.
   - Giữ 4 modal Add/Edit truyền `showStatus` (không `showKind`) — phủ tùy chọn bằng pin mới ở bước 4.
2. **Wiring `$classId.tsx`**: thêm state `manageOpen`; trong hàng header "Lịch học & Tiến độ buổi học" (289-291) thêm `<Button variant="secondary" size="sm">Sắp xếp buổi</Button>` — chỉ enable khi `sy?.classId === classId`; render `<ClassSessionsManageModal>` cạnh các modal hiện có. File phải giữ < 500 dòng (hiện 348 + ~20).
3. **Cập nhật contract test** `class-detail-sessions-tab.contract.test.ts`: thêm test "sessions tab wires class-scoped manage modal" — pin `$classId.tsx` chứa `Sắp xếp buổi` + `ClassSessionsManageModal`; pin modal file chứa `useSyllabusMutations`, `isClassCopy: true`, `SyllabusMutationButtons`; pin âm tính: modal file không chứa `showKind`.
4. **E2E `syllabus-test-session-mark.spec.ts`**: thay `getByRole("button", { name: /^Mở rộng \(/ })` (line 169) bằng mở "Sắp xếp buổi" → thao tác "Sửa" buổi 3 trong modal; các assertion còn lại giữ nguyên (không có select "Loại buổi học", badge kind ở `/syllabus/{copyId}` không reset).
5. **E2E mới `class-sessions-manage-modal.spec.ts`**: seed lớp + bản sao (theo pattern seed của `syllabus-test-session-mark.spec.ts`) → mở tab Buổi học → "Sắp xếp buổi" → ↑ một buổi sắp tới trong module → đóng modal → bảng lịch: 2 dòng liên tiếp đổi chủ đề cho nhau; đảo thứ tự 2 module → dòng lịch phản ánh khối bài của module mới. Thêm assertion: thẻ Giáo trình không hiển thị `%` hay "Mở rộng".
6. **Gate tổng**: `pnpm --filter web test` → `pnpm -w run check-types` → `pnpm -w run check` → e2e 3 spec: `syllabus-test-session-mark`, `class-sessions-manage-modal`, `projected-sessions` (đảm bảo bảng lịch không hồi quy).

## Todo

- [ ] Tạo `class-sessions-manage-modal.tsx` (reorder + CRUD + trạng thái buổi, không tổng-kết tiến độ)
- [ ] Wire nút "Sắp xếp buổi" + state trong `$classId.tsx` (< 500 dòng)
- [ ] Contract test thêm pin modal; `pnpm --filter web test` xanh
- [ ] Sửa e2e `syllabus-test-session-mark.spec.ts` qua flow modal
- [ ] Thêm e2e `class-sessions-manage-modal.spec.ts` (reorder phản ánh lịch lớp)
- [ ] Gate tổng: `pnpm --filter web test` + `pnpm -w run check-types` + `pnpm -w run check` + 3 spec e2e xanh

## Success Criteria

- Đổi thứ tự buổi & module, thêm/sửa/xóa buổi, đặt trạng thái — đều làm được trong tab Buổi học của trang lớp (modal), không phải rời trang
- Sau reorder + refetch snapshot: dòng lịch lớp hiển thị đúng chủ đề mới (buổi N ↔ bài N) — e2e assert được
- Thẻ Giáo trình vẫn thuần gán template (không % / "Mở rộng") — e2e assert được
- `pnpm --filter web test`, `pnpm -w run check-types`, `pnpm -w run check`, 3 spec e2e trên exit 0

## Risk Assessment

- **Modal dài 26+ buổi** → dùng `max-h` + overflow-y scroll (Modal hiện có hỗ trợ nội dung scroll); e2e locator theo tên buổi, không phụ thuộc vị trí.
- **Đổi thứ tự buổi đã học**: API không chặn, nhưng ngữ cảnh lớp chỉ nên reorder buổi chưa hoàn thành — V1 giữ hành vi như cây cũ (không thêm ràng buộc mới); ghi chú follow-up nếu cần khóa buổi done.
- **Hook dùng chung với trang template**: không sửa `useSyllabusMutations` — chỉ consume; nếu cần pin thêm thì viết test mới, không đổi hook.
- **Race refetch sau reorder**: `useDirectKernelAction` đã refresh snapshot sau commit (pattern hiện tại của cây cũ giữ nguyên) — không có state mới nào tự quản dữ liệu.

## Security Considerations

- Không endpoint/contract mới; mọi action qua kernel hiện có, đã scope `orgId` + `syllabusId` bản sao của lớp phía server.
- Modal chỉ thao tác trên `syllabus.classId === cls.id` — không lộ hành động lên template dùng chung (`classId IS NULL`).
