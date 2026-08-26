---
title: "Ship fix class detail curriculum duplicate render (issue #81)"
date: 2026-08-26
summary: "Gộp cây giáo trình trùng (SyllabusProgress + editor từ 5dd3acf) thành MỘT cây editor; extract lesson-status.tsx, xóa syllabus-progress.tsx (chấp nhận mất collapse per-module); gates CI-exact xanh (234 vitest + biome + check-types + build), e2e 1/1, smoke throwaway; red-team 9 findings, kongming GO x4"
---

# Ship fix class detail curriculum duplicate render (issue #81)

## What happened
- Branch `fix/class-detail-curriculum-duplicate-render`, đóng issue #81: tab "Giáo trình" ở class detail render cùng cây modules→lessons HAI LẦN từ commit 5dd3acf (PR #79/#80 thêm editor tree mà không bỏ `SyllabusProgress` read-only cũ).
- Fix: gộp thành MỘT cây editor — status dot + badge (Đã dạy/Đang học/Sắp tới) mỗi lesson, giữ "Mục tiêu", `{done}/{total} buổi` mỗi module header, summary card + progress bar đưa lên trên cây.
- Extract helpers dùng chung vào `apps/web/src/components/syllabus/lesson-status.tsx` (`lessonDotClassFor` có fallback cho giá trị ngoài union + `LessonStatusBadge`); xóa `syllabus-progress.tsx` — mất collapse per-module là regression được chấp nhận theo quyết định trong issue.
- E2E doc-contract comments cập nhật ở `class-operations.spec.ts` (header) + `helpers.ts`: comment-only, 0 thay đổi assert.

## Decision
- Đi qua pipeline ak-vibe `--ship --beta`: reuse plan + validate (Fact Checker 10/10) + red-team (9 findings được chấp nhận — lớn nhất: phải bảo toàn objectives/totalLessons) + kongming supervision GO x4; implement bằng `/ak:fix`.
- Verification toàn bộ gates CI-exact xanh: 234 vitest + ci-workflow 2 + topology-drift 5, biome, check-types, build; e2e class-operations 1/1; playwright UI smoke throwaway chứng minh render đúng MỘT cây (xóa file sau khi chạy); local code review APPROVE với 2 Minor đã fix.
- Hai cạm bẫy của smoke test:
  - Import copy lesson với status reset về "upcoming" → smoke phải gọi update endpoint để đánh dấu một lesson bản copy là done, nếu không cây toàn badge "Sắp tới" không chứng minh được gì.
  - `getByText` substring matching ban đầu đếm đúp vì objectives chứa luôn tiêu đề lesson. Test viết ra để chứng minh "hết render đúp" lại tự đếm đúp — phải siết selector thay vì trông cậy substring.

## Bài học
Bug này sinh ra vì PR #79/#80 thêm view mới mà không ai hỏi "view cũ còn ai dùng?" — additive change không kèm audit render path chính là cách một tab render hai lần và không CI nào bắt được, chỉ user nhìn thấy. Với Playwright: text hiển thị ở nhiều chỗ (tiêu đề lesson nằm trong objectives) thì substring matching là bẫy đếm — dùng selector exact ngay từ đầu.

## Next steps
- Merge PR, theo dõi CI, đóng issue #81.
- Nếu user đòi lại collapse per-module: nâng cấp node của editor tree thành collapsable, không khôi phục `SyllabusProgress`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
