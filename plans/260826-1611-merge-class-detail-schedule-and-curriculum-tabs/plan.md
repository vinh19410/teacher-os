---
title: "Merge class detail schedule and curriculum tabs"
description: "Thay 2 tab Giáo trình + Lịch học trong Class Detail bằng 1 tab Buổi học timeline-first, kèm khu Quản lý giáo trình collapsible ở trên."
status: pending
priority: P1
effort: "3-5d"
tags: [ui, class-detail, syllabus, schedule, refactor]
created: 2026-08-26
blockedBy: [260826-1854-in-place-attendance-on-bui-hc-tab]
blocks: []
---

# Merge class detail schedule and curriculum tabs

## Overview

Class Detail hiện có 2 tab tách biệt: **Giáo trình** (edit-heavy, cây Module→Lesson) và **Lịch học** (read-only timeline theo ngày, cột "Chủ đề" đã pull từ syllabus qua `sessionTopic()`). Data đã link, nhưng UI vẫn tách buộc user chuyển tab liên tục để đối chiếu topic ↔ ngày, xem materials/objectives, edit lesson, hoặc tracking done/current.

Kế hoạch: gộp thành **1 tab "Buổi học"** với 2 khu chồng dọc — Quản lý giáo trình (collapsible) ở trên + Timeline mở rộng (Module badge + expand row materials/objectives + inline edit title + status dropdown) ở dưới. Class Detail còn 3 tab sau gộp.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | 0 tab-switch cho luồng thường ngày (soạn bài + edit + tracking) | P1 |
| 2 | 1 source of truth (Syllabus) — không copy state UI | P1 |
| 3 | Thấy Module boundaries qua badge trong ≤1 giây | P2 |
| 4 | Class Detail giảm tab count 4 → 3 | P2 |
| 5 | Không đổi data model Syllabus, không đổi hợp đồng `sessionTopic()` | P1 |

## Non-goals

- Reporting/export view lịch + topic để chia sẻ ra ngoài (scope riêng).
- Đổi cấu trúc dữ liệu Syllabus (vẫn Module → Lesson).
- Split view side-by-side curriculum tree ↔ timeline (đã reject trong advise).
- Virtualization bảng timeline (chỉ cần khi lớp > 100 sessions — hiện quy mô 20-72 sessions).
- Thêm kernel action mới (đã có `check-in`, `cancel-lesson`, `lesson-edit`, `edit-lesson`).

## Constraints

- Route `apps/web/src/routes/_auth/classes/$classId.tsx` hiện 574 lines chứa 4 tab; sau gộp còn 3.
- `sessionTopic()` (`apps/web/src/lib/class-sessions.ts:256-269`) là cầu nối duy nhất session ↔ lesson theo chronological index — comment file ghi rõ "Render-only: syllabus titles are never written back to `lesson.topic`" → **pin semantic: inline edit ghi `row.topic` (per-occurrence override), không ghi `SyllabusLesson.title`**.
- `sessionStatus()` derive từ prefix của lesson rows per-sid (`class-sessions.ts:221-233`) — đổi status 1 session phải fan-out `check-in`/`cancel-lesson` cho tất cả rows của session tại occurrence index.
- Kernel actions có sẵn:
  - `check-in { lessonId }` / `cancel-lesson { lessonId }` — per lesson row status.
  - `lesson-edit { lessonId, payload: {day, time, dur, topic, zoom} }` — full-replace 5 fields (khi inline edit topic phải pass đủ 5).
  - `edit-lesson` — cho syllabus lesson (dùng trong khu Quản lý).
- Legacy fallback path (`sessions === null` trong `ClassScheduleTable`, `$classId.tsx:500-536`) giữ nguyên, KHÔNG nhận enhancements.
- Tab id (`"syllabus"` / `"schedule"`) là local state — verify không có deep-link URL param nào phụ thuộc.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Prep refactor — extract + extend helper](./phase-01-start.md) | Pending |
| 2 | [Phase 2: Timeline read-only enhancements](./phase-02-timeline-read-only-enhancements.md) | Pending |
| 3 | [Phase 3: Timeline mutations inline edit and status](./phase-03-timeline-mutations-inline-edit-and-status.md) — **SUPERSEDED một phần** bởi [260827-0941](../260827-0941-session-actions-bo-cot-hoc-vien-tab-buoi-hoc/plan.md) | Pending |
| 4 | [Phase 4: Merge tabs cleanup and QA](./phase-04-merge-tabs-cleanup-and-qa.md) | Pending |

## Dependencies

- P1 → P2 (Phase 2 dùng helper mở rộng từ P1).
- P2 → P3 (Phase 3 mutations trên UI đã enhanced ở P2).
- P3 → P4 (Phase 4 merge tab dùng ClassScheduleTable enhanced).
- P4 là phase gỡ tab cũ + QA end-to-end.

## Success Criteria

- [ ] Class Detail hiển thị 3 tab thay vì 4 (assert bằng render test hoặc grep route).
- [ ] Tab "Buổi học" chứa: khu Quản lý giáo trình (collapsible, default collapse khi `syllabus.modules.length > 0`) + bảng timeline mở rộng.
- [ ] Cột "Chủ đề" hiển thị Module badge cạnh Lesson title cho mỗi session có syllabus mapping.
- [ ] Click row session → expand hiển thị `materials` + `objectives` của lesson tương ứng.
- [ ] Click title lesson trong row → editable input (Enter save, Escape cancel), ghi vào `row.topic` qua `lesson-edit`.
- [ ] Status dropdown trên row session → fan-out `check-in`/`cancel-lesson` cho tất cả lesson rows của session.
- [ ] Progress bar `syDone/syLessons` (khu Quản lý) không đổi hành vi — vẫn dựa `SyllabusLesson.status === "done"`.
- [ ] Empty states: (a) chưa có syllabus → khu Quản lý default expanded + timeline hiển thị khung ngày với Chủ đề = "—"; (b) startDate tương lai → timeline vẫn hiển thị lịch dự kiến.
- [ ] Legacy fallback (`sessions === null`) không regress — bảng cũ vẫn render với 4 cột.
- [ ] Test suite pass; manual QA cho lớp 12 sessions (2 buổi/tuần × 6 tuần) và lớp 72 sessions (3 buổi/tuần × 6 tháng).
- [ ] `apps/web/src/routes/_auth/classes/$classId.tsx` giảm dưới 500 lines sau khi extract + xóa tab cũ.

## Risk Assessment

| Risk | Signal | Response |
|------|--------|----------|
| Semantic ambiguity: inline edit topic ghi vào đâu? | Test edit title xong tab-reload → thấy syllabus title thay vì text vừa gõ | Pin `row.topic` semantic ở Phase 3; nếu user báo cáo "cả class chưa dạy vẫn hiện title cũ" → đúng thiết kế, không phải bug |
| Status dropdown fan-out phá attendance data | Test đổi status → 1 học viên đã absent bị đổi thành cancelled | Phase 3 acceptance: dropdown chỉ áp cho rows chưa có state đích; states `absent`/`completed` per-sid phải preserve |
| Progress bar không nhích khi đánh dấu session done | UI hiển thị 3/10 nhưng đã đánh dấu 5 sessions | Đã note trong constraints: syllabus status vs attendance status là 2 hệ; UX text tooltip giải thích |
| Route file phình > 700 lines khi merge | Line count sau P4 vượt threshold | P1 phải extract triệt để (management section + expandable row); P4 verify line count |
| Deep-link mất khi xóa tab id | User bookmark `?tab=schedule` báo 404 | P4 grep repo cho `tab=` / `activeTab` — xử lý redirect nếu có |

## References

- Advise report gốc: session 2026-08-26 14:00 (không có report file — nội dung ở conversation).
- Code entry points:
  - [apps/web/src/routes/_auth/classes/$classId.tsx](../../apps/web/src/routes/_auth/classes/$classId.tsx) (route + tabs, 574 lines)
  - [apps/web/src/lib/class-sessions.ts:256-269](../../apps/web/src/lib/class-sessions.ts) (`sessionTopic`)
  - [apps/web/src/lib/data-actions.ts](../../apps/web/src/lib/data-actions.ts) (kernel actions)
- Recent related plans:
  - `260826-1351-class-schedule-tab-chronological-syllabus` (PR #84 — đã merge)
  - `260826-1030-fix-class-detail-curriculum-duplicate-render` (PR #82 — đã merge)
  - `260825-1915-syllabus-template-import-per-class-curriculum` (đã merge)

## Open questions

Không còn (đã confirm reframing với user).

<!-- slug: merge-class-detail-schedule-and-curriculum-tabs -->
