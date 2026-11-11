---
title: "Triển khai fail-closed createStudentGuard và tự phục hồi org học viên (#675)"
date: 2026-11-11
summary: "Hoàn tất triển khai TDD, sửa 4 finding review độc lập, cập nhật docs/system-architecture.md và vượt qua toàn bộ unit + Playwright E2E."
---

# Triển khai fail-closed createStudentGuard và tự phục hồi org học viên (#675)

## What happened
Hoàn tất triển khai cả 2 phase của `plans/261111-0821-675-student-guard-fail-closed`:
1. Server (`packages/api/src/contracts.ts`, `apps/server/src/routes/student.ts`, `apps/server/src/lib/media-response.ts`, `apps/server/src/app.ts`): thêm `STUDENT_ERROR_CODES.ORG_MISMATCH`, khoá fail-closed `403` trên `createStudentGuard`, giới hạn `?org=` cho `GET`/`HEAD`, đồng bộ `asc(student.id)` + `.trim()` ở `GET /api/student/orgs`, khoá allowlist MIME + `COOP: same-origin` trong `mediaObjectResponse`, và phủ `CORP: same-site` + `Referrer-Policy: no-referrer` trước `secureHeaders` cho cả 7 route media.
2. Student Portal (`apps/student`): tạo `student-org-storage.ts`, gắn `sentOrgId` vào `HttpError` để tự phục hồi an toàn mọi truy vấn `GET` song song, cô lập cả `localStorage` lẫn RAM `studentQueryClient` khi đổi `userId` / hết phiên (`syncStudentSessionUser`), chặn ghi đè ngược cache `orgs` khi đang refetch (`isFetching` trong `org-switcher.tsx`), dừng hoàn toàn auto-flush của `QuizAttemptStore` trên `org_mismatch` mà vẫn bảo toàn mirror câu trả lời, và ghim `explicitOrgId` cho `OnboardingWizard`.
3. Cập nhật `docs/system-architecture.md`, `CHANGELOG.md`, và E2E `specs/material-upload-student.spec.ts` (E6 `403` + tự phục hồi trình duyệt thật).

## Decision
Áp dụng đầy đủ 4 finding từ `LocalPendingCodeReview` theo hướng dẫn của `KongmingCodeReviewGate` (đặc biệt bảo toàn mirror `QuizAttemptStore` khi `dispose()` dưới trạng thái `org_mismatch` và giữ `if (prevUser && prevUser !== trimmedUser)` để không reset org phụ của học viên hiện hữu khi nâng cấp).

## Next steps
Commit thay đổi trên branch `chore/675-student-guard-fail-closed`, merge `origin/develop` (#682), kiểm tra lại E2E sau merge, push và mở PR beta vào `develop`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
