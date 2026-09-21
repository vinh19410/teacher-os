---
title: "Plan issue #221: thẻ Giáo trình chỉ gán template + sắp xếp buổi theo lớp"
date: 2026-09-21
summary: "ak-plan fast mode: bỏ tiến trình khỏi thẻ Giáo trình, dời reorder + CRUD buổi vào modal phạm vi lớp — 2 phase, không đổi server"
---

# Plan issue #221: thẻ Giáo trình chỉ gán template + sắp xếp buổi theo lớp

## What happened
Người dùng gửi ảnh tab Buổi học (khung đỏ quanh thẻ Giáo trình) + yêu cầu: bỏ hiển thị tiến trình ở thẻ, giáo trình chỉ để gán/load template cho lớp, đổi thứ tự buổi thực hiện theo lớp. Chạy `/ak:plan --github` (auto-detect → fast, HOLD SCOPE).

Scout phát hiện: progress %/x-y buổi là tính thuần frontend trong `curriculum-management-section.tsx:77-134`; bảng lịch map buổi N ↔ bài N qua `sessionLessonInfo` (`class-sessions.ts:470-495`) nên reorder bản sao syllabus chính là đổi chủ đề lịch lớp; hook `useSyllabusMutations` + API reorder/CRUD module-lesson đã có, vốn thao tác trên bản sao scope theo lớp → zero thay đổi server.

Fact-check then chốt: `POST /classes/:id/import-syllabus` trả 409 "Lớp đã có giáo trình" khi lớp đã có bản sao (`kernel.ts:853-857`) → không thiết kế nút "Đổi template" một bước; luồng đổi = Gỡ → Nhập. E2e duy nhất phụ thuộc "Mở rộng (" là `syllabus-test-session-mark.spec.ts:169`. Contract test pin `disabled={busy}` (`kernel-runtime.contract.test.ts:332`) và "Mở rộng/Thu gọn" (`class-detail-sessions-tab.contract.test.ts:51-57`) phải viết lại/giữ đúng.

## Decision
- Thẻ Giáo trình = assignment card thuần (3 nhánh render giữ nguyên: có bản sao / trống "Nhập từ template" / con trỏ lệch legacy).
- Reorder + CRUD buổi dời sang modal "Quản lý buổi" mở từ tab Buổi học (nút "Sắp xếp buổi"), reuse `useSyllabusMutations({isClassCopy: true})`; không tổng-kết tiến độ trong modal, giữ LessonStatusBadge từng buổi.
- 2 quyết định UX là mặc định recommended (AskUserQuestion không được trả lời): modal trong tab lớp + gộp chỉnh sửa vào modal — ghi rõ trong plan.md để đổi được.
- Gate lệnh chuẩn hóa theo repo: `pnpm --filter web test`, `pnpm -w run check-types`, `pnpm -w run check`.

## Next steps
- Cook plan: `/ak:cook plans/260921-0530-class-curriculum-assign-only-reorder-per-class/plan.md` (branch dự kiến `vinh19410/issue-221-class-curriculum-assign-only`)
- Theo dõi issue #221 (label ready to review)
- Follow-up tiềm năng: "Đổi template" một bước (cần server hỗ trợ replace), khóa reorder buổi đã hoàn thành

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
