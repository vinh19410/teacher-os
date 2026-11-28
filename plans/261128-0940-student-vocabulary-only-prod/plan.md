---
title: Mở path /student/practice/vocabulary trên PROD, giữ ẩn các path tự luyện còn lại
status: completed
created: 2026-11-28
branch: vinh19410/feat-student-vocabulary-practice
mode: both
route: feature
---

# Plan: Mở `/student/practice/vocabulary` trên PROD, giữ ẩn các path tự luyện còn lại

## Outcome
Khi `VITE_STUDENT_PRACTICE_ENABLED` không bật (`!== "true"`, mặc định trên PROD), học viên nhìn thấy mục điều hướng cấp 1 **"Từ vựng"** (`/practice/vocabulary`) trên sidebar và có thể truy cập đầy đủ luồng từ vựng (`/practice/vocabulary`, `$deckId`, `$deckId/session`, `courses`, `courses/$courseId`, `/vocab*` redirect), trong khi `/practice` chuyển hướng về `/practice/vocabulary` và các đường dẫn tự luyện còn lại (`/practice/$skill`, `/history`, `/learn/quizzes/practice/$testId`) trả về trang 404 (`NotFoundPage`). Staging và E2E (`VITE_STUDENT_PRACTICE_ENABLED="true"`) giữ nguyên toàn bộ 5 kỹ năng + Lịch sử.

## Phases
- [x] [Phase 01: Cập nhật điều hướng, route guards, tests, docs và POT](./phase-01-nav-and-route-gates.md)

## Acceptance Criteria
- Khi `VITE_STUDENT_PRACTICE_ENABLED !== "true"`:
  - `STUDENT_NAV` có 6 mục (`Tổng quan`, `Lớp học`, `Lịch học`, `Bài tập`, `Từ vựng`, `Học phí`), mục `Từ vựng` (`key: "vocabulary"`, `icon: BookA`, `href: "/practice/vocabulary"`) không có `children`.
  - `resolveStudentActiveKey` trả `"vocabulary"` cho `/practice/vocabulary` và `/practice/vocabulary/*` (đúng ranh giới segment), giữ `"practice"` cho các path `/practice/*` khác.
  - `/practice` redirect (`replace: true`) về `/practice/vocabulary`.
  - `/practice/$skill` (reading/listening/writing/speaking/unknown), `/history`, và `/learn/quizzes/practice/$testId` ném `notFound()` trong `beforeLoad` để render `NotFoundPage` và không gọi API loader.
  - `/practice/vocabulary/*`, `/vocab*`, `/learn/quizzes/$assignmentId`, `/learn/quizzes/attempt/$attemptId*` hoạt động bình thường.
- Khi `VITE_STUDENT_PRACTICE_ENABLED === "true"` (Staging / E2E):
  - `STUDENT_NAV` giữ nguyên 7 mục (nhóm `Luyện tập` 5 skill + `Lịch sử`), `resolveStudentActiveKey("/student/practice/vocabulary")` trả `"practice"`.
  - `/practice` redirect về `/practice/reading`; `/practice/$skill`, `/history`, `/learn/quizzes/practice/$testId` hoạt động bình thường.
- Toàn bộ unit/integration tests, typecheck, Biome lint, bundle flag check (`false` và `true`), và E2E specs (`student-class-detail.spec.ts`, `student-practice.spec.ts`) đều pass.

## TDD Matrix
| Test file | Coverage |
|---|---|
| `apps/student/src/components/layout/student-nav.test.ts` | Cấu trúc `STUDENT_NAV`, `VOCABULARY_NAV_ITEM`, `resolveStudentActiveKey` theo cờ và ranh giới segment |
| `apps/student/test/student-nav.test.tsx` | Render `STUDENT_NAV` mặc định (6 mục) và `STUDENT_PAGE_LABEL` |
| `apps/student/test/practice-route-gates.test.tsx` | TanStack Router integration: redirect `/practice`, `NotFoundPage` trên route ẩn, không gọi API loader, mở route từ vựng & chế độ cờ `"true"` |
