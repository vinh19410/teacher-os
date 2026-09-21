---
title: "Lớp chi tiết: thẻ Giáo trình chỉ gán template, sắp xếp & chỉnh buổi theo lớp"
description: "Bỏ hiển thị tiến trình + cây nội dung khỏi thẻ Giáo trình (chỉ còn gán/gỡ template); đưa đổi thứ tự buổi & chỉnh buổi về phạm vi lớp qua modal trong tab Buổi học."
status: pending
priority: P2
effort: 6h
branch: vinh19410/issue-221-class-curriculum-assign-only
tags: [frontend, refactor, feature]
created: 2026-09-21
issue: 221
---

# Lớp chi tiết: thẻ Giáo trình chỉ gán template, sắp xếp & chỉnh buổi theo lớp

## Bối cảnh & mục tiêu

Tab "Buổi học" của trang chi tiết lớp đang có thẻ Giáo trình (khung đỏ trong ảnh) hiển thị: vòng % tiến độ + `x/y buổi` + progress bar, nút "Mở rộng (X chương · Y/Z bài)" mở cả cây module/buổi kèm nút đổi thứ tự (↑/↓), thêm/sửa/xóa. Người dùng yêu cầu:

1. **Bỏ phần hiển thị tiến trình** ở thẻ — tiến trình đã thuộc về phạm vi lớp (StatCard "buổi đã học"/"tiến độ" ở header trang + bảng "Lịch học & Tiến độ buổi học").
2. **Thẻ Giáo trình chỉ còn gán/load template cho lớp** (nhập từ template khi trống, gỡ giáo trình).
3. **Đổi thứ tự buổi thực hiện theo lớp** — trong tab Buổi học của trang lớp, thay vì phải mở rộng thẻ để sửa.

Mode: auto-detect → **fast** (scope rõ, domain quen, không research ngoài). Scope Challenge: **HOLD SCOPE** — existing: action `import-syllabus`/`remove-curriculum`, hook `useSyllabusMutations` (reorder ↑/↓), bảng lịch map buổi N ↔ bài N (`sessionLessonInfo`), các modal Add/Edit Module/Lesson; requested scope như trên; complexity ~6 file, 0 service mới, 2 phase.

**Quyết định thiết kế (mặc định — interview chưa phản hồi, ghi rõ để đổi được):**

1. Nơi đổi thứ tự buổi: **modal "Quản lý buổi" mở từ tab Buổi học của trang lớp** (nút "Sắp xếp buổi" cạnh SectionLabel "Lịch học & Tiến độ buổi học").
2. Chỉnh sửa nội dung bản sao (thêm/sửa/xóa buổi & module, trạng thái buổi): **giữ nguyên năng lực, gộp vào modal đó** — không mất gì so với hiện tại, mọi thao tác trong phạm vi lớp.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Thẻ Giáo trình chỉ còn: tên template + meta, "Gỡ giáo trình" (có confirm), empty state "Nhập từ template", trạng thái con trỏ lệch legacy | P1 |
| 2 | Không còn % / `x/y buổi` / Progress bar / "Mở rộng"-"Thu gọn" / cây module-buổi trong thẻ | P1 |
| 3 | Modal "Quản lý buổi" theo lớp: ↑/↓ buổi trong module, ↑/↓ module, thêm/sửa/xóa buổi & module, trạng thái buổi | P1 |
| 4 | Đổi thứ tự buổi xong → chủ đề các dòng bảng lịch lớp cập nhật đúng (buổi N ↔ bài N) | P1 |
| 5 | Toàn bộ vitest + typecheck + biome + e2e liên quan xanh | P1 |

## Phạm vi

**Trong scope:**
- `apps/web/src/components/class-detail/curriculum-management-section.tsx` — thu gọn thẻ
- `apps/web/src/components/class-detail/class-sessions-manage-modal.tsx` — component mới
- `apps/web/src/routes/_auth/classes/$classId.tsx` — bỏ props collapse, thêm nút + state mở modal
- Tests: `apps/web/src/lib/class-detail-sessions-tab.contract.test.ts`, rà `apps/web/src/lib/kernel-runtime.contract.test.ts`
- E2E: cập nhật `apps/e2e/specs/syllabus-test-session-mark.spec.ts`, thêm spec reorder theo lớp

**Out of scope (không đụng):**
- Server (`apps/server`), `packages/api`, `packages/db` — dùng nguyên API `reorder-modules`/`reorder-lessons`/`import-syllabus`/`remove-curriculum`/CRUD module-lesson hiện có
- StatCard header trang lớp ("buổi đã học", "tiến độ", "bài trong syllabus") — giữ nguyên
- Bảng `ClassScheduleTable` (trừ việc chủ đề tự đổi theo thứ tự mới) và trang `/syllabus/$syllabusId`
- "Đổi template" một-nút (server trả 409 khi lớp đã có giáo trình — `kernel.ts:853-857`; luồng đổi là Gõ [Gỡ giáo trình] → thẻ thành empty state → [Nhập từ template]). Compound action này là follow-up nếu cần

## Quyết định thiết kế

1. **Thẻ = assignment card thuần**: giữ 3 nhánh render hiện có (có bản sao / chưa có / con trỏ lệch), chỉ lược phần hiển thị + cây. Nút "Gỡ giáo trình" giữ `disabled={busy}` nguyên văn để không phá pin `kernel-runtime.contract.test.ts:332`.
2. **Modal "Quản lý buổi" = nơi cây cũ dọn đến**: chuyển nguyên khối cây module/buổi + 4 modal (Add/Edit Module, Add/Edit Lesson `showStatus`) + `useSyllabusMutations({isClassCopy: true})` vào component mới — reuse tối đa, không đụng hook dùng chung với trang template.
3. **Không tổng-kết tiến độ trong modal**: bỏ %/x-y-tổng (nguyên nhân user phàn nàn); giữ `LessonStatusBadge` từng buổi vì phục vụ chỉnh trạng thái buổi.
4. **Reorder dùng API per-module hiện có** (`POST /api/syllabi/:id/modules/reorder`, `.../modules/:mid/lessons/reorder`) — bản sao của lớp nên mọi thay đổi đã scope theo lớp ở tầng dữ liệu.
5. **Modal chỉ mở khi lớp có bản sao hợp lệ** (`sy && sy.classId === cls.id`); không có giáo trình thì nút "Sắp xếp buổi" ẩn/disabled.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Thẻ Giáo trình thu gọn thành gán template](./phase-01-start.md) | Pending |
| 2 | [Modal Quản lý buổi theo lớp + wiring + e2e](./phase-02-manage-modal-wiring-e2e.md) | Pending |

## Success Criteria

- [ ] Thẻ Giáo trình không còn %/`x/y buổi`/Progress/"Mở rộng"; chỉ gán/gỡ template
- [ ] Đổi thứ tự buổi + CRUD buổi thực hiện được ngay trong tab Buổi học của trang lớp
- [ ] Sau reorder, dòng lịch lớp hiển thị đúng chủ đề buổi mới (buổi N ↔ bài N)
- [ ] `pnpm --filter web test`, `pnpm -w run check-types`, `pnpm -w run check`, e2e 2 spec liên quan pass

## Validation Log

### Verification Results (2026-09-21, tier Light)
- Claims checked: 8 — Verified: 8 | Failed: 0 | Unverified: 0
- Đã đối chiếu trực tiếp: progress tính ở frontend (`curriculum-management-section.tsx:77-134`); mapping buổi N ↔ bài N (`class-sessions.ts:470-495`); hook reorder dùng chung (`syllabus-mutations.tsx:88-115`); import 409 khi đã có giáo trình (`kernel.ts:853-857`); e2e phụ thuộc "Mở rộng (" duy nhất `syllabus-test-session-mark.spec.ts:169`; pin `disabled={busy}` (`kernel-runtime.contract.test.ts:329-333`), pin `showKind` âm tính (`:592-595`); `$classId.tsx` 348 dòng (<500, dư địa ~130 dòng); contract tab pin "Mở rộng/Thu gọn" (`class-detail-sessions-tab.contract.test.ts:51-57`).

<!-- slug: class-curriculum-assign-only-reorder-per-class -->
