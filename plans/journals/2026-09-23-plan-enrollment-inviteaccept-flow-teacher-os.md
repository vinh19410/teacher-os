---
title: "Plan: enrollment invite→accept flow (teacher-os)"
date: 2026-09-23
summary: "Tạo plan 260923-0550 thêm vòng đời enrollment invited→active; red-team 13 findings all-accepted; issue #253"
---

# Plan: enrollment invite→accept flow (teacher-os)

## What happened
Chạy /ak:plan --hard --github cho yêu cầu: thêm học viên vào lớp phải ở trạng thái "Đã mời", học viên đồng ý qua student portal rồi mới thành "Đang học".

- Scout 2 agent song song: enrollment (packages/db schema không có status, kernel.ts:601-672 enroll atomic batch tạo ngay package+lessons, contract-first 4 tầng) và auth/portal (Better Auth, bootstrap mọi user thành teacher/org riêng, portal chỉ là design doc open-design/student-portal-prompt.md).
- User chốt 3 quyết định trước khi draft: API seam (portal làm riêng), sinh gói/buổi khi accept, sĩ số chỉ đếm đang học.
- Red-team 3 reviewer song song (Security/Assumption/Failure, tier Standard): 13 findings, 13 accepted — Critical nhất: "cửa sổ chết" vận hành (không ai kích hoạt được invited sau merge vì portal chưa có); High: TOCTOU accept (check-then-batch → 500 khi song song), POST /invoices không lọc status, reducer sót action add-student, org-isolation chặn portal gọi accept, blast radius e2e là 12 spec không phải 3, bước "sửa skeleton.ts" là nhiệm vụ ma.
- User chốt thêm 2 scope từ red-team: nút "Kích hoạt" admin (dùng chính endpoint accept — 1 endpoint 2 caller) và DELETE hủy lời mời invited-only.
- Đồng bộ với plan portal 260923-0641-student-portal-app (tồn tại sẵn, đã red-team riêng): portal sẽ tái dùng activation logic qua bridge student-scoped.

## Decision
- D1 API seam / D2 gói+buổi sinh khi accept / D3 sĩ số chỉ đếm active / D4 nút Kích hoạt / D5 hủy lời mời.
- Accept idempotent theo CAS: UPDATE WHERE status='invited' đứng đầu batch + unique index session_package_enrollment_uq làm net, không dùng check-then-batch.
- Guards mới: invoice 409 với invited; assignments roster chỉ tính active.
- Projection "Dự kiến" giữ nguyên cho đến khi có enrollment active (semantics mới của projected-sessions.spec.ts).

## Next steps
- Review plan + issue #253 → /ak:cook plans/260923-0550-enrollment-invite-accept-flow/plan.md
- Portal project đọc mục "Portal integration constraints" trong plan.md (org-isolation, CORS, ownership).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
