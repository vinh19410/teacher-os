# Plan: Đề xuất bài kiểm tra đầu vào miễn phí trong Student Portal (#748)

- **GitHub Issue:** [#748](https://github.com/vinh19410/teacher-os/issues/748)
- **Status:** In Progress
- **Branch:** `feat/748-student-placement-test` → PR `--beta` (`develop`)

## Overview
Đề xuất học viên đăng ký/đăng nhập lần đầu vào Student Portal (`apps/student`) làm bài kiểm tra đầu vào 5 kỹ năng miễn phí ngay sau wizard `/onboarding` (dùng chung bộ đề đã xuất bản với `/kiem-tra-dau-vao/`), cho phép bỏ qua nhưng vẫn highlight liên tục trên Dashboard và Sidebar cho tới khi học viên hoàn thành bài test hoặc đã có `entryScore`, đồng thời cho phép giáo viên chấm bài trong `/students/$studentId` (`apps/web`) và đồng bộ `entryScore` về Student Portal.

## Phases & Dependencies
1. **Phase 1 — DB Schema, Migration, API Contracts & UI Nav Badge** *(Sequential foundation)*
   - `packages/db/src/schema/placement-test.ts`: `leadId` nullable, thêm `studentId` (nullable FK → `student.id`, `onDelete: "set null"`), index `(orgId, studentId, submittedAt)`.
   - `packages/db/src/schema/student.ts`: thêm `placementPromptDismissedAt` (`integer` `timestamp_ms`).
   - Sinh migration `0073_*.sql` via `pnpm --filter @teacher-os/db db:generate`.
   - `packages/api/src/placement-test-contracts.ts`: thêm `stripInlineCefrLabel`, `studentPlacementSubmitSchema`, `studentPlacementStatusSchema`, `studentPlacementDetailSchema`; cập nhật `PlacementSubmissionDetail.leadId` thành `string | null` + `studentId?: string | null`.
   - `packages/ui/src/components/app-shell/nav-group.tsx`: thêm optional `badge?: ReactNode` trên `NavItem`.

2. **Phase 2A — Server Routes & Services (`apps/server`)** *(Parallel after Phase 1)*
   - `apps/server/src/lib/placement-submission-service.ts`: trích xuất logic tải/chấm/AI-retry/stream-media dùng chung cho cả `lead` và `student`, tự động đồng bộ `student.entryScore` khi chốt điểm.
   - `apps/server/src/routes/student-placement-test.ts` & mount trong `apps/server/src/app.ts`:
     - `GET /api/student/placement-test/status`
     - `GET /api/student/placement-test`
     - `POST /api/student/placement-test/dismiss`
     - `POST /api/student/placement-test/submissions`
     - `PUT /api/student/placement-test/submissions/:id/speaking`
     - `GET /api/student/placement-test/audio/:id` (Range-aware audio proxy)
   - `apps/server/src/routes/leads.ts`, `apps/server/src/routes/kernel.ts` (thêm `/students/:id/placement-submission*`), `apps/server/src/routes/public-placement-test.ts` (`leftJoin` lead + student trên `/results/:token`).
   - Tests: `apps/server/src/routes/student-placement-test.test.ts`, mở rộng `leads-placement-submission.test.ts` & `public-placement-test.test.ts`.

3. **Phase 2B — Teacher Web (`apps/web`)** *(Parallel after Phase 1)*
   - `apps/web/src/lib/repos/leads.ts` / `student-placement.ts`: repo hooks cho `/api/students/:id/placement-submission*`.
   - `apps/web/src/components/leads/placement-submission-panel.tsx`: tham số hoá theo `subject: { kind: "lead"; id: string } | { kind: "student"; id: string }` (giữ tương thích ngược `leadId` prop nếu cần).
   - `apps/web/src/routes/_auth/students/$studentId.tsx`: hiển thị panel chấm bài đầu vào trong hồ sơ học viên khi có bài nộp, refresh student data khi chốt điểm.
   - Tests: cập nhật/thêm test trong `apps/web/src/routes/_auth/students/$studentId.test.tsx`.

4. **Phase 2C — Student Portal (`apps/student`)** *(Parallel after Phase 1)*
   - `apps/student/src/lib/repos/placement-test.ts`: fetch + React Query hooks cho status, test snapshot, dismiss, submit, speaking upload.
   - `apps/student/src/components/layout/student-nav.tsx` & `student-shell.tsx`: thêm mục **Kiểm tra đầu vào** với badge **"Chưa làm"** / **"Chờ chấm"** theo `useStudentPlacementStatus()`.
   - `apps/student/src/components/placement/placement-prompt-modal.tsx` & `placement-highlight-banner.tsx`: modal đề xuất lần đầu sau onboarding (Làm bài ngay / Để sau) + banner highlight trên Dashboard `/`.
   - `apps/student/src/routes/_auth/placement-test.tsx` + `apps/student/src/components/placement/*`: giao diện làm bài 5 kỹ năng đầy đủ (Listening, Grammar & Vocab, Reading, Writing, Speaking audio), lưu nháp localStorage, màn kết quả tạm tính & kết quả chính thức sau chấm.
   - Tests: `apps/student/test/placement-test.test.tsx`.

5. **Phase 3 — Integration, E2E, Visual Check & Ship (`--merge --beta`)**
   - Merge worktrees, chạy `pnpm exec biome check .`, `pnpm check-types`, `pnpm test`.
   - Chạy `student-portal-onboarding.spec.ts` + E2E spec mới `student-placement-test.spec.ts` (port override `8100/8101/8103`).
   - Chụp screenshot 3 viewports (1440×900, 768×1024, 375×812), đăng POT lên issue #748.
   - Review độc lập (`code-reviewer` subagent), sửa nếu có findings, mở PR vào `develop` và merge (`--merge --beta`), cập nhật label `shipped`.
