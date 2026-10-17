---
title: "Phase 5: Lịch sử làm bài + Streak"
status: todo
---

# Phase 5: Lịch sử làm bài + Streak

## Context Links

- [Scout §D/§E](../reports/scout-report.md) · Report P1 item 5
- Phụ thuộc: Phase 1 (index `(student_id, submitted_at)`). Red-team findings #6, #14, #15.

## Overview

Trang "Lịch sử làm bài": danh sách attempts đã nộp theo thời gian + filter skill (URL param) + card streak (chuỗi ngày + số bài 7 ngày) + **nhãn "Nộp trễ"** derive server-side. Scope giữ đúng report "trang + streak đơn giản": KHÔNG mini-list "3 bài gần nhất" trên home (red-team #14 — chỉ streak mini + link), KHÔNG heatmap/bảng tuần.

## Key Insights

- Skill/part/title không nằm trên attempt — join `class_assignment → assignment_prompt` theo chuẩn `loadOwnedAttemptWithSkill` (:660-696); title/part snapshot từ `class_assignment`.
- Unique `(assignmentId, studentId)` → 1 đề 1 dòng; streak từ `submittedAt` (đã nộp), ngày local VN (`Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Ho_Chi_Minh'})`), KHÔNG thêm dependency.
- **"Nộp trễ"** (red-team #15): derive khi đọc — `submittedAt > startedAt + timeLimitSeconds + grace 60s` → field `late: true` trong history item; UI chip "Nộp trễ" cạnh ngày. Không cột DB.
- **Endpoint nằm trong studentRoutes closure + đăng ký `requireStudent` 2 dạng path** (`/history` và `/history/*` — #320; KHÔNG mount riêng app.ts, nếu không sẽ KHÔNG có auth — comment :586-588).
- **Chip filter skill cho student là component MỚI** (red-team #14: `chip-filter.tsx` chỉ có ở apps/web; apps/student không có `components/ui/`) — viết bản minimal cho student (~4 chip skill + "Tất cả"), giữ contract quy ước AGENTS.md: filter URL param + badge đếm `aria-hidden`; KHÔNG lift packages/ui (đụng web).
- Index `(student_id, submitted_at)` đã thêm ở migration 0036 — query history/summary dùng index seek.
- Keyset pagination: cursor `submittedAt` desc + tie-break `attemptId` (trùng giờ không mất dòng).
- **Test path phải nằm trong include pattern** của apps/server vitest (`src/**/*.test.ts`) — đặt `apps/server/src/lib/streak.test.ts`, KHÔNG phải `apps/server/test/` (red-team #14 — phantom test).

## Requirements

- [ ] GET `/student/history` (cursor, filter skill) + GET `/student/history/summary` — auth student + org, đăng ký requireStudent.
- [ ] Trang `/history`: list (title, skill chip, part, ngày nộp, điểm/band nếu có, chip "Nộp trễ" khi late, link attempt summary), filter skill URL param, "Xem thêm".
- [ ] Card streak (chuỗi ngày + số bài 7 ngày) + streak mini + link trên home.
- [ ] Band chưa chấm: điểm tự chấm + "Chờ chấm".
- [ ] Quy ước UI repo (DESIGN.md, 3 viewport, keyboard focus, badge aria-hidden).

## Architecture

```
GET /student/history?skill=reading&cursor=<ISO>
  → join quiz_attempt → class_assignment → assignment_prompt (orgId + studentId)
  → items: [{attemptId, assignmentId, title, skill, part, submittedAt,
             correctCount, totalQuestions, band?, late}]   // late = submittedAt > startedAt + timeLimit + 60s
  → nextCursor
GET /student/history/summary → {streakDays, lastActiveDate, count7d}
computeStreak(submittedAtISOs[], nowISO) — pure, apps/server/src/lib/streak.ts
```

Streak rule: chuỗi ngày liên tục VN kết thúc hôm nay hoặc hôm qua; cùng ngày tính 1.

## Files to Create / Modify

- Modify: `apps/server/src/routes/student.ts` (thêm 2 route history + use() requireStudent 2 dạng path — theo cấu trúc closure hiện có, KHÔNG file mount riêng)
- Create: `apps/server/src/lib/streak.ts` + `apps/server/src/lib/streak.test.ts` (trong include pattern)
- Modify: `packages/api/src/contracts.ts` (`studentHistoryItemSchema` + `late`, `studentHistorySchema`, `studentHistorySummarySchema`)
- Create: `apps/student/src/routes/_auth/history/index.tsx`
- Create: `apps/student/src/components/history/history-list.tsx`, `streak-card.tsx`
- Create: `apps/student/src/components/history/skill-filter.tsx` (chip minimal cho student, URL param)
- Modify: `apps/student/src/routes/_auth/index.tsx` (streak mini + link "Xem tất cả" — KHÔNG mini-list)
- Modify: `apps/student/src/lib/repos/student.ts` (`fetchHistory`, `fetchHistorySummary`)

## Implementation Steps

1. Contracts (§ Architecture — required fields, endpoint mới).
2. `computeStreak` pure + test (boundary hôm qua/hôm nay, gap, cùng ngày, timezone +7, năm mới).
3. Server 2 route trong student.ts closure: join pattern `loadOwnedAttemptWithSkill`; skill param validate ∈ ASSIGNMENT_SKILLS; keyset cursor (submittedAt, attemptId); late derive; use() đăng ký.
4. Student route: loader `useSearch` URL param; skill-filter chip (debounce 300ms đẩy URL); list + skeleton; "Xem thêm" cursor append; chip "Nộp trễ" + "Chờ chấm".
5. Home: streak mini (số + icon Flame lucide) + link → /history.
6. Server test: auth (không session → 401), org scope, filter, cursor, late flag.
7. UI verify 3 viewport + keyboard + screenshots.

## Todo

- [ ] Contracts history + summary (+ late)
- [ ] computeStreak pure + test tại src/lib/ (trong include pattern)
- [ ] Server 2 route + requireStudent 2 dạng path + keyset + late
- [ ] Trang /history + skill-filter chip student + repos
- [ ] Home streak mini + link (không mini-list)
- [ ] 3 viewport + screenshots

## Success Criteria

- Seed 3 bài (hôm nay/hôm qua/3 ngày trước) → list đúng thứ tự; `?skill=reading` lọc đúng (URL giữ qua reload/back); streak = 2; count7d = 3; bài nộp trễ có chip "Nộp trễ".
- Học viên mới: empty state "Chưa có bài đã nộp".
- Test server: 401 không auth; data liên org không lộ; cursor ổn định.
- Gate local pass (student + server test).

## Risk Assessment

- Band chưa chấm → "Chờ chấm" (không block).
- Query nặng: index 0036 phủ (student_id, submitted_at); join theo assignmentId đã có unique.

## Security Considerations

- Scoped org + student (ownership); history items chỉ metadata kết quả (không đề/answers).
- requireStudent đăng ký 2 dạng path — thiếu là 401/500 lộ tùy mount; test auth chặn.

## Next Steps

→ Phase 6 (PWA/Feedback/Guide) độc lập.
