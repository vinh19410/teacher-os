---
phase: 1
title: Cập nhật điều hướng, route guards, tests, docs và POT
status: completed
---

# Phase 01: Nav, Route Guards, Tests, Docs & POT

## Context
Issue #852 đã ẩn toàn bộ menu "Luyện tập" và "Lịch sử" khi `VITE_STUDENT_PRACTICE_ENABLED !== "true"`. Hiện tại PROD cần mở riêng mục **Từ vựng** (`/student/practice/vocabulary`) trên sidebar và chặn truy cập trực tiếp các đường dẫn tự luyện chưa hoàn thiện khác (`/practice/$skill`, `/history`, `/learn/quizzes/practice/$testId`) bằng `NotFoundPage`, đồng thời giữ nguyên 100% hành vi trên Staging/E2E (`VITE_STUDENT_PRACTICE_ENABLED === "true"`).

## Target Files
- `apps/student/src/components/layout/student-nav.tsx`
- `apps/student/src/routes/_auth/practice/index.tsx`
- `apps/student/src/routes/_auth/practice/$skill.tsx`
- `apps/student/src/routes/_auth/history.tsx`
- `apps/student/src/routes/_auth/learn/quizzes/practice/$testId.tsx`
- `apps/student/src/components/layout/student-nav.test.ts`
- `apps/student/test/student-nav.test.tsx`
- `apps/student/test/practice-route-gates.test.tsx`
- `AGENTS.md`
- `docs/production-release-runbook.md`
- `CHANGELOG.md`

## Steps
1. Viết/cập nhật unit & router integration tests (Red).
2. Cài đặt `VOCABULARY_NAV_ITEM`, `resolveStudentActiveKey`, `STUDENT_PAGE_LABEL` và `beforeLoad` guards trên các route liên quan (Green).
3. Chạy `pnpm --filter student test`, `pnpm --filter lms test`, `pnpm --filter @teacher-os/infra test`, `node --test scripts/topology-drift.test.mjs`, `node --test scripts/design-compare.test.mjs`, `pnpm check-types`, `pnpm exec biome check .`.
4. Build `apps/student` ở cả hai chế độ cờ (`false` và `true`) và xác nhận bằng `bundleMatchesStudentPracticeFlag`.
5. Chụp screenshot 3 viewport (1440×900 Light/Dark, 768×1024 Light, 375×812 Light) + kiểm tra keyboard focus và trang 404 trên bản build PROD; chạy E2E spec `student-class-detail.spec.ts` và `student-practice.spec.ts`.
6. Review local diff, đồng bộ docs và `CHANGELOG.md`.

## Validation & Rollback
- Validation: toàn bộ gates local, focused E2E, và CI staging + prod (`deploy-staging.yml`, `deploy.yml`).
- Rollback: revert PR commit; không chạm D1 migration hay infra topology.
