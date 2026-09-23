---
title: "Dashboard hiển thị lịch theo lớp thay vì theo học viên"
description: "Hai mục Lịch hôm nay và Lịch sắp tới trên /dashboard group card theo buổi-lớp với tên lớp làm tiêu đề (học viên liệt kê trong card) thay vì một card mỗi học viên."
status: completed
priority: P2
effort: 3h
issue: 249
branch: vinh19410/feat/dashboard-schedule-by-class
tags: [feature, frontend, test]
blockedBy: []
blocks: []
created: 2026-09-22
---

# Dashboard hiển thị lịch theo lớp thay vì theo học viên

## Overview

Trên `/dashboard` (`apps/web/src/routes/_auth/dashboard.tsx`), hai mục "Lịch hôm nay" và "Lịch sắp tới" đang render một card cho mỗi HỌC VIÊN — mỗi dòng `Lesson` trở thành 1 card với avatar + tên học viên làm tiêu đề, nên một lớp 1:2 cùng khung giờ xuất hiện 2–3 card trùng lặp. Yêu cầu mới: hiển thị theo LỚP — mỗi buổi-lớp (cùng lớp, cùng khung giờ) là 1 card với tên lớp làm tiêu đề, học viên của buổi đó liệt kê bên trong card. Grouping thực hiện bằng pure helper mới trong `dashboard-from-kernel.ts` theo key `(classId, time)` trên output đã lọc của `lessonsToday` / `upcomingLessonsThisWeek`; data layer giữ nguyên semantics vì unit tests đang pin. Không đổi kernel/API/contracts, không đụng section "Học viên rủi ro" và trang `/schedule`.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | "Lịch hôm nay": mỗi buổi-lớp 1 card — tên lớp làm tiêu đề, danh sách học viên bên trong kèm action Điểm danh/Đã học per học viên | P1 |
| 2 | "Lịch sắp tới": trong từng thứ, mỗi buổi-lớp 1 card (tên lớp + meta + danh sách học viên, không nút action) | P1 |
| 3 | Pure helper `groupLessonsByClassSession` + unit tests; lead "Hôm nay có N buổi học" đếm số buổi-lớp | P1 |
| 4 | Toàn bộ verification pass: check-types, unit, biome, full e2e | P1 |

## Key Decisions

- **Group theo buổi-lớp với key `(classId, time)` trong từng scope ngày đã lọc**: "hôm nay" group một lần trên output `lessonsToday`; "lịch sắp tới" group riêng trong từng nhóm thứ (`upcomingGroups` theo `l.day` như hiện tại). Cùng lớp nhưng khác giờ = 2 card riêng; không merge qua các scope/ngày khác nhau. Data layer (`lessonsToday`, `upcomingLessonsThisWeek`) giữ nguyên hoàn toàn — grouping chỉ là pure helper + UI.
- **Helper mới `groupLessonsByClassSession(lessons: Lesson[]): DashboardClassSession[]` trong `apps/web/src/lib/dashboard-from-kernel.ts`**, với `DashboardClassSession = { classId, time, dur, type, topic, lessons: Lesson[] }` — field display lấy từ row đầu của group, `lessons` giữ các row per-student theo thứ tự input (input đã sort time/day nên không sort lại). Giữ thứ tự group theo thứ tự xuất hiện của row đầu trong input.
- **Card "Lịch hôm nay"**: Avatar chữ cái đầu tên lớp (size md), tiêu đề = `classById(l.classId)?.name ?? "Lớp"` (defensive fallback — FK cascade ở `mapLessons` khiến orphan class hiếm khi xảy ra), meta giữ `{time} · {dur}' · {type} · {topic}`. Bên trong: mỗi học viên 1 dòng (Avatar sm + tên) kèm action per-lesson như cũ — Badge success "Đã học" nếu `l.status === "completed"`, ngược lại Button "Điểm danh" gọi `run(l.id, { type: "check-in", lessonId: l.id }, "Đã điểm danh.")`, disabled theo `busy || isPending(l.id)`. Học viên không resolve được (`studentById` miss) bị lọc khỏi group thay vì hủy cả card; group rỗng không render.
- **Card "Lịch sắp tới" giữ parity hiện tại — không nút action**: trong mỗi nhóm thứ, cards theo buổi-lớp với tên lớp + meta + danh sách học viên (Avatar sm + tên).
- **Lead count đổi nguồn, không đổi format**: `formatDashboardLead(now, todayGroups.length)` — "Hôm nay có N buổi học" giờ đếm số buổi-lớp thay vì số dòng lesson. Test cũ `formatDashboardLead` truyền số trực tiếp nên không bị vỡ; không cần thêm test pin lead.
- **Unit tests cho helper đặt trong `apps/web/src/lib/dashboard-from-kernel.test.ts`** (describe mới, dùng fixture builder `lesson()` sẵn có của file): (a) nhiều học viên cùng lớp cùng giờ → 1 group; (b) cùng lớp khác giờ → 2 group; (c) khác lớp cùng giờ → 2 group; (d) thứ tự group theo input; (e) `lessons` trong group đủ các row. Không đổi các test đang pin `lessonsToday`/`upcomingLessonsThisWeek`.
- **Không đổi gì ngoài dashboard**: kernel/API/contracts, display type `Lesson`, section "Học viên rủi ro", trang `/schedule`; không thêm link điều hướng mới từ card lớp (card hiện tại không có link — giữ parity).

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Helper group buổi-lớp + unit tests](./phase-01-lib-grouping.md) | Done |
| 2 | [Dashboard render card theo lớp + verification](./phase-02-ui-class-cards.md) | Done |

## Success Criteria

- [x] "Lịch hôm nay" và "Lịch sắp tới" render card theo buổi-lớp với tên lớp làm tiêu đề (cùng lớp khác giờ vẫn là 2 card riêng).
- [x] Trong card "Lịch hôm nay": mỗi học viên 1 dòng kèm action riêng — Badge "Đã học" khi completed, Button "Điểm danh" (per-lesson pending state) cho buổi chưa học.
- [x] Lead "Hôm nay có N buổi học" đếm đúng số buổi-lớp của hôm nay.
- [x] `pnpm check-types`, `pnpm --filter web test`, `pnpm exec biome check apps/web/src` pass.
- [x] Full e2e `pnpm --filter e2e e2e` pass (regression — không spec nào pin UI card dashboard).

## Dependencies

- Không có plan chặn. PR #245 (card Lớp học trên tab Hồ sơ) và plan #247 (danh sách học viên) là các trang khác — không đụng file nào của plan này.

## Out of Scope

- Kernel, API routes, contracts, schema.
- Semantics của `lessonsToday` / `upcomingLessonsThisWeek` (tests đang pin — issue #212).
- Section "Học viên rủi ro" trên dashboard.
- Trang `/schedule` (đã hiển thị lớp theo cột `classById` — pattern tham chiếu, không đổi).
- Link mới từ card lớp (ví dụ tới `/classes/$classId`) — card hiện không có link.
- Trang danh sách học viên (thuộc plan #247).

## Open Questions

- Sau này giáo viên có cần click card lớp để tới chi tiết lớp (`/classes/$classId`) không? Hiện giữ parity không-link với card cũ; nếu cần thì làm follow-up riêng kèm e2e mới.

<!-- slug: dashboard-schedule-by-class -->
