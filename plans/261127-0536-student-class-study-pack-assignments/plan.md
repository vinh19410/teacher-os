---
title: "student-class-study-pack-assignments"
description: "Tab Bài tập lớp học viên chỉ hiển thị bộ đề tự học, hiển thị toàn bộ kèm ngày dự kiến và cho phép làm trước."
status: completed
priority: P1
effort: "4h"
tags: [student, study-pack, class-detail]
created: 2026-11-27
---

# student-class-study-pack-assignments

## Overview

Chuyển tab **Bài tập** trên `/student/classes/$classId?tab=assignments` sang chỉ hiển thị danh sách bài tập thuộc bộ đề tự học (`classStudyPackId != null`), bỏ chặn hiển thị/làm bài theo `available_at`, hiển thị đầy đủ tất cả ngày kèm ngày dự kiến và cho phép học viên làm trước. Homework giao tay giữ nguyên trong từng buổi học (Tab `Hành trình học` với nút làm bài 1-click và trang chi tiết buổi học).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Mở rộng `studentAssignmentSchema` thêm metadata bộ đề tự học tương thích ngược | P1 |
| 2 | Tách ranh giới visibility server: mở khóa toàn bộ bộ đề tự học ở class detail/quiz/attempt/history/reminders, giữ gate `available_at` cho bài giao tay và giữ gọn `/overview` trừ bài làm sớm | P1 |
| 3 | Cập nhật UI chi tiết lớp học viên: Tab Bài tập chỉ render bộ đề tự học kèm ngày dự kiến & cho làm trước; `TodoBanner` lọc bài đến hạn đến hôm nay; `ClassLessonList` link thẳng vào quiz | P1 |
| 4 | Cập nhật unit test, 4 E2E spec liên quan, `DESIGN.md`, chụp POT 3 viewport Light/Dark và ship beta (`develop`) → stable (`main`) | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Shared API Contracts](./phase-01-start.md) | Done |
| 2 | [Phase 2: Server Visibility and Routes](./phase-02-server-visibility-and-routes.md) | Done |
| 3 | [Phase 3: Student Class UI](./phase-03-student-class-ui.md) | Done |
| 4 | [Phase 4: E2E Docs and POT](./phase-04-e2e-docs-and-pot.md) | Done |

## Success Criteria

- [x] `GET /api/student/classes/:classId` trả đủ toàn bộ bài bộ đề tự học (kể cả tương lai) với `classStudyPackId`, `studyPackTitle`, `studyPackStatus`, `availableAt`, `studyPackDayIndex`, `studyPackPosition`.
- [x] Học viên mở đề, nghe audio, start, autosave, submit, xem review và lịch sử đối với bài bộ đề tương lai trước `available_at` thành công; bài giao tay hẹn giờ vẫn trả 404.
- [x] `/overview` giữ ẩn bài bộ đề tương lai chưa đụng tới nhưng hiển thị ngay bài bộ đề đã bắt đầu/nộp sớm.
- [x] Tab `Bài tập` của lớp chỉ hiển thị bài bộ đề tự học theo ngày dự kiến, không gắn `Quá hạn`/`Sắp đến hạn` cho ngày tương lai, và cho làm trước.
- [x] `TodoBanner` chỉ đếm bài đến hạn/quá hạn đến hôm nay; `RingStat` đếm trên tổng bài toàn khóa; `ClassLessonList` dùng link quiz trực tiếp thay cho `"Mở trong Bài tập"`.
- [x] Toàn bộ gates local (`biome check`, `check-types`, `pnpm test`, 4 E2E specs lẻ) xanh kèm POT 3 viewport Light/Dark.

<!-- slug: student-class-study-pack-assignments -->
