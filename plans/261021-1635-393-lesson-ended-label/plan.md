---
title: "Student: tab Hành trình học hiển thị \"Đã kết thúc\" cho buổi đã qua giờ mà chưa điểm danh"
description: "Buổi học còn status upcoming nhưng đã qua giờ kết thúc (giáo viên chưa check-in, chưa điểm danh ai) hiện badge \"Đã kết thúc\" thay vì \"Sắp tới\". Thay đổi thuần hiển thị ở app student, không đổi API/DB."
status: pending
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

## Câu hỏi còn mở

1. "Đã qua thời gian học" tính theo **giờ kết thúc buổi** (đề xuất, chính xác trong ngày) hay chỉ theo **ngày** (`date < hôm nay`, đơn giản hơn)? Plan mặc định giờ kết thúc.
2. Hiểu "lớp chưa start hoặc chưa điểm danh bất kỳ ai" ở **mức buổi học** (từng dòng trong timeline). Nếu ý là mức cả lớp (badge trạng thái lớp ở header), cần plan khác.
3. Màn `Tổng quan` (`class-info-card`, `loadNextSession`) vẫn có thể coi buổi hôm nay đã qua giờ là "buổi tiếp theo"; có muốn xử lý đồng bộ không (ngoài phạm vi plan này)?
