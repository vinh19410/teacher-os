---
title: "Chốt kế hoạch fail-closed createStudentGuard và tự phục hồi org học viên (#675)"
date: 2026-11-11
summary: "Hoàn tất kế hoạch TDD + handover --advice cho #675 sau vòng red-team 2 reviewer và fact-check."
---

# Chốt kế hoạch fail-closed createStudentGuard và tự phục hồi org học viên (#675)

## What happened
Xây dựng và hậu kiểm kế hoạch `plans/261111-0821-675-student-guard-fail-closed` cho issue #675. Vòng Red-Team 2 góc nhìn độc lập (Security Adversary + Assumption Destroyer) phát hiện 11 điểm rủi ro thực tế có dẫn chứng mã nguồn: race truy vấn song song khi xoá `localStorage` trên `/`, thiếu khai báo `orgBId` trong spec E2E, giá trị enum onboarding trong bài test, chia sẻ `parseErrorAndThrow` giữa GET/POST trong `vocab.ts`, cô lập `userId` qua `/_auth` `beforeLoad`, wave 2 của `QuizAttemptStore.drain()`, ghim `orgId` cho `submitOnboarding`, bảo toàn mock đóng trong test hiện hữu, và phủ `CORP: same-site` + allowlist MIME cho `mediaObjectResponse`.

## Decision
Chốt mã lỗi mới `STUDENT_ORG_MISMATCH` (`403`), chỉ nhận `?org=` trên `GET`/`HEAD` và đồng bộ thứ tự `asc(student.id)` + `.trim()` ở `GET /api/student/orgs`. Phía Student Portal lưu `sentOrgId` trên `HttpError` để retry đúng 1 lần cho mọi truy vấn `GET` song song, ngắt tự retry trên toàn bộ đường ghi, ghim `orgId` cho onboarding, và cô lập theo `userId` ở `/_auth`. Giữ nguyên `default-src 'none'; sandbox` cho `mediaObjectResponse` kèm allowlist MIME + `COOP: same-origin` + `CORP: same-site` trên `app.ts`.

## Next steps
Chạy `ak-git cp` đẩy kế hoạch + journal lên branch `chore/675-student-guard-fail-closed`, cập nhật issue #675 và triển khai TDD qua `/ak-cook`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
