---
title: "Student: tab Hành trình học hiển thị \"Đã kết thúc\" cho buổi đã qua giờ mà chưa điểm danh"
description: "Buổi học còn status upcoming nhưng đã qua giờ kết thúc (giáo viên chưa check-in, chưa điểm danh ai) hiện badge \"Đã kết thúc\" thay vì \"Sắp tới\". Thay đổi thuần hiển thị ở app student, không đổi API/DB."
status: completed
priority: P2
effort: "2h"
issue: 393
branch: ai-handle-issue-393
tags: [frontend, student, class-detail]
blockedBy: []
blocks: []
created: 2026-10-21
---

# Buổi đã qua giờ mà chưa điểm danh phải hiện "Đã kết thúc"

## Hiện trạng (đã đọc code)

- `apps/student/src/components/class/class-lesson-list.tsx`: `LESSON_STATUS` chỉ có `completed | upcoming | absent | cancelled`.
- "Điểm danh" của giáo viên = `POST /lessons/:id/check-in` hoặc `/classes/:id/sessions/:date/check-in` (`apps/server/src/routes/kernel.ts`), chuyển `upcoming → completed`. Không có trạng thái "đã start" riêng. Buổi không ai check-in giữ `upcoming` mãi.
- Hệ quả: buổi quá hạn vẫn hiện "Sắp tới", và `findNextLessonId` (upcoming + `date >= todayISO`) có thể chọn nhầm buổi hôm nay đã qua giờ làm "Buổi tới".

## Outcome / Constraints / Non-goals / Acceptance

- **Outcome:** buổi `upcoming` có `date != null` và thời điểm kết thúc (`date` + `time` + `dur` phút, giờ Việt Nam UTC+7) đã qua hiển thị badge **Đã kết thúc**; không bao giờ được đánh dấu "Buổi tới".
- **Constraints:** chỉ hiển thị phía client, suy ra từ dữ liệu sẵn có; không đổi `status` trong DB, không đổi contract/API. Hàm quyết định thuần và nhận `now` tiêm vào để test xác định, không đọc `Date` ngầm.
- **Non-goals:** không đổi số liệu Ring (`held` chỉ đếm `completed|absent`, giữ nguyên), không đổi tab Giáo trình, không đụng app giáo viên, không tự chuyển status trong DB, không đổi `loadNextSession` phía server.
- **Acceptance:** (1) buổi upcoming đã qua giờ → "Đã kết thúc"; buổi upcoming chưa tới giờ kết thúc → giữ "Sắp tới"/"Buổi tới"; `completed|absent|cancelled` không đổi; buổi `date = null` không đổi; (2) `pnpm check`, `pnpm check-types`, `pnpm --filter student test` xanh; (3) `pnpm --filter e2e e2e` cho spec `student-class-detail` xanh với override port trong `AGENTS.md`, rồi full Playwright trước khi squash-merge vào develop.

## Phases

| # | Phase | Trạng thái |
|---|---|---|
| 1 | [Helper + badge + test](phase-01-lesson-ended-label.md) | pending |

## Câu hỏi còn mở (đã resolve khi red-team)

1. Tính theo **giờ kết thúc buổi** (`date` + `time` + `dur`, UTC+7) — khớp đúng chữ issue ("thời điểm kết thúc (ngày + giờ bắt đầu + thời lượng)").
2. Mức **từng buổi học** trong timeline (dòng của tab Hành trình học) — khớp badge "Sắp tới" mà issue mô tả.
3. **Có đồng bộ Tổng quan**: red-team phát hiện `findNextLessonId` dùng chung ở `class-info-card.tsx:98`; để nhất quán với issue ("không còn là … 'Buổi tới'"), helper bỏ qua buổi đã kết thúc cho cả hai surface (null-safe sẵn).

## Red Team Review

### Session — 2026-10-21
**Findings:** 4 (3 accepted, 1 rejected sau fact-check) — chạy tự thực hiện 2 persona (Security Adversary/Fact Checker + Assumption Destroyer/Scope Auditor) do subagent kernel không có model.
**Severity breakdown:** 0 Critical, 1 High, 2 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Mâu thuẫn: bước 5 đổi `findNextLessonId` dùng chung nhưng Tổng quan bị coi ngoài phạm vi — `class-info-card.tsx:98` sẽ đổi hành vi ngầm | High | Accept | Phase 01 steps 5 + Files |
| 2 | Claim "`time` dạng HH:MM" — đã kiểm chứng: `TIME_REGEX` (contracts.ts:32) ràng buộc ở `lessonEditSchema` (contracts.ts:1058) và `occurrenceEditSchema` (contracts.ts:1088); legacy lệch format được fallback NaN→false | Medium | Accept (verified, không đổi plan ngoài ghi nhận) | Phase 01 Risk |
| 3 | Rủi ro hydration trong plan thừa — student là Vite SPA không SSR (`main.tsx` RouterProvider, test `renderToStaticMarkup`) | Medium | Accept | Phase 01 Risk |
| 4 | XSS/injection qua `${date}T${time}` — rejected: dữ liệu từ API chuẩn hoá (zod), không có surface user-inject; `NaN` không render thành nội dung nào | Medium | Reject (no codebase evidence of exposure) | — |

### Whole-Plan Consistency Sweep
- Câu hỏi mở 1–3 đã resolve và xoá khỏi danh sách "còn mở"; bước 5, Files, Test ở phase-01 đồng bộ với quyết định đồng bộ Tổng quan.
- Non-goal "không đổi `loadNextSession` phía server" giữ nguyên — `class-info-card` dùng `findNextLessonId` client-side, không đụng server.
- Không còn mâu thuẫn chưa giải quyết.
