---
title: "Ship beta hàng chờ chấm bài Writing/Speaking tự luyện (#383)"
date: 2026-10-21
summary: "Ship beta hàng chờ chấm bài /grading hỗ trợ mode=practice, đồng bộ nhãn Chờ chấm và E2E (#383)"
---

# Ship beta hàng chờ chấm bài Writing/Speaking tự luyện (#383)

## What happened
Hoàn tất triển khai và kiểm thử Issue #383: Hàng chờ chấm bài Writing/Speaking cho giáo viên (`/grading`, `GET /api/grading`) hỗ trợ bài tự luyện (`mode='practice'`) và đồng bộ nhãn `'Chờ chấm'` ở Lịch sử & catalog học viên.

### Các thay đổi chính
1. **Contract & Server API (`packages/api/src/contracts.ts`, `apps/server/src/routes/grading.ts`):**
   - Thêm `gradingQueueItemSchema`, `gradingQueueResponseSchema`, và `GET /api/grading` (`loadGradingQueue`).
   - Hợp nhất bài nộp `writing`/`speaking` đã nộp của cả `mode='assignment'` và `mode='practice'` (`className: "Luyện tập"`).
   - Chia chunk 50 `testId` khi truy vấn `assignmentPrompt.part` qua `assignmentTestPart` để không vượt trần bind parameter của Cloudflare D1; đề nhiều part không nhân bản dòng, đề 0 part fallback `part: ""`.
   - Ưu tiên bài chờ chấm (`grade === null`) lên đầu trong cả SQL và bộ nhớ trước khi áp giới hạn nhánh (`GRADING_QUEUE_BRANCH_LIMIT = 500`).
2. **Web UI & Điều hướng (`apps/web`):**
   - Bật mục nav `Chấm bài` (`/grading`, icon `PenLine`) trong nhóm `IELTS` của `sidebar.tsx`, thêm breadcrumb trong `app-shell.tsx` và đăng ký `"/grading": true` trong `routes-matcher.ts`.
   - Tạo trang `apps/web/src/routes/_auth/grading/index.tsx` với bộ lọc URL (`?q=&mode=&skill=&status=`), debounce 300ms, `ChipFilter` kèm `counts` chéo nhóm, và `aria-label` phân biệt theo học viên.
   - Cập nhật `apps/web/src/routes/_auth/grading/$attemptId.tsx` hỗ trợ quay về hàng chờ chấm (`← Về hàng chờ chấm`), ẩn `· Hạn` rỗng và invalidate `gradingQueueQueryKey` sau khi lưu điểm.
3. **Portal Học viên & E2E (`apps/student`, `apps/e2e`):**
   - Xóa nhánh tạm `'Đã nộp — tự luyện'` trong `history-list.tsx`, đồng bộ về `'Chờ chấm'`; cập nhật `skill-catalog.tsx` hiển thị `'Lần gần nhất'` + `'Chờ chấm'`.
   - Mở rộng `teacher-grade-submission.spec.ts` kiểm chứng toàn luồng và 3 viewport × 2 theme + 320px không tràn ngang.

## Decision
Dùng squash merge khi hợp nhất PR vào `develop` theo khuyến nghị của Kongming để giữ lịch sử `develop` sạch.

## Next steps
Mở PR vào `develop`, chạy `ak-review-pr --fix --reply`, post nhận xét Kongming post-PR review gate, gắn nhãn `ready to ship beta` và merge vào `develop`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
