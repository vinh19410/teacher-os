---
title: "Phase 2: Hợp nhất số đếm tại route /students và kiểm chứng hồi quy"
status: completed
---

# Phase 2: Hợp nhất số đếm tại route /students và kiểm chứng hồi quy

## Overview
Cập nhật route `/students` (`apps/web/src/routes/_auth/students/index.tsx`) để áp dụng định nghĩa thống nhất cho số học viên đang học và lời mời đang chờ, truyền danh sách học viên chờ xác nhận vào `PendingInvitationsList`, và kiểm chứng toàn diện bằng bộ test route và kiểm tra chất lượng.

## Files to Create / Modify
- Modify: `apps/web/src/routes/_auth/students/index.test.tsx` (kiểm tra kicker, tab count, và chuyển tab hiển thị học viên chờ xác nhận)
- Modify: `apps/web/src/routes/_auth/students/index.tsx` (tính toán `activeStudentsCount`, `totalPendingCount`, truyền prop cho `PendingInvitationsList`)

## Tasks & Steps

### Task 2.1 — Viết test Đỏ (`jsdom`) cho route `/students`
- **Goal:** Xác lập kiểm thử cho số đếm kicker, nhãn tab và nội dung tab của `/students`.
- **Target files and symbols:**
  - `apps/web/src/routes/_auth/students/index.test.tsx`
- **Steps:**
  1. Trong `index.test.tsx`, viết test case mới:
     - Cho dữ liệu có 2 học viên: 1 học viên đã liên kết (`portalLinked: true`), 1 học viên có email chưa liên kết (`portalLinked: false`).
     - Lời mời từ API rỗng (`body: []`).
     - Kỳ vọng kicker: `"1 học viên đang học · 1 lời mời đang chờ"`.
     - Kỳ vọng nhãn tab: `"Học viên (2)"` và `"Lời mời đang chờ (1)"`.
     - Chuyển sang tab `"Lời mời đang chờ"`, kiểm tra thấy xuất hiện tên học viên chờ xác nhận và nút `"Gửi lại lời mời"`.
- **Success criteria:** Test mới thất bại vì kicker hiện tại hiển thị `"2 học viên đang học · 0 lời mời đang chờ"` và tab hiển thị `"Lời mời đang chờ"` không có số.
- **Verify:** `pnpm --filter web exec vitest run src/routes/_auth/students/index.test.tsx` thất bại với AssertionError kỳ vọng.

### Task 2.2 — Cập nhật route `/students`
- **Goal:** Hoàn thiện tích hợp logic đếm và truyền dữ liệu tại `apps/web/src/routes/_auth/students/index.tsx`.
- **Target files and symbols:**
  - `apps/web/src/routes/_auth/students/index.tsx`
- **Steps:**
  1. Import `isPendingPortalStudent` từ `@/lib/repos/students`.
  2. Tính toán:
     ```ts
     const pendingStudents = students.filter(isPendingPortalStudent);
     const pendingStudentEmails = new Set(
       pendingStudents.map((s) => s.email.trim().toLowerCase()).filter(Boolean),
     );
     const pendingInvites = (invitations ?? []).filter(
       (inv) =>
         inv.status === "pending" &&
         !pendingStudentEmails.has(inv.email.trim().toLowerCase()),
     );
     const totalPendingCount = pendingStudents.length + pendingInvites.length;
     const activeStudentsCount = students.filter(
       (s) => !isPendingPortalStudent(s),
     ).length;
     ```
  3. Cập nhật `PageHead`:
     ```tsx
     kicker={`${activeStudentsCount} học viên đang học · ${totalPendingCount} lời mời đang chờ`}
     ```
  4. Cập nhật `Tabs`:
     ```tsx
     tabs={[
       {
         id: "students",
         label: `Học viên (${students.length})`,
       },
       {
         id: "invitations",
         label:
           totalPendingCount > 0
             ? `Lời mời đang chờ (${totalPendingCount})`
             : "Lời mời đang chờ",
       },
     ]}
     ```
  5. Cập nhật khi render `PendingInvitationsList`:
     ```tsx
     <PendingInvitationsList
       onInviteClick={() => setInviteModalOpen(true)}
       pendingStudents={pendingStudents}
     />
     ```
  6. Thay thế các kiểm tra inline `Boolean(s.email) && s.portalLinked === false` bằng `isPendingPortalStudent(s)` tại dòng 172 và 219 để đồng nhất mã nguồn.
- **Success criteria:** Tất cả test trong `index.test.tsx` pass 100%.
- **Verify:** `pnpm --filter web exec vitest run src/routes/_auth/students/index.test.tsx` thoát mã 0.

### Task 2.3 — Kiểm chứng toàn bộ test suites, types và lint
- **Goal:** Đảm bảo không gây hồi quy trên toàn bộ workspace.
- **Target files and symbols:** Toàn repo.
- **Steps:**
  1. Chạy toàn bộ test suite của web: `pnpm --filter web test`.
  2. Chạy kiểm tra kiểu: `pnpm check-types`.
  3. Chạy kiểm tra định dạng và lint: `pnpm check`.
- **Success criteria:** Tất cả lệnh thoát mã 0 không lỗi.
- **Verify:** `pnpm --filter web test && pnpm check-types && pnpm exec biome check .` thoát mã 0.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
