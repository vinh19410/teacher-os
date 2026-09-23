---
title: "Plan: dashboard hiển thị lịch theo lớp thay vì theo học viên (#249)"
date: 2026-09-22
summary: "ak-plan fast mode: 2 mục Lịch hôm nay/Lịch sắp tới ở /dashboard đổi từ card per-học-viên sang card per-buổi-lớp qua pure helper groupLessonsByClassSession (key classId|time); data layer giữ nguyên; issue #249"
---

# Plan: dashboard hiển thị lịch theo lớp thay vì theo học viên (#249)

## What happened

- Chạy `ak-plan --github` cho yêu cầu "tại /dashboard hiển thị lịch hôm nay và lịch sắp tới theo lớp chứ không phải theo học viên" — cùng hướng sản phẩm với #245/#247 (profile + list học viên đã đổi từ gói sang lớp).
- Auto-detect chọn **fast mode** (scope nhỏ, một route, không unknowns kiến trúc).
- Scout xác nhận: `dashboard.tsx` render card per-`Lesson` với `studentById(l.sid)` làm tiêu đề (dòng 79–116 hôm nay, 131–149 trong nhóm thứ của lịch sắp tới); `Lesson.classId` có sẵn và `useData()` expose `classById` (data-provider.tsx:54/134) → **regroup thuần UI, không cần đổi backend**; `mapLessons` lọc sẵn row thiếu enrollment nên không có edge case card rỗng; không spec e2e nào pin UI card dashboard (chỉ `helpers.ts:23` assert URL).
- Plan scaffold qua CLI: `plans/260922-0954-dashboard-schedule-by-class/` (2 phases), planner subagent soạn nội dung, `ak plan validate` pass, reindex OK.
- Tạo GitHub issue #249 với label `ready to review`, backfill `issue: 249` vào frontmatter.

## Decision

- **Group key `(classId, time)` trong từng scope ngày** — cùng lớp khác giờ vẫn 2 card; không merge qua ngày. Data layer (`lessonsToday`/`upcomingLessonsThisWeek`) giữ nguyên semantics vì tests (issue #212) đang pin.
- **Pure helper `groupLessonsByClassSession`** trả `DashboardClassSession { classId, time, dur, type, topic, lessons[] }` — field display từ row đầu, Map insertion-order giữ thứ tự input.
- **Check-in per-học-viên giữ nguyên trong card lớp** — `run(l.id, {type:"check-in", lessonId})` là per lesson row (per enrollment); gộp card không được phá hành vi kernel này.
- **Lead "Hôm nay có N buổi học" đổi nguồn đếm** từ số dòng lesson sang số buổi-lớp (`todayGroups.length`); test cũ truyền số trực tiếp nên không vỡ.
- Học viên không resolve được bị lọc khỏi group thay vì hủy cả card (khác `return null` cũ); fallback tên lớp `"Lớp"` khi orphan classId.
- Không thêm link từ card lớp (parity với card cũ) — ghi open question làm follow-up `/classes/$classId` nếu cần.

## Next steps

- Review issue #249 → chạy `/ak:cook plans/260922-0954-dashboard-schedule-by-class/plan.md`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
