---
title: "Lịch dạy hiển thị theo lớp"
description: "Chuyển lưới tuần của trang /schedule từ một block mỗi học viên sang một block mỗi buổi của lớp (gom theo classId + date), kèm modal buổi học liệt kê học viên."
status: completed
priority: P2
effort: 7h
issue: 162
branch: feat/schedule-by-class
tags: [frontend, feature]
blockedBy: []
blocks: []
created: 2026-09-17
---

# Lịch dạy hiển thị theo lớp

## Overview

Trang `/schedule` (Lịch dạy) hiện render mỗi dòng `lesson` (mỗi enrollment = mỗi học viên) thành một block riêng và hiển thị tên học viên. Plan này chuyển lưới tuần sang nhóm theo lớp: một buổi vật lý của lớp = một block, nhãn chính là **tên lớp**; chi tiết từng học viên (điểm danh/hủy/sửa) chuyển vào modal buổi học mới. Không đổi schema, không đổi API server — dữ liệu `lesson.classId` đã có sẵn trên client và logic gom `(classId, date)` đã tồn tại trong `class-sessions.ts`.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Block trên lưới tuần `/schedule` = 1 buổi của lớp (gom dated rows theo `(classId, date)`, legacy rows theo `(classId, day, time)`), hiển thị tên lớp | P1 |
| 2 | Modal buổi học theo lớp: liệt kê từng học viên với điểm danh/hủy/sửa riêng theo `lessonId` | P1 |
| 3 | Không regress QC #121 (projected blocks) và flow điểm danh e2e | P1 |

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Session selector thuần + unit tests](./phase-01-selector.md) | Pending |
| 2 | [Route UI theo lớp + ClassSessionModal](./phase-02-route-ui-session-modal.md) | Pending |
| 3 | [Cập nhật e2e + regression](./phase-03-tests-regression.md) | Pending |

## Success Criteria

- [ ] Lớp 1:2 (2 enrollment) hiển thị đúng 1 block/buổi với tên lớp, không còn 2 block trùng giờ theo tên học viên
- [ ] Click block mở modal buổi học: tên lớp + ngày, mỗi học viên một hàng, Điểm danh/Hủy/Sửa tác động đúng `lessonId` của hàng đó
- [ ] `pnpm --filter web test` và e2e (`projected-sessions`, `class-operations`, `session-occurrence`) pass

## Assumptions (product decisions mặc định)

1. **Giữ lưới tuần 7 cột** — "lịch dạy" là lịch của giáo viên nên block = buổi dạy của lớp; chỉ đổi nhãn và mức gom. Không đổi sang danh sách theo lớp.
2. **Không đổi server** — mọi action vẫn per-`lessonId` như hiện tại; modal lớp chỉ gom hiển thị.
3. **Legacy class (date null)**: gom theo `(classId, day, time)` giữ nguyên hành vi template tuần.

## Dependencies

- Không có plan chặn; tái sử dụng `class-sessions.ts` (chỉ đọc) và `LessonEditForm`/`useDirectKernelAction` hiện có.

## Validation Log

### Verification Results (2026-09-17, Standard tier — 3 phases)

- Claims checked: 12 | Verified: 12 | Failed: 0 | Unverified: 0
- Tier: Standard (Fact Checker + Contract Verifier — xác minh bằng đọc trực tiếp file trong phiên lập kế hoạch)
- Đã xác minh: `schedule.tsx:190,226` render tên học viên; `schedule-week.ts:23-97` selector + slot count; `lesson-modal.tsx` action per-lessonId và còn 5 consumer khác; `class-sessions.ts` exports (`projectClassSessions:128`, `buildClassSessions:186`, `sessionRowTargets:546`); `mock-data.ts:30-47` `Lesson.classId/date`; `useClasses().classById` (`repos/use-classes.ts:14-22`); e2e `class-operations.spec.ts:88,103` locate theo `STUDENT_NAME`; e2e `projected-sessions.spec.ts` đã assert theo `CLASS_NAME`; `session-occurrence.spec.ts` chỉ chạy ở tab lớp.
- Failures: (none)

### Whole-Plan Consistency Sweep

- Đã quét 4 file plan: không còn thuật ngữ cũ ("theo học viên" chỉ xuất hiện ở ngữ cảnh mô tả hành vi hiện tại/cần xóa); không có xung đột giữa overview và phase files; frontmatter khớp phases table.
- Không có `[UNVERIFIED]` tag nào còn lại.

### Open Questions (không chặn — đã ghi Assumptions mặc định)

1. Giữ lưới tuần 7 cột với block = buổi lớp (mặc định đang chọn) hay đổi sang danh sách theo lớp?
2. Modal lớp: giữ modal mở sau điểm danh từng học viên (mặc định) hay đóng sau mỗi action?
